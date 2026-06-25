import { AppSettings, ChatResponse, Message, ModelOption, Provider, SearchImage, SearchResult } from '@/types';
import { API_BASE } from '@/utils/apiBase';

interface ChatRequestPayload {
  provider: Provider;
  model: string;
  messages: Message[];
  settings: AppSettings;
  tools?: any[];
   selectedApiTools?: string[];
  zygId?: string | null;
  sessionId?: string;
}

export interface ImageOptions {
  aspectRatio?: string;
  imageSize?: string;
  extraConfig?: Record<string, unknown>;
}

export interface ImageGenerationResponse {
  prompt: string;
  provider: string;
  modelId: string;
  images: string[];
  text?: string | null;
}


const toPayload = (messages: Message[]) =>
  messages.map((message) => ({
    role: message.role,
    content: message.content,
    ...(message.userImages && message.userImages.length > 0
      ? { userImages: message.userImages }
      : {})
  }));

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error ?? 'Request failed. Please try again.';
    throw new Error(message);
  }
  return response.json();
};

export const sendChatMessage = async (payload: ChatRequestPayload): Promise<ChatResponse> => {
  const start = performance.now();
  const token = localStorage.getItem('zygai:token');
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      provider: payload.provider,
      model: payload.model,
      messages: toPayload(payload.messages),
      settings: payload.settings
    })
  });

  const data = await handleResponse(response);
  const latencyMs = Math.round(performance.now() - start);

  return {
    message: data.message,
    provider: payload.provider,
    model: payload.model,
    latencyMs
  };
};

export interface StreamCallbacks {
  onChunk: (chunk: string) => void;
  onComplete: (fullMessage: string) => void;
  onError: (error: Error) => void;
  onDone?: () => void;
}

export interface WebSocketStreamCallbacks {
  onChunk: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onComplete: (fullMessage: string) => void;
  onError: (error: Error) => void;
  onDone?: () => void;
}

export const streamChatMessageWebSocket = (
  payload: ChatRequestPayload,
  callbacks: WebSocketStreamCallbacks
): { send: (message: string) => void; close: () => void } => {
  const token = localStorage.getItem('zygai:token');
  
  // Use Vite proxy URL - will be ws://localhost:5173/api/chat/ws
  // which gets proxied to ws://localhost:8085/api/chat/ws
  const wsUrl = `/api/chat/ws`;
  
  let fullText = '';
  let ws: WebSocket | null = null;
  let isClosed = false;
  let wasCompleted = false;

  const connect = () => {
    ws = new WebSocket(`${wsUrl}?token=${token}`);

    ws.onopen = () => {
      ws?.send(JSON.stringify({
        provider: payload.provider,
        model: payload.model,
        messages: toPayload(payload.messages),
        settings: payload.settings,
        ...(payload.tools ? { tools: payload.tools } : {}),
        ...(payload.selectedApiTools ? { selectedApiTools: payload.selectedApiTools } : {}),
        ...(payload.zygId ? { zygId: payload.zygId } : {}),
        sessionId: payload.sessionId
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'reasoning_chunk' && callbacks.onReasoningChunk) {
          const reasoningText = data.delta || '';
          callbacks.onReasoningChunk(reasoningText);
        } else if (data.type === 'chunk' || data.delta || data.content) {
          const text = data.delta || data.content || '';
          fullText += text;
          callbacks.onChunk(text);
        } else if (data.type === 'done' || data.message) {
          wasCompleted = true;
          const finalMessage = data.message || fullText;
          callbacks.onComplete(finalMessage);
          callbacks.onDone?.();
        } else if (data.type === 'error') {
          callbacks.onError(new Error(data.error || 'WebSocket error'));
        }
      } catch (e) {
        // Plain text message
        fullText += event.data;
        callbacks.onChunk(event.data);
      }
    };

    ws.onerror = () => {
      // Silent - let onclose handle errors
    };

    ws.onclose = (event) => {
      if (!isClosed) {
        isClosed = true;
        // Only call error if we haven't completed and it's not a normal closure
        if (!wasCompleted && event.code !== 1000) {
          // Connection closed unexpectedly - but might have partial content
        }
        // Don't show error for 1006 - it's normal when server closes after sending
      }
    };
  };

  // Add connection timeout - 30 seconds
  const connectionTimeout = setTimeout(() => {
    if (ws && ws.readyState !== WebSocket.OPEN) {
      ws.close();
    }
  }, 30000);

  connect();

  return {
    send: (message: string) => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', content: message }));
      }
    },
    close: () => {
      clearTimeout(connectionTimeout);
      isClosed = true;
      ws?.close();
    }
  };
};

export const streamChatMessage = async (
  payload: ChatRequestPayload,
  callbacks: StreamCallbacks
): Promise<void> => {
  const token = localStorage.getItem('zygai:token');
  const response = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      provider: payload.provider,
      model: payload.model,
      messages: toPayload(payload.messages),
      settings: payload.settings,
      selectedApiTools: payload.selectedApiTools || [],
      stream: true
    })
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message = errorBody?.error ?? 'Request failed.';
    callbacks.onError(new Error(message));
    return;
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  if (!reader) {
    callbacks.onError(new Error('No response body'));
    return;
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // Handle SSE format: data: {...} or just plain text chunks
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            // Handle OpenRouter/OpenAI style responses
            if (parsed.choices && parsed.choices[0]) {
              const choice = parsed.choices[0];
              if (choice.delta && choice.delta.content) {
                const text = choice.delta.content;
                fullText += text;
                callbacks.onChunk(text);
              }
            }
            // Handle direct content/delta
            else if (parsed.content || parsed.delta) {
              const text = parsed.content || parsed.delta;
              fullText += text;
              callbacks.onChunk(text);
            }
            // Handle OpenRouter event types
            else if (parsed.type === 'response.output_text.delta' && parsed.delta) {
              fullText += parsed.delta;
              callbacks.onChunk(parsed.delta);
            }
            // Handle message field
            else if (parsed.message !== undefined) {
              const text = parsed.message;
              fullText += text;
              callbacks.onChunk(text);
            }
          } catch {
            // Ignore parse errors for non-JSON lines
          }
        } else if (line.trim()) {
          // Plain text chunk (non-SSE) - try to parse as JSON first
          try {
            const parsed = JSON.parse(line.trim());
            if (parsed.message) {
              const text = parsed.message;
              fullText += text;
              callbacks.onChunk(text);
            } else {
              // Not our expected format, treat as plain text
              fullText += line;
              callbacks.onChunk(line);
            }
          } catch {
            // Plain text
            fullText += line;
            callbacks.onChunk(line);
          }
        }
      }
    }
    callbacks.onComplete(fullText);
  } catch (error) {
    console.error('Stream error:', error);
    callbacks.onError(error instanceof Error ? error : new Error('Stream error'));
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore release lock errors
    }
    callbacks.onDone?.();
  }
};

export const searchWeb = async (
  query: string
): Promise<{ results: SearchResult[]; images: SearchImage[] }> => {
  const token = localStorage.getItem('zygai:token');
  const response = await fetch(
    `${API_BASE}/search?q=${encodeURIComponent(query)}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    }
  );
  const data = await handleResponse(response);
  return {
    results: data.results || [],
    images: data.images || []
  };
};


export const generateChatTitle = async (
  model: ModelOption,
  messages: Message[],
  settings: AppSettings
): Promise<string> => {
  // Create a special system prompt to generate a short title
  const titlePrompt = `Given the following conversation, generate a very short (3-5 words) title that captures the main topic. Respond with ONLY the title text, nothing else.\n\n${JSON.stringify(messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : '[...]' })))}`;

  const response = await sendChatMessage({
    provider: model.provider as Provider,
    model: model.id,
    messages: [
      {
        id: 'title-gen',
        role: 'user',
        content: titlePrompt,
        createdAt: new Date().toISOString()
      }
    ],
    settings,
    selectedApiTools: [] // Title generation doesn't use MCP tools
  });

  // Clean up the response - take first line, max 50 chars
  let title = response.message.split('\n')[0].trim();
  if (title.length > 50) title = title.slice(0, 50) + '...';
  return title || 'New chat';
};
export const generateImage = async (
  prompt: string,
  modelId: string,
  provider: string,
  imageOptions?: ImageOptions
): Promise<ImageGenerationResponse> => {
  if (!prompt.trim()) {
    throw new Error('Prompt required for image generation.');
  }
  const token = localStorage.getItem('zygai:token');
  const response = await fetch(`${API_BASE}/generate-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      prompt: prompt.trim(),
      modelId,
      provider,
      imageOptions
    })
  });

  const data = await handleResponse(response);
  return data as ImageGenerationResponse;
};
