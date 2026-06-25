import React, { useEffect, useState } from 'react';
import { Shield, ShieldCheck, QrCode, X, CreditCard, Clock, Key, Terminal, Plus, Trash2, Copy, Check, Sun, Gift, Circle, Palette } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';

const AccountSettingsModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose
}) => {
  const { token, user, refreshUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordCode, setPasswordCode] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [setupData, setSetupData] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [setupCode, setSetupCode] = useState('');
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<string | null>(null);

  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disableMessage, setDisableMessage] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'account' | 'security' | 'billing' | 'api'>('account');

  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [topupLoading, setTopupLoading] = useState(false);
  const [topupAmount, setTopupAmount] = useState('10');
  const [usageHistory, setUsageHistory] = useState<any[]>([]);
  const [newKeyMonthlyLimit, setNewKeyMonthlyLimit] = useState('');
  const [newKeyIpAllowlist, setNewKeyIpAllowlist] = useState('');
  
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'oled'>(() => {
    const saved = localStorage.getItem('zygai:theme');
    if (saved === 'light' || saved === 'dark' || saved === 'oled') return saved;
    if (document.documentElement.classList.contains('oled')) return 'oled';
    if (document.documentElement.classList.contains('dark')) return 'dark';
    return 'light';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', themeMode === 'dark' || themeMode === 'oled');
    document.documentElement.classList.toggle('oled', themeMode === 'oled');
    localStorage.setItem('zygai:theme', themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordCode('');
      setPasswordLoading(false);
      setPasswordError(null);
      setPasswordSuccess(null);
      setSetupData(null);
      setSetupCode('');
      setSetupLoading(false);
      setSetupError(null);
      setSetupMessage(null);
      setDisableCode('');
      setDisableLoading(false);
      setDisableError(null);
      setDisableMessage(null);
      setGeneratedKey(null);
      setCopiedKey(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (activeTab === 'api' && isOpen) {
      fetchApiKeys();
      fetchUsageHistory();
    }
  }, [activeTab, isOpen]);

  const fetchApiKeys = async () => {
    try {
      const res = await fetch(`${API_BASE}/keys`, { headers: buildHeaders() });
      const data = await res.json();
      setApiKeys(data.keys || []);
    } catch (err) {
      console.error('Failed to fetch API keys:', err);
    }
  };

  const fetchUsageHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/user/api-usage`, { headers: buildHeaders() });
      const data = await res.json();
      setUsageHistory(data.usage || []);
    } catch (err) {
      console.error('Failed to fetch usage history:', err);
    }
  };

  const handleTopup = async () => {
    setTopupLoading(true);
    try {
      const res = await fetch(`${API_BASE}/stripe/create-topup-session`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ amount: parseFloat(topupAmount) })
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create topup session');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setTopupLoading(false);
    }
  };

  const handleCreateKey = async () => {
    if (isCreatingKey) return;
    setIsCreatingKey(true);
    setGeneratedKey(null);
    try {
      const res = await fetch(`${API_BASE}/keys`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ 
          name: newKeyName || 'API Key',
          monthlyLimit: newKeyMonthlyLimit ? parseFloat(newKeyMonthlyLimit) : null,
          ipAllowlist: newKeyIpAllowlist || null
        })
      });
      const data = await res.json();
      if (data.api_key) {
        setGeneratedKey(data.api_key);
        setNewKeyName('');
        setNewKeyMonthlyLimit('');
        setNewKeyIpAllowlist('');
        fetchApiKeys();
      }
    } catch (err) {
      console.error('Failed to create API key:', err);
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this API key? Any applications using it will stop working.')) return;
    try {
      await fetch(`${API_BASE}/keys/${id}`, {
        method: 'DELETE',
        headers: buildHeaders()
      });
      fetchApiKeys();
    } catch (err) {
      console.error('Failed to delete API key:', err);
    }
  };

  const buildHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  };

  const handlePasswordSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!currentPassword || !newPassword) {
      setPasswordError('Both current and new passwords are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    setPasswordLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({
          currentPassword,
          newPassword,
          totpCode: user?.twoFactorEnabled ? passwordCode : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to change password.');
      }
      setPasswordSuccess('Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordCode('');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Password change failed.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleStartSetup = async () => {
    setSetupError(null);
    setSetupMessage(null);
    setSetupLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/2fa/setup`, {
        headers: buildHeaders()
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Failed to prepare two-factor setup.');
      }
      setSetupData({
        secret: data.secret,
        otpauthUrl: data.otpauthUrl
      });
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Unable to start two-factor setup.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleConfirmSetup = async () => {
    if (!setupCode.trim()) {
      setSetupError('Enter the code from your authenticator app.');
      return;
    }
    setSetupLoading(true);
    setSetupError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/2fa/enable`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ code: setupCode.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Verification failed.');
      }
      setSetupMessage('Two-factor authentication enabled.');
      setSetupData(null);
      setSetupCode('');
      refreshUser().catch(() => {});
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleDisable = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDisableError(null);
    setDisableMessage(null);
    if (!disableCode.trim()) {
      setDisableError('Enter the code from your authenticator app.');
      return;
    }
    setDisableLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/2fa/disable`, {
        method: 'POST',
        headers: buildHeaders(),
        body: JSON.stringify({ code: disableCode.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Unable to disable two-factor authentication.');
      }
      setDisableMessage('Two-factor authentication disabled.');
      setDisableCode('');
      refreshUser().catch(() => {});
    } catch (error) {
      setDisableError(error instanceof Error ? error.message : 'Disable request failed.');
    } finally {
      setDisableLoading(false);
    }
  };

   if (!isOpen) return null;

   return (
     <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/60 p-2 sm:p-4 overflow-y-auto pt-16 pb-16">
       <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-2xl dark:border-ink-800 dark:bg-ink-900">
         <div className="sticky top-0 bg-white dark:bg-ink-900 z-10">
           <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4 dark:border-ink-800">
             <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">Account</p>
                  <h2 className="text-xl font-bold text-ink-900 dark:text-ink-50">Settings</h2>
                </div>
             </div>
             <button
               onClick={onClose}
               className="rounded-full p-2 text-ink-500 transition hover:text-ink-900 dark:text-ink-400 dark:hover:text-ink-100"
             >
               <X size={18} />
             </button>
           </div>
           
           <div className="flex border-b border-ink-100 dark:border-ink-800">
             {[
               { id: 'account', label: 'Account', icon: Shield },
               { id: 'security', label: 'Security', icon: ShieldCheck },
               { id: 'billing', label: 'Billing', icon: CreditCard },
               { id: 'api', label: 'Developer', icon: Terminal }
             ].map((tab) => (
               <button
                 key={tab.id}
                 onClick={() => setActiveTab(tab.id as any)}
                 className={`flex items-center gap-2 px-4 sm:px-6 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] transition border-b-2 ${
                   activeTab === tab.id 
                     ? 'border-saffron-400 text-saffron-500' 
                     : 'border-transparent text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
                 }`}
               >
                 <tab.icon size={14} />
                 <span className="hidden xs:inline">{tab.label}</span>
               </button>
             ))}
           </div>
         </div>
         
         <div className="p-6">

           {activeTab === 'account' && (
             <>
               <section className="mb-4 space-y-4 rounded-2xl border border-ink-100 bg-white p-5 shadow-sm dark:border-ink-800 dark:bg-ink-900">
                 <div className="flex items-center gap-3">
                   <Palette size={20} className="text-saffron-500" />
                   <div>
                     <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Theme</p>
                     <p className="text-xs text-ink-500 dark:text-ink-400">
                       Choose how the app should look. OLED is pure black and white.
                     </p>
                   </div>
                 </div>
                 <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                   {[
                     { value: 'light', label: 'Light', icon: Sun, description: 'Bright surfaces and soft accents.' },
                     { value: 'oled', label: 'OLED', icon: Circle, description: 'Pure black background, white text.' }
                   ].map((option) => {
                     const active = themeMode === option.value;
                     const Icon = option.icon;
                     return (
                       <button
                         key={option.value}
                         type="button"
                         onClick={() => setThemeMode(option.value as 'light' | 'dark' | 'oled')}
                         className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                           active
                             ? 'border-saffron-400 bg-saffron-50 text-ink-900 dark:border-saffron-500 dark:bg-white/5 dark:text-ink-50'
                             : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300 dark:hover:border-ink-700'
                         }`}
                       >
                         <Icon size={18} className={active ? 'text-saffron-500' : 'text-ink-500'} />
                         <div className="min-w-0">
                           <div className="text-sm font-semibold">{option.label}</div>
                           <div className="text-xs leading-snug text-ink-500 dark:text-ink-400">{option.description}</div>
                         </div>
                       </button>
                     );
                   })}
                 </div>
               </section>

               <section className="space-y-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-900/40">
             <div className="flex items-center gap-3">
               <Shield size={20} className="text-saffron-500" />
               <div>
                 <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Change password</p>
                 <p className="text-xs text-ink-500 dark:text-ink-400">
                   Update your password at any time. {user?.twoFactorEnabled ? 'You will need a two-factor code.' : ''}
                 </p>
               </div>
             </div>
             <form className="space-y-4" onSubmit={handlePasswordSubmit}>
               <div className="grid gap-3 sm:grid-cols-2">
                 <label className="text-xs uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">
                   Current password
                   <input
                     type="password"
                     value={currentPassword}
                     onChange={(event) => setCurrentPassword(event.target.value)}
                     className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                     autoComplete="current-password"
                   />
                 </label>
                 <label className="text-xs uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">
                   New password
                   <input
                     type="password"
                     value={newPassword}
                     onChange={(event) => setNewPassword(event.target.value)}
                     className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                     autoComplete="new-password"
                   />
                 </label>
               </div>
               <label className="text-xs uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">
                 Confirm new password
                 <input
                   type="password"
                   value={confirmPassword}
                   onChange={(event) => setConfirmPassword(event.target.value)}
                   className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                   autoComplete="new-password"
                 />
               </label>
               {user?.twoFactorEnabled && (
                 <label className="text-xs uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">
                   Two-factor code
                   <input
                     type="text"
                     value={passwordCode}
                     onChange={(event) => setPasswordCode(event.target.value)}
                     className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                     placeholder="123 456"
                   />
                 </label>
               )}
               {(passwordError || passwordSuccess) && (
                 <p
                   className={`text-sm ${passwordError ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
                 >
                   {passwordError || passwordSuccess}
                 </p>
               )}
               <div className="flex flex-wrap gap-3">
                 <button
                   type="submit"
                   disabled={passwordLoading}
                   className="rounded-2xl bg-saffron-400 px-5 py-3 text-xs font-bold uppercase tracking-[0.3em] text-ink-900 transition hover:bg-saffron-500 disabled:opacity-60"
                 >
                   {passwordLoading ? 'Saving…' : 'Save new password'}
                 </button>
                 <span className="text-xs text-ink-500 dark:text-ink-400">
                   Choose a strong password and store it safely.
                 </span>
               </div>
             </form>
           </section>

           <section className="mt-4 space-y-4 rounded-2xl border border-saffron-200 bg-saffron-50/20 p-5 dark:border-saffron-900/40 dark:bg-saffron-900/10">
             <div className="flex items-center gap-3">
               <Gift size={20} className="text-saffron-600 dark:text-saffron-400" />
               <div>
                 <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Referral Program</p>
                 <p className="text-xs text-ink-500 dark:text-ink-400">
                   Earn <span className="font-bold text-saffron-600 dark:text-saffron-400">$2.00 free API credits</span> for every friend you refer!
                 </p>
               </div>
             </div>
             <div className="flex items-center gap-2">
               <code className="flex-1 rounded-lg bg-white px-3 py-2 text-[10px] sm:text-xs font-mono dark:bg-ink-900/40 border border-saffron-200 dark:border-saffron-800 truncate">
                 {window.location.origin}/register?ref={user?.id}
               </code>
               <button 
                 onClick={() => {
                   navigator.clipboard.writeText(`${window.location.origin}/register?ref=${user?.id}`);
                   alert('Referral link copied to clipboard!');
                 }}
                 className="rounded-xl bg-saffron-100 p-2.5 transition hover:bg-saffron-200 dark:bg-saffron-900/40"
                 title="Copy referral link"
               >
                 <Copy size={16} className="text-saffron-600" />
               </button>
             </div>
             <p className="text-[10px] text-ink-500 dark:text-ink-400 italic">
               * Bonus is awarded to you when your referred friend verifies their email.
             </p>
           </section>
           </>
           )}

           {activeTab === 'security' && (
             <section className="space-y-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-900/60">
             <div className="flex items-center gap-3">
               <ShieldCheck size={20} className="text-emerald-500" />
               <div>
                 <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Two-factor authentication</p>
                 <p className="text-xs text-ink-500 dark:text-ink-400">
                   {user?.twoFactorEnabled ? 'Enabled – use your authenticator app to generate codes.' : 'Disabled – add an extra layer of protection.'}
                 </p>
               </div>
             </div>
             {user?.twoFactorEnabled ? (
               <form onSubmit={handleDisable} className="space-y-3">
                 <label className="text-xs uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">
                   Current code
                   <input
                     type="text"
                     value={disableCode}
                     onChange={(event) => setDisableCode(event.target.value)}
                     className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                     placeholder="123 456"
                   />
                 </label>
                 {(disableError || disableMessage) && (
                   <p className={`text-sm ${disableError ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                     {disableError || disableMessage}
                   </p>
                 )}
                 <button
                   type="submit"
                   disabled={disableLoading}
                   className="rounded-2xl border border-ink-200 px-5 py-3 text-xs font-bold uppercase tracking-[0.3em] text-ink-700 transition hover:border-saffron-400 hover:text-saffron-900 dark:border-ink-700 dark:text-ink-200 disabled:opacity-60"
                 >
                   {disableLoading ? 'Disabling…' : 'Disable two-factor'}
                 </button>
               </form>
             ) : (
               <div className="space-y-4">
                 <p className="text-sm text-ink-600 dark:text-ink-300">
                   Use Google Authenticator, Authy, or iOS/Android built-in authenticators. Scan the QR code or enter the key manually.
                 </p>
                 {setupData ? (
                   <div className="space-y-3 rounded-2xl border border-dashed border-ink-200 bg-white/70 p-4 dark:border-ink-700 dark:bg-ink-900/60">
                     <p className="text-xs text-ink-500 dark:text-ink-400">
                       Paste this URL into your authenticator app or open it in a new tab to generate a QR code.
                     </p>
                     <a
                       href={setupData.otpauthUrl}
                       target="_blank"
                       rel="noreferrer"
                       className="text-xs font-mono text-saffron-500 underline decoration-dotted underline-offset-2 dark:text-saffron-300"
                     >
                       {setupData.otpauthUrl}
                     </a>
                     <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 text-xs font-mono text-ink-600 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-200">
                       {setupData.secret}
                     </div>
                     <label className="text-xs uppercase tracking-[0.3em] text-ink-500 dark:text-ink-400">
                       Enter authenticator code
                       <input
                         type="text"
                         value={setupCode}
                         onChange={(event) => setSetupCode(event.target.value)}
                         className="mt-2 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                         placeholder="123 456"
                       />
                     </label>
                     {(setupError || setupMessage) && (
                       <p className={`text-sm ${setupError ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                         {setupError || setupMessage}
                       </p>
                     )}
                     <div className="flex flex-wrap gap-3">
                       <button
                         type="button"
                         disabled={setupLoading}
                         onClick={handleConfirmSetup}
                         className="rounded-2xl bg-ink-900 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-white transition hover:bg-ink-800 disabled:opacity-60"
                       >
                         {setupLoading ? 'Verifying…' : 'Verify & enable'}
                       </button>
                       <button
                         type="button"
                         onClick={() => {
                           setSetupData(null);
                           setSetupCode('');
                           setSetupError(null);
                         }}
                         className="rounded-2xl border border-ink-200 px-4 py-2 text-xs font-bold uppercase tracking-[0.3em] text-ink-600 transition hover:border-rose-400 hover:text-rose-600 dark:border-ink-700 dark:text-ink-200"
                       >
                         Cancel
                       </button>
                     </div>
                   </div>
                 ) : (
                   <div className="flex flex-wrap gap-3">
                     <button
                       type="button"
                       onClick={handleStartSetup}
                       disabled={setupLoading}
                       className="flex items-center gap-2 rounded-2xl bg-ink-900 px-5 py-3 text-xs font-bold uppercase tracking-[0.3em] text-white transition hover:bg-ink-800 disabled:opacity-60"
                     >
                       <QrCode size={14} />
                       {setupLoading ? 'Preparing…' : 'Set up two-factor'}
                     </button>
                     {setupError && (
                       <p className="text-xs text-red-600 dark:text-red-400">{setupError}</p>
                     )}
                   </div>
                 )}
                 <p className="text-xs text-ink-500 dark:text-ink-400">
                   Keep a copy of the secret safe. Losing access to your authenticator may require contacting support.
                 </p>
               </div>
             )}
           </section>
           )}

           {activeTab === 'billing' && (
             <section className="space-y-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-900/60">
              <div className="flex items-center gap-3">
                <CreditCard size={20} className="text-saffron-500" />
                <div>
                  <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Billing & Subscription</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Manage your current plan and subscription.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-ink-900 dark:text-ink-50 capitalize">{user?.plan || 'Free'} Plan</p>
                  {user?.plan !== 'free' && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Active subscription</p>
                  )}
                </div>
                {user?.plan !== 'free' && (
                  <button
                    onClick={async () => {
                      setBillingLoading(true);
                      setBillingError(null);
                      try {
                        const res = await fetch(`${API_BASE}/stripe/cancel-subscription`, {
                          method: 'POST',
                          headers: buildHeaders()
                        });
                        if (!res.ok) throw new Error('Failed to cancel subscription');
                        setBillingSuccess('Subscription cancelled successfully');
                        await refreshUser();
                      } catch (err: any) {
                        setBillingError(err.message || 'Failed to cancel subscription');
                      } finally {
                        setBillingLoading(false);
                      }
                    }}
                    disabled={billingLoading}
                    className="w-full sm:w-auto rounded-2xl border border-red-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:bg-ink-900 disabled:opacity-60"
                  >
                    {billingLoading ? 'Cancelling…' : 'Cancel plan'}
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-ink-200 bg-white p-4 dark:border-ink-700 dark:bg-ink-900/60">
                <Clock size={16} className="text-ink-400" />
                <p className="text-sm text-ink-600 dark:text-ink-300">
                  Your plan will remain active until the end of your billing period.
                </p>
              </div>

              {(billingError || billingSuccess) && (
                <p className={`text-sm ${billingError ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {billingError || billingSuccess}
                </p>
              )}
            </section>
           )}

           {activeTab === 'api' && (
             <section className="space-y-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-5 dark:border-ink-800 dark:bg-ink-900/60">
               <div className="flex items-center justify-between gap-3">
                 <div className="flex items-center gap-3">
                   <Terminal size={20} className="text-saffron-500" />
                   <div>
                     <p className="text-sm font-semibold text-ink-900 dark:text-ink-50">Developer API</p>
                     <p className="text-xs text-ink-500 dark:text-ink-400">
                       Use ZygAI in your own applications.
                     </p>
                   </div>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wider text-ink-500">API Credits</p>
                        <p className="text-sm font-bold text-ink-900 dark:text-ink-50">${(parseFloat(String(user?.apiCredits || '0'))).toFixed(4)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
                        <select 
                          value={topupAmount} 
                          onChange={(e) => setTopupAmount(e.target.value)}
                          className="bg-transparent pl-2 pr-1 text-xs font-bold text-ink-900 outline-none dark:text-ink-50"
                        >
                          <option value="5">$5</option>
                          <option value="10">$10</option>
                          <option value="25">$25</option>
                          <option value="50">$50</option>
                          <option value="100">$100</option>
                        </select>
                        <button 
                          onClick={handleTopup}
                          disabled={topupLoading}
                          className="rounded-lg bg-ink-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-ink-800 disabled:opacity-50"
                        >
                          {topupLoading ? '...' : 'Deposit'}
                        </button>
                    </div>
                 </div>
               </div>

               {generatedKey && (
                 <div className="mb-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4 dark:border-emerald-900/30 dark:bg-emerald-900/20">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">New Secret Key Generated</p>
                      <button onClick={() => setGeneratedKey(null)} className="text-emerald-600 hover:text-emerald-800">
                        <X size={14} />
                      </button>
                    </div>
                    <p className="mb-3 text-[10px] text-emerald-700 dark:text-emerald-400">Save this key now. For your security, you won't be able to see it again.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-mono dark:bg-ink-950 border border-emerald-200 dark:border-emerald-800 truncate">{generatedKey}</code>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(generatedKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="rounded-xl bg-emerald-100 p-2.5 transition hover:bg-emerald-200 dark:bg-emerald-900/40"
                      >
                        {copiedKey ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} className="text-emerald-600" />}
                      </button>
                    </div>
                 </div>
               )}

               <div className="space-y-4">
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <input 
                      type="text" 
                      placeholder="Key name"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                    />
                    <input 
                      type="number" 
                      placeholder="Monthly limit ($)"
                      value={newKeyMonthlyLimit}
                      onChange={(e) => setNewKeyMonthlyLimit(e.target.value)}
                      className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                    />
                    <input 
                      type="text" 
                      placeholder="IP Allowlist (optional)"
                      value={newKeyIpAllowlist}
                      onChange={(e) => setNewKeyIpAllowlist(e.target.value)}
                      className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-800 dark:bg-ink-950 dark:text-ink-100"
                    />
                    <button 
                      onClick={handleCreateKey}
                      disabled={isCreatingKey}
                      className="flex items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-ink-800 disabled:opacity-50"
                    >
                      <Plus size={14} />
                      {isCreatingKey ? '...' : 'Create Key'}
                    </button>
                 </div>

                 <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950">
                    <table className="w-full text-left text-[11px] sm:text-xs">
                      <thead className="bg-ink-50 text-ink-500 dark:bg-ink-900/40 border-b dark:border-ink-800">
                        <tr>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider">Secret Key</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider">Usage / Limit</th>
                          <th className="px-4 py-3 font-bold uppercase tracking-wider">IPs</th>
                          <th className="px-4 py-3 text-right"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                        {apiKeys.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-12 text-center text-ink-400 italic">No API keys generated yet.</td>
                          </tr>
                        ) : (
                          apiKeys.map(k => (
                            <tr key={k.id} className="hover:bg-ink-50/50 dark:hover:bg-ink-900/30 transition">
                              <td className="px-4 py-3">
                                <div className="font-semibold text-ink-900 dark:text-ink-50">{k.name}</div>
                                <div className="text-[10px] text-ink-400">Created {new Date(k.created_at).toLocaleDateString()}</div>
                              </td>
                              <td className="px-4 py-3 font-mono text-ink-500">{k.api_key}</td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <div className="flex justify-between items-center w-32">
                                    <span>${parseFloat(k.current_monthly_spend).toFixed(4)}</span>
                                    <span className="text-ink-400">/ {k.monthly_limit ? `$${k.monthly_limit}` : '∞'}</span>
                                  </div>
                                  {k.monthly_limit && (
                                    <div className="w-32 h-1 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-saffron-500" 
                                        style={{ width: `${Math.min(100, (parseFloat(k.current_monthly_spend) / parseFloat(k.monthly_limit)) * 100)}%` }}
                                      />
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-ink-500 italic max-w-[120px] truncate" title={k.ip_allowlist || 'All IPs allowed'}>
                                {k.ip_allowlist || 'All IPs'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button 
                                  onClick={() => handleDeleteKey(k.id)}
                                  className="p-1.5 rounded-lg text-ink-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                 </div>
               </div>

               {usageHistory.length > 0 && (
                 <div className="mt-8 space-y-3">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-ink-400" />
                      <p className="text-xs font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Usage History (7 Days)</p>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950">
                      <table className="w-full text-left text-[11px] sm:text-xs">
                        <thead className="bg-ink-50 text-ink-500 dark:bg-ink-900/40 border-b dark:border-ink-800">
                          <tr>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Requests</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider">Tokens</th>
                            <th className="px-4 py-3 font-bold uppercase tracking-wider text-right">Cost</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                          {usageHistory.map((u, i) => (
                            <tr key={i} className="hover:bg-ink-50/50 dark:hover:bg-ink-900/30 transition">
                              <td className="px-4 py-3 text-ink-900 dark:text-ink-50 font-medium">{new Date(u.day).toLocaleDateString()}</td>
                              <td className="px-4 py-3 text-ink-600 dark:text-ink-400">{u.total_requests}</td>
                              <td className="px-4 py-3 text-ink-600 dark:text-ink-400">{(u.total_tokens / 1000).toFixed(1)}k</td>
                              <td className="px-4 py-3 text-right font-bold text-ink-900 dark:text-ink-50">${parseFloat(u.total_cost).toFixed(4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                 </div>
               )}

               <div className="rounded-2xl bg-saffron-50/50 border border-saffron-100 p-5 dark:bg-saffron-900/10 dark:border-saffron-900/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Key size={16} className="text-saffron-600" />
                    <p className="text-xs font-bold text-saffron-800 dark:text-saffron-300">API Documentation</p>
                  </div>
                  <div className="space-y-2 text-[10px] sm:text-xs text-saffron-700 dark:text-saffron-400 leading-relaxed">
                    <p>Base URL: <code className="bg-white/80 px-1.5 py-0.5 rounded border border-saffron-200 font-mono dark:bg-ink-900/30 dark:border-saffron-800">https://zygai.app/api/v1</code></p>
                    <p>Endpoint: <code className="bg-white/80 px-1.5 py-0.5 rounded border border-saffron-200 font-mono dark:bg-ink-900/30 dark:border-saffron-800">/chat/completions</code></p>
                    <p>Authentication: <code className="bg-white/80 px-1.5 py-0.5 rounded border border-saffron-200 font-mono dark:bg-ink-900/30 dark:border-saffron-800">Authorization: Bearer YOUR_API_KEY</code></p>
                    <p className="mt-3 pt-3 border-t border-saffron-200/50 dark:border-saffron-800/50">Compatible with OpenAI SDKs and libraries. Simply change the base URL to ZygAI.</p>
                  </div>
               </div>
             </section>
           )}
         </div>
       </div>
     </div>
   );
};

export default AccountSettingsModal;
