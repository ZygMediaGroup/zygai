import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import { Blocks, Settings, Plus } from 'lucide-react';
import clsx from 'clsx';

interface ApiToolServer {
  id: string;
  name: string;
  baseUrl: string;
  authHeader?: string;
  headers?: Record<string, string>;
}

const McpSelectorArea: React.FC = () => {
  const { token } = useAuth();
  const [availableApiTools, setAvailableApiTools] = useState<ApiToolServer[]>([]);
  const [selectedApiTools, setSelectedApiTools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApiToolServers = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/mcp-servers?enabled=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.servers) {
          setAvailableApiTools(data.servers);
        }
      } catch (err) {
        console.error('Failed to fetch API tool servers', err);
      } finally {
        setLoading(false);
      }
    };

    const loadUserPreferences = async () => {
      // Load user's selected API tools from localStorage
      const saved = localStorage.getItem('zygai:selectedApiTools');
      if (saved) {
        setSelectedApiTools(JSON.parse(saved));
      }
    };

    fetchApiToolServers();
    loadUserPreferences();
  }, [token]);

  const handleServerToggle = (serverId: string) => {
    const newSelected = selectedApiTools.includes(serverId)
      ? selectedApiTools.filter(id => id !== serverId)
      : [...selectedApiTools, serverId];

    setSelectedApiTools(newSelected);
    localStorage.setItem('zygai:selectedApiTools', JSON.stringify(newSelected));
  };

  const handleOpenConnections = () => {
    window.location.href = '/apps';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="thinking-indicator" style={{ margin: 0 }}>
          <div className="thinking-dot"></div>
          <div className="thinking-dot"></div>
          <div className="thinking-dot"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between p-6 border-b border-ink-100 dark:border-ink-800">
        <div className="flex items-center gap-3">
          <Blocks size={24} className="text-saffron-500" />
          <div>
            <h1 className="text-2xl font-bold text-ink-900 dark:text-ink-50">API Tool Selection</h1>
            <p className="text-sm text-ink-500 dark:text-ink-400">Choose which external APIs to use in your conversations</p>
          </div>
        </div>
        <button
          onClick={handleOpenConnections}
          className="flex items-center gap-2 px-4 py-2 bg-saffron-500 hover:bg-saffron-600 text-white rounded-lg transition-colors"
        >
          <Settings size={16} />
          Manage API Connections
        </button>
      </header>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {availableApiTools.length === 0 ? (
          <div className="text-center py-12">
            <Blocks size={48} className="mx-auto text-ink-300 mb-4" />
            <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50 mb-2">No API tools available</h3>
            <p className="text-ink-500 dark:text-ink-400 mb-6">
              You need to add API connections first before you can select them.
            </p>
            <button
              onClick={handleOpenConnections}
              className="inline-flex items-center gap-2 px-4 py-2 bg-saffron-500 hover:bg-saffron-600 text-white rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add API Connections
            </button>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50 mb-2">
                Selected API Tools ({selectedApiTools.length})
              </h2>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                These external APIs will be available in your conversations
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableApiTools.map((server) => (
                <div 
                  key={server.id}
                  className={clsx(
                    "relative p-5 rounded-2xl border transition-all cursor-pointer group",
                    selectedApiTools.includes(server.id)
                      ? "bg-saffron-50/50 border-saffron-200 dark:bg-saffron-900/10 dark:border-saffron-800"
                      : "bg-white border-ink-100 hover:border-ink-200 dark:bg-ink-900 dark:border-ink-800 dark:hover:border-ink-700"
                  )}
                  onClick={() => handleServerToggle(server.id)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={clsx(
                      "h-10 w-10 flex items-center justify-center rounded-xl transition-colors",
                      selectedApiTools.includes(server.id)
                        ? "bg-saffron-100 text-saffron-600 dark:bg-saffron-900/40"
                        : "bg-ink-50 text-ink-400 group-hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-500"
                    )}>
                      <Blocks size={20} />
                    </div>
                    <div className={clsx(
                      "h-5 w-5 rounded-full border flex items-center justify-center transition-all",
                      selectedApiTools.includes(server.id)
                        ? "bg-saffron-500 border-saffron-500 text-white scale-110"
                        : "border-ink-200 bg-white dark:bg-ink-900 dark:border-ink-700"
                    )}>
                      {selectedApiTools.includes(server.id) && (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <h3 className="font-bold text-ink-900 dark:text-ink-50 mb-1">{server.name}</h3>
                  <p className="text-xs text-ink-500 dark:text-ink-400 truncate font-mono">{server.baseUrl}</p>
                </div>
              ))}
            </div>

            {selectedApiTools.length > 0 && (
              <div className="mt-8 p-4 bg-saffron-50 dark:bg-saffron-900/20 rounded-xl border border-saffron-200 dark:border-saffron-800">
                <h3 className="font-semibold text-saffron-800 dark:text-saffron-200 mb-2">
                  Active API Tools
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedApiTools.map(serverId => {
                    const server = availableApiTools.find(s => s.id === serverId);
                    return server ? (
                      <div key={serverId} className="px-3 py-1 bg-white dark:bg-ink-900 border border-saffron-200 dark:border-saffron-800 rounded-lg text-xs font-medium text-saffron-700 dark:text-saffron-300">
                        {server.name}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default McpSelectorArea;
