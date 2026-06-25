import React, { useEffect, useState } from 'react'
import { Trash2, Plus, AlertCircle } from 'lucide-react'
import { API_BASE } from '@/utils/apiBase'

interface BanFilter {
  id: number
  filter_type: 'keyword' | 'domain_pattern' | 'email_pattern'
  filter_value: string
  is_regex: boolean
  description?: string | null
  active: boolean
  created_at: string
  updated_at: string
}

interface BanLog {
  id: number
  user_id: string
  email: string
  reason: string
  triggered_by: string
  permanent: boolean
  created_at: string
}

type BansPanelProps = {
  token: string
  error?: string
  onError?: (error: string) => void
}

export const BansPanel: React.FC<BansPanelProps> = ({ token, onError }) => {
  const [filters, setFilters] = useState<BanFilter[]>([])
  const [logs, setLogs] = useState<BanLog[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'filters' | 'logs'>('filters')
  
  // New filter form
  const [newFilter, setNewFilter] = useState({
    filterType: 'keyword' as const,
    filterValue: '',
    isRegex: false,
    description: ''
  })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const headers = { Authorization: `Bearer ${token}` }

  useEffect(() => {
    if (!token) {
      setErrorMessage('No authentication token available. Please log in as an admin.')
      setLoading(false)
      return
    }
    console.log('BansPanel: Token available, loading data...')
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      setErrorMessage('')
      const url = `${API_BASE}/admin/ban-filters`
      console.log('BansPanel: Fetching from:', url)
      const res = await fetch(url, { headers })
      
      console.log('BansPanel: Response status:', res.status, res.statusText)
      console.log('BansPanel: Response content-type:', res.headers.get('content-type'))
      
      if (!res.ok) {
        const text = await res.text()
        const errMsg = `Failed to load filters: ${res.status} ${res.statusText}`
        console.error(errMsg)
        console.error('Response preview:', text.substring(0, 300))
        setErrorMessage(errMsg)
        onError?.(errMsg)
        setLoading(false)
        return
      }

      const contentType = res.headers.get('content-type')
      if (!contentType?.includes('application/json')) {
        const text = await res.text()
        const errMsg = `Invalid response format: expected JSON, but received HTML. This often indicates the backend API server is not running or the endpoint is misconfigured.`
        console.error(errMsg)
        console.error('Make sure the backend API is running and accessible at:', url)
        console.error('Response preview:', text.substring(0, 300))
        setErrorMessage(errMsg)
        onError?.(errMsg)
        setLoading(false)
        return
      }

      try {
        const data = await res.json()
        console.log('BansPanel: Loaded filters:', data.filters?.length || 0)
        setFilters(data.filters || [])
      } catch (parseErr) {
        const errMsg = 'Failed to parse filter response'
        console.error(errMsg, parseErr)
        setErrorMessage(errMsg)
        onError?.(errMsg)
        setLoading(false)
        return
      }

      const logsUrl = `${API_BASE}/admin/ban-logs`
      console.log('BansPanel: Fetching logs from:', logsUrl)
      const logsRes = await fetch(logsUrl, { headers })
      if (logsRes.ok) {
        const logsContentType = logsRes.headers.get('content-type')
        if (logsContentType?.includes('application/json')) {
          try {
            const data = await logsRes.json()
            console.log('BansPanel: Loaded logs:', data.logs?.length || 0)
            setLogs(data.logs || [])
          } catch (parseErr) {
            console.error('Failed to parse logs response', parseErr)
          }
        }
      } else {
        console.error('Failed to load logs:', logsRes.status, logsRes.statusText)
      }
    } catch (err) {
      const errMsg = `Error loading ban data: ${err instanceof Error ? err.message : 'Unknown error'}`
      console.error(errMsg, err)
      setErrorMessage(errMsg)
      onError?.(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const handleAddFilter = async () => {
    if (!newFilter.filterValue.trim()) {
      setAddError('Filter value is required.')
      return
    }

    setAdding(true)
    setAddError('')

    try {
      const res = await fetch(`${API_BASE}/admin/ban-filters`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filterType: newFilter.filterType,
          filterValue: newFilter.filterValue.trim(),
          isRegex: newFilter.isRegex,
          description: newFilter.description.trim() || null
        })
      })

      if (res.ok) {
        setNewFilter({ filterType: 'keyword', filterValue: '', isRegex: false, description: '' })
        await loadData()
      } else {
        const error = await res.json()
        setAddError(error.error || 'Failed to add filter')
      }
    } catch (err) {
      console.error('Error adding filter:', err)
      setAddError('Error adding filter')
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteFilter = async (id: number) => {
    if (!confirm('Delete this filter?')) return

    try {
      const res = await fetch(`${API_BASE}/admin/ban-filters/${id}`, {
        method: 'DELETE',
        headers
      })
      if (res.ok) {
        await loadData()
      } else {
        onError?.('Failed to delete filter')
      }
    } catch (err) {
      console.error('Error deleting filter:', err)
      onError?.('Error deleting filter')
    }
  }

  const handleToggleFilter = async (id: number, active: boolean) => {
    try {
      const res = await fetch(`${API_BASE}/admin/ban-filters/${id}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ active: !active })
      })
      if (res.ok) {
        await loadData()
      } else {
        console.error('Failed to toggle filter:', res.status)
      }
    } catch (err) {
      console.error('Error updating filter:', err)
      onError?.('Error updating filter')
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading ban data...</div>
  }

  if (errorMessage) {
    return (
      <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50 mb-4">
            Ban Management
          </h3>
          <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10">
            <p className="text-sm text-red-700 dark:text-red-300 mb-3">
              <strong>Error:</strong> {errorMessage}
            </p>
            <p className="text-xs text-red-600 dark:text-red-400 mb-4 space-y-1">
              <div>Make sure you're:</div>
              <div className="ml-4">• Logged in to ZygAI</div>
              <div className="ml-4">• Logged in as an admin user</div>
              <div className="ml-4">• The API endpoint is accessible ({API_BASE}/admin/ban-filters). Check your server logs for more details.</div>
            </p>
            <button
              onClick={() => loadData()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
      <div className="mb-6">
        <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50 mb-4">
          Ban Management
        </h3>
        
        <div className="flex gap-2 mb-6 border-b border-ink-100 dark:border-ink-800">
          <button
            onClick={() => setTab('filters')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'filters'
                ? 'text-saffron-600 border-b-2 border-saffron-600'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Ban Filters ({filters.length})
          </button>
          <button
            onClick={() => setTab('logs')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === 'logs'
                ? 'text-saffron-600 border-b-2 border-saffron-600'
                : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Ban Logs ({logs.length})
          </button>
        </div>
      </div>

      {tab === 'filters' && (
        <div className="space-y-6">
          {/* Add new filter form */}
          <div className="border border-ink-100 dark:border-ink-800 rounded-lg p-4 bg-ink-50 dark:bg-ink-800/50">
            <h4 className="text-sm font-semibold text-ink-900 dark:text-ink-100 mb-4">Add New Filter</h4>
            
            {addError && (
              <div className="mb-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded flex items-center gap-2">
                <AlertCircle size={16} />
                {addError}
              </div>
            )}

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    Filter Type
                  </label>
                  <select
                    value={newFilter.filterType}
                    onChange={(e) => setNewFilter({ ...newFilter, filterType: e.target.value as any })}
                    className="w-full px-3 py-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded text-sm"
                  >
                    <option value="keyword">Keyword</option>
                    <option value="domain_pattern">Domain Pattern</option>
                    <option value="email_pattern">Email Pattern</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                    <input
                      type="checkbox"
                      checked={newFilter.isRegex}
                      onChange={(e) => setNewFilter({ ...newFilter, isRegex: e.target.checked })}
                    />
                    Regex Pattern
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                  Filter Value
                </label>
                <input
                  type="text"
                  value={newFilter.filterValue}
                  onChange={(e) => setNewFilter({ ...newFilter, filterValue: e.target.value })}
                  placeholder={`e.g., ${newFilter.filterType === 'keyword' ? 'drugs' : '.local'}`}
                  className="w-full px-3 py-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-ink-600 dark:text-ink-400 mb-1">
                  Description (optional)
                </label>
                <input
                  type="text"
                  value={newFilter.description}
                  onChange={(e) => setNewFilter({ ...newFilter, description: e.target.value })}
                  placeholder="Why is this filter needed?"
                  className="w-full px-3 py-2 bg-white dark:bg-ink-900 border border-ink-200 dark:border-ink-700 rounded text-sm"
                />
              </div>

              <button
                onClick={handleAddFilter}
                disabled={adding || !newFilter.filterValue.trim()}
                className="w-full px-3 py-2 bg-saffron-500 hover:bg-saffron-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50"
              >
                {adding ? 'Adding...' : <span className="flex items-center justify-center gap-2"><Plus size={16} /> Add Filter</span>}
              </button>
            </div>
          </div>

          {/* Filter list */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-50 dark:border-ink-800 text-[10px] uppercase tracking-widest text-ink-400">
                  <th className="pb-3 font-bold">Type</th>
                  <th className="pb-3 font-bold">Value</th>
                  <th className="pb-3 font-bold">Description</th>
                  <th className="pb-3 font-bold">Status</th>
                  <th className="pb-3 font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
                {filters.map((filter) => (
                  <tr key={filter.id} className="group hover:bg-ink-50 dark:hover:bg-ink-800/50">
                    <td className="py-3 pr-4 text-xs font-medium text-ink-600 dark:text-ink-400">
                      {filter.filter_type.replace('_', ' ')}
                      {filter.is_regex && <span className="ml-1 text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">REGEX</span>}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-700 dark:text-ink-300">{filter.filter_value}</td>
                    <td className="py-3 pr-4 text-xs text-ink-500 dark:text-ink-500">{filter.description || '-'}</td>
                    <td className="py-3 pr-4">
                      <button
                        onClick={() => handleToggleFilter(filter.id, filter.active)}
                        className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                          filter.active
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200'
                            : 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        {filter.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => handleDeleteFilter(filter.id)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filters.length === 0 && (
            <div className="text-center py-8 text-ink-500 dark:text-ink-400">No filters configured yet.</div>
          )}
        </div>
      )}

      {tab === 'logs' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-50 dark:border-ink-800 text-[10px] uppercase tracking-widest text-ink-400">
                <th className="pb-3 font-bold">User</th>
                <th className="pb-3 font-bold">Reason</th>
                <th className="pb-3 font-bold">Triggered By</th>
                <th className="pb-3 font-bold">Type</th>
                <th className="pb-3 font-bold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50 dark:divide-ink-800">
              {logs.map((log) => (
                <tr key={log.id} className="group hover:bg-ink-50 dark:hover:bg-ink-800/50">
                  <td className="py-3 pr-4 text-sm font-medium text-ink-900 dark:text-ink-100">{log.email}</td>
                  <td className="py-3 pr-4 text-sm text-ink-700 dark:text-ink-300">{log.reason}</td>
                  <td className="py-3 pr-4 text-xs text-ink-500 dark:text-ink-500">{log.triggered_by}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs font-medium px-2 py-1 rounded ${
                      log.permanent
                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                        : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                    }`}>
                      {log.permanent ? 'Permanent' : 'Temporary'}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-ink-500">
                    {new Date(log.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div className="text-center py-8 text-ink-500 dark:text-ink-400">No ban logs yet.</div>
          )}
        </div>
      )}
    </section>
  )
}
