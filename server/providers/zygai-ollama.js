const ZYGAI_OLLAMA_DEFAULT = {
  baseUrl: 'http://100.115.210.53:11434',
};

const normalizeNativeOllamaBaseUrl = (baseUrl) => {
  return (baseUrl || ZYGAI_OLLAMA_DEFAULT.baseUrl)
    .replace(/\/$/, '')
    .replace(/\/v\d+$/, '');
};

const logZygAIOllamaRequest = ({ baseUrl, endpoint, modelId }) => {
  console.info('[ZygAI Ollama] native request', {
    url: `${baseUrl}${endpoint}`,
    model: modelId
  });
};

const buildZygAIOllamaHeaders = (providerRow) => {
  const headers = { 'Content-Type': 'application/json' };
  if (providerRow?.api_key) {
    headers.Authorization = `Bearer ${providerRow.api_key}`;
  }
  return headers;
};

const handleZygAIOllamaResponse = async (response) => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('[ZygAI Ollama] Error body:', JSON.stringify(body));
    const errorMsg = body?.error?.message || body?.error || body?.message || `Ollama request failed (${response.status})`;
    throw new Error(errorMsg);
  }
  return response.json();
};

const buildMessagesWithImages = (messages) => {
  return messages.map((msg) => {
    // Extract text content correctly whether it's a string or an array of parts
    let textContent = '';
    if (typeof msg.content === 'string') {
      textContent = msg.content;
    } else if (Array.isArray(msg.content)) {
      textContent = msg.content
        .map((part) => (typeof part === 'string' ? part : part.text || ''))
        .join('\n');
    }

    // Sanitize message fields for Ollama (only role, content, images allowed)
    const sanitized = {
      role: msg.role,
      content: textContent
    };

    if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
      sanitized.images = msg.userImages.map((img) => {
        const match = typeof img === 'string' && img.match(/^data:image\/[^;]+;base64,(.*)$/);
        return match ? match[1] : img;
      });
    }
    
    return sanitized;
  });
};

const normalizeToolCalls = (toolCalls) => {
  if (!Array.isArray(toolCalls)) return null;
  return toolCalls.map((tc, index) => ({
    id: tc.id || `call_${Date.now()}_${index}`,
    type: 'function',
    function: {
      name: tc.function?.name,
      arguments: typeof tc.function?.arguments === 'string' 
        ? tc.function.arguments 
        : JSON.stringify(tc.function?.arguments || {})
    }
  }));
};

export const zygAIOllamaProvider = async ({ providerRow, modelId, messages, customSystemPrompt, temperature, maxTokens, topP, tools, toolChoice }) => {
  const baseUrl = normalizeNativeOllamaBaseUrl(providerRow?.base_url);
  const headers = buildZygAIOllamaHeaders(providerRow);

  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    model: modelId,
    messages: payloadMessages,
    stream: false,
    options: {
      temperature: temperature ?? 0.7,
      ...(maxTokens ? { num_predict: maxTokens } : {}),
      ...(topP ? { top_p: topP } : {})
    },
    ...(tools && { tools }),
    ...(toolChoice && { tool_choice: toolChoice })
  };

  const endpoint = '/api/chat';
  logZygAIOllamaRequest({ baseUrl, endpoint, modelId });
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000)
  });

  const data = await handleZygAIOllamaResponse(response);
  const message = data?.message;
  
  if (message?.tool_calls) {
    return { 
      content: message.content || '', 
      tool_calls: normalizeToolCalls(message.tool_calls)
    };
  }
  
  return message?.content || '';
};

export const zygAIOllamaProviderStream = async function* ({ providerRow, modelId, messages, customSystemPrompt, temperature, maxTokens, topP, tools, toolChoice }) {
  const baseUrl = normalizeNativeOllamaBaseUrl(providerRow?.base_url);
  const headers = buildZygAIOllamaHeaders(providerRow);

  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    model: modelId,
    messages: payloadMessages,
    stream: true,
    options: {
      temperature: temperature ?? 0.7,
      ...(maxTokens ? { num_predict: maxTokens } : {}),
      ...(topP ? { top_p: topP } : {})
    },
    ...(tools && { tools }),
    ...(toolChoice && { tool_choice: toolChoice })
  };

  const endpoint = '/api/chat';
  logZygAIOllamaRequest({ baseUrl, endpoint, modelId });
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('[ZygAI Ollama] Error body:', JSON.stringify(body));
    const errorMsg = body?.error?.message || body?.error || body?.message || `Ollama request failed (${response.status})`;
    throw new Error(errorMsg);
  }

  // Native Ollama streaming: each line is a JSON object with message.content
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const chunk = JSON.parse(line);
        if (chunk.message?.content || chunk.message?.tool_calls) {
          const normalizedToolCalls = normalizeToolCalls(chunk.message.tool_calls);
          yield { 
            choices: [{ 
              delta: { 
                content: chunk.message.content,
                tool_calls: normalizedToolCalls
              },
              finish_reason: chunk.done ? (normalizedToolCalls ? 'tool_calls' : 'stop') : null
            }] 
          };
        }
        if (chunk.done) return;
      } catch {
        // Skip invalid JSON
      }
    }
  }
};

export const zygAIOllamaImageProvider = async ({
  providerRow,
  modelId,
  prompt,
  imageOptions = {}
}) => {
  const baseUrl = normalizeNativeOllamaBaseUrl(providerRow?.base_url);
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: buildZygAIOllamaHeaders(providerRow),
    body: JSON.stringify({
      model: modelId,
      prompt,
      stream: false
    })
  });
  
  const data = await handleZygAIOllamaResponse(response);
  return data?.image || data?.images?.[0] || '';
};
