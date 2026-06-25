import React, { useState } from 'react'
import { Mail, Send, CheckCircle, XCircle } from 'lucide-react'
import type { AdminUser } from '@/types/admin'

type EmailPanelProps = {
  users: AdminUser[]
  onSendEmail: (subject: string, text: string, html: string, userIds: string[]) => Promise<{ sent: number; failed: number }>
}

export type EmailFormState = {
  subject: string
  message: string
  html: string
  selectedUserIds: string[]
}

export const EmailPanel: React.FC<EmailPanelProps> = ({ users, onSendEmail }) => {
  const [form, setForm] = useState<EmailFormState>({
    subject: '',
    message: '',
    html: '',
    selectedUserIds: []
  })
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ sent: number; failed: number; errors: Array<{ id: string; email: string; error: string }> } | null>(null)

  const toggleUser = (userId: string) => {
    setForm(prev => ({
      ...prev,
      selectedUserIds: prev.selectedUserIds.includes(userId)
        ? prev.selectedUserIds.filter(id => id !== userId)
        : [...prev.selectedUserIds, userId]
    }))
  }

  const selectAll = () => {
    if (form.selectedUserIds.length === users.length) {
      setForm(prev => ({ ...prev, selectedUserIds: [] }))
    } else {
      setForm(prev => ({ ...prev, selectedUserIds: users.map(u => u.id) }))
    }
  }

  const handleSend = async () => {
    if (!form.subject.trim() || !form.message.trim() || form.selectedUserIds.length === 0) return
    setSending(true)
    setResult(null)
    try {
      const data = await onSendEmail(form.subject.trim(), form.message.trim(), form.html.trim(), form.selectedUserIds)
      setResult({
        sent: data.sent || 0,
        failed: data.failed || 0,
        errors: (data as any)?.failed?.length ? (data as any)?.failed : []
      })
      // Reset form on success
      setForm({ subject: '', message: '', html: '', selectedUserIds: [] })
    } catch (err: any) {
      setResult({ sent: 0, failed: 1, errors: [{ id: '', email: '', error: err?.message || 'Failed to send email' }] })
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
          <Mail size={20} />
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Email Marketing</h3>
          <p className="text-xs text-ink-500">Send bulk emails to selected users</p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Email compose */}
        <div className="space-y-4 bg-ink-50/50 dark:bg-ink-800/30 p-6 rounded-2xl border border-ink-100 dark:border-ink-800">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-ink-400 mb-1 block ml-1">Subject</label>
            <input
              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-saffron-400 transition-colors"
              placeholder="Email subject..."
              value={form.subject}
              onChange={(e) => setForm(prev => ({ ...prev, subject: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-ink-400 mb-1 block ml-1">Message (Text)</label>
            <textarea
              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2.5 text-sm h-32 outline-none focus:border-saffron-400 transition-colors resize-none"
              placeholder="Write your message..."
              value={form.message}
              onChange={(e) => setForm(prev => ({ ...prev, message: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-ink-400 mb-1 block ml-1">HTML (optional)</label>
            <textarea
              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2.5 text-sm h-20 outline-none focus:border-saffron-400 transition-colors resize-none font-mono text-xs"
              placeholder="<p>HTML version...</p>"
              value={form.html}
              onChange={(e) => setForm(prev => ({ ...prev, html: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-ink-500">{form.selectedUserIds.length} recipients selected</span>
            <button
              className="rounded-xl bg-ink-900 dark:bg-saffron-400 dark:text-ink-900 px-6 py-2.5 text-white text-xs font-bold uppercase tracking-widest transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              onClick={handleSend}
              disabled={sending || !form.subject.trim() || !form.message.trim() || form.selectedUserIds.length === 0}
            >
              {sending ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send size={14} />
                  Send Email
                </>
              )}
            </button>
          </div>
          {result && (
            <div className="flex items-center gap-3 text-xs p-3 rounded-lg border border-ink-100 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/50">
              <CheckCircle size={16} className="text-emerald-500" />
              <span>Sent: {result.sent}</span>
              {result.failed > 0 && (
                <>
                  <XCircle size={16} className="text-rose-500" />
                  <span>Failed: {result.failed}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* User list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold uppercase tracking-widest text-ink-400">Select Recipients</h4>
            <button
              onClick={selectAll}
              className="text-[10px] text-saffron-500 hover:underline"
            >
              {form.selectedUserIds.length === users.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto space-y-2 pr-2 custom-scrollbar rounded-xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900">
            {users.map((user) => (
              <label
                key={user.id}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-ink-50 dark:border-ink-800 last:border-b-0 hover:bg-ink-50 dark:hover:bg-ink-800/50 ${
                  form.selectedUserIds.includes(user.id) ? 'bg-saffron-50/50 dark:bg-saffron-900/20' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={form.selectedUserIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                  className="rounded border-ink-300 text-saffron-500 focus:ring-saffron-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-ink-900 dark:text-ink-100 truncate">{user.email}</div>
                  <div className="text-xs text-ink-500">
                    {user.plan} • {user.role}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
