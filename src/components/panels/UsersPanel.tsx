import React, { useState } from 'react'
import { AdminUser } from '@/types/admin'

type UsersPanelProps = {
  users: AdminUser[]
  onUpdateUser: (id: string, patch: any) => void
}

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  go: 'ZygAI Go',
  plus: 'ZygAI Plus',
  beta: 'ZygAI Beta',
}

const PLAN_BADGE: Record<string, string> = {
  free: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-400',
  go: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  plus: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  beta: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
}

type GraceModalState = { userId: string; email: string } | null

export const UsersPanel: React.FC<UsersPanelProps> = ({ users, onUpdateUser }) => {
  const [graceModal, setGraceModal] = useState<GraceModalState>(null)
  const [gracePlan, setGracePlan] = useState<string>('go')
  const [graceDuration, setGraceDuration] = useState<string>('30')
  const [graceForever, setGraceForever] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  const openGraceModal = (u: AdminUser) => {
    setGracePlan(u.grace_plan || 'go')
    setGraceDuration('30')
    setGraceForever(!u.grace_plan_expires_at && !!u.grace_plan)
    setGraceModal({ userId: u.id, email: u.email })
  }

  const applyGrace = () => {
    if (!graceModal) return
    onUpdateUser(graceModal.userId, {
      __grace: true,
      plan: gracePlan,
      days: graceForever ? null : Number(graceDuration),
    })
    setGraceModal(null)
  }

  const revokeGrace = (userId: string) => {
    onUpdateUser(userId, { __grace: true, plan: 'free', days: 0 })
  }

  const formatExpiry = (iso: string | null | undefined) => {
    if (!iso) return 'Forever'
    const d = new Date(iso)
    const diff = Math.ceil((d.getTime() - Date.now()) / 86400000)
    if (diff < 0) return 'Expired'
    if (diff === 0) return 'Today'
    return `${diff}d left`
  }

  return (
    <>
      <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">User Management</h3>
          <span className="text-xs text-ink-500 font-medium">{users.length} users total</span>
        </div>

        <input
          className="w-full mb-4 px-3 py-2 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 text-ink-900 dark:text-ink-100 placeholder-ink-400 outline-none focus:border-saffron-400 transition-colors"
          placeholder="Search by email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-50 dark:border-ink-800 text-[10px] uppercase tracking-widest text-ink-400">
                <th className="pb-3 font-bold">Email</th>
                <th className="pb-3 font-bold">Plan</th>
                <th className="pb-3 font-bold">Role</th>
                <th className="pb-3 font-bold">Grace</th>
                <th className="pb-3 font-bold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
              {filtered.map((u) => {
                const hasGrace = !!u.grace_plan
                const graceExpired = hasGrace && u.grace_plan_expires_at && new Date(u.grace_plan_expires_at) <= new Date()
                return (
                  <tr key={u.id} className="group">
                    <td className="py-3 pr-4 font-medium text-ink-900 dark:text-ink-100 max-w-[200px] truncate">{u.email}</td>
                    <td className="py-3 pr-4">
                      <select
                        className="bg-transparent border-0 p-0 text-sm font-medium focus:ring-0 cursor-pointer text-ink-600 hover:text-saffron-500 transition-colors outline-none"
                        value={u.plan}
                        onChange={(e) => onUpdateUser(u.id, { plan: e.target.value })}
                      >
                        <option value="free">Free Plan</option>
                        <option value="go">ZygAI Go</option>
                        <option value="plus">ZygAI Plus</option>
                        <option value="beta">ZygAI Beta</option>
                      </select>
                    </td>
                    <td className="py-3 pr-4">
                      <select
                        className="bg-transparent border-0 p-0 text-sm font-medium focus:ring-0 cursor-pointer text-ink-600 hover:text-saffron-500 transition-colors outline-none"
                        value={u.role}
                        onChange={(e) => onUpdateUser(u.id, { role: e.target.value as any })}
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      {hasGrace && !graceExpired ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${PLAN_BADGE[u.grace_plan!] || PLAN_BADGE.free}`}>
                            {PLAN_LABELS[u.grace_plan!] || u.grace_plan}
                          </span>
                          <span className="text-[10px] text-ink-400 font-medium">{formatExpiry(u.grace_plan_expires_at)}</span>
                          <button
                            onClick={() => revokeGrace(u.id)}
                            className="text-[10px] text-red-400 hover:text-red-600 transition-colors font-medium"
                            title="Revoke grace period"
                          >✕</button>
                        </div>
                      ) : graceExpired ? (
                        <span className="text-[10px] text-ink-300 italic">Expired</span>
                      ) : (
                        <span className="text-[10px] text-ink-300">—</span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => openGraceModal(u)}
                        className="text-[11px] font-semibold text-saffron-500 hover:text-saffron-600 transition-colors px-2 py-1 rounded hover:bg-saffron-50 dark:hover:bg-saffron-900/20"
                      >
                        {hasGrace && !graceExpired ? 'Edit Grace' : 'Grant Grace'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-ink-400">No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Grace Period Modal */}
      {graceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 p-6 shadow-xl">
            <h4 className="text-base font-bold text-ink-900 dark:text-ink-50 mb-1">Grant Grace Period</h4>
            <p className="text-xs text-ink-500 mb-5 truncate">{graceModal.email}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-600 dark:text-ink-400 mb-1.5 uppercase tracking-wider">Plan</label>
                <div className="flex gap-2">
                  {(['go', 'plus', 'beta'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setGracePlan(p)}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                        gracePlan === p
                          ? 'border-saffron-400 bg-saffron-50 dark:bg-saffron-900/20 text-saffron-600 dark:text-saffron-400'
                          : 'border-ink-200 dark:border-ink-700 text-ink-500 hover:border-saffron-300'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-600 dark:text-ink-400 mb-1.5 uppercase tracking-wider">Duration</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={graceForever}
                      onChange={e => setGraceForever(e.target.checked)}
                      className="rounded accent-saffron-500"
                    />
                    <span className="text-sm text-ink-700 dark:text-ink-300">Forever</span>
                  </label>
                  {!graceForever && (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number"
                        min="1"
                        max="3650"
                        value={graceDuration}
                        onChange={e => setGraceDuration(e.target.value)}
                        className="w-20 px-2 py-1.5 text-sm rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800 text-ink-900 dark:text-ink-100 outline-none focus:border-saffron-400 transition-colors"
                      />
                      <span className="text-sm text-ink-500">days</span>
                      <div className="flex gap-1 ml-1">
                        {[7, 30, 90].map(d => (
                          <button
                            key={d}
                            onClick={() => setGraceDuration(String(d))}
                            className="px-2 py-1 text-[11px] font-semibold rounded bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-400 hover:bg-saffron-50 dark:hover:bg-saffron-900/20 hover:text-saffron-600 transition-colors"
                          >{d}d</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setGraceModal(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-ink-200 dark:border-ink-700 text-ink-600 dark:text-ink-400 hover:bg-ink-50 dark:hover:bg-ink-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyGrace}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-saffron-500 hover:bg-saffron-600 text-white transition-colors shadow-sm"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
