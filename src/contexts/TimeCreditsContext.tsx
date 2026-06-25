import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { TimeCredits } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/contexts/ChatContext';
import { API_BASE } from '@/utils/apiBase';

interface TimeCreditsContextValue {
  credits: TimeCredits | null;
  isLoading: boolean;
  consumeTime: (seconds: number) => void;
  refreshCredits: () => Promise<void>;
  saveCredits: () => Promise<void>;
}

const TimeCreditsContext = createContext<TimeCreditsContextValue | undefined>(undefined);


export const TimeCreditsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const { isSending } = useChat();
  const [credits, setCredits] = useState<TimeCredits | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Keep a ref to credits for auto-saving without resetting intervals
  const creditsRef = useRef<TimeCredits | null>(null);
  useEffect(() => {
    creditsRef.current = credits;
  }, [credits]);

  const fetchCredits = useCallback(async () => {
    try {
      if (!token) {
        console.log('TimeCredits: No token, skipping credits fetch');
        return;
      }

      const response = await fetch(`${API_BASE}/user/time-credits`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCredits(data);
      }
    } catch (error) {
      console.error('Failed to fetch time credits:', error);
    }
  }, [token]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await fetchCredits();
      setIsLoading(false);
    };
    init();
  }, [fetchCredits]);

  // Countdown timer: decrease credits every second locally ONLY when AI is generating
  useEffect(() => {
    const timer = setInterval(() => {
      setCredits((prev) => {
        if (!prev || prev.isUnlimited || prev.remainingSeconds <= 0 || !isSending) return prev;
        return {
          ...prev,
          remainingSeconds: Math.max(0, prev.remainingSeconds - 1)
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isSending]);

  // Auto-save credits every 10 seconds
  useEffect(() => {
    const saveInterval = setInterval(() => {
      const current = creditsRef.current;
      if (current && !current.isUnlimited) {
        if (token) {
          fetch(`${API_BASE}/user/save-time-credits`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ remainingSeconds: current.remainingSeconds })
          }).catch(console.error);
        }
      }
    }, 10000);
    return () => clearInterval(saveInterval);
  }, [token]);

  const consumeTime = useCallback((seconds: number) => {
    setCredits((prev) => {
      if (!prev || prev.isUnlimited) return prev;
      return {
        ...prev,
        remainingSeconds: Math.max(0, prev.remainingSeconds - seconds)
      };
    });
  }, []);

  const saveCredits = useCallback(async () => {
    if (!credits || credits.isUnlimited) return;

    try {
      if (!token) return;

      await fetch(`${API_BASE}/user/save-time-credits`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ remainingSeconds: credits.remainingSeconds })
      });
    } catch (error) {
      console.error('Failed to save time credits:', error);
    }
  }, [credits, token]);

  const refreshCredits = useCallback(async () => {
    await fetchCredits();
  }, [fetchCredits]);

  return (
    <TimeCreditsContext.Provider
      value={{
        credits,
        isLoading,
        consumeTime,
        refreshCredits,
        saveCredits
      }}
    >
      {children}
    </TimeCreditsContext.Provider>
  );
};

export const useTimeCredits = () => {
  const context = useContext(TimeCreditsContext);
  if (!context) {
    throw new Error('useTimeCredits must be used within TimeCreditsProvider');
  }
  return context;
};
