import React, { useState, useEffect } from 'react';
import { Gift, Clock, Users, Copy, Check } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

const BirthdayCountdown: React.FC = () => {
  const { user } = useAuth();
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);
  const [userCount, setUserCount] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // June 5th, 2026, 23:59:59 Vilnius time (UTC+3) -> June 5th, 2026, 20:59:59 UTC
  const targetDate = new Date('2026-06-05T20:59:59Z').getTime();

  useEffect(() => {
    const fetchUserCount = async () => {
      try {
        const res = await fetch(`${API_BASE}/public/user-count`);
        if (res.ok) {
          const data = await res.json();
          setUserCount(data.count || 0);
        }
      } catch (err) {
        console.error('Failed to fetch user count:', err);
      }
    };
    fetchUserCount();
    const interval = setInterval(fetchUserCount, 300000); // Every 5 mins
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance < 0) {
        clearInterval(timer);
        setTimeLeft(null);
      } else {
        setTimeLeft({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000),
        });
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) return null;

  const progress = Math.min(100, (userCount / 100) * 100);

  return (
      <div className="mb-6 rounded-2xl bg-black border border-ink-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gift size={18} className="text-saffron-600 dark:text-saffron-400 animate-bounce" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-saffron-700 dark:text-saffron-300">
            Birthday Promotion
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/50 dark:bg-ink-900/20">
          <Clock size={12} className="text-rose-500" />
          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Limited</span>
        </div>
      </div>

      <div className="space-y-2 mb-5">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-saffron-500" />
          <p className="text-xs font-bold text-ink-900 dark:text-ink-50">
            New Users: <span className="text-saffron-600 dark:text-saffron-400">Free $2.00 API</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          <p className="text-xs font-bold text-ink-900 dark:text-ink-50">
            Unlimited Referrals: <span className="text-rose-500">+$2.00 per friend</span>
          </p>
        </div>
        
        {user ? (
          <div className="mt-2 pl-3.5 space-y-2">
            <p className="text-[10px] text-ink-500 dark:text-ink-400">Share & Earn (No Limits):</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-white/50 px-3 py-1.5 text-[10px] font-mono dark:bg-ink-900/40 border border-saffron-200/50 dark:border-saffron-800/50 truncate">
                {window.location.origin}/register?ref={user.id}
              </code>
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/register?ref=${user.id}`);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="rounded-lg bg-saffron-400 p-1.5 text-ink-900 transition hover:bg-saffron-500"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[10px] text-ink-500 dark:text-ink-400 mt-1 pl-3.5">
            Refer friends with your ID as the <span className="font-semibold italic text-ink-900 dark:text-ink-50">Access Code</span>. No limits!
          </p>
        )}
      </div>
      
      {/* Community Milestone Progress Bar */}
      <div className="mb-5 space-y-2">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
          <div className="flex items-center gap-1.5 text-ink-600 dark:text-ink-400">
            <Users size={12} />
            Progress Bar
          </div>
          <span className="text-ink-900 dark:text-ink-50">[{userCount}]/100</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
          <div 
            className="h-full bg-gradient-to-r from-saffron-400 to-rose-400 transition-all duration-1000"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-2 pt-2 border-t border-saffron-200/50 dark:border-saffron-900/30">
        <div className="flex flex-col">
          <span className="text-sm font-black text-ink-900 dark:text-ink-50">{timeLeft.days}</span>
          <span className="text-[8px] uppercase font-bold tracking-tighter text-ink-500">Days</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-black text-ink-900 dark:text-ink-50">{timeLeft.hours}</span>
          <span className="text-[8px] uppercase font-bold tracking-tighter text-ink-500">Hours</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-black text-ink-900 dark:text-ink-50">{timeLeft.minutes}</span>
          <span className="text-[8px] uppercase font-bold tracking-tighter text-ink-500">Mins</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-black text-ink-900 dark:text-ink-50">{timeLeft.seconds}</span>
          <span className="text-[8px] uppercase font-bold tracking-tighter text-ink-500">Secs</span>
        </div>
      </div>
    </div>
  );
};

export default BirthdayCountdown;
