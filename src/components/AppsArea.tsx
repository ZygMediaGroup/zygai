import React, { useState, useEffect, useCallback } from 'react';
import { Blocks, Plus, X, Trash2, Pencil, Globe, Share2, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import clsx from 'clsx';

const AppsArea: React.FC = () => {
  const [apps, setApps] = useState<any[]>([]);
  const [communityApps, setCommunityApps] = useState<any[]>([]);
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'my-apps' | 'community'>('my-apps');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [importConfig, setImportConfig] = useState('');
  const [importDescription, setImportDescription] = useState('');
  const [importIsPublic, setImportIsPublic] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  
  const [editingApp, setEditingApp] = useState<any>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [editMcpJsonUrl, setEditMcpJsonUrl] = useState('');
  const [editAuthHeader, setEditAuthHeader] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editHeadersJson, setEditHeadersJson] = useState('{}');
  const [editIsPublic, setEditIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/mcp-servers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setApps(data.servers || []);
      }
    } catch (err) {
      console.error('Failed to load apps:', err);
    }
  }, [token]);

  const loadCommunityApps = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/community/mcp-servers`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCommunityApps(data.servers || []);
      }
    } catch (err) {
      console.error('Failed to load community apps:', err);
    }
  }, [token]);

  useEffect(() => {
    loadApps();
    loadCommunityApps();
  }, [loadApps, loadCommunityApps]);

  const handleImport = async (baseUrlOverride?: string, nameOverride?: string) => {
    const baseUrl = baseUrlOverride || importConfig;
    if (!baseUrl.trim()) return;
    setIsImporting(true);
    setImportError(null);
    
    try {
      const response = await fetch(`${API_BASE}/mcp-servers/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          command: baseUrl,
          name: nameOverride || undefined,
          description: importDescription,
          isPublic: importIsPublic
        })
      });
      
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to import connection.');
      
      setIsAddModalOpen(false);
      setImportConfig('');
      setImportDescription('');
      setImportIsPublic(false);
      loadApps();
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const toggleApp = async (id: string) => {
    const appToToggle = apps.find(a => a.id === id);
    if (!appToToggle) return;
    const newEnabled = appToToggle.enabled !== false ? false : true;
    
    setApps(apps.map(app => app.id === id ? { ...app, enabled: newEnabled } : app));
    
    try {
      await fetch(`${API_BASE}/mcp-servers/${id}/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ enabled: newEnabled })
      });
    } catch (err) {
      console.error('Failed to toggle app:', err);
      setApps(apps.map(app => app.id === id ? { ...app, enabled: !newEnabled } : app));
    }
  };

  const handleEditSave = async () => {
    if (!editingApp || !editName.trim() || !editBaseUrl.trim()) return;
    setIsSaving(true);
    setEditError(null);
    try {
      let parsedHeaders = {};
      if (editHeadersJson.trim()) {
        parsedHeaders = JSON.parse(editHeadersJson);
      }

      const res = await fetch(`${API_BASE}/mcp-servers/${editingApp.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editName,
          description: editDescription,
          baseUrl: editBaseUrl,
          mcpJsonUrl: editMcpJsonUrl,
          authHeader: editAuthHeader,
          apiKey: editApiKey,
          headers: parsedHeaders,
          isPublic: editIsPublic
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save changes.');
      }

      setEditingApp(null);
      loadApps();
      loadCommunityApps();
    } catch (err: any) {
      setEditError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this tool connection?')) return;
    try {
      await fetch(`${API_BASE}/mcp-servers/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      loadApps();
      loadCommunityApps();
    } catch (err) {
      console.error('Failed to delete tool server:', err);
    }
  };

  const canEdit = (app: any) => {
    return app.userId === user?.id || user?.role === 'admin';
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 text-white shadow-sm">
              <Blocks size={24} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-ink-50">API Ecosystem</h1>
              <p className="text-sm text-ink-500">Connect private MCP tools or browse the community directory.</p>
            </div>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-ink-700 dark:bg-saffron-400 dark:text-ink-900 dark:hover:bg-saffron-500 shadow-sm"
          >
            <Plus size={18} />
            Add Connection
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="mb-8 flex gap-2 border-b border-ink-100 pb-px dark:border-ink-800">
          <button
            onClick={() => setActiveTab('my-apps')}
            className={clsx(
              "relative px-4 py-3 text-sm font-bold transition",
              activeTab === 'my-apps' ? "text-saffron-500" : "text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
            )}
          >
            My Connections
            {activeTab === 'my-apps' && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-saffron-500" />}
          </button>
          <button
            onClick={() => setActiveTab('community')}
            className={clsx(
              "relative px-4 py-3 text-sm font-bold transition",
              activeTab === 'community' ? "text-saffron-500" : "text-ink-400 hover:text-ink-600 dark:hover:text-ink-200"
            )}
          >
            Community Store
            {activeTab === 'community' && <div className="absolute bottom-0 left-0 h-0.5 w-full bg-saffron-500" />}
          </button>
        </div>

        {activeTab === 'my-apps' ? (
          <div className="grid gap-4">
            {apps.map(app => {
              const Icon = app.userId ? Shield : Blocks;
              return (
                <div key={app.id} className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-ink-800 dark:bg-ink-900">
                  <div className="flex items-center gap-4">
                    <div className={clsx(
                      "flex h-10 w-10 items-center justify-center rounded-xl",
                      app.userId ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                    )}>
                      <Icon size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{app.name || app.id || 'Unknown Server'}</h3>
                        {app.isPublic && (
                          <span className="rounded-full bg-saffron-100 px-2 py-0.5 text-[10px] font-bold text-saffron-600 dark:bg-saffron-900/30 dark:text-saffron-400 uppercase">Public</span>
                        )}
                        {!app.userId && (
                          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold text-ink-600 dark:bg-ink-800 dark:text-ink-400 uppercase">System</span>
                        )}
                      </div>
                      <p className="text-sm text-ink-500 dark:text-ink-400 truncate max-w-[200px] sm:max-w-sm">{app.description || app.baseUrl || 'External API'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {canEdit(app) && (
                      <>
                        <button onClick={() => {
                          setEditingApp(app);
                          setEditName(app.name || app.id);
                          setEditDescription(app.description || '');
                          setEditBaseUrl(app.baseUrl || '');
                          setEditMcpJsonUrl(app.mcpJsonUrl || '');
                          setEditAuthHeader(app.authHeader || '');
                          setEditApiKey(app.apiKey || '');
                          setEditHeadersJson(JSON.stringify(app.headers || {}, null, 2));
                          setEditIsPublic(!!app.isPublic);
                          setEditError(null);
                        }} className="text-ink-400 hover:text-saffron-500 transition-colors">
                          <Pencil size={18} />
                        </button>
                        <button onClick={() => handleDelete(app.id)} className="text-ink-400 hover:text-red-500 transition-colors">
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                    <label className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none cursor-pointer">
                      <input type="checkbox" className="sr-only" checked={app.enabled !== false} onChange={() => toggleApp(app.id)} />
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${app.enabled !== false ? 'translate-x-6' : 'translate-x-1'} ${app.enabled !== false ? 'bg-saffron-400' : 'bg-ink-300'}`} />
                      <div className={`absolute inset-0 rounded-full transition-colors ${app.enabled !== false ? 'bg-saffron-100 dark:bg-saffron-900/40' : 'bg-ink-100 dark:bg-ink-800'}`} />
                    </label>
                  </div>
                </div>
              );
            })}
            {apps.length === 0 && (
              <div className="rounded-2xl border border-ink-200 bg-white p-12 text-center shadow-sm dark:border-ink-800 dark:bg-ink-900">
                <Blocks size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-ink-500 mb-4">You haven't connected any tools yet.</p>
                <button 
                  onClick={() => setActiveTab('community')}
                  className="text-sm font-bold text-saffron-500 hover:underline"
                >
                  Browse Community Store
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {communityApps.map(app => (
              <div key={app.id} className="flex flex-col rounded-2xl border border-ink-200 bg-white p-6 shadow-sm transition hover:shadow-md dark:border-ink-800 dark:bg-ink-900">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-saffron-50 text-saffron-500 dark:bg-saffron-900/20">
                    <Globe size={24} />
                  </div>
                  {apps.some(installed => installed.baseUrl === app.baseUrl) && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      Connected
                    </span>
                  )}
                </div>
                <h3 className="mb-1 text-lg font-bold text-ink-900 dark:text-ink-50">{app.name}</h3>
                <p className="mb-6 flex-1 text-sm text-ink-500 dark:text-ink-400 line-clamp-3">{app.description || 'Public MCP server available for the community.'}</p>
                
                <button
                  onClick={() => handleImport(app.baseUrl, app.name)}
                  disabled={isImporting || apps.some(installed => installed.baseUrl === app.baseUrl)}
                  className={clsx(
                    "w-full rounded-xl py-2.5 text-sm font-bold transition flex items-center justify-center gap-2",
                    apps.some(installed => installed.baseUrl === app.baseUrl)
                      ? "bg-ink-50 text-ink-400 dark:bg-ink-800 dark:text-ink-600"
                      : "bg-saffron-500 text-ink-900 hover:bg-saffron-600"
                  )}
                >
                  {isImporting ? 'Connecting...' : apps.some(installed => installed.baseUrl === app.baseUrl) ? 'Connected' : 'Connect Tool'}
                </button>
              </div>
            ))}
            {communityApps.length === 0 && (
              <div className="col-span-full rounded-2xl border border-ink-200 bg-white p-12 text-center shadow-sm dark:border-ink-800 dark:bg-ink-900">
                <Globe size={48} className="mx-auto mb-4 opacity-20" />
                <p className="text-ink-500">The community directory is currently empty.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Connection Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl dark:border-ink-700 dark:bg-ink-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">Add API Connection</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Endpoint URL</label>
                <input
                  type="text"
                  value={importConfig}
                  onChange={(e) => setImportConfig(e.target.value)}
                  placeholder="https://api.example.com/mcp"
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Description</label>
                <textarea
                  value={importDescription}
                  onChange={(e) => setImportDescription(e.target.value)}
                  placeholder="What does this tool do?"
                  rows={2}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
              </div>
              <div className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  id="importPublic"
                  checked={importIsPublic}
                  onChange={(e) => setImportIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-saffron-500 focus:ring-saffron-400"
                />
                <label htmlFor="importPublic" className="flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-300 cursor-pointer">
                  <Share2 size={14} className="text-saffron-500" />
                  Make public in Community Store
                </label>
              </div>
              {importError && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{importError}</p>}
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setIsAddModalOpen(false)} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800">
                  Cancel
                </button>
                <button
                  onClick={() => handleImport()}
                  disabled={!importConfig.trim() || isImporting}
                  className="rounded-xl bg-saffron-500 px-4 py-2 text-sm font-bold text-ink-900 transition hover:bg-saffron-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Connection Modal */}
      {editingApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-ink-200 bg-white p-6 shadow-2xl dark:border-ink-700 dark:bg-ink-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">Edit API Connection</h2>
              <button onClick={() => setEditingApp(null)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto max-h-[70vh] pr-1">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Endpoint URL (Base)</label>
                <input
                  type="text"
                  value={editBaseUrl}
                  onChange={(e) => setEditBaseUrl(e.target.value)}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Auth Header</label>
                  <input
                    type="text"
                    value={editAuthHeader}
                    onChange={(e) => setEditAuthHeader(e.target.value)}
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">API Key</label>
                  <input
                    type="password"
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Headers JSON</label>
                <textarea
                  value={editHeadersJson}
                  onChange={(e) => setEditHeadersJson(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                />
              </div>

              <div className="flex items-center gap-3 py-2">
                <input
                  type="checkbox"
                  id="editPublic"
                  checked={editIsPublic}
                  onChange={(e) => setEditIsPublic(e.target.checked)}
                  className="h-4 w-4 rounded border-ink-300 text-saffron-500 focus:ring-saffron-400"
                />
                <label htmlFor="editPublic" className="flex items-center gap-2 text-sm font-medium text-ink-700 dark:text-ink-300 cursor-pointer">
                  <Share2 size={14} className="text-saffron-500" />
                  Public in Community Store
                </label>
              </div>

              {editError && <p className="text-xs font-semibold text-red-600 dark:text-red-400">{editError}</p>}
              <div className="flex justify-end gap-3 pt-4">
                <button onClick={() => setEditingApp(null)} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-bold text-ink-600 transition hover:bg-ink-50 dark:border-ink-700 dark:text-ink-300 dark:hover:bg-ink-800">
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  disabled={!editName.trim() || !editBaseUrl.trim() || isSaving}
                  className="rounded-xl bg-saffron-500 px-4 py-2 text-sm font-bold text-ink-900 transition hover:bg-saffron-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppsArea;
