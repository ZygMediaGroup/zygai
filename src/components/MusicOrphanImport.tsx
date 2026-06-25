import React, { useEffect, useState } from 'react';
import { Music2, Download, Trash2, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

interface Orphan {
  filename: string;
  url: string;
  size: number;
  mtime: string;
}

interface User {
  id: string;
  email: string;
  display_name?: string;
}

const MusicOrphanImport: React.FC = () => {
  const { token } = useAuth();
  const [orphans, setOrphans] = useState<Orphan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [selectedUser, setSelectedUser] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, 'importing' | 'done' | 'error' | 'deleting'>>({});

  const headers = { Authorization: `Bearer ${token}` };

  const fetchOrphans = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/music-orphans`, { headers });
      const data = await res.json();
      setOrphans(data.orphans || []);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/users`, { headers });
      const data = await res.json();
      setUsers(data.users || data || []);
    } catch {}
  };

  useEffect(() => { fetchOrphans(); fetchUsers(); }, []);

  const importTrack = async (orphan: Orphan) => {
    const userId = selectedUser[orphan.filename];
    if (!userId) return alert('Select a user first.');
    setStatus(s => ({ ...s, [orphan.filename]: 'importing' }));
    try {
      const res = await fetch(`${API_BASE}/admin/music-orphans/import`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: orphan.filename,
          userId,
          prompt: prompts[orphan.filename] || 'Imported track',
        }),
      });
      if (res.ok) {
        setStatus(s => ({ ...s, [orphan.filename]: 'done' }));
        setTimeout(() => fetchOrphans(), 800);
      } else {
        setStatus(s => ({ ...s, [orphan.filename]: 'error' }));
      }
    } catch {
      setStatus(s => ({ ...s, [orphan.filename]: 'error' }));
    }
  };

  const deleteTrack = async (orphan: Orphan) => {
    if (!confirm(`Delete ${orphan.filename}?`)) return;
    setStatus(s => ({ ...s, [orphan.filename]: 'deleting' }));
    await fetch(`${API_BASE}/admin/music-orphans/${orphan.filename}`, {
      method: 'DELETE', headers,
    });
    fetchOrphans();
  };

  const fmt = (bytes: number) => bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
            <Music2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">Orphaned Music Files</h2>
            <p className="text-xs text-ink-400">Files in public/music/ not linked to any user</p>
          </div>
        </div>
        <button
          onClick={fetchOrphans}
          className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {orphans.length === 0 && !loading && (
        <div className="rounded-2xl border border-ink-100 bg-ink-50 py-16 text-center dark:border-ink-800 dark:bg-ink-900">
          <CheckCircle size={32} className="mx-auto mb-3 text-emerald-400" />
          <p className="font-semibold text-ink-600 dark:text-ink-300">No orphaned files</p>
          <p className="text-sm text-ink-400">All music files are linked to users.</p>
        </div>
      )}

      <div className="space-y-3">
        {orphans.map(orphan => {
          const st = status[orphan.filename];
          return (
            <div
              key={orphan.filename}
              className={clsx(
                'rounded-2xl border p-4 transition',
                st === 'done' ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20' :
                st === 'error' ? 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/20' :
                'border-ink-100 bg-white dark:border-ink-800 dark:bg-ink-900'
              )}
            >
              {/* File info */}
              <div className="flex items-center gap-3 mb-3">
                <Music2 size={16} className="text-violet-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium text-ink-700 dark:text-ink-200 truncate">
                    {orphan.filename}
                  </p>
                  <p className="text-[10px] text-ink-400">
                    {fmt(orphan.size)} · {new Date(orphan.mtime).toLocaleString()}
                  </p>
                </div>
                <audio controls src={`${window.location.origin}${orphan.url}`} className="h-8 w-40 flex-shrink-0" />
              </div>

              {/* Import controls */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Prompt / track name"
                  value={prompts[orphan.filename] || ''}
                  onChange={e => setPrompts(p => ({ ...p, [orphan.filename]: e.target.value }))}
                  className="flex-1 min-w-[160px] rounded-xl border border-ink-200 bg-ink-50 px-3 py-1.5 text-xs dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
                />
                <select
                  value={selectedUser[orphan.filename] || ''}
                  onChange={e => setSelectedUser(u => ({ ...u, [orphan.filename]: e.target.value }))}
                  className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-1.5 text-xs dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
                >
                  <option value="">— Assign to user —</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || u.email}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => importTrack(orphan)}
                  disabled={!selectedUser[orphan.filename] || st === 'importing' || st === 'done'}
                  className={clsx(
                    'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition',
                    st === 'done' ? 'bg-emerald-500' :
                    st === 'error' ? 'bg-red-500' :
                    'bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:opacity-90 disabled:opacity-50'
                  )}
                >
                  {st === 'importing' ? <RefreshCw size={12} className="animate-spin" /> :
                   st === 'done' ? <CheckCircle size={12} /> :
                   st === 'error' ? <AlertCircle size={12} /> :
                   <Download size={12} />}
                  {st === 'importing' ? 'Importing…' : st === 'done' ? 'Imported' : st === 'error' ? 'Failed' : 'Import'}
                </button>

                <button
                  onClick={() => deleteTrack(orphan)}
                  disabled={st === 'deleting'}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800/50 dark:hover:bg-red-950/30"
                >
                  <Trash2 size={12} />
                  {st === 'deleting' ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MusicOrphanImport;
