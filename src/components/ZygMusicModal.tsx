import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Music, Info } from 'lucide-react';
import { ZygMusic } from './ZygMusic';
import { useMusicLimits } from '@/hooks/useMusicLimits';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  modelId?: string;
}

export const ZygMusicModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { limits, used, plan, remaining } = useMusicLimits();
  const ZYGMUSIC_MODEL = 'google/lyria-3-pro-preview';
  const planLimit = limits[plan as keyof typeof limits] ?? 2;

  useEffect(() => {
    if (isOpen) document.body.classList.add('overflow-hidden');
    else document.body.classList.remove('overflow-hidden');
    return () => document.body.classList.remove('overflow-hidden');
  }, [isOpen]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-ink-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 flex items-center justify-center rounded-full bg-white/20">
              <Music size={18} />
            </div>
            <h3 className="font-display text-xl">ZygMusic</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl bg-ink-50 dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Plan</p>
              <p className="text-lg font-bold text-ink-900 dark:text-ink-50 capitalize">{plan}</p>
            </div>
            <div className="rounded-xl bg-ink-50 dark:bg-ink-900 border border-ink-100 dark:border-ink-800 p-4">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Used Today</p>
              <p className="text-lg font-bold text-ink-900 dark:text-ink-50">{used}/{planLimit}</p>
            </div>
            <div className={`rounded-xl border p-4 ${remaining === 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50' : 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'}`}>
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-bold mb-1">Remaining</p>
              <p className={`text-lg font-bold ${remaining === 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-300'}`}>
                {remaining} left
              </p>
            </div>
          </div>

          {/* Model badge */}
          <div className="flex items-center gap-2 rounded-xl bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/30 px-4 py-2.5">
            <Info size={14} className="text-violet-500 flex-shrink-0" />
            <p className="text-[11px] text-violet-700 dark:text-violet-300 font-medium">
              Model: <span className="font-mono font-bold">{ZYGMUSIC_MODEL}</span>
            </p>
          </div>

          {/* Main generator */}
          <ZygMusic modelId={ZYGMUSIC_MODEL} />

          {/* Limit info */}
          <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/5 border border-amber-100 dark:border-amber-900/20 p-4">
            <p className="text-[11px] text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
              💡 <strong>Plan limits:</strong> Free 2/day · Go 20/day · Plus 50/day.{' '}
              Limits reset every 24 hours.
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
