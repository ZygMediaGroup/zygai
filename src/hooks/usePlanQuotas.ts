import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

export type PlanQuotaFeature = 'chat' | 'image_generation' | 'vibe_coder' | 'game_rps' | 'game_word_guess' | 'game_math_duel' | 'game_i_spy' | 'game_misc';

export interface PlanQuota {
  feature: PlanQuotaFeature;
  label: string;
  limit: number | null;
  used: number;
  resetAt: string | null;
  windowMs: number;
  plan: string;
  isUnlimited: boolean;
}

type PlanQuotaMap = Partial<Record<PlanQuotaFeature, PlanQuota>>;

export const usePlanQuotas = () => {
  const { token } = useAuth();
  const [quotas, setQuotas] = useState<PlanQuotaMap>({});
  const [loading, setLoading] = useState(false);

  const refreshQuotas = useCallback(async () => {
    if (!token) {
      setQuotas({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/plan-quotas`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQuotas(data.quotas || {});
      }
    } catch (err) {
      console.error('Failed to fetch plan quotas:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshQuotas();
    const interval = setInterval(refreshQuotas, 60000);
    return () => clearInterval(interval);
  }, [refreshQuotas]);

  return { quotas, loading, refreshQuotas };
};
