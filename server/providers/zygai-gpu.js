// EXPERIMENTAL: ZygAI GPU provider using RunPod serverless endpoints
// This provider is experimental and may be removed in future versions
// It implements safe polling patterns to avoid keeping serverless workers active unnecessarily

const ZYGAI_GPU_DEFAULT = {
  endpointId: process.env.RUNPOD_ENDPOINT_ID || '',
  apiKey: process.env.RUNPOD_API_KEY || '',
};

const buildZygAIGPUHeaders = (providerRow) => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${providerRow?.api_key || ZYGAI_GPU_DEFAULT.apiKey}`,
});

const getZygAIGPUEndpointId = (providerRow) => {
  const baseUrl = providerRow?.base_url || providerRow?.baseUrl || '';
  // If full URL provided (https://api.runpod.ai/v2/<endpoint_id>/...), extract endpoint_id
  const match = baseUrl.match(/https:\/\/api\.runpod\.ai\/v2\/([^\/]+)/);
  if (match) return match[1];
  // Otherwise, treat as direct endpoint ID
  return baseUrl.trim() || providerRow?.endpoint_id || ZYGAI_GPU_DEFAULT.endpointId;
};

const handleZygAIGPUResponse = async (response) => {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error('ZygAI GPU error body:', body);
    throw new Error(body?.error?.message || `ZygAI GPU request failed (${response.status})`);
  }
  return response.json();
};

// Submit job once and get request_id
const submitZygAIGPUJob = async (providerRow, payload) => {
  const endpointId = getZygAIGPUEndpointId(providerRow);
  const headers = buildZygAIGPUHeaders(providerRow);

  console.log('[ZygAI GPU] Submitting job to endpoint:', endpointId);

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const data = await handleZygAIGPUResponse(response);
  return data.id; // request_id
};

// Poll status until completion
const pollZygAIGPUStatus = async (providerRow, requestId) => {
  const endpointId = getZygAIGPUEndpointId(providerRow);
  const headers = buildZygAIGPUHeaders(providerRow);

  const maxPolls = 120; // Max 2 minutes at 1s intervals
  let pollCount = 0;

  while (pollCount < maxPolls) {
    console.log(`[ZygAI GPU] Polling status for request ${requestId}, attempt ${pollCount + 1}`);

    const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/status/${requestId}`, {
      headers
    });

    const status = await handleZygAIGPUResponse(response);

    if (status.status === 'COMPLETED') {
      console.log('[ZygAI GPU] Job completed successfully');
      return status;
    }

    if (status.status === 'FAILED') {
      console.log('[ZygAI GPU] Job failed');
      return status;
    }

    // Wait 1 second before polling again
    await new Promise(resolve => setTimeout(resolve, 1000));
    pollCount++;
  }

  throw new Error(`ZygAI GPU job ${requestId} timed out after ${maxPolls} polls`);
};

const buildMessagesWithImages = (messages) => {
  return messages.map((msg) => {
    if (msg.role === 'user' && Array.isArray(msg.userImages) && msg.userImages.length > 0) {
      const content = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
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

export const zygAIGPUProvider = async ({ providerRow, modelId, messages, customSystemPrompt, tools }) => {
  console.log('[ZygAI GPU] EXPERIMENTAL: Using experimental RunPod provider');
  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    input: {
      model: modelId,
      messages: payloadMessages,
      temperature: 0.7,
      ...(tools && { tools })
    }
  };

  // Submit once
  const requestId = await submitZygAIGPUJob(providerRow, payload);

  // Poll until completion
  const result = await pollZygAIGPUStatus(providerRow, requestId);

  if (result.status === 'FAILED') {
    throw new Error(result.error || 'ZygAI GPU job failed');
  }

  const output = result.output;
  if (output?.choices?.[0]?.message?.tool_calls) {
    return { content: output.choices[0].message.content ?? '', tool_calls: output.choices[0].message.tool_calls };
  }
  return output?.choices?.[0]?.message?.content ?? '';
};

export const zygAIGPUProviderStream = async function* ({ providerRow, modelId, messages, customSystemPrompt, tools }) {
  console.log('[ZygAI GPU] EXPERIMENTAL: Using experimental RunPod streaming provider');
  // For streaming with RunPod, we need to use their streaming endpoint
  // RunPod supports streaming via Server-Sent Events
  const endpointId = getZygAIGPUEndpointId(providerRow);
  const headers = buildZygAIGPUHeaders(providerRow);

  const processedMessages = buildMessagesWithImages(messages);
  const systemMessage = customSystemPrompt ? { role: 'system', content: customSystemPrompt } : null;
  const payloadMessages = systemMessage ? [systemMessage, ...processedMessages] : processedMessages;

  const payload = {
    input: {
      model: modelId,
      messages: payloadMessages,
      temperature: 0.7,
      stream: true,
      ...(tools && { tools })
    }
  };

  console.log('[ZygAI GPU] Starting streaming request');

  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message || `ZygAI GPU streaming request failed (${response.status})`);
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
          let output = { choices: [{ delta: {} }] };

          if (content) {
            output.choices[0].delta.content = content;
          }
          if (reasoning) {
            output.choices[0].delta.reasoning_content = reasoning;
          }
          if (tool_calls) {
            output.choices[0].delta.tool_calls = tool_calls;
          }

          if (content || reasoning || tool_calls) {
            yield output;
          }
        }
      } catch {
        // Skip invalid JSON
      }
    }
  }
};

export const zygAIGPUImageProvider = async ({
  providerRow,
  modelId,
  prompt,
  imageOptions = {}
}) => {
  console.log('[ZygAI GPU] EXPERIMENTAL: Using experimental RunPod image provider');
  const payload = {
    input: {
      model: modelId,
      prompt,
      ...imageOptions
    }
  };

  // Submit once
  const requestId = await submitZygAIGPUJob(providerRow, payload);

  // Poll until completion
  const result = await pollZygAIGPUStatus(providerRow, requestId);

  if (result.status === 'FAILED') {
    throw new Error(result.error || 'ZygAI GPU image generation failed');
  }

  const output = result.output;
  return output?.images?.[0] || output?.image || '';
};
