import { openRouterProvider, openRouterImageProvider, openRouterProviderStream } from './openrouter.js';
import { zygAIProvider, zygAIImageProvider, zygAIProviderStream } from './zygai.js';
import { zygAIGPUProvider, zygAIGPUImageProvider, zygAIGPUProviderStream } from './zygai-gpu.js';
import { zygAIOllamaProvider, zygAIOllamaImageProvider, zygAIOllamaProviderStream } from './zygai-ollama.js';

export { zygAIOllamaProvider, zygAIOllamaImageProvider, zygAIOllamaProviderStream };

const registry = new Map();
const streamRegistry = new Map();
const imageRegistry = new Map();

export const registerProvider = (type, handler) => {
  if (!type || !handler) return;
  registry.set(type.toLowerCase(), handler);
};

export const registerStreamProvider = (type, handler) => {
  if (!type || !handler) return;
  streamRegistry.set(type.toLowerCase(), handler);
};

export const registerImageProvider = (type, handler) => {
  if (!type || !handler) return;
  imageRegistry.set(type.toLowerCase(), handler);
};

export const getProviderHandler = (type) => {
  if (!type) return undefined;
  return registry.get(type.toLowerCase());
};

export const getStreamProviderHandler = (type) => {
  if (!type) return undefined;
  return streamRegistry.get(type.toLowerCase());
};

export const getImageProviderHandler = (type) => {
  if (!type) return undefined;
  return imageRegistry.get(type.toLowerCase());
};

registerProvider('openrouter', openRouterProvider);
registerStreamProvider('openrouter', openRouterProviderStream);
registerImageProvider('openrouter', openRouterImageProvider);

registerProvider('zygai', zygAIProvider);
registerStreamProvider('zygai', zygAIProviderStream);
registerImageProvider('zygai', zygAIImageProvider);

registerProvider('zygai-gpu', zygAIGPUProvider);
registerStreamProvider('zygai-gpu', zygAIGPUProviderStream);
registerImageProvider('zygai-gpu', zygAIGPUImageProvider);

registerProvider('zygai-ollama', zygAIOllamaProvider);
registerStreamProvider('zygai-ollama', zygAIOllamaProviderStream);
registerImageProvider('zygai-ollama', zygAIOllamaImageProvider);

registerProvider('groq', zygAIProvider);
registerStreamProvider('groq', zygAIProviderStream);
registerImageProvider('groq', zygAIImageProvider);
