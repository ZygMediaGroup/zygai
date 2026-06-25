import { AppSettings, ChatSession, ModelOption } from '@/types';
import { API_BASE } from '@/utils/apiBase';

export const DEFAULT_MODELS: ModelOption[] = [];

const DEFAULT_SESSIONS_BASE: ChatSession[] = [];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: { mode: 'light' },
  api: {
    llamaInstances: []
  },
  billing: {
    planId: 'free',
    creditsRemaining: 120,
    rateLimitPerMinute: 60
  },
  preferredModelId: ''
};

export const DEFAULT_SESSIONS: ChatSession[] = DEFAULT_SESSIONS_BASE.map((session) => ({
  ...session,
  modelId: DEFAULT_SETTINGS.preferredModelId
}));

const TOKEN_KEY = 'zygai:token';

export const getAuthToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const apiRequest = async (path: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error?.error || 'Request failed');
  }
  return response.json();
};

export const storage = {
  get<T>(key: string, fallback: T): T {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  },
  set<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

export const loadSessions = () => {
  const sessions = storage.get('zygai:sessions', DEFAULT_SESSIONS);
  return sessions.map((session) => ({
    ...session,
    modelId:
      session.modelId && ['llama-local-1', 'llama-local-2', 'llama-local-3'].includes(session.modelId)
        ? 'llama'
        : session.modelId || DEFAULT_SETTINGS.preferredModelId,
    messages: session.messages.map((msg) => ({
      ...msg,
      content: typeof msg.content === 'string'
        ? msg.content
            .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
            .replace(/<[^>]+>/g, '')
            .trim()
        : msg.content
    }))
  }));
};
export const saveSessions = (sessions: ChatSession[]) => storage.set('zygai:sessions', sessions);

export const loadSettings = () => {
  const stored = storage.get('zygai:settings', DEFAULT_SETTINGS);
  const normalized = {
    ...DEFAULT_SETTINGS,
    ...stored,
    theme: {
      ...DEFAULT_SETTINGS.theme,
      ...stored.theme,
      mode: ['light', 'dark', 'oled'].includes(stored.theme?.mode) ? stored.theme.mode : DEFAULT_SETTINGS.theme.mode
    },
    api: { ...DEFAULT_SETTINGS.api, ...stored.api },
    billing: { ...DEFAULT_SETTINGS.billing, ...stored.billing }
  };
  const hasLegacy =
    stored.api?.llamaInstances?.some((instance) => instance.baseUrl.includes('localhost')) ??
    false;
  let nextSettings = normalized;
  if (hasLegacy) {
    nextSettings = {
      ...nextSettings,
      api: {
        ...nextSettings.api,
        llamaInstances: DEFAULT_SETTINGS.api.llamaInstances
      }
    };
  }
  if (['llama', 'llama-local-1', 'llama-local-2', 'llama-local-3', 'groq-llama-3.1-8b-instant'].includes(nextSettings.preferredModelId)) {
    nextSettings = { ...nextSettings, preferredModelId: '' };
  }
  return nextSettings;
};
export const saveSettings = (settings: AppSettings) => storage.set('zygai:settings', settings);

export const loadActiveSessionId = () => storage.get('zygai:activeSessionId', '');
export const saveActiveSessionId = (id: string) => storage.set('zygai:activeSessionId', id);

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

// Server API functions for chat sync
export const fetchChatSessions = async (): Promise<ChatSession[]> => {
  const data = await apiRequest('/chats');
  return data.sessions || [];
};

export const fetchChatSession = async (sessionId: string): Promise<ChatSession | null> => {
  const data = await apiRequest(`/chats/${sessionId}`);
  return data.session || null;
};

export const createChatSession = async (title?: string, modelId?: string, id?: string, zygId?: string): Promise<ChatSession> => {
  const data = await apiRequest('/chats', {
    method: 'POST',
    body: JSON.stringify({ title, modelId, id, zygId })
  });
  return data.session;
};

export const updateChatSession = async (sessionId: string, updates: any): Promise<void> => {
  await apiRequest(`/chats/${sessionId}`, {
    method: 'PUT',
    body: JSON.stringify(updates)
  });
};

export const deleteChatSession = async (sessionId: string): Promise<void> => {
  await apiRequest(`/chats/${sessionId}`, { method: 'DELETE' });
};

export const saveChatMessage = async (sessionId: string, message: any): Promise<void> => {
  await apiRequest(`/chats/${sessionId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message })
  });
};

export const deleteChatMessage = async (sessionId: string, messageId: string): Promise<void> => {
  await apiRequest(`/chats/${sessionId}/messages/${messageId}`, { method: 'DELETE' });
};

export const clearChatMessages = async (sessionId: string): Promise<void> => {
  await apiRequest(`/chats/${sessionId}/clear`, { method: 'POST' });
};

export const buildChatExport = (sessions: ChatSession[]) => {
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    sessions
  };
  return JSON.stringify(exportPayload, null, 2);
};

export const buildTextExport = (sessions: ChatSession[]) => {
  return sessions
    .map((session) => {
      const header = `# ${session.title}`;
      const body = session.messages
        .map((message) => `[${message.role}] ${message.content}`)
        .join('\n');
      return `${header}\n${body}`;
    })
    .join('\n\n');
};
