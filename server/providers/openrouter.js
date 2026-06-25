const OPENROUTER_DEFAULT = {
  baseUrl: 'https://openrouter.ai/api/v1',
  headers: {
    'HTTP-Referer': process.env.OPENROUTER_REFERER || '',
    'X-OpenRouter-Title': process.env.OPENROUTER_SITE_TITLE || ''
  }
};

const buildOpenRouterHeaders = (providerRow) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${providerRow?.api_key || ''}`,
  ...OPENROUTER_DEFAULT.headers
});

const handleOpenRouterResponse = async (response) => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('OpenRouter error body:', body);
    throw new Error(body?.error?.message || `OpenRouter request failed (${response.status})`);
  }
  const json = await response.json();
  console.log('[OpenRouter response] keys:', json ? Object.keys(json) : 'null', 'choices:', json?.choices?.length ?? 0);
  return json;
};

const buildMessagesWithImages = (messages) => {
  return messages.map((msg) => {
    if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
      const content = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      // Each entry in userImages may already be a full data URL (e.g., "data:image/jpeg;base64,...")
      // or a raw base64 string without MIME prefix. Detect and handle both.
      msg.userImages.forEach((img) => {
        const url = typeof img === 'string' && img.startsWith('data:')
          ? img
          : `data:image/jpeg;base64,${img}`;
        content.push({ type: 'image_url', image_url: { url } });
      });
      return { ...msg, content };
    }
    return msg;
  });
};

export const openRouterProvider = async ({ providerRow, modelId, messages, customSystemPrompt, tools }) => {
  const baseUrl = (providerRow?.base_url || OPENROUTER_DEFAULT.baseUrl).replace(/\/$/, '');
  const headers = buildOpenRouterHeaders(providerRow);

  console.log('[OpenRouter provider] baseUrl:', baseUrl);
  console.log('[OpenRouter provider] modelId:', modelId);
  console.log('[OpenRouter provider] headers.Authorization:', headers.Authorization ? 'set' : 'missing');
  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    model: modelId,
    messages: payloadMessages,
    temperature: 0.7,
    ...(tools && Array.isArray(tools) && tools.length > 0 ? { tools } : {})
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  console.log('[OpenRouter provider] response.status:', response.status);
  const data = await handleOpenRouterResponse(response);
  const content = data?.choices?.[0]?.message?.content ?? '';
  console.log('[OpenRouter provider] content preview:', content ? content.slice(0, 200) : '(empty)');
  // If OpenRouter returns a URL to an audio file, expose it as output
  const trimmed = (content || '').trim();
  // Google Lyria content may be a JSON-ish string containing a url; try parse
  let parsed = null;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = null;
  }
  const url = parsed?.url || parsed?.output || parsed?.audio_url || parsed?.audioUrl;
  if (typeof url === 'string' && url.startsWith('http')) {
    return { output: url };
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return { output: trimmed };
  }
  // Otherwise return the raw content for now (text response)
  return content;
};

// Streaming version of OpenRouter provider
export const openRouterProviderStream = async function* ({
  providerRow,
  modelId,
  messages,
  customSystemPrompt,
  tools,
  extra
}) {
  const baseUrl = (providerRow?.base_url || OPENROUTER_DEFAULT.baseUrl).replace(/\/$/, '');
  const headers = buildOpenRouterHeaders(providerRow);

  console.log('[OpenRouter stream] baseUrl:', baseUrl);
  console.log('[OpenRouter stream] modelId:', modelId);
  console.log('[OpenRouter stream] headers.Authorization:', headers.Authorization ? 'set' : 'missing');
  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    model: modelId,
    messages: payloadMessages,
    temperature: 0.7,
    stream: true,
    ...(tools && Array.isArray(tools) && tools.length > 0 ? { tools } : {})
  };

  // Include audio output options if provided (OpenRouter requires streaming for audio)
  if (extra && typeof extra === 'object') {
    if (Array.isArray(extra.modalities)) payload.modalities = extra.modalities;
    if (extra.audio && typeof extra.audio === 'object') payload.audio = extra.audio;
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

      console.log('[OpenRouter stream] response.status:', response.status, 'content-type:', response.headers.get('content-type'));
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `OpenRouter request failed (${response.status})`);
  }

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
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        if (choice) {
          const content = choice.delta?.content;
          const reasoning = choice.delta?.reasoning_content || choice.delta?.reasoning;
          const tool_calls = choice.delta?.tool_calls;
          const audio = choice.delta?.audio;
          const finish_reason = choice.finish_reason;

          let output = { choices: [{ delta: {}, finish_reason: finish_reason || null }] };

          if (content) {
            output.choices[0].delta.content = content;
          }
          if (reasoning) {
            output.choices[0].delta.reasoning_content = reasoning;
          }
          if (tool_calls) {
            output.choices[0].delta.tool_calls = tool_calls;
          }
          if (audio) {
            output.choices[0].delta.audio = audio;
          }

          if (content || reasoning || tool_calls || audio || finish_reason) {
            yield output;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }
};

export const openRouterImageProvider = async ({
  providerRow,
  modelId,
  prompt,
  imageOptions = {}
}) => {
  const baseUrl = (providerRow?.base_url || OPENROUTER_DEFAULT.baseUrl).replace(/\/$/, '');
  const headers = buildOpenRouterHeaders(providerRow);
  console.log('[OpenRouter image] baseUrl:', baseUrl);
  console.log('[OpenRouter image] modelId:', modelId);
  console.log('[OpenRouter image] headers.Authorization:', headers.Authorization ? 'set' : 'missing');
  const modalities = imageOptions.modalities ?? ['image', 'text'];
  const imageConfig = {
    ...(imageOptions.aspectRatio ? { aspect_ratio: imageOptions.aspectRatio } : {}),
    ...(imageOptions.imageSize ? { image_size: imageOptions.imageSize } : {}),
    ...(imageOptions.extraConfig || {})
  };

  const payload = {
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    modalities,
    ...(Object.keys(imageConfig).length ? { image_config: imageConfig } : {})
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  console.log('[OpenRouter image] response.status:', response.status);
  const data = await handleOpenRouterResponse(response);
  const message = data?.choices?.[0]?.message;
  const rawImages = Array.isArray(message?.images) ? message.images : [];
  const images = rawImages
    .map((image) => image?.image_url?.url || image?.imageUrl?.url || image?.url)
    .filter(Boolean);

  return {
    text: message?.content ?? '',
    images,
    raw: message
  };
};
