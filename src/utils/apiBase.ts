const DEV_FALLBACK = '/api';
const PROD_FALLBACK = 'https://zygai.app/api';

const normalizeBoolean = (value: string | undefined) =>
  value !== undefined && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const resolveApiBase = () => {
  const useLocalApi = normalizeBoolean(import.meta.env.VITE_USE_LOCAL_API);
  if (import.meta.env.MODE === 'development' && useLocalApi) {
    return import.meta.env.VITE_DEV_API_BASE || DEV_FALLBACK;
  }
  return import.meta.env.VITE_API_BASE || PROD_FALLBACK;
};

export const API_BASE = resolveApiBase();
