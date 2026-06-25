import React from 'react';
import { X, Music2, CheckCircle, ChevronRight, Clock } from 'lucide-react';
import clsx from 'clsx';

interface ZygMusicPacketModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: string;
  quotaUsed: number;
  quotaLimit: number | null;
  onRequestUpgrade: () => void;
}

const PLAN_LIMITS: Record<string, { limit: number | string; label: string; color: string }> = {
  free: { limit: 2,  label: 'Free',       color: 'text-ink-500' },
  go:   { limit: 20, label: 'ZygAI Go',   color: 'text-violet-600 dark:text-violet-400' },
  plus: { limit: 50, label: 'ZygAI Plus', color: 'text-fuchsia-600 dark:text-fuchsia-400' },
  beta: { limit: 50, label: 'ZygAI Beta', color: 'text-emerald-600 dark:text-emerald-400' },
};

const ZygMusicPacketModal: React.FC<ZygMusicPacketModalProps> = ({
  isOpen, onClose, plan, quotaUsed, quotaLimit, onRequestUpgrade,
}) => {
  if (!isOpen) return null;

  const remaining = quotaLimit !== null ? Math.max(0, quotaLimit - quotaUsed) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-950">

        {/* Header */}
        <div className="bg-gradient-to-r from-violet-600 to-fuchsia-600 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20">
                <Music2 size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-display text-lg font-bold text-white">ZygMusic</h2>
                <p className="text-[11px] text-violet-200">Plan limits</p>
              </div>
            </div>
            <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
              <X size={16} />
            </button>
          </div>

          {/* Status */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-200">Plan</p>
              <p className="mt-0.5 font-bold text-white">{PLAN_LIMITS[plan]?.label || 'Free'}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-violet-200">Today</p>
              <p className="mt-0.5 font-bold text-white flex items-center justify-center gap-1">
                <Clock size={12} />
                {remaining !== null ? `${remaining} left` : `${quotaLimit ?? 50} left`}
              </p>
            </div>
          </div>
        </div>

        {/* Plan list */}
        <div className="p-6">
          <p className="mb-4 text-sm text-ink-500 dark:text-ink-400">
            Music generations reset every 24 hours.
          </p>
          <div className="space-y-2">
            {Object.entries(PLAN_LIMITS).map(([key, info]) => {
              const isCurrent = key === plan;
              return (
                <div
                  key={key}
                  className={clsx(
                    'flex items-center justify-between rounded-2xl border px-4 py-3',
                    isCurrent
                      ? 'border-violet-300 bg-violet-50 dark:border-violet-700/50 dark:bg-violet-950/30'
                      : 'border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {isCurrent && <CheckCircle size={15} className="text-violet-500 flex-shrink-0" />}
                    <span className={clsx('font-semibold text-sm', info.color, !isCurrent && 'ml-[19px]')}>
                      {info.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-ink-700 dark:text-ink-200">
                      {info.limit} / day
                    </span>
                    {!isCurrent && key !== 'free' && key !== 'beta' && (
                      <button
                        onClick={() => { onClose(); onRequestUpgrade(); }}
                        className="rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 px-3 py-1 text-[11px] font-bold text-white hover:opacity-90"
                      >
                        Upgrade <ChevronRight size={10} className="inline" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZygMusicPacketModal;
