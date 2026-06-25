import React from 'react'
import { UsageDay, AdminLog } from '@/types/admin'

type OverviewPanelProps = {
  stats: any
  usage: UsageDay[]
  logs: AdminLog[]
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({ stats, usage, logs }) => {
  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-bold mb-1">Total Users</p>
          <p className="text-3xl font-display font-bold text-ink-900 dark:text-ink-50">{stats.totalUsers}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-bold mb-1">Paid Users</p>
          <p className="text-3xl font-display font-bold text-ink-900 dark:text-ink-50">{stats.paidUsers}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-bold mb-1">Online Now</p>
          <p className="text-3xl font-display font-bold text-emerald-500">{stats.onlineUsers}</p>
        </div>
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-ink-500 font-bold mb-1">PWA Installs</p>
          <p className="text-3xl font-display font-bold text-saffron-500">{stats.pwaInstalls}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50 mb-6">Usage (last few days)</h3>
          <div className="flex h-32 items-end gap-2">
            {usage.map((u) => (
              <div 
                key={u.day} 
                title={`${u.day}: ${u.count} requests`}
                style={{ height: `${Math.max(8, Math.min(100, (u.count / (Math.max(...usage.map(x => x.count)) || 1)) * 100))}%` }} 
                className="flex-1 rounded-t-lg bg-gradient-to-t from-saffron-400 to-saffron-300 transition-all hover:from-saffron-500 hover:to-saffron-400" 
              />
            ))}
          </div>
          <div className="mt-4 flex justify-between text-[10px] text-ink-400 uppercase tracking-tighter">
            <span>{usage[0]?.day}</span>
            <span>{usage[usage.length-1]?.day}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50 mb-6">Recent Activity</h3>
          <div className="space-y-3">
            {logs.slice(0, 5).map((l) => (
              <div key={l.id} className="flex items-center justify-between text-xs border-b border-ink-50 dark:border-ink-800 pb-2 last:border-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900 dark:text-ink-100 truncate">{l.email || l.user_id}</p>
                  <p className="text-ink-500">{l.provider.toUpperCase()} • {l.model}</p>
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <p className="text-ink-400">{new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
