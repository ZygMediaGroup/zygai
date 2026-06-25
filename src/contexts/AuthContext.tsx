import React, { createContext, useContext, useEffect, useState } from 'react';
import { API_BASE } from '@/utils/apiBase';

export interface User {
  id: string;
  email: string;
  displayName?: string | null;
  plan: 'free' | 'go' | 'plus' | 'beta';
  role: 'user' | 'admin';
  emailVerified?: boolean;
  aiRoleId?: string | null;
  twoFactorEnabled?: boolean;
  apiCredits?: string | number;
}

interface AuthContextValue {
  user?: User;
  token?: string;
  loading: boolean;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  register: (email: string, password: string, displayName: string, accessCode?: string) => Promise<void>;
  pendingVerificationEmail?: string;
  resendVerification: (email?: string) => Promise<void>;
  clearPendingVerification: () => void;
  logout: () => void;
  upgradePlan: () => Promise<void>;
  refreshUser: () => Promise<void>;
  heartbeat: () => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = 'zygai:token';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | undefined>(undefined);
  const [token, setToken] = useState<string | undefined>(() => localStorage.getItem(TOKEN_KEY) ?? undefined);
  const [loading, setLoading] = useState(true);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string | undefined>(
    undefined
  );

  const storeToken = (nextToken?: string) => {
    if (nextToken) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      setToken(nextToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      setToken(undefined);
    }
  };

  const fetchMe = async () => {
    if (!token) {
      setUser(undefined);
      return;
    }
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        throw new Error('Auth check failed');
      }
      const data = await response.json();
      setUser(data.user);
    } catch (err) {
      storeToken(undefined);
      setUser(undefined);
    }
  };

  useEffect(() => {
    const init = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        await fetchMe();
      } catch (err) {
        console.error('Auth init error:', err);
        storeToken(undefined);
        setUser(undefined);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [token]);

  const login = async (email: string, password: string, totpCode?: string) => {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, totpCode })
    });
    const data = await response.json();
    if (!response.ok) {
      if (data?.code === 'email_unverified') {
        setPendingVerificationEmail(email);
      }
      const error = new Error(data?.error || 'Login failed.');
      if (data?.twoFactorRequired) {
        (error as any).twoFactorRequired = true;
      }
      throw error;
    }
    setPendingVerificationEmail(undefined);
    storeToken(data.token);
    setUser(data.user);
  };

  const register = async (email: string, password: string, displayName: string, accessCode?: string) => {
    const response = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName, accessCode })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Registration failed.');
    if (data?.pendingVerification) {
      setPendingVerificationEmail(email);
      storeToken(undefined);
      setUser(undefined);
      return;
    }
    storeToken(data.token);
    setUser(data.user);
  };

  const resendVerification = async (email?: string) => {
    const targetEmail = email || pendingVerificationEmail;
    if (!targetEmail) throw new Error('Email required to resend verification.');
    const response = await fetch(`${API_BASE}/auth/resend-verification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Resend failed.');
  };

  const clearPendingVerification = () => {
    setPendingVerificationEmail(undefined);
  };

  const upgradePlan = async () => {
    if (!token) return;
    const stripeResponse = await fetch(`${API_BASE}/stripe/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ plan: 'paid' })
    });
    const stripeData = await stripeResponse.json();
    if (!stripeResponse.ok) {
      throw new Error(stripeData?.error || 'Stripe checkout failed.');
    }
    if (stripeData?.url) {
      window.location.href = stripeData.url as string;
      return;
    }
    throw new Error('Stripe checkout URL missing.');
  };

  const logout = () => {
    storeToken(undefined);
    setUser(undefined);
    setPendingVerificationEmail(undefined);
  };

  const refreshUser = async () => {
    if (!token) return;
    await fetchMe();
  };

  const heartbeat = async () => {
    if (!token) return;
    await fetch(`${API_BASE}/presence`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  };

  const forgotPassword = async (email: string) => {
    const response = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Password reset request failed.');
    }
  };

  const resetPassword = async (token: string, newPassword: string) => {
    const response = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Password reset failed.');
    }
  };

  const value: AuthContextValue = {
    user,
    token,
    loading,
    login,
    register,
    pendingVerificationEmail,
    resendVerification,
    clearPendingVerification,
    logout,
    upgradePlan,
    refreshUser,
    heartbeat,
    forgotPassword,
    resetPassword
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
