import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';

const limitMap: { [P in 'free' | 'go' | 'plus' | 'beta' | 'paid' | 'ad']: number } = {
  free: 2,
  go: 20,
  plus: 50,
  beta: 50,
  paid: 50,
  ad: 2,
};

interface MusicConfig {
  plan: string;
  used: number;
  limit: number;
  remaining: number;
}

export const useMusicLimits = () => {
  const ctx = useContext(AuthContext);
  const token = ctx?.token;
  const plan = (ctx?.user?.plan ?? 'free') as keyof typeof limitMap;

  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_BASE}/music/config`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then((data: MusicConfig | null) => {
        if (data) setUsed(data.used);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  return {
    limits: limitMap,
    used,
    plan,
    loading,
    remaining: Math.max(0, (limitMap[plan] ?? 2) - used),
  };
};
