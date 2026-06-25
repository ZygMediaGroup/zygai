import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Gift } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';

const EmailVerification: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying your email...');
  const [bonusAwarded, setBonusAwarded] = useState(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  }, []);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Missing verification token.');
      return;
    }
    const verify = async () => {
      try {
        const response = await fetch(`${API_BASE}/auth/verify?token=${encodeURIComponent(token)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Verification failed.');
        setStatus('success');
        setMessage('Email verified. You can sign in now.');
        if (data.birthdayBonusAwarded) {
          setBonusAwarded(true);
        }
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    };
    verify();
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-6 dark:bg-ink-900">
      <div className="w-full max-w-md rounded-3xl border border-ink-100 bg-white/90 p-8 shadow-card dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron-400 text-ink-900 shadow-glow">
            <Sparkles size={20} />
          </div>
          <div>
            <p className="font-display text-2xl font-semibold">Email verification</p>
            <p className="text-xs uppercase tracking-[0.3em] text-ink-400">account security</p>
          </div>
        </div>

        <p className="mt-6 text-sm text-ink-500 dark:text-ink-100">{message}</p>

        {bonusAwarded && (
          <div className="mt-6 animate-bounce rounded-2xl bg-gradient-to-r from-saffron-400/20 to-rose-400/20 p-4 border border-saffron-200 dark:border-saffron-900/50">
            <div className="flex items-center gap-3 mb-1">
              <Gift size={20} className="text-saffron-600 dark:text-saffron-400" />
              <span className="text-sm font-bold text-saffron-700 dark:text-saffron-300">
                Bonus Awarded!
              </span>
            </div>
            <p className="text-xs text-ink-600 dark:text-ink-200">
              You've received <span className="font-bold text-saffron-600">$2.00 free API credits</span> as part of Zygiuos Birthday Special!
            </p>
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            onClick={() => {
              window.location.href = '/';
            }}
            className="rounded-2xl bg-ink-900 px-4 py-3 text-sm font-semibold text-ink-50 transition hover:bg-ink-700 dark:bg-ink-50 dark:text-ink-900"
          >
            {status === 'success' ? 'Continue to sign in' : 'Back to sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
