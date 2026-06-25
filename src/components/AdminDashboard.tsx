import React, { useEffect, useMemo, useState } from 'react';
import { Shield, Users, FileText, CreditCard, Server, Cpu, Megaphone, Settings, ClipboardList, Plus, Edit2, Trash2, Save, X, Mail, AlertTriangle } from 'lucide-react';
import { OverviewPanel } from './panels/OverviewPanel';
import { UsersPanel } from './panels/UsersPanel';
import { BlogsPanel } from './panels/BlogsPanel';
import { PlansPanel } from './panels/PlansPanel';
import { McpPanel } from './panels/McpPanel';
import { ModelsPanel } from './panels/ModelsPanel';
import { EmailPanel } from './panels/EmailPanel';
import { BansPanel } from './panels/BansPanel';
import { CampaignsPanel } from './panels/CampaignsPanel';
import ModelLimitsPanel from './ModelLimitsPanel';
import MusicOrphanImport from './MusicOrphanImport';
import { AdminUser, AdminBlogPost, AdminLog, UsageDay, ApiProvider, ModelConfig, FeatureModelConfig } from '@/types/admin';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';

type AdminSection = 'overview' | 'users' | 'blogs' | 'plans' | 'mcp' | 'models' | 'announcements' | 'settings' | 'changelogs' | 'email' | 'bans' | 'campaigns' | 'music' | 'model_limits';

interface SectionConfig {
  id: AdminSection;
  label: string;
  icon: React.ElementType;
}

const SECTIONS: SectionConfig[] = [
  { id: 'overview', label: 'Overview', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'bans', label: 'Bans & Filters', icon: AlertTriangle },
  { id: 'blogs', label: 'Blogs', icon: FileText },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'plans', label: 'Plans', icon: CreditCard },
  { id: 'campaigns', label: 'Campaigns', icon: Megaphone },
  { id: 'mcp', label: 'MCP', icon: Server },
  { id: 'models', label: 'Models', icon: Cpu },
  { id: 'announcements', label: 'Announcements', icon: Megaphone },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'changelogs', label: 'Changelogs', icon: ClipboardList },
  { id: 'model_limits', label: 'Model Limits', icon: Cpu },
];

const AdminDashboard: React.FC = () => {
  const { user, token } = useAuth();
  const [section, setSection] = useState<AdminSection>('overview');

  if (user?.role !== 'admin') {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">403 Forbidden</h1>
          <p className="text-ink-500 mt-2">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usage, setUsage] = useState<UsageDay[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [stats, setStats] = useState<any>({ 
    totalUsers: 0, 
    paidUsers: 0, 
    onlineUsers: 0, 
    stripeStats: { activeSubscriptions: 0, trialingSubscriptions: 0 }, 
    pwaInstalls: 0, 
    pwaInstalls30d: 0 
  });
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState<boolean>(true);
  
  // Blog state
  const [blogs, setBlogs] = useState<AdminBlogPost[]>([]);
  const [blogForm, setBlogForm] = useState<{ 
    id: number | null; 
    title: string; 
    slug: string; 
    content: string; 
    metaTitle: string; 
    metaDescription: string; 
    metaImage: string; 
    published: boolean 
  }>({ id: null, title: '', slug: '', content: '', metaTitle: '', metaDescription: '', metaImage: '', published: false });
  
  // Plans state
  const [planSettings, setPlanSettings] = useState<{ id: string; enabled: boolean }[]>([
    { id: 'free', enabled: true },
    { id: 'go', enabled: true },
    { id: 'plus', enabled: true },
    { id: 'beta', enabled: true }
  ]);
  const [planSettingsLoading, setPlanSettingsLoading] = useState(false);
  const [planSettingsStatus, setPlanSettingsStatus] = useState<string | undefined>();
  
  // MCP state
  const [apiToolServers, setMcpServers] = useState<any[]>([]);
  
  // Models state
  const [apiProviders, setApiProviders] = useState<ApiProvider[]>([]);
  const [modelConfigs, setModelConfigs] = useState<ModelConfig[]>([]);
  const [featureModels, setFeatureModels] = useState<FeatureModelConfig[]>([]);

  // Announcements state
  const [announcement, setAnnouncement] = useState<string>('');
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementStatus, setAnnouncementStatus] = useState<string | undefined>();
  
  // Site Settings state
  const [siteSettings, setSiteSettings] = useState<any>({});
  const [siteSettingsLoading, setSiteSettingsLoading] = useState(false);
  const [siteSettingsStatus, setSiteSettingsStatus] = useState<string | undefined>();

  // Changelogs state
  const [changelogs, setChangelogs] = useState<any[]>([]);
  const [changelogForm, setChangelogForm] = useState<{ id: number | null; version: string; content: string; published: boolean }>({ id: null, version: '', content: '', published: true });
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [isCreatingChangelog, setIsCreatingChangelog] = useState(false);

  const headers = useMemo(() => ({ 
    Authorization: `Bearer ${token}`, 
    'Content-Type': 'application/json' 
  }), [token]);

  // Helpers
  const fetchJson = async (url: string, options?: RequestInit) => {
    const res = await fetch(url, { headers, ...options });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error((data as any)?.error || 'Request failed');
    return data;
  };

   // Load all sections on mount
   useEffect(() => {
     const loadAll = async () => {
       setLoading(true);
       try {
         const responses = await Promise.allSettled([
           fetch(`${API_BASE}/admin/users`, { headers }),
           fetch(`${API_BASE}/admin/stats`, { headers }),
           fetch(`${API_BASE}/admin/logs`, { headers }),
           fetch(`${API_BASE}/admin/feature-models`, { headers }),
           fetch(`${API_BASE}/admin/api-providers`, { headers }),
           fetch(`${API_BASE}/admin/model-configs`, { headers }),
           fetch(`${API_BASE}/admin/mcp-servers`, { headers }),
           fetch(`${API_BASE}/admin/site-settings`, { headers })
         ]);
         
         const [usersRes, statsRes, logsRes, featureModelsRes, apiProvidersRes, modelConfigsRes, mcpRes, siteSettingsRes] = responses;
         
         const usersData = usersRes.status === 'fulfilled' ? await usersRes.value.json().catch(() => ({})) : {};
         const statsData = statsRes.status === 'fulfilled' ? await statsRes.value.json().catch(() => ({})) : {};
         const logsData = logsRes.status === 'fulfilled' ? await logsRes.value.json().catch(() => ({})) : {};
         const featureModelsData = featureModelsRes.status === 'fulfilled' ? await featureModelsRes.value.json().catch(() => ({ settings: [] })) : { settings: [] };
         const apiProvidersData = apiProvidersRes.status === 'fulfilled' ? await apiProvidersRes.value.json().catch(() => ({ providers: [] })) : { providers: [] };
         const modelConfigsData = modelConfigsRes.status === 'fulfilled' ? await modelConfigsRes.value.json().catch(() => ({ configs: [] })) : { configs: [] };
         const mcpData = mcpRes.status === 'fulfilled' ? await mcpRes.value.json().catch(() => ({ servers: [] })) : { servers: [] };
         const siteSettingsData = siteSettingsRes.status === 'fulfilled' ? await siteSettingsRes.value.json().catch(() => ({})) : {};

         setUsers((usersData as any).users || []);
         setStats({
           totalUsers: (statsData as any).totalUsers ?? 0,
           paidUsers: (statsData as any).paidUsers ?? 0,
           onlineUsers: (statsData as any).onlineUsers ?? 0,
           stripeStats: (statsData as any).stripeStats ?? { activeSubscriptions: 0, trialingSubscriptions: 0 },
           pwaInstalls: (statsData as any).pwaInstalls ?? 0,
           pwaInstalls30d: (statsData as any).pwaInstalls30d ?? 0
         });
         setUsage((statsData as any).usageByDay ?? []);
         setLogs((logsData as any).logs ?? []);
         
         const fetchedFeatureModels = (featureModelsData.settings || []) as FeatureModelConfig[];
         if (!fetchedFeatureModels.find((s) => s.featureKey === 'vibe_coder')) {
           fetchedFeatureModels.push({ 
             featureKey: 'vibe_coder', 
             provider: 'zygai-ollama', 
             modelId: 'gemma4:e4b',
             modelIds: ['gemma4:e4b'],
             modelOptions: [{ provider: 'zygai-ollama', modelId: 'gemma4:e4b', label: 'Gemma 4 (ZygAI Native)' }]
           } as any);
         }
         if (!fetchedFeatureModels.find((s) => s.featureKey === 'reach')) {
           fetchedFeatureModels.push({ 
             featureKey: 'reach', 
             provider: 'zygai', 
             modelId: 'llama-3.1-8b-instruct' 
           });
         }
         setFeatureModels(fetchedFeatureModels);

         setApiProviders(apiProvidersData.providers || []);
         setModelConfigs(modelConfigsData.configs || []);
         setMcpServers(mcpData.servers || []);
         setSiteSettings(siteSettingsData);
       } catch (err: any) {
         setError(err?.message ?? 'Failed to load admin data.');
       } finally {
         setLoading(false);
       }
     };
      loadAll();
    }, [headers]);

    // Load tab-specific data
    useEffect(() => {
      if (section === 'blogs') {
        loadBlogs();
      } else if (section === 'announcements') {
        loadAnnouncement();
      } else if (section === 'settings') {
        loadSiteSettings();
      } else if (section === 'changelogs') {
        loadChangelogs();
      }
    }, [section]);

   const loadSiteSettings = async () => {
     setSiteSettingsLoading(true);
     try {
       const response = await fetch(`${API_BASE}/admin/site-settings`, { headers });
       if (response.ok) {
         const data = await response.json();
         setSiteSettings(data);
       }
     } catch (err) {
       console.error('Failed to load site settings');
     } finally {
       setSiteSettingsLoading(false);
     }
   };

   // Helpers for saving simple sections
   const savePlanSettings = async () => {
     setPlanSettingsLoading(true);
     try {
       await fetchJson(`${API_BASE}/admin/plan-settings`, {
         method: 'PUT',
         body: JSON.stringify({ plans: planSettings })
       });
       setPlanSettingsStatus('Plan settings saved.');
       window.setTimeout(() => setPlanSettingsStatus(undefined), 2000);
     } catch (err: any) {
       setPlanSettingsStatus(err?.message ?? 'Failed to save plan settings.');
     } finally {
       setPlanSettingsLoading(false);
     }
   };

  // Blog operations
  const loadBlogs = async () => {
    try {
      const data = await fetchJson(`${API_BASE}/admin/blog`);
      setBlogs((data as any).posts || []);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load blogs.');
    }
  };

  const saveBlogPost = async () => {
    try {
      const payload = {
        title: blogForm.title.trim(), 
        slug: blogForm.slug.trim(), 
        content: blogForm.content,
        metaTitle: blogForm.metaTitle.trim() || undefined,
        metaDescription: blogForm.metaDescription.trim() || undefined,
        metaImage: blogForm.metaImage.trim() || undefined,
        published: blogForm.published
      };
      const endpoint = blogForm.id != null
          ? `${API_BASE}/admin/blog/${blogForm.id}`
          : `${API_BASE}/admin/blog`;
      const method = blogForm.id != null ? 'PUT' : 'POST';
      const res = await fetch(endpoint, {
        method, headers, body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to save post.');
      await loadBlogs();
      if (!blogForm.id && (data as any).id) {
        setBlogForm((prev) => ({ ...prev, id: (data as any).id, slug: (data as any).slug || prev.slug }));
      } else if ((data as any).slug) {
        setBlogForm((prev) => ({ ...prev, slug: (data as any).slug }));
      }
    } catch (err: any) {
      setError(err?.message ?? 'Failed to save post.');
    }
   };

   // Announcements operations
   const loadAnnouncement = async () => {
     setAnnouncementLoading(true);
     try {
       const response = await fetch(`${API_BASE}/announcement`, { headers });
       if (response.ok) {
         const data = await response.json();
         setAnnouncement(data.message || '');
       } else {
         setAnnouncement('');
       }
     } catch {
       setAnnouncement('');
     } finally {
       setAnnouncementLoading(false);
     }
   };

   const saveAnnouncement = async () => {
     setAnnouncementLoading(true);
     setAnnouncementStatus(undefined);
     try {
       const response = await fetch(`${API_BASE}/admin/announcement`, {
         method: 'POST',
         headers,
         body: JSON.stringify({ message: announcement })
       });
       const data = await response.json();
       if (!response.ok) throw new Error(data?.error || 'Failed to save announcement');
       setAnnouncementStatus('Announcement saved successfully.');
       setTimeout(() => setAnnouncementStatus(undefined), 2000);
     } catch (err: any) {
       setAnnouncementStatus(err?.message ?? 'Failed to save announcement.');
     } finally {
       setAnnouncementLoading(false);
     }
   };

   const saveSiteSettings = async () => {
     setSiteSettingsLoading(true);
     setSiteSettingsStatus(undefined);
     try {
       const response = await fetch(`${API_BASE}/admin/site-settings`, {
         method: 'PUT',
         headers,
         body: JSON.stringify(siteSettings)
       });
       const data = await response.json();
       if (!response.ok) throw new Error(data?.error || 'Failed to save settings');
       setSiteSettingsStatus('Site settings saved successfully.');
       setTimeout(() => setSiteSettingsStatus(undefined), 2000);
     } catch (err: any) {
       setSiteSettingsStatus(err?.message ?? 'Failed to save settings.');
     } finally {
       setSiteSettingsLoading(false);
     }
   };

   const loadChangelogs = async () => {
     setChangelogLoading(true);
     try {
       const response = await fetch(`${API_BASE}/admin/changelogs`, { headers });
       const data = await response.json();
       if (response.ok) {
         setChangelogs(data.changelogs || []);
       }
     } catch (err) {
       console.error('Failed to load changelogs');
     } finally {
       setChangelogLoading(false);
     }
   };

   const saveChangelog = async () => {
     if (!changelogForm.version.trim() || !changelogForm.content.trim()) {
       setError('Version and content are required.');
       return;
     }
     setChangelogLoading(true);
     try {
       const endpoint = changelogForm.id ? `${API_BASE}/admin/changelogs/${changelogForm.id}` : `${API_BASE}/admin/changelogs`;
       const method = changelogForm.id ? 'PUT' : 'POST';
       const res = await fetch(endpoint, {
         method,
         headers,
         body: JSON.stringify({
           version: changelogForm.version,
           content: changelogForm.content,
           published: changelogForm.published
         })
       });
       const data = await res.json();
       if (!res.ok) throw new Error(data?.error || 'Failed to save changelog');
       
       setIsCreatingChangelog(false);
       setChangelogForm({ id: null, version: '', content: '', published: true });
       await loadChangelogs();
     } catch (err: any) {
       setError(err?.message ?? 'Failed to save changelog.');
     } finally {
       setChangelogLoading(false);
     }
   };

    const deleteChangelog = async (id: number) => {
      if (!confirm('Are you sure you want to delete this changelog?')) return;
      try {
        const res = await fetch(`${API_BASE}/admin/changelogs/${id}`, {
          method: 'DELETE',
          headers
        });
        if (!res.ok) throw new Error('Failed to delete changelog');
        await loadChangelogs();
      } catch (err: any) {
        setError(err?.message ?? 'Failed to delete changelog.');
      }
    };

    const sendBulkEmail = async (subject: string, text: string, html: string, userIds: string[]) => {
      const res = await fetch(`${API_BASE}/admin/bulk-email`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ subject, text, html, userIds })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to send email');
      return data; // { sent, failed }
    };

    const selectBlogPost = (post: AdminBlogPost) => {
    setBlogForm({ 
      id: post.id, 
      title: post.title, 
      slug: post.slug, 
      content: post.content, 
      metaTitle: post.meta_title || '', 
      metaDescription: post.meta_description || '', 
      metaImage: post.meta_image || '', 
      published: Boolean(post.published) 
    });
  };



  // Render
   return (
     <div className="flex-1 overflow-y-auto bg-ink-50/50 dark:bg-ink-950/20 px-3 sm:px-6 py-4 sm:py-8">
       <div className="mx-auto max-w-6xl">
           <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 mb-6 sm:mb-8">
             <div className="flex items-center gap-3">
               <div className="h-10 w-10 sm:h-12 sm:w-12 flex items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-ink-900 shadow-glow">
                 <Shield size={20} strokeWidth={2} />
               </div>
               <div>
                 <h1 className="text-xl sm:text-2xl font-display font-bold text-ink-900 dark:text-ink-50">Admin Console</h1>
                 <p className="text-xs sm:text-sm text-ink-500 dark:text-ink-400 uppercase tracking-widest font-medium">System Operations</p>
               </div>
             </div>
           <div className="flex bg-white dark:bg-ink-900 rounded-xl border border-ink-100 dark:border-ink-800 p-1 shadow-sm overflow-x-auto snap-x snap-mandatory">
             {SECTIONS.map((s) => (
               <button
                 key={s.id}
                 className={`flex items-center justify-center min-w-[80px] snap-start gap-1 rounded-lg px-3 py-2.5 text-xs font-bold transition whitespace-nowrap ${
                   section === s.id 
                     ? 'bg-saffron-400 text-ink-900' 
                     : 'text-ink-500 hover:text-ink-700 dark:hover:text-ink-300'
                 }`}
                 onClick={() => setSection(s.id)}
               >
                 <s.icon size={16} />
                 <span className="hidden sm:inline">{s.label}</span>
               </button>
             ))}
           </div>
        </div>
        
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(undefined)} className="text-red-500 hover:text-red-700">Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-saffron-400"></div>
          </div>
        ) : (
          <>
            {section === 'overview' && (
              <OverviewPanel stats={stats} usage={usage} logs={logs} />
            )}

            {section === 'users' && (
              <UsersPanel
                users={users}
                onUpdateUser={async (id, patch) => {
                  if (patch.__grace) {
                    // Grace period route
                    const { __grace, ...graceBody } = patch;
                    await fetch(`${API_BASE}/admin/users/${id}/grace`, { method:'POST', headers, body: JSON.stringify(graceBody) });
                  } else {
                    await fetch(`${API_BASE}/admin/users/${id}`, { method:'PATCH', headers, body: JSON.stringify(patch) });
                  }
                  // Refresh user list
                  const res = await fetch(`${API_BASE}/admin/users`, { headers });
                  const data = await res.json();
                  setUsers(data.users || []);
                }}
              />
            )}

            {section === 'bans' && (
              <BansPanel
                token={token!}
                error={error}
                onError={setError}
              />
            )}

            {section === 'blogs' && (
              <BlogsPanel
                blogs={blogs}
                blogForm={blogForm as any}
                onBlogFormChange={(patch) => setBlogForm((prev) => ({ ...prev, ...patch }))}
                onSelectBlog={selectBlogPost}
                onSaveBlog={saveBlogPost}
              />
            )}

            {section === 'plans' && (
              <PlansPanel
                planSettings={planSettings}
                onTogglePlan={(id, en) => setPlanSettings((prev)=> prev.map((pp)=> pp.id===id ? { id: pp.id, enabled: en } : pp))}
                onSave={savePlanSettings}
                loading={planSettingsLoading}
                status={planSettingsStatus}
              />
            )}

            {section === 'mcp' && (
              <McpPanel
                apiToolServers={apiToolServers}
                onSetMcpServers={setMcpServers}
                onSave={async () => {
                  try {
                    const res = await fetch(`${API_BASE}/admin/mcp-servers`, {
                      method: 'PUT',
                      headers,
                      body: JSON.stringify({ servers: apiToolServers })
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data?.error || 'Failed to save MCP servers');
                    // Success! maybe show a toast if we had a toast system, 
                    // but for now just clear error and maybe we could add a success state
                    setError(undefined);
                  } catch (err: any) {
                    setError(err?.message || 'Failed to save MCP settings.');
                  }
                }}
              />
            )}

            {section === 'music' && (
              <MusicOrphanImport />
            )}

            {section === 'model_limits' && (
              <ModelLimitsPanel />
            )}

            {section === 'models' && (
              <>
            <ModelsPanel

                apiProviders={apiProviders}
                onSetApiProviders={setApiProviders}
                modelConfigs={modelConfigs}
                onSetModelConfigs={setModelConfigs}
                featureModels={featureModels}
                onSetFeatureModels={setFeatureModels}
                siteSettings={siteSettings}
                onSetSiteSettings={setSiteSettings}
                onSave={async () => {
                  setSiteSettingsStatus(undefined);
                  try {
                    await fetchJson(`${API_BASE}/admin/api-providers`, {
                      method: 'PUT',
                      body: JSON.stringify({ providers: apiProviders })
                    });
                    await Promise.all([
                      fetchJson(`${API_BASE}/admin/model-configs`, {
                        method: 'PUT',
                        body: JSON.stringify({ configs: modelConfigs })
                      }),
                      fetchJson(`${API_BASE}/admin/feature-models`, {
                        method: 'PUT',
                        body: JSON.stringify({ settings: featureModels })
                      }),
                      fetch(`${API_BASE}/admin/site-settings`, {
                        method: 'PUT',
                        headers,
                        body: JSON.stringify(siteSettings)
                      }).then(res => {
                        if (!res.ok) throw new Error('Failed to save site settings');
                        return res.json();
                      })
                    ]);
                    setSiteSettingsStatus('Model settings saved successfully.');
                    setTimeout(() => setSiteSettingsStatus(undefined), 3000);
                  } catch (err: any) {
                    const msg = err?.message || 'Failed to save model settings.';
                    setSiteSettingsStatus(msg);
                    setError(msg);
                    throw new Error(msg);
                  }
                }}
               />
               {siteSettingsStatus && (
                 <div className={`mt-4 p-3 rounded-xl text-xs font-bold uppercase tracking-wider ${
                   siteSettingsStatus.includes('successfully') 
                     ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' 
                     : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400'
                 }`}>
                   {siteSettingsStatus}
                 </div>
               )}
             </>
              )}

              {section === 'campaigns' && (
                <CampaignsPanel
                  token={token!}
                  onShowToast={(message, type = 'success') => {
                    if (type === 'success') {
                      setStats((prev: any) => ({ ...prev, lastSuccess: message }));
                    } else {
                      setError(message);
                    }
                  }}
                />
              )}

              {section === 'email' && (
                <EmailPanel
                  users={users}
                  onSendEmail={sendBulkEmail}
                />
              )}

              {section === 'announcements' && (
               <div className="space-y-6">
                 <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-xl font-display font-bold text-ink-900 dark:text-ink-50">
                       Global Announcement
                     </h2>
                     <p className="text-sm text-ink-500 dark:text-ink-400">
                       This message will be shown to all users in a centered dialog.
                     </p>
                   </div>
                 </div>

                 <div className="rounded-xl border border-ink-200 bg-white p-4 sm:p-6 dark:border-ink-700 dark:bg-ink-900">
                   <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                     Announcement Message
                   </label>
                   <textarea
                     value={announcement}
                     onChange={(e) => setAnnouncement(e.target.value)}
                     placeholder="Write an important announcement for all users..."
                     rows={6}
                     className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-800 placeholder-ink-400 focus:border-saffron-400 focus:outline-none focus:ring-2 focus:ring-saffron-400/50 resize-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                   />
                   {announcementStatus && (
                     <p className={`mt-2 text-xs ${announcementStatus.includes('success') ? 'text-emerald-600' : 'text-red-600'}`}>
                       {announcementStatus}
                     </p>
                   )}
                   <div className="mt-4 flex justify-end">
                     <button
                       onClick={saveAnnouncement}
                       disabled={announcementLoading}
                       className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-saffron-500 hover:bg-saffron-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                     >
                       {announcementLoading ? 'Saving...' : 'Save Announcement'}
                     </button>
                   </div>
                 </div>
               </div>
             )}

             {section === 'settings' && (
               <div className="space-y-6">
                 <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-xl font-display font-bold text-ink-900 dark:text-ink-50">
                       Global Site Settings
                     </h2>
                     <p className="text-sm text-ink-500 dark:text-ink-400">
                       Manage public access features and overarching site preferences.
                     </p>
                   </div>
                 </div>

                 <div className="rounded-xl border border-ink-200 bg-white p-4 sm:p-6 dark:border-ink-700 dark:bg-ink-900 space-y-4">
                   <label className="flex items-center justify-between p-4 rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950 cursor-pointer">
                     <div>
                       <p className="font-semibold text-ink-900 dark:text-ink-50">Zyg's Marketplace Access</p>
                       <p className="text-xs text-ink-500 dark:text-ink-400">If disabled, only Admins will be able to see and access Zyg's Marketplace.</p>
                     </div>
                     <div className="relative flex-shrink-0">
                       <input
                         type="checkbox"
                         className="hidden peer"
                         checked={siteSettings.zygsMarketplacePublic !== false}
                         onChange={(e) => setSiteSettings({ ...siteSettings, zygsMarketplacePublic: e.target.checked })}
                       />
                       <div className="w-10 h-6 bg-ink-300 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                       <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                     </div>
                   </label>

                    <label className="flex items-center justify-between p-4 rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950 cursor-pointer">
                      <div>
                        <p className="font-semibold text-ink-900 dark:text-ink-50">Prompts Marketplace Access</p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">If disabled, only Admins will be able to see and access the Prompts Marketplace.</p>
                      </div>
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          className="hidden peer"
                          checked={siteSettings.promptsMarketplacePublic !== false}
                          onChange={(e) => setSiteSettings({ ...siteSettings, promptsMarketplacePublic: e.target.checked })}
                        />
                        <div className="w-10 h-6 bg-ink-300 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                      </div>
                    </label>

                    <label className="flex flex-col p-4 rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950 cursor-pointer">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-semibold text-ink-900 dark:text-ink-50">Vibe Coder Access</p>
                          <p className="text-xs text-ink-500 dark:text-ink-400">If disabled, only Admins will be able to see and access Vibe Coder in the sidebar.</p>
                        </div>
                        <div className="relative flex-shrink-0">
                          <input
                            type="checkbox"
                            className="hidden peer"
                            checked={siteSettings.vibeCoderPublic === true}
                            onChange={(e) => setSiteSettings({ ...siteSettings, vibeCoderPublic: e.target.checked })}
                          />
                          <div className="w-10 h-6 bg-ink-300 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                          <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border border-ink-200 bg-white dark:border-ink-700 dark:bg-ink-950">
                        <span className="text-xs font-semibold text-ink-500 dark:text-ink-400">Max Daily Usage:</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="number" 
                            step="1"
                            min="0"
                            value={siteSettings.vibeCoderLimit || 0}
                            onChange={(e) => setSiteSettings({ ...siteSettings, vibeCoderLimit: parseInt(e.target.value) || 0 })}
                            className="w-20 rounded-lg border border-ink-200 bg-ink-50 px-2 py-1 text-xs font-bold text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                          />
                          <span className="text-[10px] text-ink-400 uppercase font-bold">Requests</span>
                        </div>
                      </div>
                    </label>

                    <div className="p-4 rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-ink-900 dark:text-ink-50">API Pricing (Rate per 1M Tokens)</p>
                          <p className="text-xs text-ink-500 dark:text-ink-400">The amount in USD charged per 1 million tokens (input + output).</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-ink-500">$</span>
                          <input 
                            type="number" 
                            step="0.0001"
                            min="0"
                            value={siteSettings.apiRatePer1M || 0.0500}
                            onChange={(e) => setSiteSettings({ ...siteSettings, apiRatePer1M: parseFloat(e.target.value) })}
                            className="w-24 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-bold text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-ink-200 dark:border-ink-800">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-ink-900 dark:text-ink-50">Input Token Rate (per 1M)</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-500">$</span>
                            <input 
                              type="number" 
                              step="0.0001"
                              value={siteSettings.apiInputRatePer1M || 0.0100}
                              onChange={(e) => setSiteSettings({ ...siteSettings, apiInputRatePer1M: parseFloat(e.target.value) })}
                              className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-bold text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-ink-900 dark:text-ink-50">Output Token Rate (per 1M)</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-500">$</span>
                            <input 
                              type="number" 
                              step="0.0001"
                              value={siteSettings.apiOutputRatePer1M || 0.0700}
                              onChange={(e) => setSiteSettings({ ...siteSettings, apiOutputRatePer1M: parseFloat(e.target.value) })}
                              className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-bold text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-ink-900 dark:text-ink-50">Compacting Rate (fixed)</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-500">$</span>
                            <input 
                              type="number" 
                              step="0.0001"
                              value={siteSettings.apiCompactRate || 0.0200}
                              onChange={(e) => setSiteSettings({ ...siteSettings, apiCompactRate: parseFloat(e.target.value) })}
                              className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-bold text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-ink-900 dark:text-ink-50">Tool Usage Rate (fixed)</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-ink-500">$</span>
                            <input 
                              type="number" 
                              step="0.0001"
                              value={siteSettings.apiToolRate || 0.0200}
                              onChange={(e) => setSiteSettings({ ...siteSettings, apiToolRate: parseFloat(e.target.value) })}
                              className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs font-bold text-ink-900 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                            />
                          </div>
                        </div>
                      </div>
                      </div>
                   <div className="mt-4 flex justify-end">
                     <button
                       onClick={saveSiteSettings}
                       disabled={siteSettingsLoading}
                       className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-saffron-500 hover:bg-saffron-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                     >
                       {siteSettingsLoading ? 'Saving...' : 'Save Settings'}
                     </button>
                   </div>
                 </div>
               </div>
             )}

             {section === 'changelogs' && (
               <div className="space-y-6">
                 <div className="flex items-center justify-between">
                   <div>
                     <h2 className="text-xl font-display font-bold text-ink-900 dark:text-ink-50">
                       Changelogs
                     </h2>
                     <p className="text-sm text-ink-500 dark:text-ink-400">
                       Manage product updates and release notes shown to users.
                     </p>
                   </div>
                   <button
                     onClick={() => {
                       setChangelogForm({ id: null, version: '', content: '', published: true });
                       setIsCreatingChangelog(true);
                     }}
                     className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-sm"
                   >
                     <Plus size={16} /> New Changelog
                   </button>
                 </div>

                 {isCreatingChangelog && (
                   <div className="rounded-xl border border-ink-200 bg-white p-4 sm:p-6 dark:border-ink-700 dark:bg-ink-900 space-y-4 shadow-sm">
                     <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                       {changelogForm.id ? 'Edit Changelog' : 'New Changelog'}
                     </h3>
                     
                     <div className="grid gap-4 sm:grid-cols-2">
                       <div>
                         <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">Version *</label>
                         <input 
                           value={changelogForm.version}
                           onChange={e => setChangelogForm(prev => ({ ...prev, version: e.target.value }))}
                           placeholder="e.g. v3.5.0"
                           className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                         />
                       </div>
                       <div className="flex items-center">
                         <label className="flex items-center gap-2 cursor-pointer mt-4">
                           <input
                             type="checkbox"
                             checked={changelogForm.published}
                             onChange={e => setChangelogForm(prev => ({ ...prev, published: e.target.checked }))}
                             className="rounded text-saffron-500 focus:ring-saffron-500"
                           />
                           <span className="text-sm font-medium text-ink-700 dark:text-ink-200">Published to users</span>
                         </label>
                       </div>
                     </div>

                     <div>
                       <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">Content (Markdown) *</label>
                       <textarea 
                         value={changelogForm.content}
                         onChange={e => setChangelogForm(prev => ({ ...prev, content: e.target.value }))}
                         placeholder="- Added awesome new feature..."
                         rows={6}
                         className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm font-mono text-ink-800 outline-none focus:border-saffron-400 resize-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-100"
                       />
                     </div>

                     <div className="flex justify-end gap-2 pt-2">
                       <button
                         onClick={() => setIsCreatingChangelog(false)}
                         className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-ink-600 bg-ink-100 hover:bg-ink-200 rounded-xl transition-colors dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
                       >
                         <X size={16} /> Cancel
                       </button>
                       <button
                         onClick={saveChangelog}
                         disabled={changelogLoading}
                         className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-saffron-500 hover:bg-saffron-600 disabled:opacity-50 rounded-xl transition-colors"
                       >
                         <Save size={16} /> {changelogLoading ? 'Saving...' : 'Save Changelog'}
                       </button>
                     </div>
                   </div>
                 )}

                 <div className="grid gap-4">
                   {changelogs.length === 0 && !changelogLoading && !isCreatingChangelog && (
                      <div className="rounded-xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-ink-900">
                        No changelogs created yet.
                      </div>
                   )}
                   {changelogs.map(log => (
                     <div key={log.id} className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-ink-800 dark:bg-ink-900">
                       <div className="flex items-start justify-between">
                         <div>
                           <div className="flex items-center gap-3 mb-2">
                             <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">{log.version}</h3>
                             {log.published ? (
                               <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                 Published
                               </span>
                             ) : (
                               <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-ink-600 dark:bg-ink-800 dark:text-ink-400">
                                 Draft
                               </span>
                             )}
                             <span className="text-xs text-ink-400">{new Date(log.created_at).toLocaleDateString()}</span>
                           </div>
                           <p className="text-sm text-ink-600 dark:text-ink-300 line-clamp-2">{log.content}</p>
                         </div>
                         <div className="flex items-center gap-2 ml-4">
                           <button
                             onClick={() => {
                               setChangelogForm({ id: log.id, version: log.version, content: log.content, published: Boolean(log.published) });
                               setIsCreatingChangelog(true);
                             }}
                             className="p-2 text-ink-400 hover:text-saffron-500 hover:bg-saffron-50 rounded-lg transition-colors dark:hover:bg-saffron-900/20"
                             title="Edit"
                           >
                             <Edit2 size={16} />
                           </button>
                           <button
                             onClick={() => deleteChangelog(log.id)}
                             className="p-2 text-ink-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors dark:hover:bg-red-900/20"
                             title="Delete"
                           >
                             <Trash2 size={16} />
                           </button>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
               </div>
             )}

           </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
