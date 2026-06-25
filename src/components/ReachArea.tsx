import React, { useState, useEffect, useCallback } from 'react';
import { Target, Search, Mail, Settings, Trash2, Send, CheckCircle, AlertCircle, Loader2, ExternalLink, Filter, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import clsx from 'clsx';

interface Lead {
  id: string;
  email: string;
  name: string | null;
  company: string | null;
  source_url: string | null;
  status: 'new' | 'contacted' | 'replied' | 'rejected';
  notes: string | null;
  created_at: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
}

interface SMTPSettings {
  host: string;
  port: number;
  user: string;
  secure: boolean;
  from_email: string;
  from_name: string | null;
}

interface FeatureConfig {
  featureKey: string;
  provider: string;
  modelId: string;
}

const ReachArea: React.FC = () => {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<'leads' | 'search' | 'settings'>('search');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [smtpSettings, setSmtpSettings] = useState<SMTPSettings | null>(null);
  const [featureConfig, setFeatureConfig] = useState<FeatureConfig | null>(null);
  
  // ...
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Outreach state
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [outreachTemplate, setOutreachTemplate] = useState('Hi [Name],\n\nI saw your work at [Company] and wanted to reach out...');
  const [isSending, setIsSending] = useState(false);
  const [sendResults, setSendResults] = useState<any[]>([]);

  // SMTP form state
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 587,
    user: '',
    pass: '',
    secure: false,
    fromEmail: '',
    fromName: ''
  });
  const [isSavingSmtp, setIsSavingSmtp] = useState(false);

  const fetchLeads = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/reach/leads`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  }, [token]);

  const fetchCampaigns = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/reach/campaigns`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    }
  }, [token]);

  const fetchSmtpSettings = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/reach/smtp`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.smtp) {
          setSmtpSettings(data.smtp);
          setSmtpForm({
            host: data.smtp.host || '',
            port: data.smtp.port || 587,
            user: data.smtp.user || '',
            pass: '', // Don't fetch password
            secure: !!data.smtp.secure,
            fromEmail: data.smtp.from_email || '',
            fromName: data.smtp.from_name || ''
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch SMTP settings:', err);
    }
  }, [token]);

  const fetchFeatureConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/feature-models`);
      if (res.ok) {
        const data = await res.json();
        const reach = data.settings?.find((s: any) => s.featureKey === 'reach');
        if (reach) setFeatureConfig(reach);
      }
    } catch (err) {
      console.error('Failed to fetch feature config:', err);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
    fetchCampaigns();
    fetchSmtpSettings();
    fetchFeatureConfig();
  }, [fetchLeads, fetchCampaigns, fetchSmtpSettings, fetchFeatureConfig]);

  const handleSearch = async () => {
    if (!searchQuery.trim() || isSearching) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`${API_BASE}/reach/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          query: searchQuery,
          campaignId: selectedCampaignId || null
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      
      if (data.leads && data.leads.length > 0) {
        setLeads(prev => [...data.leads, ...prev]);
        setActiveTab('leads');
      } else {
        setSearchError('No leads found for this query.');
      }
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSendOutreach = async () => {
    if (selectedLeadIds.size === 0 || isSending) return;
    setIsSending(true);
    try {
      const res = await fetch(`${API_BASE}/reach/outreach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          leadIds: Array.from(selectedLeadIds),
          template: outreachTemplate
        })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Outreach failed');
      
      setSendResults(data.results);
      fetchLeads(); // Refresh statuses
      setSelectedLeadIds(new Set());
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveSmtp = async () => {
    setIsSavingSmtp(true);
    try {
      const res = await fetch(`${API_BASE}/reach/smtp`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(smtpForm)
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save SMTP settings');
      }
      
      fetchSmtpSettings();
      alert('SMTP settings saved successfully');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsSavingSmtp(false);
    }
  };

  const toggleLeadSelection = (id: string) => {
    const newSelected = new Set(selectedLeadIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLeadIds(newSelected);
  };

  const selectAllLeads = () => {
    if (selectedLeadIds.size === leads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(leads.map(l => l.id)));
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl p-6">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg">
              <Target size={24} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-ink-50">ZygAI Reach</h1>
              <div className="flex items-center gap-2">
                <p className="text-sm text-ink-500">Autonomous lead discovery and outreach agent.</p>
                {featureConfig && (
                  <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
                    <Sparkles size={10} />
                    {featureConfig.modelId.replace('m-', 'Model ')}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
            <button
              onClick={() => setActiveTab('search')}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition",
                activeTab === 'search' ? "bg-white text-indigo-600 shadow-sm dark:bg-ink-900" : "text-ink-500 hover:text-ink-700"
              )}
            >
              <Search size={16} />
              Find Leads
            </button>
            <button
              onClick={() => setActiveTab('leads')}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition",
                activeTab === 'leads' ? "bg-white text-indigo-600 shadow-sm dark:bg-ink-900" : "text-ink-500 hover:text-ink-700"
              )}
            >
              <Mail size={16} />
              Outreach
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={clsx(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition",
                activeTab === 'settings' ? "bg-white text-indigo-600 shadow-sm dark:bg-ink-900" : "text-ink-500 hover:text-ink-700"
              )}
            >
              <Settings size={16} />
              Setup
            </button>
          </div>
        </div>

        {activeTab === 'search' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="rounded-3xl border border-ink-200 bg-white p-8 shadow-xl dark:border-ink-800 dark:bg-ink-900">
              <h2 className="mb-6 text-xl font-bold text-ink-900 dark:text-ink-50">What are you looking for?</h2>
              <div className="flex flex-col gap-4">
                <textarea
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Find founders of AI startups in London who recently raised seed funding..."
                  rows={3}
                  className="w-full rounded-2xl border border-ink-200 bg-ink-50 px-6 py-4 text-lg text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <select
                      value={selectedCampaignId}
                      onChange={(e) => setSelectedCampaignId(e.target.value)}
                      className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-700 outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-300"
                    >
                      <option value="">No Campaign</option>
                      {campaigns.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <button className="text-sm font-bold text-indigo-600 hover:underline">
                      + New Campaign
                    </button>
                  </div>
                  
                  <button
                    onClick={handleSearch}
                    disabled={!searchQuery.trim() || isSearching}
                    className="flex items-center gap-3 rounded-2xl bg-indigo-600 px-8 py-3 text-lg font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSearching ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Searching...
                      </>
                    ) : (
                      <>
                        <Target size={20} />
                        Find Leads
                      </>
                    )}
                  </button>
                </div>
                {searchError && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
                    <AlertCircle size={18} />
                    {searchError}
                  </div>
                )}
              </div>
            </div>
            
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
                <h3 className="mb-2 font-bold text-ink-900 dark:text-ink-50">Exa Search</h3>
                <p className="text-sm text-ink-500">Powered by neural search to find high-quality professional sources.</p>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
                <h3 className="mb-2 font-bold text-ink-900 dark:text-ink-50">AI Extraction</h3>
                <p className="text-sm text-ink-500">Intelligently extracts contact details and context from search results.</p>
              </div>
              <div className="rounded-2xl border border-ink-100 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
                <h3 className="mb-2 font-bold text-ink-900 dark:text-ink-50">Auto-Enrich</h3>
                <p className="text-sm text-ink-500">Automatically builds a profile for every lead found.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'leads' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-ink-900 dark:text-ink-50">{leads.length} Leads Discovered</h2>
              <div className="flex items-center gap-4">
                <button
                  onClick={selectAllLeads}
                  className="text-sm font-bold text-ink-500 hover:text-indigo-600"
                >
                  {selectedLeadIds.size === leads.length ? 'Deselect All' : 'Select All'}
                </button>
                <div className="h-4 w-px bg-ink-200" />
                <button className="flex items-center gap-2 text-sm font-bold text-ink-500">
                  <Filter size={16} />
                  Filter
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-3 space-y-4">
                {leads.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-ink-200 p-12 text-center">
                    <Mail size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-ink-500">No leads found yet. Start by searching!</p>
                  </div>
                ) : (
                  leads.map(lead => (
                    <div
                      key={lead.id}
                      onClick={() => toggleLeadSelection(lead.id)}
                      className={clsx(
                        "group flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition-all hover:shadow-md",
                        selectedLeadIds.has(lead.id) 
                          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20" 
                          : "border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900"
                      )}
                    >
                      <div className="flex items-center gap-4">
                        <div className={clsx(
                          "flex h-10 w-10 items-center justify-center rounded-xl",
                          selectedLeadIds.has(lead.id) ? "bg-indigo-500 text-white" : "bg-ink-100 text-ink-500 dark:bg-ink-800"
                        )}>
                          {lead.name ? lead.name.slice(0, 1).toUpperCase() : <Mail size={18} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-ink-900 dark:text-ink-50">{lead.name || lead.email}</h4>
                            <span className={clsx(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                              lead.status === 'new' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30" : "bg-ink-100 text-ink-600"
                            )}>
                              {lead.status}
                            </span>
                          </div>
                          <p className="text-xs text-ink-500">{lead.company || 'Unknown Company'} • {lead.email}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {lead.source_url && (
                          <a
                            href={lead.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-indigo-600 transition-colors"
                          >
                            <ExternalLink size={16} />
                          </a>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle delete
                          }}
                          className="rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="space-y-6">
                <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-900">
                  <h3 className="mb-4 font-bold text-ink-900 dark:text-ink-50">Outreach Plan</h3>
                  <div className="mb-4">
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">Template</label>
                    <textarea
                      value={outreachTemplate}
                      onChange={(e) => setOutreachTemplate(e.target.value)}
                      rows={6}
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                    <p className="mt-2 text-[10px] text-ink-400">Use [Name] and [Company] for personalization.</p>
                  </div>
                  
                  <button
                    onClick={handleSendOutreach}
                    disabled={selectedLeadIds.size === 0 || isSending || !smtpSettings}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSending ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send to {selectedLeadIds.size} Leads
                      </>
                    )}
                  </button>
                  {!smtpSettings && (
                    <p className="mt-2 text-center text-xs font-medium text-amber-600">
                      Configure SMTP in Setup first.
                    </p>
                  )}
                </div>
                
                {sendResults.length > 0 && (
                  <div className="rounded-2xl border border-ink-100 bg-emerald-50/50 p-6 dark:border-emerald-900/20 dark:bg-emerald-900/10">
                    <h3 className="mb-2 flex items-center gap-2 font-bold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle size={18} />
                      Last Blast Results
                    </h3>
                    <p className="text-sm text-emerald-600 dark:text-emerald-500">
                      {sendResults.filter(r => r.sent).length} sent, {sendResults.filter(r => !r.sent).length} failed.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="max-w-2xl rounded-3xl border border-ink-200 bg-white p-8 shadow-xl dark:border-ink-800 dark:bg-ink-900">
              <h2 className="mb-2 text-xl font-bold text-ink-900 dark:text-ink-50">Email Infrastructure</h2>
              <p className="mb-8 text-sm text-ink-500">Connect your personal SMTP server to send outreach on your own name.</p>
              
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">SMTP Host</label>
                    <input
                      type="text"
                      value={smtpForm.host}
                      onChange={(e) => setSmtpForm({...smtpForm, host: e.target.value})}
                      placeholder="smtp.gmail.com"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">Port</label>
                    <input
                      type="number"
                      value={smtpForm.port}
                      onChange={(e) => setSmtpForm({...smtpForm, port: parseInt(e.target.value) || 587})}
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">Username</label>
                    <input
                      type="text"
                      value={smtpForm.user}
                      onChange={(e) => setSmtpForm({...smtpForm, user: e.target.value})}
                      placeholder="you@gmail.com"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">App Password / Secret</label>
                    <input
                      type="password"
                      value={smtpForm.pass}
                      onChange={(e) => setSmtpForm({...smtpForm, pass: e.target.value})}
                      placeholder="••••••••••••••••"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>
                </div>
                
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">Sender Email</label>
                    <input
                      type="email"
                      value={smtpForm.fromEmail}
                      onChange={(e) => setSmtpForm({...smtpForm, fromEmail: e.target.value})}
                      placeholder="outreach@yourdomain.com"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-bold uppercase tracking-widest text-ink-400">Display Name</label>
                    <input
                      type="text"
                      value={smtpForm.fromName}
                      onChange={(e) => setSmtpForm({...smtpForm, fromName: e.target.value})}
                      placeholder="John Doe"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-indigo-500 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="smtpSecure"
                    checked={smtpForm.secure}
                    onChange={(e) => setSmtpForm({...smtpForm, secure: e.target.checked})}
                    className="h-4 w-4 rounded border-ink-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="smtpSecure" className="text-sm font-medium text-ink-700 dark:text-ink-300">
                    Use Secure Connection (SSL/TLS)
                  </label>
                </div>
                
                <div className="flex justify-end pt-4">
                  <button
                    onClick={handleSaveSmtp}
                    disabled={isSavingSmtp}
                    className="rounded-xl bg-indigo-600 px-8 py-2.5 font-bold text-white shadow-lg transition hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isSavingSmtp ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </div>
            
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-6 dark:border-amber-900/20 dark:bg-amber-900/10">
              <h3 className="mb-2 flex items-center gap-2 font-bold text-amber-700 dark:text-amber-400">
                <AlertCircle size={18} />
                Security Note
              </h3>
              <p className="text-sm text-amber-600 dark:text-amber-500">
                Your SMTP credentials are encrypted at rest using AES-256-GCM. We recommend using App Passwords instead of your primary account password whenever possible.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReachArea;
