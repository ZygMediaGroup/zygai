import React, { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';

interface Props {
  modelId?: string;
  onGenerated?: () => void; // optional callback to refresh quota
}

export const ZygMusic: React.FC<Props> = ({ modelId: _modelId = 'google/lyria-3-pro-preview', onGenerated }) => {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const generate = async () => {
    if (!token || !query.trim()) return;
    setLoading(true);
    setAudioUrl(undefined);
    setError(null);
    setElapsed(0);

    const start = Date.now();
    timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 600_000); // 10 min — Lyria can be slow

    try {
      const res = await fetch(`${API_BASE}/music/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: query.trim() }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Music generation failed. Please try again.');
        return;
      }

      const url = data?.output || data?.audioUrl || data?.url || null;
      if (url && typeof url === 'string') {
        setAudioUrl(url);
        onGenerated?.();
      } else {
        setError('No audio received. Please try again.');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        setError('Request timed out (10 min). Please try again.');
      } else {
        setError(e?.message || 'Error generating music. Please try again.');
      }
    } finally {
      clearTimeout(timeout);
      if (timerRef.current) clearInterval(timerRef.current);
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }
  };

  return (
    <div className="space-y-4 text-white">
      <textarea
        className="w-full h-28 rounded-xl border border-white/20 bg-black px-4 py-3 text-sm text-white outline-none focus:border-violet-400 resize-none transition-colors placeholder-white/40"
        placeholder="Describe the music you want… e.g. 'A calm lo-fi beat with piano and soft drums'"
        value={query}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading}
      />
      <button
        className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
        disabled={!query.trim() || loading}
        onClick={generate}
      >
        {loading ? `🎵 Composing… ${elapsed}s` : '🎵 Generate Music'}
      </button>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {audioUrl && (
        <div className="rounded-xl border border-white/20 bg-black/60 p-4 space-y-3">
          <div className="flex items-center gap-3">
            <audio src={audioUrl} controls className="flex-1 rounded-lg" />
            <a
              href={audioUrl}
              download
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-bold uppercase tracking-widest hover:opacity-90 transition-colors whitespace-nowrap"
            >
              ⬇ Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
};
