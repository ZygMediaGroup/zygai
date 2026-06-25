import React from 'react';

type McpPanelProps = {
  apiToolServers: any[];
  onSetMcpServers: React.Dispatch<React.SetStateAction<any[]>>;
  onSave: () => Promise<void>;
};

export const McpPanel: React.FC<McpPanelProps> = ({ apiToolServers, onSetMcpServers, onSave }) => {
  return (
    <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">MCP Integrations</h3>
        </div>
        <button
          className="rounded-xl border border-ink-200 dark:border-ink-700 px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:border-saffron-400 hover:text-saffron-500"
          onClick={() => onSetMcpServers((arr) => [...arr, { id: `m${Date.now()}`, name: '', baseUrl: '', authHeader: '', apiKey: '', mcpJsonUrl: '', enabled: true }])}
        >
          Add Server
        </button>
      </div>
      
      <div className="space-y-4">
        {apiToolServers.map((s, idx) => (
          <div key={idx} className="p-5 border border-ink-100 dark:border-ink-800 rounded-2xl bg-ink-50/30 dark:bg-ink-900/40 group transition-all hover:border-ink-200 dark:hover:border-ink-700">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end mb-4">
              <div className="md:col-span-3 space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Name</label>
                <input
                  className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-saffron-400 transition-colors"
                  value={s.name ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetMcpServers((arr) => arr.map((x, i) => i === idx ? { ...x, name: v } : x));
                  }}
                  placeholder="e.g. Search Tool"
                />
              </div>
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Base URL</label>
                <input
                  className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none font-mono focus:border-saffron-400 transition-colors"
                  value={s.baseUrl ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetMcpServers((arr) => arr.map((x, i) => i === idx ? { ...x, baseUrl: v } : x));
                  }}
                  placeholder="https://api.example.com"
                />
              </div>
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">MCP JSON URL</label>
                <input
                  className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none font-mono focus:border-saffron-400 transition-colors"
                  value={s.mcpJsonUrl ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetMcpServers((arr) => arr.map((x, i) => i === idx ? { ...x, mcpJsonUrl: v } : x));
                  }}
                  placeholder="/mcp.json"
                />
              </div>
              <div className="md:col-span-1 flex justify-end">
                <button
                  className="h-10 w-10 flex items-center justify-center rounded-xl border border-red-100 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white dark:bg-red-900/20 dark:border-red-900/40 transition-all"
                  onClick={() => onSetMcpServers((arr) => arr.filter((_, i) => i !== idx))}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className="md:col-span-4 space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">Auth Header</label>
                <input
                  className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-saffron-400 transition-colors"
                  value={s.authHeader ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetMcpServers((arr) => arr.map((x, i) => i === idx ? { ...x, authHeader: v } : x));
                  }}
                  placeholder="X-API-Key or Authorization"
                />
              </div>
              <div className="md:col-span-5 space-y-1.5">
                <label className="text-[10px] uppercase tracking-widest text-ink-400 font-bold ml-1">API Key</label>
                <input
                  type="password"
                  className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-saffron-400 transition-colors font-mono"
                  value={s.apiKey ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onSetMcpServers((arr) => arr.map((x, i) => i === idx ? { ...x, apiKey: v } : x));
                  }}
                  placeholder="Your API secret"
                />
              </div>
              <div className="md:col-span-3 flex items-center gap-2 pb-2.5 ml-1">
                <input
                  type="checkbox"
                  id={`enabled-${idx}`}
                  className="h-4 w-4 rounded border-ink-300 text-saffron-500 focus:ring-saffron-500"
                  checked={s.enabled !== false}
                  onChange={(e) => {
                    const v = e.target.checked;
                    onSetMcpServers((arr) => arr.map((x, i) => i === idx ? { ...x, enabled: v } : x));
                  }}
                />
                <label htmlFor={`enabled-${idx}`} className="text-xs font-semibold text-ink-600 dark:text-ink-400 uppercase tracking-widest cursor-pointer">
                  Enabled
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {apiToolServers.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed border-ink-100 dark:border-ink-800 rounded-2xl text-ink-400 text-sm">
          No API servers configured yet.
        </div>
      )}
      
      <div className="mt-8 flex justify-end border-t border-ink-50 dark:border-ink-800 pt-6">
        <button
          className="rounded-xl bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-8 py-3 text-white text-xs font-bold uppercase tracking-widest transition hover:opacity-90 shadow-lg shadow-ink-900/10 dark:shadow-none"
          onClick={onSave}
        >
          Apply Changes
        </button>
      </div>
    </section>
  );
};
