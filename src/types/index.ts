export type Role = 'user' | 'assistant' | 'system';

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ImageAttachment {
  url: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  name: string;
  previewUrl: string; // for thumbnail display
}

export interface Message {
  id: string;
  role: Role;
  content: string | ContentBlock[];
  createdAt: string;
  edited?: boolean;
  sources?: SearchResult[];
  images?: SearchImage[];
  userImages?: string[]; // cognivision:// IDs or legacy base64
  attachedFiles?: Array<{
    id: string;
    name: string;
    url?: string;
    isImage: boolean;
    isDocument: boolean;
    fileType: string;
  }>;
  reasoning_content?: string; // Thinking/reasoning content from models that support it
}

export interface ChatSession {
  id: string;
  title: string;
  modelId?: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export type Provider = string;

export interface LlamaInstanceConfig {
  id: string;
  name: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  topP: number;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: Provider;
  description: string;
  contextLength: string;
  pricing?: string;
  speedHint: string;
  hiddenFromChat?: boolean;
  supports_vision?: boolean;
}

export interface ThemeSettings {
  mode: 'light' | 'dark' | 'oled';
}

export interface ApiSettings {
  llamaInstances: LlamaInstanceConfig[];
}

export interface BillingSettings {
  planId: string;
  creditsRemaining: number;
  rateLimitPerMinute: number;
}

export interface AppSettings {
  theme: ThemeSettings;
  api: ApiSettings;
  billing: BillingSettings;
  preferredModelId: string;
}

export interface ChatResponse {
  message: string;
  provider: Provider;
  model: string;
  latencyMs?: number;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface SearchImage {
  title: string;
  url: string;
  imageUrl: string;
  source?: string;
}

export interface AdSettings {
  adsEnabled: boolean;
  adPlanEnabled?: boolean;
  adSessionDurationSeconds: number;
  adCreditDurationMinutes: number;
  adMaxSessionMinutes: number;
  adRectangleCode: string | null;
  adOverlayCode: string | null;
}

export interface TimeCredits {
  remainingSeconds: number;
  maxSeconds: number;
  isUnlimited: boolean;
}

export interface PlanInfo {
  id: string;
  name: string;
  description: string;
  features: string[];
  icon: string;
  price?: string;
}
