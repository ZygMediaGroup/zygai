import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

export interface UserCampaign {
  id: string;
  name: string;
  description: string;
  featureKey: string;
  quotaLimit: number;
  quotaUsed: number;
  startedAt: string;
  expiresAt: string;
}

export const useUserCampaigns = () => {
  const { token } = useAuth();
  const [campaigns, setCampaigns] = useState<UserCampaign[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshCampaigns = useCallback(async () => {
    if (!token) {
      setCampaigns([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/user/campaigns`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Failed to fetch user campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refreshCampaigns();
    const interval = setInterval(refreshCampaigns, 60000);
    return () => clearInterval(interval);
  }, [refreshCampaigns]);

  return { campaigns, loading, refreshCampaigns };
};