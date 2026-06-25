const ZYGAI_DEFAULT = {
  baseUrl: process.env.ZYGAI_BASE_URL || 'http://100.74.57.127:11234/v1',
};

const buildZygAIHeaders = (providerRow) => {
  const headers = { 'Content-Type': 'application/json' };
  if (providerRow?.api_key) {
    headers.Authorization = `Bearer ${providerRow.api_key}`;
  }
  return headers;
};

const handleZygAIResponse = async (response) => {
  if (!response.ok) {
    let errorMsg = `ZygAI request failed (${response.status})`;
    try {
      const body = await response.json();
      console.error('ZygAI error body:', body);
      errorMsg = body?.error?.message || body?.error || errorMsg;
    } catch (e) {
      // Body not JSON or already consumed
    }
    throw new Error(errorMsg);
  }
  return response.json();
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

    // Sanitize for compatibility with strict local servers (llama.cpp/vllm)
    const sanitized = {
      role: msg.role,
      content: textContent
    };

    if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
      const images = msg.userImages.map((img) => {
        const url = typeof img === 'string' && img.startsWith('data:')
          ? img
          : `data:image/jpeg;base64,${img}`;
        return { type: 'image_url', image_url: { url } };
      });
      sanitized.content = [
        { type: 'text', text: sanitized.content },
        ...images
      ];
    }
    return sanitized;
  });
};

export const zygAIProvider = async ({ providerRow, modelId, messages, customSystemPrompt, temperature, maxTokens, topP, tools, toolChoice, timeout }) => {
  const baseUrl = (providerRow?.base_url || ZYGAI_DEFAULT.baseUrl).replace(/\/$/, '');
  const headers = buildZygAIHeaders(providerRow);

  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    model: modelId,
    messages: payloadMessages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens,
    top_p: topP,
    ...(tools && { tools }),
    ...(toolChoice && { tool_choice: toolChoice })
  };

  const finalTimeout = timeout === 0 ? 0 : (timeout || 300000);
  const signal = finalTimeout > 0 ? AbortSignal.timeout(finalTimeout) : null;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    ...(signal && { signal })
  });

  const data = await handleZygAIResponse(response);
  const choice = data?.choices?.[0];
  if (!choice) {
    throw new Error('Model provider returned an empty response with no message choices.');
  }

  if (choice.message?.tool_calls) {
    return { 
      content: choice.message.content ?? '', 
      tool_calls: normalizeToolCalls(choice.message.tool_calls) 
    };
  }
  return choice.message?.content ?? '';
};

export const zygAIProviderStream = async function* ({ providerRow, modelId, messages, customSystemPrompt, temperature, maxTokens, topP, tools, toolChoice }) {
  const baseUrl = (providerRow?.base_url || ZYGAI_DEFAULT.baseUrl).replace(/\/$/, '');
  const headers = buildZygAIHeaders(providerRow);

  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    model: modelId,
    messages: payloadMessages,
    temperature: temperature ?? 0.7,
    max_tokens: maxTokens,
    top_p: topP,
    stream: true,
    ...(tools && { tools }),
    ...(toolChoice && { tool_choice: toolChoice })
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000)
  });

  if (!response.ok) {
    let errorMsg = `ZygAI request failed (${response.status})`;
    try {
      const body = await response.json();
      console.error('ZygAI error body:', body);
      errorMsg = body?.error?.message || body?.error || errorMsg;
    } catch (e) {
      // Body not JSON or already consumed
    }
    throw new Error(errorMsg);
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
      const tool_calls = normalizeToolCalls(choice.delta?.tool_calls);
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
      
      // If there's any content or a finish reason, yield it
      if (content || reasoning || tool_calls || finish_reason) {
        yield output;
      }
    }
  } catch {
    // Skip invalid JSON
  }
    }
  }
};

export const zygAIImageProvider = async ({
  providerRow,
  modelId,
  prompt,
  imageOptions = {}
}) => {
  const baseUrl = (providerRow?.base_url || ZYGAI_DEFAULT.baseUrl).replace(/\/$/, '');
  const headers = buildZygAIHeaders(providerRow);
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
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300000)
  });

  const data = await handleZygAIResponse(response);
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
