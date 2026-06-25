import React, { useState } from 'react';
import { Gift, X, Heart, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';

const BirthdayWishModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { token } = useAuth();
  const [wish, setWish] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wish.trim() || wish.trim().length < 5) {
      setError('Please write a meaningful wish (min 5 characters).');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/birthday/wish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ content: wish.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send wish');
      
      setSuccess(true);
      setWish('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md animate-floatIn rounded-3xl border border-saffron-200 bg-white p-6 shadow-2xl dark:border-saffron-900/50 dark:bg-ink-950">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-100 text-saffron-600 dark:bg-saffron-900/40 dark:text-saffron-400">
              <Gift size={20} />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-ink-900 dark:text-ink-50">Surprise Zygiuos!</h3>
              <p className="text-[10px] uppercase tracking-[0.2em] text-ink-400">23rd Birthday Wish</p>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-600 dark:hover:text-ink-200">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="text-center py-8 space-y-4">
            <div className="flex justify-center">
              <Heart size={48} className="text-rose-500 fill-rose-500 animate-pulse" />
            </div>
            <h4 className="text-xl font-bold text-ink-900 dark:text-ink-50">Wish Sent!</h4>
            <p className="text-sm text-ink-500 dark:text-ink-400">
              Thank you for being part of this surprise. Zygiuos will see your wish on June 5th!
            </p>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded-2xl bg-ink-900 py-3 text-sm font-bold text-white transition hover:bg-ink-800 dark:bg-white dark:text-ink-900 dark:hover:bg-ink-100"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-ink-600 dark:text-ink-300 leading-relaxed">
              Zygiuos is turning 23 on June 5th! He's been feeling a bit down, so let's show him some love. 
              Write a wish or suggest how he can improve ZygAI. 
              <span className="block mt-2 font-semibold text-saffron-600">Best wishes can win 1 month of ZygAI Go/Plus!</span>
            </p>
            
            <textarea
              value={wish}
              onChange={(e) => setWish(e.target.value)}
              placeholder="Happy Birthday Zyg! I hope you..."
              className="h-32 w-full rounded-2xl border border-ink-200 bg-white p-4 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-900 dark:text-ink-100"
            />

            {error && (
              <p className="text-xs text-red-500 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-saffron-400 to-rose-400 py-4 text-sm font-bold text-ink-900 shadow-lg shadow-saffron-500/20 transition hover:shadow-xl disabled:opacity-50"
            >
              <Sparkles size={18} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Sending Wish...' : 'Send Surprise Wish'}
            </button>
            <p className="text-[10px] text-center text-ink-400">
              * Shhh! This is a secret surprise. He can't see this yet!
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

export default BirthdayWishModal;
