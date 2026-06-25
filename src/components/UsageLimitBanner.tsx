import React from 'react';
import { X } from 'lucide-react';

interface UsageLimitBannerProps {
  percentage: number;
  limitReached: boolean;
  resetTime?: string;
  onDismiss?: () => void;
  onUpgrade?: () => void;
}

const UsageLimitBanner: React.FC<UsageLimitBannerProps> = ({
  percentage,
  limitReached,
  resetTime,
  onDismiss,
  onUpgrade
}) => {
  if (percentage < 80 && !limitReached) return null;

  return (
    <div className="w-full px-4 py-2 bg-ink-50 dark:bg-ink-800 border-b border-ink-100 dark:border-ink-700">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {limitReached ? (
            <>
              <span className="text-ink-700 dark:text-ink-200">
                {resetTime?.toString().includes('campaign')
                  ? "Campaign quota exhausted. Upgrade for more credits."
                  : `Usage limit reached — your limit will reset at ${resetTime}.`}
              </span>
            </>
          ) : (
            <>
              <span className="text-ink-700 dark:text-ink-200">
                You've used {percentage}% of your usage limit
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {limitReached ? (
            <button
              onClick={onUpgrade}
              className="px-4 py-1.5 bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 rounded-xl text-xs font-bold uppercase tracking-wider hover:opacity-90 transition"
            >
              Subscribe to Max
            </button>
          ) : (
            <button
              onClick={onUpgrade}
              className="text-sm font-medium text-ink-900 dark:text-ink-100 underline underline-offset-2 hover:no-underline"
            >
              Get more usage
            </button>
          )}
          
          {onDismiss && !limitReached && (
            <button
              onClick={onDismiss}
              className="p-1 text-ink-400 hover:text-ink-600 dark:hover:text-ink-300 transition"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsageLimitBanner;
