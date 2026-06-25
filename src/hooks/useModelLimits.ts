import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

export interface ModelLimit {
  model_id: string;
  free_limit: number | null;
  go_limit: number | null;
  plus_limit: number | null;
  beta_limit: number | null;
  vibe_coder_limit: number | null;
  enabled: boolean;
}

export interface ModelLimitExtended {
  id: string;
  name: string;
  limits: ModelLimit;
}

type ModelLimitMap = Partial<Record<string, ModelLimit>>;

export const useModelLimits = () => {
  const { token } = useAuth();
  const [modelLimits, setModelLimits] = useState<ModelLimitMap>({});
  const [loading, setLoading] = useState(false);

  const fetchModelLimits = useCallback(async () => {
    if (!token) {
      setModelLimits({});
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/model-limits`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const limitsMap: ModelLimitMap = {};
        (data.limits || []).forEach((limit: ModelLimit) => {
          limitsMap[limit.model_id] = limit;
        });
        setModelLimits(limitsMap);
      }
    } catch (err) {
      console.error('Failed to fetch model limits:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchModelLimits();
  }, [fetchModelLimits]);

  return { modelLimits, loading, refreshModelLimits: fetchModelLimits };
};