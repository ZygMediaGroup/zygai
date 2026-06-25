import React, { useState } from 'react';
import { ArrowRight, ShieldAlert, RefreshCw, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface BillingStatusProps {
  status: 'success' | 'cancel';
  isAuthenticated: boolean;
}

const BillingStatus: React.FC<BillingStatusProps> = ({ status, isAuthenticated }) => {
  const { refreshUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const isSuccess = status === 'success';
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6 dark:bg-ink-900">
      <div className="w-full max-w-lg rounded-3xl border border-ink-100 bg-white/90 p-8 shadow-card dark:border-ink-800 dark:bg-ink-900/80">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl text-ink-900 shadow-glow ${
              isSuccess ? 'bg-amber-400' : 'bg-ink-200'
            }`}
          >
            {isSuccess ? <Zap size={20} className="fill-current" /> : <ShieldAlert size={20} />}
          </div>
          <div>
            <p className="font-display text-2xl font-semibold">
              {isSuccess ? 'Payment Successful!' : 'Transaction Canceled'}
            </p>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">
              {isSuccess ? 'account updated' : 'no changes made'}
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-saffron-200 bg-saffron-50 p-4 dark:border-saffron-800 dark:bg-saffron-900/20">
          <div className="flex items-start gap-3">
            <Zap size={20} className="text-saffron-600 mt-0.5" />
            <div>
              <p className="font-semibold text-saffron-800 dark:text-saffron-200">
                {isSuccess ? 'Credits Added / Subscription Active' : 'Payment Canceled'}
              </p>
              <p className="text-sm text-saffron-700 dark:text-saffron-300 mt-1">
                {isSuccess 
                  ? 'Your transaction was successful. If you purchased API credits, they are now available in your Developer tab.'
                  : 'Your payment process was canceled. No funds have been deducted from your account.'}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-6 text-sm text-ink-500 dark:text-ink-100">
          {isSuccess
            ? 'Thank you for supporting ZygAI. You can now continue using our premium models and API services.'
            : 'You can try the payment again at any time from your account settings.'}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="/"
            className="flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white transition hover:bg-amber-600"
          >
            Back to ZygAI
            <ArrowRight size={14} />
          </a>
          {isAuthenticated && isSuccess && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-ink-600 transition hover:border-saffron-400 hover:text-saffron-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-ink-700 dark:text-ink-200"
            >
              Refresh status
              <RefreshCw size={14} />
            </button>
          )}
          {!isAuthenticated && (
            <a
              href="/"
              className="flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-ink-600 transition hover:border-saffron-400 hover:text-saffron-500 dark:border-ink-700 dark:text-ink-200"
            >
              Sign in
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillingStatus;
