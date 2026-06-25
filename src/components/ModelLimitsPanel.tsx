import React, { useEffect, useState } from 'react';
import { Plus, Save, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

interface ModelLimit {
  model_id: string;
  free_limit: number | null;
  go_limit: number | null;
  plus_limit: number | null;
  beta_limit: number | null;
  vibe_coder_limit: number | null;
  enabled: boolean;
}

const PLANS = [
  { key: 'free_limit', label: 'Free', color: 'text-ink-500' },
  { key: 'go_limit', label: 'Go', color: 'text-violet-600 dark:text-violet-400' },
  { key: 'plus_limit', label: 'Plus', color: 'text-fuchsia-600 dark:text-fuchsia-400' },
  { key: 'beta_limit', label: 'Beta', color: 'text-emerald-600 dark:text-emerald-400' },
];

const LimitInput: React.FC<{
  value: number | null;
  onChange: (v: number | null) => void;
}> = ({ value, onChange }) => (
  <div className="flex items-center gap-1">
    <input
      type="number"
      min={0}
      placeholder="∞"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : parseInt(e.target.value))}
      className="w-16 rounded-lg border border-ink-200 bg-ink-50 px-2 py-1 text-center text-xs dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
    />
  </div>
);

const ModelLimitsPanel: React.FC = () => {
  const { token } = useAuth();
  const [limits, setLimits] = useState<ModelLimit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [newModelId, setNewModelId] = useState('');
  const [edits, setEdits] = useState<Record<string, Partial<ModelLimit>>>({});

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const fetchLimits = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/model-limits`, { headers });
      const data = await res.json();
      setLimits(data.limits || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLimits(); }, []);

  const getEdit = (modelId: string): ModelLimit => {
    const base = limits.find(l => l.model_id === modelId) || {
      model_id: modelId, free_limit: 0, go_limit: null, plus_limit: null, beta_limit: null, vibe_coder_limit: null, enabled: true
    };
    return { ...base, ...edits[modelId] };
  };

  const setEdit = (modelId: string, field: string, value: any) => {
    setEdits(e => ({ ...e, [modelId]: { ...e[modelId], [field]: value } }));
  };

  const save = async (modelId: string) => {
    setSaving(s => ({ ...s, [modelId]: true }));
    const data = getEdit(modelId);
    await fetch(`${API_BASE}/admin/model-limits/${encodeURIComponent(modelId)}`, {
      method: 'PUT', headers,
      body: JSON.stringify(data),
    });
    setSaving(s => ({ ...s, [modelId]: false }));
    setEdits(e => { const n = { ...e }; delete n[modelId]; return n; });
    fetchLimits();
  };

  const remove = async (modelId: string) => {
    if (!confirm(`Remove limits for ${modelId}?`)) return;
    await fetch(`${API_BASE}/admin/model-limits/${encodeURIComponent(modelId)}`, {
      method: 'DELETE', headers,
    });
    fetchLimits();
  };

  const addNew = () => {
    const id = newModelId.trim();
    if (!id) return;
    if (limits.find(l => l.model_id === id)) return;
    setLimits(l => [...l, { model_id: id, free_limit: 0, go_limit: null, plus_limit: null, beta_limit: null, vibe_coder_limit: null, enabled: true }]);
    setEdits(e => ({ ...e, [id]: { model_id: id, free_limit: 0, go_limit: null, plus_limit: null, beta_limit: null, vibe_coder_limit: null, enabled: true } }));
    setNewModelId('');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">Model Limits</h2>
          <p className="text-xs text-ink-400">Daily message limits per model per plan. Empty = unlimited.</p>
        </div>
        <button onClick={fetchLimits} className="flex items-center gap-2 rounded-xl border border-ink-200 px-3 py-2 text-sm hover:bg-ink-50 dark:border-ink-700 dark:hover:bg-ink-800">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Add new */}
      <div className="mb-4 flex gap-2">
        <input
          type="text"
          placeholder="model-id e.g. openai/gpt-4o"
          value={newModelId}
          onChange={e => setNewModelId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addNew()}
          className="flex-1 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2 text-sm dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100"
        />
        <button
          onClick={addNew}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus size={14} /> Add Model
        </button>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-ink-100 dark:border-ink-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 dark:border-ink-800 dark:bg-ink-900">
              <th className="px-4 py-3 text-left font-semibold text-ink-600 dark:text-ink-300">Model</th>
              {PLANS.map(p => (
                <th key={p.key} className={clsx('px-3 py-3 text-center font-semibold', p.color)}>{p.label}</th>
              ))}
              <th className="px-3 py-3 text-center font-semibold text-saffron-600 dark:text-saffron-400">Vibe Coder<small className="text-sm text-ink-500">Per-model daily Vibe Coder</small></th>
              <th className="px-3 py-3 text-center font-semibold text-ink-600 dark:text-ink-300">On</th>
              <th className="px-3 py-3 text-center font-semibold text-ink-600 dark:text-ink-300">Actions</th>
            </tr>
          </thead>
          <tbody>
            {limits.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-ink-400">
                  No model limits configured. Add a model above.
                </td>
              </tr>
            )}
            {limits.map((limit, i) => {
              const edit = getEdit(limit.model_id);
              const isDirty = !!edits[limit.model_id];
              return (
                <tr key={limit.model_id} className={clsx(
                  'border-b border-ink-50 dark:border-ink-800/50 transition',
                  isDirty ? 'bg-amber-50/50 dark:bg-amber-950/10' : 'hover:bg-ink-50/50 dark:hover:bg-ink-900/30',
                  i % 2 === 0 ? '' : 'bg-ink-50/20 dark:bg-ink-900/10'
                )}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-ink-700 dark:text-ink-200">{limit.model_id}</span>
                  </td>
                  {PLANS.map(p => (
                    <td key={p.key} className="px-3 py-3 text-center">
                      <LimitInput
                        value={edit[p.key as keyof ModelLimit] as number | null}
                        onChange={v => setEdit(limit.model_id, p.key, v)}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    <LimitInput
                      value={edit.vibe_coder_limit}
                      onChange={v => setEdit(limit.model_id, 'vibe_coder_limit', v)}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={edit.enabled !== false}
                      onChange={e => setEdit(limit.model_id, 'enabled', e.target.checked)}
                      className="h-4 w-4 accent-violet-500"
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => save(limit.model_id)}
                        disabled={!isDirty || saving[limit.model_id]}
                        className={clsx(
                          'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition',
                          isDirty
                            ? 'bg-violet-500 text-white hover:opacity-90'
                            : 'bg-ink-100 text-ink-400 cursor-not-allowed dark:bg-ink-800'
                        )}
                      >
                        {saving[limit.model_id] ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                        Save
                      </button>
                      <button
                        onClick={() => remove(limit.model_id)}
                        className="flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/20"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
        <span>Empty cells = unlimited for that plan. 0 = completely blocked. Limits reset at midnight UTC.</span>
      </div>
    </div>
  );
};

export default ModelLimitsPanel;
