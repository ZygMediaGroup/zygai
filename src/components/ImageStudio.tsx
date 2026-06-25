import React, { useEffect, useRef, useState } from 'react';
import { SendHorizontal, Trash2, Download, RefreshCw, ImageIcon, Wand2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanQuotas } from '@/hooks/usePlanQuotas';
import { useUserCampaigns } from '@/hooks/useUserCampaigns';
import clsx from 'clsx';
import { API_BASE } from '@/utils/apiBase';
import PlanQuotaMeter from './PlanQuotaMeter';

interface ImageStudioProps {
  onRequestUpgrade: () => void;
}

interface ImageMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  createdAt: string;
}

interface ImageConfigResponse {
  feature: {
    featureKey: string;
    provider: string;
    modelId: string;
    systemPrompt: string;
  } | null;
  config: {
    id: string;
    name: string;
    providerId: string;
    providerName: string;
    providerType: string;
    freeLimit: number;
    paidLimit: number;
    limits: Record<string, number>;
    planAccess: string[];
    planQuota?: {
      label: string;
      limit: number;
      used: number;
      resetAt: string | null;
      plan: string;
    } | null;
    campaigns?: Array<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
    }> | null;
  } | null;
  usageCount: number;
}

const styleOptions = [
  'None',
  'Photorealistic',
  'Digital Art',
  'Anime',
  'Oil Painting',
  'Watercolor',
  '3D Render',
  'Pixel Art',
  'Sketch',
  'Cinematic',
];

const ImageStudio: React.FC<ImageStudioProps> = ({ onRequestUpgrade }) => {
  const { token } = useAuth();
  const { quotas, refreshQuotas } = usePlanQuotas();
  const { campaigns } = useUserCampaigns();
  const [messages, setMessages] = useState<ImageMessage[]>([]);
  const [input, setInput] = useState('');
  const [style, setStyle] = useState(styleOptions[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [imageConfig, setImageConfig] = useState<ImageConfigResponse | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch(`${API_BASE}/image-config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setImageConfig(data);
        }
      } catch (err) {
        console.error('Image Studio config failed:', err);
      }
    };
    if (token) fetchConfig();
  }, [token]);

  const checkLimit = (): boolean => {
    const imageQuota = quotas.image_generation;
    const imageCampaign = campaigns.find(c => c.featureKey === 'image_generation');

    const imageOk = imageCampaign
      ? imageCampaign.quotaUsed < imageCampaign.quotaLimit
      : (!imageQuota || imageQuota.isUnlimited || imageQuota.limit === null || imageQuota.used < imageQuota.limit);

    return imageOk;
  };

  const generateImage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    if (!checkLimit()) {
      onRequestUpgrade();
      return;
    }

    const userMessage: ImageMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    const prompt = style && style !== 'None' ? `${trimmed}, ${style.toLowerCase()} style` : trimmed;

    try {
      const res = await fetch(`${API_BASE}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          modelId: imageConfig?.config?.id || imageConfig?.feature?.modelId,
          provider: imageConfig?.config?.providerType || imageConfig?.feature?.provider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Image generation failed.');
        const cleanError = (data.error || 'I apologize, but I encountered an error while generating your images.')
          .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: cleanError,
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      const cleanContent = (data.text || `Here are the generated images for: "${trimmed}"`)
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const assistantMessage: ImageMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: cleanContent,
        images: data.images || [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      setImageConfig((prev) =>
        prev ? { ...prev, usageCount: prev.usageCount + 1 } : prev
      );
      refreshQuotas();
    } catch (err) {
      setError('Network error. Please try again.');
      const cleanError = 'I apologize, but I encountered an error while generating your images.'
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: cleanError,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateLast = async () => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg || isLoading) return;

    if (!checkLimit()) {
      onRequestUpgrade();
      return;
    }

    setInput('');
    setIsLoading(true);
    setError(null);

    const prompt = style && style !== 'None' ? `${lastUserMsg.content}, ${style.toLowerCase()} style` : lastUserMsg.content;

    try {
      const res = await fetch(`${API_BASE}/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          modelId: imageConfig?.config?.id || imageConfig?.feature?.modelId,
          provider: imageConfig?.config?.providerType || imageConfig?.feature?.provider,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Image generation failed.');
        const cleanError = (data.error || 'I apologize, but I encountered an error while regenerating your images.')
          .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
          .replace(/<[^>]+>/g, '')
          .trim();
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: cleanError,
            createdAt: new Date().toISOString(),
          },
        ]);
        return;
      }

      const cleanContent = (data.text || `Here are the regenerated images for: "${lastUserMsg.content}"`)
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const assistantMessage: ImageMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: cleanContent,
        images: data.images || [],
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      setImageConfig((prev) =>
        prev ? { ...prev, usageCount: prev.usageCount + 1 } : prev
      );
      refreshQuotas();
    } catch (err) {
      setError('Network error. Please try again.');
      const cleanError = 'I apologize, but I encountered an error while regenerating your images.'
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: cleanError,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateImage();
    }
  };

  const clearChat = () => {
    setMessages([]);
  };

  const downloadImage = (url: string, index: number) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = `zygai-image-${index + 1}.png`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-ink-900">
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-200 dark:border-ink-700">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-100">Image Studio</h2>
        </div>
        <div className="flex items-center gap-2">
          {/* Show campaign quotas first if available, otherwise show plan quotas */}
          {campaigns.filter(c => c.featureKey === 'image_generation').length > 0 ? (
            campaigns
              .filter(c => c.featureKey === 'image_generation')
              .map(campaign => (
                <PlanQuotaMeter
                  key={campaign.id}
                  quota={{
                    feature: 'image_generation',
                    label: campaign.name,
                    limit: campaign.quotaLimit,
                    used: campaign.quotaUsed,
                    resetAt: campaign.expiresAt,
                    windowMs: 0,
                    plan: 'campaign',
                    isUnlimited: false
                  }}
                  compact
                  className="hidden min-w-[190px] sm:block"
                />
              ))
          ) : (
            <PlanQuotaMeter quota={quotas.image_generation} compact className="hidden min-w-[190px] sm:block" />
          )}
          {imageConfig?.config && (
            <span className="text-xs text-ink-500 dark:text-ink-400">
              {imageConfig.config.name || imageConfig.config.providerName}
            </span>
          )}
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              className="p-1.5 rounded-lg hover:bg-ink-100 dark:hover:bg-ink-800 text-ink-500 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-ink-400 dark:text-ink-500 gap-3">
            <Wand2 className="w-12 h-12" />
            <p className="text-center max-w-md">
              Describe an image and I'll generate it for you. Choose a style to customize the output.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx(
              'flex',
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={clsx(
                'max-w-[80%] rounded-2xl px-4 py-2.5',
                msg.role === 'user'
                  ? 'bg-primary-500 text-white'
                  : 'bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-ink-100'
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.images && msg.images.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {msg.images.map((img, idx) => (
                    <div key={idx} className="relative group rounded-lg overflow-hidden">
                      <img
                        src={img}
                        alt={`Generated ${idx + 1}`}
                        className="w-full h-auto rounded-lg"
                      />
                      <button
                        onClick={() => downloadImage(img, idx)}
                        className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity text-white"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-ink-100 dark:bg-ink-800 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-2 text-ink-500">
                <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse" />
                <span className="text-sm">Generating image...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-ink-200 dark:border-ink-700 p-3">
        <div className="flex items-center gap-2 mb-2">
          <label className="text-xs text-ink-500 dark:text-ink-400">Style:</label>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            className="text-xs bg-ink-100 dark:bg-ink-800 text-ink-900 dark:text-ink-100 rounded-lg px-2 py-1 border border-ink-200 dark:border-ink-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            {styleOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {messages.length > 0 && (
            <button
              onClick={regenerateLast}
              disabled={isLoading}
              className="ml-auto flex items-center gap-1 text-xs text-ink-500 hover:text-primary-500 disabled:opacity-50 transition-colors"
              title="Regenerate last"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          )}
        </div>

        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the image you want to generate..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 text-ink-900 dark:text-ink-100 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 placeholder:text-ink-400"
          />
          <button
            onClick={generateImage}
            disabled={!input.trim() || isLoading}
            className="p-2.5 rounded-xl bg-primary-500 text-white disabled:opacity-50 hover:bg-primary-600 transition-colors"
          >
            <SendHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageStudio;
