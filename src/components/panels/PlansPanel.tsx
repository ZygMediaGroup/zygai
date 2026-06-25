import React from 'react'

type PlansPanelProps = {
  planSettings: { id:string; enabled:boolean }[]
  onTogglePlan: (id:string, enabled:boolean)=>void
  onSave: ()=>void
  loading?: boolean
  status?: string
}

export const PlansPanel: React.FC<PlansPanelProps> = ({ planSettings, onTogglePlan, onSave, loading, status }) => (
  <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
    <div className="flex items-center justify-between mb-6">
      <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Plan Configuration</h3>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      {planSettings.map((p) => (
        <label key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-ink-100 dark:border-ink-800 p-4 transition-colors hover:bg-ink-50 dark:hover:bg-ink-800/50 cursor-pointer group">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-ink-900 dark:text-ink-50 uppercase tracking-wide">{p.id} Plan</span>
            <span className="text-xs text-ink-500">{p.enabled ? 'Currently active' : 'Disabled'}</span>
          </div>
          <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-saffron-500 focus:ring-offset-2">
            <input 
              type="checkbox" 
              checked={p.enabled} 
              onChange={(e)=> onTogglePlan(p.id, e.target.checked)} 
              className="sr-only"
            />
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${p.enabled ? 'translate-x-6' : 'translate-x-1'} ${p.enabled ? 'bg-saffron-400' : 'bg-ink-300'}`} />
            <div className={`absolute inset-0 rounded-full transition-colors ${p.enabled ? 'bg-saffron-100 dark:bg-saffron-900/40' : 'bg-ink-100 dark:bg-ink-800'}`} />
          </div>
        </label>
      ))}
    </div>
    <div className="flex items-center gap-4">
      <button 
        onClick={onSave} 
        disabled={loading} 
        className="rounded-xl bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Saving...' : 'Apply Changes'}
      </button>
      {status && (
        <span className="text-xs font-medium text-emerald-600 animate-fade-in">{status}</span>
      )}
    </div>
  </section>
)
