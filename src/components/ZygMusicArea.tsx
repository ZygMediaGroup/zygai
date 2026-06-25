import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Music2,
  Play,
  Pause,
  Download,
  Sparkles,
  RefreshCw,
  Volume2,
  VolumeX,
  Clock,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import ZygMusicPacketModal from './ZygMusicPacketModal';
import clsx from 'clsx';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MusicTrack {
  id: string;
  prompt: string;
  audioUrl: string;
  duration?: number;
  createdAt: string;
  status: 'generating' | 'ready' | 'error';
}

interface MusicConfig {
  plan: string;
  used: number;
  limit: number | null;
  remaining: number;
}

// ─── Genre / mood presets ─────────────────────────────────────────────────────

const GENRE_PRESETS = [
  { label: 'Cinematic', emoji: '🎬', hint: 'Epic orchestral cinematic score' },
  { label: 'Lo-Fi', emoji: '☕', hint: 'Chill lo-fi hip hop study beats' },
  { label: 'Electronic', emoji: '⚡', hint: 'Energetic electronic dance music' },
  { label: 'Acoustic', emoji: '🎸', hint: 'Warm acoustic folk guitar melody' },
  { label: 'Jazz', emoji: '🎷', hint: 'Smooth jazz with piano and saxophone' },
  { label: 'Ambient', emoji: '🌌', hint: 'Atmospheric ambient soundscape' },
  { label: 'Rock', emoji: '🤘', hint: 'Powerful rock with electric guitars' },
  { label: 'Classical', emoji: '🎻', hint: 'Elegant classical string quartet' },
];

// ─── Audio player subcomponent ────────────────────────────────────────────────

const MiniPlayer: React.FC<{ track: MusicTrack }> = ({ track }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else { el.play(); setPlaying(true); }
  };

  const handleTimeUpdate = () => {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    setProgress((el.currentTime / el.duration) * 100);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    el.currentTime = ratio * el.duration;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = track.audioUrl;
    a.download = `zygmusic-${track.id}.mp3`;
    a.click();
  };

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm dark:border-ink-800 dark:bg-ink-900">
      <audio
        ref={audioRef}
        src={track.audioUrl}
        muted={muted}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
        onEnded={() => setPlaying(false)}
      />

      {/* Waveform-ish progress bar */}
      <div
        className="relative h-10 cursor-pointer overflow-hidden rounded-xl bg-gradient-to-r from-violet-50 to-fuchsia-50 dark:from-violet-950/30 dark:to-fuchsia-950/30"
        onClick={handleSeek}
        title="Seek"
      >
        {/* Static fake bars */}
        <div className="absolute inset-0 flex items-center justify-around px-2">
          {Array.from({ length: 40 }).map((_, i) => {
            const h = 20 + Math.sin(i * 0.8) * 14 + Math.cos(i * 1.3) * 8;
            const pct = (i / 40) * 100;
            const active = pct <= progress;
            return (
              <div
                key={i}
                style={{ height: `${h}%` }}
                className={clsx(
                  'w-[2px] rounded-full transition-colors',
                  active
                    ? 'bg-violet-500 dark:bg-violet-400'
                    : 'bg-ink-200 dark:bg-ink-700'
                )}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm transition hover:scale-105"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-ink-600 dark:text-ink-400">
            {track.prompt}
          </p>
        </div>

        <span className="flex-shrink-0 text-[10px] tabular-nums text-ink-400 dark:text-ink-500">
          {fmt(Math.floor((progress / 100) * duration))}/{fmt(duration)}
        </span>

        <button
          onClick={() => { setMuted(m => !m); }}
          className="flex-shrink-0 text-ink-400 hover:text-ink-700 dark:hover:text-ink-200"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
        </button>

        <button
          onClick={handleDownload}
          className="flex-shrink-0 text-ink-400 hover:text-violet-500"
          aria-label="Download"
        >
          <Download size={15} />
        </button>
      </div>
    </div>
  );
};

// ─── Skeleton loading card ────────────────────────────────────────────────────

const GeneratingCard: React.FC<{ prompt: string }> = ({ prompt }) => (
  <div className="flex flex-col gap-3 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4 shadow-sm dark:border-violet-900/40 dark:from-violet-950/20 dark:to-fuchsia-950/20">
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-fuchsia-400">
        <Music2 size={14} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-medium text-violet-700 dark:text-violet-300">{prompt}</p>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-violet-500">
          <RefreshCw size={10} className="animate-spin" />
          Composing your track… this may take up to 60 seconds, please wait
        </div>
      </div>
    </div>
    {/* Animated bars */}
    <div className="flex h-8 items-center justify-around gap-0.5 overflow-hidden rounded-xl bg-white/60 px-2 dark:bg-ink-900/20">
      {Array.from({ length: 28 }).map((_, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full bg-violet-400/60 dark:bg-violet-500/60"
          style={{
            height: `${30 + Math.random() * 60}%`,
            animationDelay: `${i * 0.05}s`,
            animation: 'musicBar 0.9s ease-in-out infinite alternate',
          }}
        />
      ))}
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

interface ZygMusicAreaProps {
  onRequestUpgrade: () => void;
}

const ZygMusicArea: React.FC<ZygMusicAreaProps> = ({ onRequestUpgrade }) => {
  const { token, user } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [config, setConfig] = useState<MusicConfig | null>(null);
  const [packetModalOpen, setPacketModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // ── Fetch quota config
  const fetchConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/music/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setConfig(await res.json());
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ── Fetch track history
  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/music/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.tracks) setTracks(data.tracks.map((t: any) => ({ ...t, audioUrl: t.audioUrl?.startsWith('http') ? t.audioUrl : `${window.location.origin}${t.audioUrl}` }))); })
      .catch(() => {});
  }, [token]);

  // ── Quota check
  const hasCredits = config ? config.remaining > 0 : true;

  const quotaUsed = config?.used ?? 0;
  const quotaLimit = config?.limit ?? null;
  const remaining = config?.remaining ?? null;

  // ── Generate
  const generate = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || !token) return;
    if (!hasCredits) { setPacketModalOpen(true); return; }

    setError(null);
    const tempId = `gen-${Date.now()}`;

    setGeneratingIds(s => new Set(s).add(tempId));

    try {
      const res = await fetch(`${API_BASE}/music/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: trimmed }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setPacketModalOpen(true);
          setError(data.error || 'Limit reached. Buy a music packet to keep going.');
        } else {
          setError(data.error || 'Music generation failed.');
        }
        return;
      }

      const newTrack: MusicTrack = {
        id: data.id,
        prompt: trimmed,
        audioUrl: data.output?.startsWith('http') ? data.output : `${window.location.origin}${data.output}`,
        createdAt: new Date().toISOString(),
        status: 'ready',
      };
      setTracks(prev => [newTrack, ...prev]);
      setPrompt('');
      fetchConfig();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setGeneratingIds(s => { const n = new Set(s); n.delete(tempId); return n; });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); generate(); }
  };

  const applyPreset = (hint: string) => {
    setPrompt(hint);
    promptRef.current?.focus();
  };

  const isGenerating = generatingIds.size > 0;

  return (
    <>
      {/* Keyframes injected inline */}
      <style>{`
        @keyframes musicBar {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1); }
        }
      `}</style>

      <div className="flex h-full flex-col bg-white dark:bg-ink-950">
        {/* ── Header */}
        <div className="border-b border-ink-100 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-white px-6 py-4 dark:border-ink-800 dark:from-violet-950/20 dark:via-fuchsia-950/10 dark:to-ink-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-sm">
                <Music2 size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-ink-900 dark:text-ink-50">
                  ZygMusic
                </h1>
                <p className="text-[11px] text-ink-400 dark:text-ink-500">
                  AI music generation · Lyria 3 Pro
                </p>
              </div>
            </div>

            {/* Quota pill */}
            <div className="flex items-center gap-2">
              {remaining !== null && (
                <div className={clsx(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold',
                  remaining === 0
                    ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-400'
                    : 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800/50 dark:bg-violet-950/30 dark:text-violet-300'
                )}>
                  <Clock size={10} />
                  {remaining}/{quotaLimit} today
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Main scrollable content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Tracks list */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {/* Generating skeletons */}
              {Array.from(generatingIds).map(id => (
                <GeneratingCard key={id} prompt={prompt || 'Generating…'} />
              ))}

              {/* Tracks */}
              {tracks.map(track => (
                <MiniPlayer key={track.id} track={track} />
              ))}

              {tracks.length === 0 && !isGenerating && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-950/40 dark:to-fuchsia-950/40">
                    <Music2 size={28} className="text-violet-400" />
                  </div>
                  <p className="text-base font-semibold text-ink-700 dark:text-ink-200">
                    No music yet
                  </p>
                  <p className="mt-1 text-sm text-ink-400 dark:text-ink-500">
                    Describe the music you want and hit Generate
                  </p>
                </div>
              )}
            </div>

            {/* ── Error */}
            {error && (
              <div className="mx-6 mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}

            {/* ── Input area */}
            <div className="border-t border-ink-100 bg-white px-4 py-3 dark:border-ink-800 dark:bg-ink-950">
              {/* Genre presets */}
              <div className="mb-2 flex flex-wrap gap-1.5">
                {GENRE_PRESETS.map(g => (
                  <button
                    key={g.label}
                    onClick={() => applyPreset(g.hint)}
                    className="flex items-center gap-1 rounded-full border border-ink-200 bg-ink-50 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-violet-600 dark:hover:bg-violet-950/30 dark:hover:text-violet-300"
                  >
                    <span>{g.emoji}</span>
                    {g.label}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2">
                <textarea
                  ref={promptRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the music you want… e.g. 'Upbeat lo-fi hip hop with rainy day vibes'"
                  rows={2}
                  className="flex-1 resize-none rounded-2xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 placeholder-ink-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:placeholder-ink-500 dark:focus:border-violet-500"
                />
                <button
                  onClick={generate}
                  disabled={isGenerating || !prompt.trim()}
                  className={clsx(
                    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl transition',
                    isGenerating || !prompt.trim()
                      ? 'bg-ink-100 text-ink-400 cursor-not-allowed dark:bg-ink-800 dark:text-ink-600'
                      : 'bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm hover:opacity-90'
                  )}
                  aria-label="Generate music"
                >
                  {isGenerating
                    ? <RefreshCw size={16} className="animate-spin" />
                    : <Sparkles size={16} />
                  }
                </button>
              </div>
              <p className="mt-1.5 text-[10px] text-ink-400 dark:text-ink-600">
                Press Enter to generate · Shift+Enter for new line
              </p>
              <p className="mt-1 text-center text-[10px] text-ink-400 dark:text-ink-600">
                ZygMusic is powered by Google Lyria and subject to Google's Terms of Service. Generated content must comply with applicable usage rights. Occasional unexpected outputs may occur.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Packet modal */}
      <ZygMusicPacketModal
        isOpen={packetModalOpen}
        onClose={() => setPacketModalOpen(false)}
        plan={(user as any)?.plan || 'free'}
        quotaUsed={quotaUsed}
        quotaLimit={quotaLimit}
        onRequestUpgrade={onRequestUpgrade}
      />
    </>
  );
};

export default ZygMusicArea;
