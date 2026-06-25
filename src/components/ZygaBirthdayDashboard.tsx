import React, { useEffect, useState } from 'react';
import { Gift, Heart, User, Clock, Award, Star } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';

const ZygaBirthdayDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const [wishes, setWishes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [awardingId, setAwardingId] = useState<number | null>(null);

  useEffect(() => {
    fetchWishes();
  }, []);

  const fetchWishes = async () => {
    try {
      const res = await fetch(`${API_BASE}/birthday/wishes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setWishes(data.wishes || []);
    } catch (err) {
      console.error('Failed to fetch wishes:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAward = async (wishId: number, plan: 'go' | 'plus') => {
    if (!confirm(`Are you sure you want to award 1 month of ${plan.toUpperCase()} to this user?`)) return;
    setAwardingId(wishId);
    try {
      const res = await fetch(`${API_BASE}/birthday/award`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ wishId, plan })
      });
      if (res.ok) {
        alert(`Successfully awarded ${plan.toUpperCase()} plan!`);
        fetchWishes();
      }
    } catch (err) {
      alert('Failed to award plan.');
    } finally {
      setAwardingId(null);
    }
  };

  if (user?.email !== 'zygai@zygai.app') {
    return (
      <div className="flex flex-1 items-center justify-center bg-ink-50 dark:bg-ink-900">
        <div className="text-center space-y-4">
          <Heart size={48} className="mx-auto text-rose-500 animate-pulse" />
          <h2 className="text-xl font-bold">Shhh! This is a surprise.</h2>
          <p className="text-ink-500">Only Zygiuos can access this dashboard on his birthday.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-ink-50 p-6 dark:bg-ink-900">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="flex items-center gap-6 rounded-3xl bg-gradient-to-r from-saffron-400 to-rose-400 p-8 text-ink-900 shadow-xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/30 backdrop-blur-md">
            <Gift size={40} />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold">Happy 23rd Birthday, Zygiuos!</h1>
            <p className="text-sm font-medium opacity-80">
              The community has a surprise for you. Here are all the wishes and feedback they've sent.
            </p>
          </div>
        </header>

        <div className="grid gap-6">
          {loading ? (
            <div className="py-20 text-center text-ink-500 italic animate-pulse">Opening presents...</div>
          ) : wishes.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-ink-200 bg-white py-20 text-center dark:border-ink-800 dark:bg-ink-950">
              <p className="text-ink-500">No wishes found yet. They're still coming in!</p>
            </div>
          ) : (
            wishes.map((wish) => (
              <div key={wish.id} className="group relative rounded-3xl border border-ink-100 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-ink-800 dark:bg-ink-900/50">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-50 text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                      <User size={18} />
                    </div>
                    <div>
                      <p className="font-bold text-ink-900 dark:text-ink-50">{wish.display_name || 'Anonymous User'}</p>
                      <p className="text-[10px] text-ink-400">{wish.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-bold text-ink-400 uppercase tracking-widest">
                    <Clock size={12} />
                    {new Date(wish.created_at).toLocaleDateString()}
                  </div>
                </div>

                <div className="relative rounded-2xl bg-ink-50/50 p-4 dark:bg-ink-900/20 italic text-ink-700 dark:text-ink-200 leading-relaxed">
                  <Heart size={14} className="absolute -left-2 -top-2 text-rose-500 fill-rose-500" />
                  "{wish.content}"
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-ink-50 dark:border-ink-800 pt-4">
                  <div className="flex items-center gap-2">
                    {wish.awarded_plan ? (
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                        <Award size={12} />
                        Awarded {wish.awarded_plan}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Reward with:</span>
                    )}
                  </div>
                  
                  {!wish.awarded_plan && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAward(wish.id, 'go')}
                        disabled={awardingId !== null}
                        className="flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-[10px] font-bold text-white transition hover:bg-ink-800 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500"
                      >
                        <Star size={12} />
                        GO Plan
                      </button>
                      <button
                        onClick={() => handleAward(wish.id, 'plus')}
                        disabled={awardingId !== null}
                        className="flex items-center gap-1.5 rounded-xl border border-ink-200 px-4 py-2 text-[10px] font-bold text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
                      >
                        <Award size={12} />
                        PLUS Plan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default ZygaBirthdayDashboard;
