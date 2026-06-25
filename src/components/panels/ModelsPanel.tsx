import React, { useState } from 'react';
import { ApiProvider, ModelConfig, FeatureModelConfig } from '@/types/admin';
import { Key, Layout, Plus, Trash2, Shield, Globe, Database, Settings2, Sparkles, Brain, Image, Target, ChevronDown, X, Music, FlaskConical, Code } from 'lucide-react';
import ReactDOM from 'react-dom';
import clsx from 'clsx';

const PLAN_OPTIONS = [
  { id: 'free', label: 'Free' },
  { id: 'go', label: 'Go' },
  { id: 'plus', label: 'Plus' },
  { id: 'beta', label: 'Beta' }
];

const FEATURE_META: Record<string, { label: string; icon: any; description: string }> = {
  vibe_coder: { label: 'Vibe Coder', icon: Code, description: 'AI coding assistant for rapid prototyping' },
  calm_mode: { label: 'Calm Mode', icon: Brain, description: 'Grounding and steady communication style' },
  image_generation: { label: 'Image Generation', icon: Image, description: 'Dynamic image creation with various providers' },
  reach: { label: 'ZygAI Reach', icon: Target, description: 'Autonomous lead discovery and outreach agent' },
  music_generation: { label: 'Music Generation', icon: Music, description: 'AI music composition model (configure provider and model ID)' },
};

const PROVIDER_LABELS: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  groq: 'Groq',
  llama: 'Llama',
  zygai: 'ZygAI',
  'zygai-gpu': 'ZygAI GPU'
};

const LIMIT_FIELDS: Array<{ key: 'freeLimit' | 'goLimit' | 'plusLimit' | 'betaLimit'; label: string }> = [
  { key: 'freeLimit', label: 'Free Limit (m)' },
  { key: 'goLimit', label: 'Go Limit (m)' },
  { key: 'plusLimit', label: 'Plus Limit (m)' },
  { key: 'betaLimit', label: 'Beta Limit (m)' }
];

type ModelsPanelProps = {
  apiProviders: ApiProvider[];
  onSetApiProviders: React.Dispatch<React.SetStateAction<ApiProvider[]>>;
  modelConfigs: ModelConfig[];
  onSetModelConfigs: React.Dispatch<React.SetStateAction<ModelConfig[]>>;
  featureModels?: FeatureModelConfig[];
  onSetFeatureModels?: React.Dispatch<React.SetStateAction<FeatureModelConfig[]>>;
  siteSettings?: any;
  onSetSiteSettings?: (settings: any) => void;
  onSave: () => Promise<void>;
};
export const ModelsPanel: React.FC<ModelsPanelProps> = ({
  apiProviders,
  onSetApiProviders,
  modelConfigs,
  onSetModelConfigs,
  featureModels = [],
  onSetFeatureModels,
  siteSettings,
  onSetSiteSettings,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'configs' | 'features'>('providers');
  const [configModalIndex, setConfigModalIndex] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      await onSave();
      setSaveStatus('Changes applied successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(err?.message || 'Failed to apply changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const addProvider = () => {
    onSetApiProviders(prev => [
      ...prev,
      { id: `p-${Date.now()}`, name: '', apiKey: '', enabled: true, providerType: '', failoverProviderId: null, isHealthy: true }
    ]);
  };

  const addConfig = () => {
        onSetModelConfigs(prev => [
          ...prev,
          {
            id: `m-${Date.now()}`,
            name: '',
            providerId: apiProviders[0]?.id || '',
            modelId: '',
            description: '',
            category: '8k',
            freeLimit: 0,
            paidLimit: 0,
            goLimit: 0,
            plusLimit: 0,
            betaLimit: 0,
            planAccess: ['free', 'go', 'plus', 'beta'],
            role: 'all',
            enabled: true,
            hiddenFromChat: false
          }
    ]);
  };

  const openConfigModal = (idx: number) => {
    setConfigModalIndex(idx);
  };

  const closeConfigModal = () => {
    setConfigModalIndex(null);
  };

  // Helper to get matching models for a feature provider
  const getMatchingModels = (providerVal: string) => {
    const provLower = (providerVal || '').toLowerCase();
    return modelConfigs.filter(cfg => {
      const p = apiProviders.find(ap => ap.id === cfg.providerId);
      if (!p) {
        return (provLower === 'llama' && cfg.providerId === 'llama') || 
               (provLower === 'zygai' && cfg.providerId === 'zygai');
      }
      return p.name.toLowerCase() === provLower || 
             p.providerType?.toLowerCase() === provLower ||
             (provLower === 'llama' && p.id === 'llama') ||
             (provLower === 'zygai' && p.id === 'zygai');
    });
  };

  const getModelOptionKey = (option: { provider: string; modelId: string }) => `${option.provider}@@${option.modelId}`;

  const getProviderForModelConfig = (cfg: ModelConfig) => {
    const provider = apiProviders.find(ap => ap.id === cfg.providerId);
    return (provider?.providerType || provider?.name || cfg.providerId || 'openrouter').toLowerCase();
  };

  const getSavedFeatureModelOptions = (fm: FeatureModelConfig) => {
    const rawOptions = Array.isArray((fm as any).modelOptions) ? (fm as any).modelOptions : [];
    const options = rawOptions
      .map((option: any) => ({
        provider: typeof option?.provider === 'string' && option.provider.trim() ? option.provider.trim().toLowerCase() : fm.provider,
        modelId: typeof option?.modelId === 'string' ? option.modelId.trim() : '',
        label: typeof option?.label === 'string' && option.label.trim() ? option.label.trim() : undefined
      }))
      .filter((option: any) => option.provider && option.modelId);
    if (options.length) return options;
    const ids = Array.isArray((fm as any).modelIds) ? (fm as any).modelIds : [];
    const fallbackIds = ids.length ? ids : (fm.modelId ? [fm.modelId] : []);
    return fallbackIds
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((modelId: string) => ({ provider: fm.provider || 'zygai-ollama', modelId, label: modelId }));
  };

  const getFeatureModelOptions = (fm: FeatureModelConfig) => {
    const modelPool = fm.featureKey === 'vibe_coder'
      ? modelConfigs.filter(cfg => cfg.enabled !== false)
      : getMatchingModels(fm.provider);
    const registered = modelPool.map(cfg => ({
      id: fm.featureKey === 'vibe_coder' ? cfg.modelId : cfg.id,
      provider: getProviderForModelConfig(cfg),
      modelId: cfg.modelId,
      label: `${cfg.name} (${cfg.modelId})`
    }));
    const fallback = [
      { id: 'gemma4:e4b', provider: 'zygai-ollama', modelId: 'gemma4:e4b', label: 'Gemma 4 (ZygAI Native)' },
      { id: 'llama', provider: 'zygai-ollama', modelId: 'llama', label: 'llama (ZygAI Native)' },
      { id: 'openai/gpt-4o-mini', provider: 'openrouter', modelId: 'openai/gpt-4o-mini', label: 'GPT-4o Mini (OpenRouter)' },
      { id: 'google/gemini-2.0-flash-001', provider: 'openrouter', modelId: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (OpenRouter)' },
      { id: 'meta-llama/llama-3.1-8b-instruct', provider: 'openrouter', modelId: 'meta-llama/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (OpenRouter)' }
    ];
    const currentIds = getSavedFeatureModelOptions(fm).map((option: any) => ({ id: option.modelId, ...option, label: option.label || `${option.modelId} (${option.provider})` }));
    const seen = new Set<string>();
    return [...registered, ...fallback, ...currentIds].filter(option => {
      const key = getModelOptionKey(option);
      if (!option.id || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const updateFeatureModel = (idx: number, patch: Record<string, unknown>) => {
    onSetFeatureModels?.(prev => prev.map((item, i) => i === idx ? { ...(item as any), ...patch } as any : item));
  };

  const setDefaultFeatureModel = (idx: number, optionKey: string) => {
    const feature = featureModels[idx];
    if (!feature) return;
    if (feature.featureKey !== 'vibe_coder') {
      updateFeatureModel(idx, { modelId: optionKey });
      return;
    }
    const selectedOption = getFeatureModelOptions(feature).find(option => getModelOptionKey(option) === optionKey);
    if (!selectedOption) return;
    const modelOptions = getSavedFeatureModelOptions(feature);
    const hasOption = modelOptions.some((option: any) => getModelOptionKey(option) === optionKey);
    const nextOptions = hasOption ? modelOptions : [selectedOption, ...modelOptions];
    updateFeatureModel(idx, {
      provider: selectedOption.provider,
      modelId: selectedOption.modelId,
      modelIds: nextOptions.map((option: any) => option.modelId),
      modelOptions: feature.featureKey === 'vibe_coder' ? nextOptions : undefined
    });
  };

  const toggleVibeCoderModel = (idx: number, selectedOption: any, checked: boolean) => {
    const feature = featureModels[idx];
    if (!feature) return;
    const existing = getSavedFeatureModelOptions(feature);
    const selectedKey = getModelOptionKey(selectedOption);
    const modelOptions = checked
      ? [...existing.filter((option: any) => getModelOptionKey(option) !== selectedKey), selectedOption]
      : existing.filter((option: any) => getModelOptionKey(option) !== selectedKey);
    const defaultOption = modelOptions.find((option: any) => option.modelId === feature.modelId) || modelOptions[0];
    updateFeatureModel(idx, {
      provider: defaultOption?.provider || feature.provider,
      modelOptions,
      modelIds: modelOptions.map((option: any) => option.modelId),
      modelId: defaultOption?.modelId || ''
    });
  };

  return (
    <section className="space-y-6">
      {/* Tabs */}
      <div className="flex bg-white dark:bg-ink-900 rounded-2xl border border-ink-100 dark:border-ink-800 p-1.5 shadow-sm max-w-fit">
        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'providers'
              ? 'bg-saffron-400 text-ink-900 shadow-base'
              : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
          }`}
        >
          <Key size={14} />
          API Providers
        </button>
        <button
          onClick={() => setActiveTab('configs')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'configs'
              ? 'bg-saffron-400 text-ink-900 shadow-base'
              : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
          }`}
        >
          <Layout size={14} />
          Model Management
        </button>
        <button
          onClick={() => setActiveTab('features')}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'features'
              ? 'bg-saffron-400 text-ink-900 shadow-base'
              : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
          }`}
        >
          <Sparkles size={14} />
          System Features
        </button>
      </div>

      {activeTab === 'providers' && (
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
                <Key size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">API Infrastructure</h3>
                <p className="text-[10px] text-ink-400 font-bold uppercase tracking-tighter mt-0.5">Manage Provider Keys & Endpoints</p>
              </div>
            </div>
            <button
              onClick={addProvider}
              className="flex items-center gap-2 rounded-xl border border-ink-200 dark:border-ink-700 px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:border-saffron-400 hover:text-saffron-500"
            >
              <Plus size={14} />
              Add Provider
            </button>
          </div>

          <div className="grid gap-4">
            {apiProviders.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 p-5 border border-ink-100 dark:border-ink-800 rounded-2xl bg-ink-50/30 dark:bg-ink-900/40 items-end group transition-all hover:border-ink-200 dark:hover:border-ink-700 shadow-sm hover:shadow-md">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Provider Name</label>
                  <input
                    className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-saffron-400 transition-colors"
                    value={p.name}
                    onChange={(e) => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                    placeholder="e.g. Anthropic, OpenAI"
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">API Key</label>
                  {p.name.toLowerCase().includes('openrouter') ? (
                    <input
                      type="password"
                      className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none font-mono focus:border-saffron-400 transition-colors"
                      value={p.apiKey || ''}
                      onChange={(e) => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, apiKey: e.target.value } : item))}
                      placeholder="OpenRouter API Key"
                    />
                  ) : (
                    <input
                      type="password"
                      className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none font-mono focus:border-saffron-400 transition-colors"
                      value={p.apiKey || ''}
                      onChange={(e) => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, apiKey: e.target.value } : item))}
                      placeholder="sk-..."
                    />
                  )}
                  {p.name.toLowerCase().includes('openrouter') && (
                    <div className="mt-2">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('https://openrouter.ai/api/v1/models', {
                              headers: { Authorization: `Bearer ${p.apiKey || ''}` }
                            });
                            alert(res.ok ? 'OpenRouter key valid' : 'OpenRouter key invalid');
                          } catch {
                            alert('OpenRouter key invalid');
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-ink-200 dark:border-ink-700 text-[10px] font-bold uppercase tracking-widest hover:border-saffron-400 hover:text-saffron-500 transition-colors"
                      >
                        <FlaskConical size={12} />
                        Test
                      </button>
                    </div>
                  )}
                </div>
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Base URL (optional)</label>
                  <input
                    className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none font-mono focus:border-saffron-400 transition-colors"
                    value={p.baseUrl || ''}
                    onChange={(e) => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, baseUrl: e.target.value } : item))}
                    placeholder="https://..."
                  />
                </div>
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Provider type</label>
                  <input
                    className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-saffron-400 transition-colors"
                    value={p.providerType || ''}
                    onChange={(e) => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, providerType: e.target.value } : item))}
                    placeholder="openai"
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1 flex items-center justify-between">
                    Failover
                    {p.isHealthy === false && (
                      <span className="text-red-500 font-black animate-pulse">! DOWN</span>
                    )}
                    {p.isHealthy === true && (
                      <span className="text-emerald-500 font-black">● UP</span>
                    )}
                  </label>
                  <select
                    className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-saffron-400 transition-colors cursor-pointer"
                    value={p.failoverProviderId || ''}
                    onChange={(e) => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, failoverProviderId: e.target.value || null } : item))}
                  >
                    <option value="">No Failover</option>
                    {apiProviders.filter(other => other.id !== p.id).map(other => (
                      <option key={other.id} value={other.id}>{other.name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-1 flex gap-2">
                  <button
                    onClick={() => onSetApiProviders(prev => prev.map((item, i) => i === idx ? { ...item, enabled: !item.enabled } : item))}
                    className={`flex-1 h-10 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                      p.enabled
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                        : 'bg-ink-100 text-ink-500 border-ink-200 dark:bg-ink-800 dark:border-ink-700'
                    }`}
                    title={p.enabled ? 'Disable Provider' : 'Enable Provider'}
                  >
                    {p.enabled ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => onSetApiProviders(prev => prev.filter((_, i) => i !== idx))}
                    className="h-10 w-10 flex-shrink-0 flex items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white dark:bg-red-900/20 dark:border-red-900/40 transition-all shadow-sm"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {apiProviders.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-ink-100 dark:border-ink-800 rounded-2xl text-ink-400 text-sm font-medium">
              No API providers configured. Add your first provider to start routing models.
            </div>
          )}
        </div>
      )}

      {activeTab === 'configs' && (
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
                <Layout size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Model Registry</h3>
                <p className="text-[10px] text-ink-400 font-bold uppercase tracking-tighter mt-0.5">Configure User Access & Pricing</p>
              </div>
            </div>
            <button
              onClick={addConfig}
              className="flex items-center gap-2 rounded-xl border border-ink-200 dark:border-ink-700 px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:border-saffron-400 hover:text-saffron-500"
            >
              <Plus size={14} />
              Register Model
            </button>
          </div>

          <div className="grid gap-6">
            {modelConfigs.map((c, idx) => (
              <div key={idx} className="border border-ink-100 dark:border-ink-800 rounded-3xl bg-ink-50/20 dark:bg-ink-900/40 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                {/* Header Section */}
                <div className="bg-white/50 dark:bg-white/5 p-5 border-b border-ink-100 dark:border-ink-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1 min-w-[200px]">
                    <div className="flex-1">
                      <input
                        className="w-full bg-transparent border-none p-0 text-lg font-bold text-ink-900 dark:text-ink-50 focus:ring-0 placeholder-ink-300"
                        value={c.name}
                        onChange={(e) => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, name: e.target.value } : item))}
                        placeholder="Model Display Name (e.g. ZygAI Alpha)"
                      />
                      <div className="flex items-center gap-2 mt-1">
                        <select
                          className="text-[10px] uppercase tracking-widest font-bold bg-transparent border-none p-0 focus:ring-0 text-saffron-500 cursor-pointer"
                          value={c.providerId}
                          onChange={(e) => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, providerId: e.target.value } : item))}
                        >
                          <option value="">Select Provider</option>
                          {apiProviders.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        <span className="text-ink-200 dark:text-ink-700 px-1">|</span>
                        <input
                          className="text-[10px] uppercase tracking-widest font-mono bg-transparent border-none p-0 focus:ring-0 text-ink-400 w-32"
                          value={c.modelId}
                          onChange={(e) => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, modelId: e.target.value } : item))}
                          placeholder="MODEL_ID"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, enabled: !item.enabled } : item))}
                      className={`h-9 px-4 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        c.enabled
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800'
                          : 'bg-ink-100 text-ink-500 border-ink-200 dark:bg-ink-800 dark:border-ink-700'
                      }`}
                    >
                      {c.enabled ? 'Live' : 'Hidden'}
                    </button>
                    <button
                      onClick={() => onSetModelConfigs(prev => prev.filter((_, i) => i !== idx))}
                      className="h-9 w-9 flex items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white dark:bg-red-900/20 dark:border-red-900/40 transition-all shadow-sm"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {/* Body Content */}
                <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left Column: Description & Category */}
                  <div className="lg:col-span-7 space-y-4">
                     <div>
                       <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1.5 block ml-1">Custom Description</label>
                       <textarea
                         className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-2xl px-4 py-3 text-sm outline-none focus:border-saffron-400 transition-colors resize-none h-24"
                         value={c.description}
                         onChange={(e) => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, description: e.target.value } : item))}
                         placeholder="Explain this model's strengths and best use cases..."
                       />
                     </div>
                     <div>
                       <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1.5 block ml-1">Model System Prompt</label>
                       <textarea
                         className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-2xl px-4 py-3 text-sm outline-none focus:border-saffron-400 transition-colors resize-none h-24 font-mono"
                         value={c.systemPrompt || ''}
                         onChange={(e) => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, systemPrompt: e.target.value } : item))}
                         placeholder="You are {model} made by {company} hosted on ZygAI. Be helpful, accurate, and concise."
                       />
                       <p className="text-[10px] text-ink-400 mt-1 ml-1">Variables: {'{model}'}, {'{company}'}. Combined with user's custom prompt.</p>
                     </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-2 block ml-1">Category & Badge</label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: '8k', label: '📚 8k', color: 'bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800' },
                          { id: '32k', label: '📖 32k', color: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800' },
                          { id: '128k', label: '📔 128k', color: 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-900/20 dark:border-violet-800' },
                          { id: 'instant', label: '⚡ Instant', color: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800' },
                          { id: 'paid', label: '💰 Paid', color: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800' }
                        ].map(cat => (
                          <button
                            key={cat.id}
                            onClick={() => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, category: cat.id } : item))}
                            className={`px-4 py-2 rounded-xl border text-xs font-bold transition-all ${
                              c.category === cat.id
                                ? cat.color + ' ring-2 ring-offset-2 ring-saffron-400 dark:ring-offset-ink-950'
                                : 'bg-white dark:bg-ink-900 text-ink-400 border-ink-100 dark:border-ink-800 hover:border-ink-200'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Limits & Access */}
                  <div className="lg:col-span-5 space-y-4">
                    <div className="bg-white/50 dark:bg-ink-950/30 border border-ink-100 dark:border-ink-800 rounded-2xl p-4 space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Settings2 size={14} className="text-saffron-500" />
                        <span className="text-[10px] uppercase tracking-widest font-bold text-ink-900 dark:text-ink-100">Usage Policy</span>
                      </div>
                      
                      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                        {LIMIT_FIELDS.map((field) => (
                          <div key={field.key}>
                            <label className="text-[9px] uppercase tracking-[0.15em] text-ink-500 font-bold mb-1 block">
                              {field.label}
                            </label>
                            <input
                              type="number"
                              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-saffron-400 transition-colors"
                              value={(c[field.key] as number | undefined) ?? 0}
                              onChange={(e) =>
                                onSetModelConfigs((prev) =>
                                  prev.map((item, i) =>
                                    i === idx
                                      ? { ...item, [field.key]: parseInt(e.target.value) || 0 }
                                      : item
                                  )
                                )
                              }
                            />
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] uppercase tracking-[0.15em] text-ink-500 font-bold block">
                          Plan Access
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {PLAN_OPTIONS.map((planOption) => {
                            const isActive = c.planAccess?.includes(planOption.id);
                            return (
                              <button
                                key={planOption.id}
                                onClick={() =>
                                  onSetModelConfigs((prev) =>
                                    prev.map((item, i) => {
                                      if (i !== idx) return item;
                                      const currentAccess = item.planAccess || ['free', 'go', 'plus', 'beta'];
                                      const hasPlan = currentAccess.includes(planOption.id);
                                      const updatedAccess = hasPlan
                                        ? currentAccess.filter((entry) => entry !== planOption.id)
                                        : [...currentAccess, planOption.id];
                                      return { ...item, planAccess: updatedAccess };
                                    })
                                  )
                                }
                                className={`px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-widest transition ${
                                  isActive
                                    ? 'bg-saffron-400 text-ink-900 shadow-sm'
                                    : 'border border-ink-200 bg-white text-ink-500 hover:border-saffron-400 hover:text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-saffron-500'
                                }`}
                              >
                                {planOption.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <label className="text-[9px] uppercase tracking-[0.15em] text-ink-500 font-bold mb-1 block">Role Restriction</label>
                        <div className="flex bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl p-1">
                          {[
                            { id: 'all', label: 'All', icon: Globe },
                            { id: 'user', label: 'User', icon: Database },
                            { id: 'admin', label: 'Admin', icon: Shield }
                          ].map(role => (
                            <button
                              key={role.id}
                              onClick={() => onSetModelConfigs(prev => prev.map((item, i) => i === idx ? { ...item, role: role.id as any } : item))}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                                c.role === role.id
                                  ? 'bg-saffron-400 text-ink-900 shadow-sm'
                                  : 'text-ink-400 hover:text-ink-600 dark:hover:text-ink-200'
                              }`}
                            >
                              <role.icon size={12} />
                              {role.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[10px] uppercase tracking-widest text-ink-500">
                        <span>Hide from chat</span>
                        <button
                          onClick={() =>
                            onSetModelConfigs(prev =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, hiddenFromChat: !item.hiddenFromChat } : item
                              )
                            )
                          }
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold transition ${
                            c.hiddenFromChat
                              ? 'bg-ink-900 text-white dark:bg-ink-50 dark:text-ink-900'
                              : 'border border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-300'
                          }`}
                        >
                          {c.hiddenFromChat ? 'Hidden' : 'Visible'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {modelConfigs.length === 0 && (
            <div className="text-center py-12 border-2 border-dashed border-ink-100 dark:border-ink-800 rounded-2xl text-ink-400 text-sm font-medium">
              No models registered. Start by adding a provider and then register your models here.
            </div>
          )}
        </div>
      )}

      {activeTab === 'features' && (
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
              <Sparkles size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">System AI Features</h3>
              <p className="text-[10px] text-ink-400 font-bold uppercase tracking-tighter mt-0.5">Route AI Intelligence for System Tasks</p>
            </div>
          </div>

          <div className="grid gap-6">
            {featureModels.map((fm, idx) => {
              const meta = FEATURE_META[fm.featureKey];
              const FeatureIcon = meta?.icon || Sparkles;
              
              return (
                <div key={fm.featureKey} className="p-5 border border-ink-100 dark:border-ink-800 rounded-2xl bg-ink-50/30 dark:bg-ink-900/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all hover:border-ink-200 dark:hover:border-ink-700">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-ink-800 border border-ink-100 dark:border-ink-700 text-saffron-500 shadow-sm">
                      <FeatureIcon size={20} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-ink-900 dark:text-ink-50 uppercase tracking-wide">
                        {meta?.label || fm.featureKey.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] text-ink-500 font-medium uppercase tracking-widest">
                        {meta?.description || 'Feature Routing'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto">
                    {fm.featureKey === 'reach' && siteSettings && onSetSiteSettings && (
                       <label className="flex items-center gap-2 cursor-pointer bg-white dark:bg-ink-800 px-3 py-1.5 rounded-xl border border-ink-100 dark:border-ink-700 shadow-sm">
                         <span className="text-[10px] font-bold uppercase tracking-widest text-ink-500">Public Access</span>
                         <div className="relative">
                           <input
                             type="checkbox"
                             className="hidden peer"
                             checked={siteSettings.reachPublic === true}
                             onChange={(e) => onSetSiteSettings({ ...siteSettings, reachPublic: e.target.checked })}
                           />
                           <div className="w-8 h-4 bg-ink-200 dark:bg-ink-700 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                           <div className="absolute left-0.5 top-0.5 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                         </div>
                       </label>
                    )}

                    <div className="hidden lg:flex flex-col items-end mr-4">
                      <span className="text-[10px] uppercase tracking-widest text-ink-400 font-bold">Active Model</span>
                      <span className="text-xs font-mono font-bold text-ink-700 dark:text-ink-300 italic">
                        {fm.provider}: {fm.featureKey === 'vibe_coder'
                          ? `${getSavedFeatureModelOptions(fm).length} model${getSavedFeatureModelOptions(fm).length === 1 ? '' : 's'}`
                          : fm.modelId.replace('m-', 'Model ')}
                      </span>
                    </div>
                    <button
                      onClick={() => openConfigModal(idx)}
                      className="flex items-center gap-2 rounded-xl bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-5 py-2.5 text-xs font-bold uppercase tracking-widest transition hover:opacity-90 shadow-sm ml-auto md:ml-0"
                    >
                      <Settings2 size={14} />
                      Configure
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feature Configuration Modal */}
      {configModalIndex !== null && featureModels[configModalIndex] && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white dark:bg-ink-950 rounded-3xl border border-ink-200 dark:border-ink-800 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between bg-ink-50/50 dark:bg-ink-900/30">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
                  {FEATURE_META[featureModels[configModalIndex].featureKey]?.icon ? 
                    React.createElement(FEATURE_META[featureModels[configModalIndex].featureKey].icon, { size: 20 }) : 
                    <Sparkles size={20} />
                  }
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink-900 dark:text-ink-50 uppercase tracking-widest">
                    {FEATURE_META[featureModels[configModalIndex].featureKey]?.label || featureModels[configModalIndex].featureKey.replace(/_/g, ' ')}
                  </h3>
                  <p className="text-xs text-ink-500 font-medium">System Feature Routing & Intelligence</p>
                </div>
              </div>
              <button 
                onClick={closeConfigModal}
                className="h-10 w-10 flex items-center justify-center rounded-full hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors"
              >
                <X size={20} className="text-ink-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">AI Provider</label>
                  <div className="relative">
                    <select
                      className="w-full bg-ink-50 dark:bg-ink-900/50 border border-ink-200 dark:border-ink-700 rounded-2xl px-5 py-3 text-sm focus:border-saffron-400 outline-none transition-all appearance-none font-bold cursor-pointer"
                      value={featureModels[configModalIndex].provider}
                      onChange={(e) => updateFeatureModel(configModalIndex, { provider: e.target.value })}
                    >
                      <option value="llama">Local (llama)</option>
                      <option value="zygai">ZygAI (Native)</option>
                      <option value="zygai-ollama">ZygAI Native (Ollama)</option>
                      <option value="openrouter">OpenRouter</option>
                      {apiProviders.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                      {/* Unique provider types for generic routing */}
                      {Array.from(new Set(apiProviders.map(p => p.providerType))).filter(Boolean).map(type => (
                        <option key={type} value={type!.toLowerCase()}>Type: {PROVIDER_LABELS[type!] || type}</option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ink-400">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Model Selection</label>
                  <div className="relative">
                    <select
                      className="w-full bg-ink-50 dark:bg-ink-900/50 border border-ink-200 dark:border-ink-700 rounded-2xl px-5 py-3 text-sm focus:border-saffron-400 outline-none transition-all appearance-none font-mono cursor-pointer"
                      value={featureModels[configModalIndex].featureKey === 'vibe_coder'
                        ? getModelOptionKey({
                          provider: featureModels[configModalIndex].provider,
                          modelId: featureModels[configModalIndex].modelId
                        })
                        : featureModels[configModalIndex].modelId}
                      onChange={(e) => setDefaultFeatureModel(configModalIndex, e.target.value)}
                    >
                      <option value="">Select an available model...</option>
                      {getFeatureModelOptions(featureModels[configModalIndex]).map(option => (
                        <option
                          key={featureModels[configModalIndex].featureKey === 'vibe_coder' ? getModelOptionKey(option) : option.id}
                          value={featureModels[configModalIndex].featureKey === 'vibe_coder' ? getModelOptionKey(option) : option.id}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-ink-400">
                      <ChevronDown size={16} />
                    </div>
                  </div>
                </div>
              </div>

              {featureModels[configModalIndex].featureKey === 'vibe_coder' && (
                <div className="space-y-3 rounded-2xl border border-ink-100 bg-ink-50/70 p-4 dark:border-ink-800 dark:bg-ink-900/40">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold">Enabled Vibe Coder Models</p>
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                      Users can only choose models checked here. The default model above is selected first.
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {getFeatureModelOptions(featureModels[configModalIndex]).map(option => {
                      const enabledKeys = getSavedFeatureModelOptions(featureModels[configModalIndex]).map((enabled: any) => getModelOptionKey(enabled));
                      const optionKey = getModelOptionKey(option);
                      const checked = enabledKeys.includes(optionKey);
                      return (
                        <label
                          key={optionKey}
                          className={clsx(
                            'flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-xs transition',
                            checked
                              ? 'border-saffron-300 bg-white text-ink-900 shadow-sm dark:border-saffron-700 dark:bg-ink-950 dark:text-ink-50'
                              : 'border-ink-200 bg-white/50 text-ink-500 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleVibeCoderModel(configModalIndex, option, e.target.checked)}
                            className="h-4 w-4 accent-saffron-500"
                          />
                          <span className="min-w-0 flex-1 truncate font-mono">{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">System Prompt Override</label>
                <textarea
                  className="w-full bg-ink-50 dark:bg-ink-900/50 border border-ink-200 dark:border-ink-700 rounded-2xl px-5 py-4 text-sm outline-none focus:border-saffron-400 transition-all resize-none h-40 font-medium leading-relaxed"
                  value={featureModels[configModalIndex].systemPrompt || ''}
                  onChange={(e) => updateFeatureModel(configModalIndex, { systemPrompt: e.target.value })}
                  placeholder="Leave empty to use model's default system instructions..."
                />
              </div>

              <div className="rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 p-4 flex gap-3">
                <Shield size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-normal font-medium">
                  Changes made here apply system-wide for this feature. Ensure the selected model supports the required capabilities (e.g., JSON extraction for Reach).
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-ink-100 dark:border-ink-800 flex justify-end gap-3 bg-ink-50/30 dark:bg-ink-900/20">
              <button
                onClick={closeConfigModal}
                className="px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest text-ink-600 hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  closeConfigModal();
                  await handleSave();
                }}
                disabled={isSaving}
                className="px-8 py-2.5 rounded-xl bg-saffron-400 text-ink-900 text-xs font-bold uppercase tracking-widest transition hover:bg-saffron-500 shadow-md"
              >
                {isSaving ? 'Saving...' : 'Confirm Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-ink-50 dark:border-ink-800 pt-6">
        {saveStatus && (
          <p className={`text-xs font-bold ${saveStatus.includes('success') ? 'text-emerald-500' : 'text-red-500'}`}>
            {saveStatus}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-xl bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-8 py-3 text-white text-xs font-bold uppercase tracking-widest transition hover:opacity-90 shadow-lg shadow-ink-900/10 dark:shadow-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Applying Changes...' : 'Apply Registry Changes'}
        </button>
      </div>
    </section>
  );
};
