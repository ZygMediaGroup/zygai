import React from 'react';
import clsx from 'clsx';
import type { PlanQuota } from '@/hooks/usePlanQuotas';

interface PlanQuotaMeterProps {
  quota?: PlanQuota;
  compact?: boolean;
  className?: string;
}

const formatReset = (resetAt?: string | null) => {
  if (!resetAt) return 'unused';
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return 'soon';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const PlanQuotaMeter: React.FC<PlanQuotaMeterProps> = ({ quota, compact = false, className }) => {
  if (!quota) return null;

  if (quota.isUnlimited || quota.limit === null) {
    return (
      <div className={clsx('rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300', className)}>
        {quota.label}: unlimited
      </div>
    );
  }

  const used = Math.max(0, quota.used || 0);
  const limit = Math.max(1, quota.limit);
  const percentage = Math.min(100, Math.round((used / limit) * 100));
  const remaining = Math.max(0, limit - used);
  const danger = percentage >= 90;
  const warning = percentage >= 75 && !danger;

  return (
    <div className={clsx('rounded-lg border border-ink-200 bg-white px-3 py-2 shadow-sm dark:border-ink-800 dark:bg-ink-900', className)}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-ink-700 dark:text-ink-200">{quota.label}</span>
        <span className={clsx('font-bold tabular-nums', danger ? 'text-red-500' : warning ? 'text-amber-600' : 'text-ink-500 dark:text-ink-400')}>
          {remaining}/{limit} left
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
        <div
          className={clsx('h-full rounded-full transition-all', danger ? 'bg-red-500' : warning ? 'bg-amber-500' : 'bg-saffron-500')}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {!compact && (
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-400 dark:text-ink-500">
          <span>{used} used</span>
          <span>resets {formatReset(quota.resetAt)}</span>
        </div>
      )}
    </div>
  );
};

export default PlanQuotaMeter;
