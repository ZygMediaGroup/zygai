import React, { useState, useEffect } from 'react';
import { Sparkles, AlertCircle, CheckCircle, ArrowLeft, Mail, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import BirthdayCountdown from './BirthdayCountdown';

interface AuthScreenProps {
  initialMode?: 'login' | 'register';
  onBack?: () => void;
}

type AuthMode = 'login' | 'register' | 'forgotPassword' | 'resetPassword';

const AuthScreen: React.FC<AuthScreenProps> = ({ initialMode = 'login', onBack }) => {
  const { login, register, pendingVerificationEmail, resendVerification, clearPendingVerification, forgotPassword, resetPassword } =
    useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode as AuthMode);

  useEffect(() => {
    setMode(initialMode as AuthMode);
  }, [initialMode]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | undefined>();
  const [resendLoading, setResendLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | undefined>();
  const [resetToken, setResetToken] = useState<string | undefined>();
  const [referrerName, setReferrerName] = useState<string | null>(null);
  const [isRefFromUrl, setIsRefFromUrl] = useState(false);

  // Handle tokens and referral codes from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setMode('resetPassword');
      setResetToken(token);
    }

    const referralCode = params.get('ref');
    if (referralCode && mode === 'register') {
      setAccessCode(referralCode);
      setIsRefFromUrl(true);
      fetch(`${API_BASE}/public/user/${referralCode}/info`)
        .then(res => res.json())
        .then(data => {
          if (data.displayName) setReferrerName(data.displayName);
        })
        .catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    setTwoFactorRequired(false);
    setTwoFactorCode('');
  }, [mode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setLoading(true);
    try {
      const code = twoFactorRequired ? twoFactorCode.trim() : undefined;
      if (mode === 'login') {
        await login(email.trim(), password, code);
      } else if (mode === 'register') {
        await register(email.trim(), password, displayName.trim(), accessCode.trim() || undefined);
      } else if (mode === 'forgotPassword') {
        await forgotPassword(email.trim());
        setForgotMessage('Password reset instructions sent. Please check your inbox.');
      } else if (mode === 'resetPassword' && resetToken) {
        await resetPassword(resetToken, password);
        setForgotMessage('Password reset successfully. You can now sign in.');
        setResetToken(undefined);
        window.history.replaceState({}, '', '/');
        // stay in resetPassword mode to show success message
      }
      if (mode === 'login') {
        setTwoFactorRequired(false);
        setTwoFactorCode('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
      if (mode === 'login' && err && (err as any).twoFactorRequired) {
        setTwoFactorRequired(true);
        setTwoFactorCode('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendMessage(undefined);
    setResendLoading(true);
    try {
      await resendVerification();
      setResendMessage('Verification email sent. Please check your inbox.');
    } catch (err) {
      setResendMessage(err instanceof Error ? err.message : 'Resend failed.');
    } finally {
      setResendLoading(false);
    }
  };

  if (pendingVerificationEmail) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-white to-saffron-50/20 px-4 dark:from-black dark:via-ink-950 dark:to-black">
        <div className="w-full max-w-md animate-floatIn rounded-2xl border border-ink-100 bg-white/95 backdrop-blur p-6 sm:p-8 shadow-card dark:border-ink-800 dark:bg-ink-950/95">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow dark:from-ink-100 dark:to-white dark:text-black dark:shadow-none">
              <Sparkles size={20} strokeWidth={2} />
            </div>
            <div>
              <p className="font-display text-2xl font-bold">Verify email</p>
              <p className="text-xs uppercase tracking-widest text-ink-400">continue setup</p>
            </div>
          </div>

          <p className="text-sm text-ink-600 dark:text-ink-200 leading-relaxed">
            We sent a verification link to<br />
            <span className="font-semibold text-saffron-600 dark:text-saffron-400">{pendingVerificationEmail}</span>
          </p>

          {resendMessage && (
            <div className="mt-4 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-ink-900">
              <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
              <p className="text-xs text-emerald-700 dark:text-emerald-300">{resendMessage}</p>
            </div>
          )}

          <div className="mt-6 grid gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendLoading}
              className="group rounded-lg bg-saffron-500 px-4 py-3 text-sm font-semibold text-ink-900 transition hover:bg-saffron-600 disabled:cursor-not-allowed disabled:bg-saffron-300 dark:bg-ink-100 dark:text-black dark:hover:bg-white"
            >
              {resendLoading ? 'Sending...' : 'Resend verification email'}
            </button>
            <button
              type="button"
              onClick={() => {
                clearPendingVerification();
                setMode('login');
              }}
              className="rounded-lg border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 hover:border-saffron-300 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'forgotPassword' && forgotMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-white to-saffron-50/20 px-4 dark:from-black dark:via-ink-950 dark:to-black">
        <div className="w-full max-w-md animate-floatIn rounded-2xl border border-ink-100 bg-white/95 backdrop-blur p-6 sm:p-8 shadow-card dark:border-ink-800 dark:bg-ink-950/95">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow dark:from-ink-100 dark:to-white dark:text-black dark:shadow-none">
              <Mail size={20} strokeWidth={2} />
            </div>
            <div>
              <p className="font-display text-2xl font-bold">Check your email</p>
              <p className="text-xs uppercase tracking-widest text-ink-400">password reset</p>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{forgotMessage}</p>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                setForgotMessage(undefined);
                setMode('login');
              }}
            className="w-full rounded-lg bg-saffron-500 px-4 py-3 text-sm font-semibold text-ink-900 transition hover:bg-saffron-600 dark:bg-ink-100 dark:text-black dark:hover:bg-white"
            >
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'resetPassword' && forgotMessage) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-white to-saffron-50/20 px-4 dark:from-black dark:via-ink-950 dark:to-black">
        <div className="w-full max-w-md animate-floatIn rounded-2xl border border-ink-100 bg-white/95 backdrop-blur p-6 sm:p-8 shadow-card dark:border-ink-800 dark:bg-ink-950/95">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow dark:from-ink-100 dark:to-white dark:text-black dark:shadow-none">
              <Lock size={20} strokeWidth={2} />
            </div>
            <div>
              <p className="font-display text-2xl font-bold">Password updated</p>
              <p className="text-xs uppercase tracking-widest text-ink-400">success</p>
            </div>
          </div>

          <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <CheckCircle size={16} className="mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs text-emerald-700 dark:text-emerald-300">{forgotMessage}</p>
          </div>

          <div className="mt-6">
            <button
              type="button"
              onClick={() => {
                setForgotMessage(undefined);
                setMode('login');
              }}
              className="w-full rounded-lg bg-saffron-500 px-4 py-3 text-sm font-semibold text-ink-900 transition hover:bg-saffron-600 dark:bg-saffron-600 dark:hover:bg-saffron-700"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-ink-50 via-white to-saffron-50/20 px-4 dark:from-black dark:via-ink-950 dark:to-black">
        <div className="w-full max-w-md animate-floatIn rounded-2xl border border-ink-100 bg-white/95 backdrop-blur p-6 sm:p-8 shadow-card dark:border-ink-800 dark:bg-ink-950/95">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-400 transition hover:text-ink-600 dark:hover:text-ink-200"
          >
            <ArrowLeft size={14} />
            Back
          </button>
        )}
        <div className="flex items-center gap-3 mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow">
            <Sparkles size={20} strokeWidth={2} />
          </div>
          <div>
            <p className="font-display text-2xl font-bold">ZygAI</p>
            <p className="text-xs uppercase tracking-widest text-ink-400">intelligent access</p>
          </div>
        </div>

        <BirthdayCountdown />

        <p className="text-sm text-ink-600 dark:text-ink-300 mb-6 leading-relaxed">
          {mode === 'login'
            ? 'Welcome back! Sign in to continue your conversations.'
            : mode === 'forgotPassword'
            ? 'Enter your email address and we will send you a link to reset your password.'
            : 'Create an account to save your chat sessions and unlock all features.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {(mode === 'login' || mode === 'register' || mode === 'forgotPassword') && (
            <div className="space-y-2">
              <label htmlFor="email" className="text-xs uppercase tracking-widest font-semibold text-ink-600 dark:text-ink-400">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="you@example.com"
                className="w-full rounded-lg border border-ink-200 bg-white/50 px-4 py-3 text-sm text-ink-900 placeholder-ink-400 backdrop-blur transition focus:border-saffron-400 focus:bg-white focus:ring-2 focus:ring-saffron-400/20 dark:border-ink-700 dark:bg-ink-800/50 dark:text-ink-50 dark:placeholder-ink-500 dark:focus:border-saffron-400 dark:focus:bg-ink-800"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'resetPassword') && (
            <div className="space-y-2">
              <label htmlFor="password" className="text-xs uppercase tracking-widest font-semibold text-ink-600 dark:text-ink-400">
                {mode === 'resetPassword' ? 'New password' : 'Password'}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-lg border border-ink-200 bg-white/50 px-4 py-3 text-sm text-ink-900 placeholder-ink-400 backdrop-blur transition focus:border-saffron-400 focus:bg-white focus:ring-2 focus:ring-saffron-400/20 dark:border-ink-700 dark:bg-ink-800/50 dark:text-ink-50 dark:placeholder-ink-500 dark:focus:border-saffron-400 dark:focus:bg-ink-800"
              />
            </div>
          )}

          {mode === 'login' && twoFactorRequired && (
            <div className="space-y-2">
              <label htmlFor="twoFactorCode" className="text-xs uppercase tracking-widest font-semibold text-ink-600 dark:text-ink-400">
                Two-factor code
              </label>
              <input
                id="twoFactorCode"
                type="text"
                value={twoFactorCode}
                onChange={(event) => setTwoFactorCode(event.target.value)}
                required
                placeholder="123 456"
                className="w-full rounded-lg border border-ink-200 bg-white/50 px-4 py-3 text-sm text-ink-900 placeholder-ink-400 backdrop-blur transition focus:border-saffron-400 focus:bg-white focus:ring-2 focus:ring-saffron-400/20 dark:border-ink-700 dark:bg-ink-800/50 dark:text-ink-50 dark:placeholder-ink-500 dark:focus:border-saffron-400 dark:focus:bg-ink-800"
              />
              <p className="text-xs text-ink-500 dark:text-ink-400">
                Enter the code from your authenticator app to finish signing in.
              </p>
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="space-y-2">
                <label htmlFor="displayName" className="text-xs uppercase tracking-widest font-semibold text-ink-600 dark:text-ink-400">
                  Display name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  placeholder="Your name"
                  className="w-full rounded-lg border border-ink-200 bg-white/50 px-4 py-3 text-sm text-ink-900 placeholder-ink-400 backdrop-blur transition focus:border-saffron-400 focus:bg-white focus:ring-2 focus:ring-saffron-400/20 dark:border-ink-700 dark:bg-ink-800/50 dark:text-ink-50 dark:placeholder-ink-500 dark:focus:border-saffron-400 dark:focus:bg-ink-800"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="accessCode" className="text-xs uppercase tracking-widest font-semibold text-ink-600 dark:text-ink-400">
                  {isRefFromUrl ? 'Referral Applied' : 'Access or Referral Code'} <span className="font-normal text-ink-500">(optional)</span>
                </label>
                <div className="relative">
                  <input
                    id="accessCode"
                    type="text"
                    value={accessCode}
                    onChange={(event) => !isRefFromUrl && setAccessCode(event.target.value)}
                    readOnly={isRefFromUrl}
                    placeholder="Referrer's Email or ID"
                    className={`w-full rounded-lg border border-ink-200 bg-white/50 px-4 py-3 text-sm text-ink-900 placeholder-ink-400 backdrop-blur transition focus:border-saffron-400 focus:bg-white focus:ring-2 focus:ring-saffron-400/20 dark:border-ink-700 dark:bg-ink-800/50 dark:text-ink-50 dark:placeholder-ink-500 dark:focus:border-saffron-400 dark:focus:bg-ink-800 ${isRefFromUrl ? 'cursor-not-allowed opacity-75' : ''}`}
                  />
                  {isRefFromUrl && referrerName && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 animate-fadeIn" aria-hidden="true">
                      <CheckCircle size={10} />
                      Referred by {referrerName}
                    </div>
                  )}
                </div>
                {isRefFromUrl && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                    You're eligible for the <span className="font-bold">$4.00 total bonus</span> upon verification!
                  </p>
                )}
              </div>
            </>
          )}

          {error && (
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950/30" role="alert" aria-live="assertive">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" aria-hidden="true" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-saffron-500 to-saffron-600 px-4 py-3 text-sm font-semibold text-ink-900 transition hover:shadow-lg hover:from-saffron-600 hover:to-saffron-700 disabled:cursor-not-allowed disabled:opacity-50 dark:from-saffron-600 dark:to-saffron-700"
          >
            {loading ? 'Processing...' : (() => {
              switch (mode) {
                case 'login': return 'Sign in';
                case 'register': return 'Create account';
                case 'forgotPassword': return 'Send reset link';
                case 'resetPassword': return 'Reset password';
                default: return 'Submit';
              }
            })()}
          </button>

          {(mode === 'login' || mode === 'register') && (
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-ink-100 dark:border-ink-800"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-ink-400 dark:bg-ink-900">Or continue with</span>
              </div>
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/auth/google/url`);
                  const data = await res.json();
                  if (data.url) {
                    window.location.href = data.url;
                  } else {
                    alert(data.error || 'Failed to start Google login.');
                  }
                } catch (err) {
                  console.error('Google login error:', err);
                  alert('Failed to initiate Google login.');
                }
              }}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
            >
              <img src="https://www.google.com/favicon.ico" className="h-4 w-4" alt="G" />
              Login with Google
            </button>
          )}
        </form>

        <div className="mt-6 border-t border-ink-100 pt-6 text-center dark:border-ink-800">
          {(mode === 'login' || mode === 'register') && (
            <>
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('forgotPassword');
                    setError(undefined);
                  }}
                  className="text-xs text-ink-500 hover:text-saffron-600 transition mb-2 dark:text-ink-400 dark:hover:text-saffron-400"
                >
                  Forgot password?
                </button>
              )}
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setError(undefined);
                  }}
                  className="font-semibold text-saffron-600 hover:text-saffron-700 transition dark:text-saffron-400 dark:hover:text-saffron-300"
                  type="button"
                >
                  {mode === 'login' ? 'Register now' : 'Sign in'}
                </button>
              </p>
            </>
          )}

          {(mode === 'forgotPassword' || mode === 'resetPassword') && (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(undefined);
                setForgotMessage(undefined);
                setResetToken(undefined);
              }}
              className="text-xs text-ink-500 hover:text-saffron-600 transition dark:text-ink-400 dark:hover:text-saffron-400"
            >
              Back to sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
