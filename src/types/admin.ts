export interface AdminUser {
  id: string;
  email: string;
  plan: 'free' | 'go' | 'plus' | 'beta';
  role: 'user' | 'admin';
  al_access?: boolean;
  email_verified?: boolean;
  ai_role_id?: string | null;
  created_at: string;
  grace_plan?: string | null;
  grace_plan_expires_at?: string | null;
}

export interface AdminBlogPost {
  id: number;
  slug: string;
  title: string;
  content: string;
  meta_title?: string | null;
  meta_description?: string | null;
  meta_image?: string | null;
  published: number;
  created_at: string;
  updated_at: string;
}

export interface Announcement {
  id: number;
  title: string;
  content: string;
  published: boolean;
  is_archived: number;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface AdminLog {
  id: number;
  user_id: string;
  email: string;
  provider: string;
  model: string;
  latency_ms: number;
  created_at: string;
}

export interface ApiProvider {
  id: string;
  name: string;
  apiKey: string;
  baseUrl?: string;
  enabled: boolean;
  providerType?: string | null;
  isHealthy?: boolean;
  failoverProviderId?: string | null;
}

export interface ModelConfig {
  id: string;
  name: string;
  providerId: string;
  modelId: string;
  description: string;
  category: '8k' | 'instant' | 'paid' | string;
  freeLimit: number;
  paidLimit: number;
  goLimit?: number;
  plusLimit?: number;
  betaLimit?: number;
  planAccess?: string[];
  role: 'user' | 'admin' | 'all';
  enabled: boolean;
  hiddenFromChat?: boolean;
  supportsVision?: boolean;
  systemPrompt?: string;
}

export interface FeatureModelConfig {
  featureKey: string;
  provider: string;
  modelId: string;
  modelIds?: string[];
  modelOptions?: Array<{
    provider: string;
    modelId: string;
    label?: string;
  }>;
  systemPrompt?: string;
}

export type UsageDay = { day: string; count: number };
