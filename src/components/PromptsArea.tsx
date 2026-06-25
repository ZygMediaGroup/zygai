import React, { useEffect, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';

interface PromptItem {
  id: string;
  title: string;
  body: string;
}

const PromptsArea: React.FC = () => {
  const [prompts, setPrompts] = useState<PromptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(`${API_BASE}/prompts`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Failed to load prompts.');
        setPrompts(data.prompts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load prompts.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleCopy = async (prompt: PromptItem) => {
    await navigator.clipboard.writeText(prompt.body);
    setCopiedId(prompt.id);
    window.setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="chat-gradient flex-1 overflow-y-auto px-4 py-6 text-ink-100 sm:px-6">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <div className="rounded-2xl border border-ink-100 bg-white/90 p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900/80">
          <h2 className="font-display text-2xl text-ink-900 dark:text-ink-50">Prompts</h2>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-300">
            Copy and paste a prompt into chat.
          </p>
        </div>

        {loading && (
          <div className="rounded-2xl border border-ink-100 bg-white/90 p-6 text-sm text-ink-500 shadow-sm dark:border-ink-800 dark:bg-ink-900/80 dark:text-ink-300">
            Loading prompts...
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {!loading && !error && prompts.length === 0 && (
          <div className="rounded-2xl border border-ink-100 bg-white/90 p-6 text-sm text-ink-500 shadow-sm dark:border-ink-800 dark:bg-ink-900/80 dark:text-ink-300">
            No prompts yet.
          </div>
        )}

        {!loading && !error && prompts.length > 0 && (
          <div className="grid gap-4">
            {prompts.map((prompt) => (
              <div
                key={prompt.id}
                className="rounded-2xl border border-ink-100 bg-white/90 p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900/80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                      {prompt.title}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600 dark:text-ink-200">
                      {prompt.body}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(prompt)}
                    className="rounded-full border border-ink-200 bg-white/80 p-2 text-ink-700 transition hover:border-saffron-400 hover:text-saffron-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
                    aria-label="Copy prompt"
                  >
                    {copiedId === prompt.id ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptsArea;
