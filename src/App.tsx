import React, { useEffect, useMemo, useState } from 'react';
import { ChatProvider, useChat } from '@/contexts/ChatContext';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { TimeCreditsProvider } from '@/contexts/TimeCreditsContext';
import Sidebar from '@/components/Sidebar';
import ChatArea from '@/components/ChatArea';
import LandingPage from '@/components/LandingPage';
import AuthScreen from '@/components/AuthScreen';
import EmailVerification from '@/components/EmailVerification';
import AdminDashboard from '@/components/AdminDashboard';
import BillingStatus from '@/components/BillingStatus';
import BlogPost from '@/components/BlogPost';
import BlogIndex from '@/components/BlogIndex';
import CalmMode from '@/components/CalmMode';
import PromptsArea from '@/components/PromptsArea';
import ImageStudio from '@/components/ImageStudio';
import PersonalArea from '@/components/PersonalArea';
import LearningArea from '@/components/LearningArea';
import GamesArea from '@/components/GamesArea';
import MarketplaceArea from '@/components/MarketplaceArea';
import AppsArea from '@/components/AppsArea';
import ReachArea from '@/components/ReachArea';
import NotesArea from '@/components/NotesArea';
import TasksArea from '@/components/TasksArea';
import McpSelectorArea from '@/components/McpSelectorArea';
// Ensure we import the React UI component, not the backend Express route!
import VibeCoderArea from '@/components/VibeCoderArea'; 
import UpgradeModal from '@/components/UpgradeModal';
import AccountSettingsModal from '@/components/AccountSettingsModal';
import BirthdayWishModal from '@/components/BirthdayWishModal';
import ZygMusicArea from '@/components/ZygMusicArea';
import ZygaBirthdayDashboard from '@/components/ZygaBirthdayDashboard';
import { Menu } from 'lucide-react';
import { StickyNote, ListTodo, Target, Blocks, Music, Image, Gamepad2 } from 'lucide-react';
import { pluginManager } from '@/plugins/pluginManager';
import { API_BASE } from '@/utils/apiBase';


// Initialize plugins
const initializePlugins = () => {
  // Example plugin registration
  // In a real app, this would load plugins dynamically
  pluginManager.registerPlugin({
    id: 'example-plugin',
    name: 'Example Plugin',
    description: 'A sample plugin demonstrating the plugin system',
    version: '1.0.0',
    author: 'ZygAI Team',
    
    initialize: (api) => {
      console.log('Example plugin initialized');
      api.log('Example plugin ready');
      
      // Example command handler
      api.on('messageSent', (message) => {
        if (message.startsWith('/example')) {
          api.sendMessage('This is a response from the example plugin!');
        }
      });
    },
    
    preProcessMessage: (message) => {
      // Example: Add timestamp to messages
      return `${message} (processed by example plugin)`;
    }
  });
};

const AppShell: React.FC = () => {
  const { user, token, loading: authLoading, logout, heartbeat, refreshUser } = useAuth();

  const {
    sessions,
    activeSessionId,
    models,
    settings,
    isSending,
    typingIndicator,
    error,
    setActiveSession,
    createSession,
    sendMessage,
    stopGeneration,
    deleteSession,
    renameSession,
    updateSessionModel,
    updateSessionZyg
  } = useChat();

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeView, setActiveView] = useState<string>('chat');
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [modelId, setModelId] = useState(settings.preferredModelId || models[0]?.id);
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const [birthdayWishOpen, setBirthdayWishOpen] = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    fetch(`${API_BASE}/feature-models`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data?.settings)) {
          const musicFeature = data.settings.find(
            (fm: any) => fm.featureKey === "music_generation"
          );
          if (musicFeature?.modelId) {
          }
        }
      })
      .catch(err => console.error("Failed to fetch music feature model:", err));
  }, [user, token]);


  useEffect(() => {
    if (!models.length) return;
    if (!models.find((model) => model.id === modelId)) {
      setModelId(models[0].id);
    }
  }, [modelId, models]);

  useEffect(() => {
    if (!user) return;
    heartbeat();
    const interval = window.setInterval(() => {
      heartbeat();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [user, heartbeat]);

  // Notes Reminders Check
  useEffect(() => {
    if (!user || !token) return;

    const checkReminders = async () => {
      try {
        const res = await fetch(`${API_BASE}/notes/reminders`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const { reminders } = await res.json();
          if (reminders && reminders.length > 0) {
            for (const reminder of reminders) {
              // Trigger notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('ZygAI Reminder', {
                  body: reminder.content,
                  icon: '/logo.png'
                });
              } else {
                // Fallback to alert if no notification permission
                alert(`Reminder: ${reminder.content}`);
              }

              // Mark as notified
              await fetch(`${API_BASE}/notes/${reminder.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ notified: 1 })
              });
            }
          }
        }
      } catch (err) {
        console.error('Failed to check reminders:', err);
      }
    };

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const interval = window.setInterval(checkReminders, 60000); // Check every minute
    checkReminders(); // Initial check

    return () => window.clearInterval(interval);
  }, [user, token]);

  useEffect(() => {
    if (!user?.displayName) {
      setNameDraft('');
      setNameError(null);
    }
  }, [user?.displayName]);







  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId),
    [sessions, activeSessionId]
  );

  useEffect(() => {
    if (!activeSession?.modelId) return;
    setModelId(activeSession.modelId);
  }, [activeSession?.modelId]);

  // Update active session's modelId when model is changed
  const handleModelChange = (newModelId: string) => {
    setModelId(newModelId);
  };

  // Initialize plugins on app load
  useEffect(() => {
    initializePlugins();
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 text-sm text-ink-500 dark:bg-ink-900 dark:text-ink-100">
        Loading your workspace...
      </div>
    );
  }

  if (window.location.pathname.startsWith('/billing/success')) {
    return <BillingStatus status="success" isAuthenticated={Boolean(user)} />;
  }

  if (window.location.pathname.startsWith('/billing/cancel')) {
    return <BillingStatus status="cancel" isAuthenticated={Boolean(user)} />;
  }

  if (window.location.pathname.startsWith('/verify')) {
    return <EmailVerification />;
  }

  if (window.location.pathname.startsWith('/reset-password')) {
    return <AuthScreen initialMode="login" />;
  }

  if (window.location.pathname === '/blog' || window.location.pathname === '/blog/') {
    return <BlogIndex />;
  }

  if (window.location.pathname.startsWith('/blog/')) {
    return <BlogPost />;
  }

  if (!user) {
    if (showAuth) {
      return (
        <AuthScreen 
          initialMode={authMode} 
          onBack={() => setShowAuth(false)} 
        />
      );
    }
    return (
      <LandingPage 
        onGetStarted={() => {
          setAuthMode('register');
          setShowAuth(true);
        }}
        onLogin={() => {
          setAuthMode('login');
          setShowAuth(true);
        }}
      />
    );
  }

  if (window.location.pathname.startsWith('/admin')) {
    if (user.role !== 'admin') {
      return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-[var(--bg)] text-ink-900">
          <div className="text-center space-y-4">
            <h1 className="font-display text-6xl font-bold text-saffron-500">403</h1>
            <h2 className="text-2xl font-semibold">Access Forbidden</h2>
            <p className="text-ink-500 max-w-md mx-auto">
              You do not have the necessary permissions to access the administration console.
            </p>
            <button
              onClick={() => window.location.href = '/'}
              className="mt-4 rounded-2xl bg-ink-900 px-8 py-3 text-sm font-bold text-white transition hover:bg-ink-800"
            >
              Return to Workspace
            </button>
          </div>
        </div>
      );
    }
    return <AdminDashboard />;
  }



  return (
    <div className="relative flex h-screen w-full bg-[var(--bg)] text-ink-900">
        <div className="hidden w-[260px] lg:flex">
            <Sidebar
             sessions={sessions}
             activeSessionId={activeSessionId}
             onNewChat={() => createSession(modelId)}
             onSelectSession={setActiveSession}
             onDeleteSession={deleteSession}
             onRenameSession={renameSession}
             onSetView={(view: string) => setActiveView(view as any)}
             plan={user.plan}
             displayName={user.displayName}
             onLogout={logout}
             onOpenAccountSettings={() => setAccountSettingsOpen(true)}
             onRequestUpgrade={() => setUpgradeModalOpen(true)}
             onOpenBirthdayWish={() => setBirthdayWishOpen(true)}
             onSearch={(query) => {
               // Implement search logic here
               console.log('Search query:', query);
             }}
              isAdmin={user.role === 'admin'}
            />
          </div>
      <div className="flex flex-1 flex-col min-h-0">
        <div className="flex items-center justify-between border-b border-ink-100 bg-white/80 px-4 py-3 lg:hidden dark:border-ink-800 dark:bg-ink-900">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="rounded-full border border-ink-200 p-2 text-ink-600 transition hover:border-saffron-400 hover:text-saffron-500 dark:border-ink-700 dark:text-ink-200"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <div className="text-sm font-semibold">ZygAI</div>
          <div className="h-8 w-8" />
        </div>
          {activeView === 'chat' ? (
           <ChatArea
             session={activeSession}
             models={models}
             modelId={modelId}
              onSend={(message, useWebSearch, images, attachedFiles, tools, selectedApiTools) => sendMessage(message, modelId, { useWebSearch, images, attachedFiles, tools, selectedApiTools } as any)}
             isSending={isSending}
             typingIndicator={typingIndicator}
             error={error}
             onNewChat={() => {
               createSession(modelId);
               if (modelId) {
                 setModelId(modelId);
               }
             }}
             onOpenAccountSettings={() => setAccountSettingsOpen(true)}
             onModelChange={handleModelChange}
             onRenameSession={(id, title) => renameSession(id, title)}
             onDeleteSession={(id) => deleteSession(id)}
             onUpdateSessionModel={(sessionId, newModelId) => updateSessionModel(sessionId, newModelId)}
             onUpdateSessionZyg={(sessionId, newZygId) => updateSessionZyg(sessionId, newZygId)}
             onStopGeneration={stopGeneration}
             onRequestUpgrade={() => setUpgradeModalOpen(true)}
             isAdmin={user.role === 'admin'}
           />
        ) : activeView === 'calm' ? (
          <CalmMode settings={settings} displayName={user.displayName} />
        ) : activeView === 'prompts' ? (
          <PromptsArea />
        ) : activeView === 'images' ? (
          <ImageStudio onRequestUpgrade={() => setUpgradeModalOpen(true)} />
        ) : activeView === 'admin' ? (
          user.role === 'admin' ? (
            <AdminDashboard />
          ) : (
            <div className="flex-1 flex items-center justify-center text-ink-500">
              Access Denied
            </div>
          )
         ) : activeView === 'personal' ? (
           <PersonalArea />
         ) : activeView === 'learning' ? (
           <LearningArea />
         ) : activeView === 'games' ? (
           <GamesArea />
         ) : activeView === 'zygs_marketplace' ? (
           <MarketplaceArea
             type="zyg"
             onNavigateToChat={(zygId) => {
               createSession(modelId, zygId);
               setActiveView('chat');
             }}
           />
          ) : activeView === 'prompts_marketplace' ? (
            <MarketplaceArea
              type="prompt"
              onNavigateToChat={(zygId) => {
                createSession(modelId, zygId);
                setActiveView('chat');
              }}
            />
          ) : activeView === 'vibe_coder' ? (
            <VibeCoderArea onRequestUpgrade={() => setUpgradeModalOpen(true)} />
          ) : activeView === 'deep-research' ? (
          <div className="flex-1 flex items-center justify-center text-ink-500">
            Deep research view coming soon
          </div>
          ) : activeView === 'apps' ? (
            <AppsArea />
          ) : activeView === 'notes' ? (
            <NotesArea />
          ) : activeView === 'tasks' ? (
            <TasksArea />
          ) : activeView === 'reach' ? (
            <ReachArea />
          ) : activeView === 'mcp-selector' ? (
            <McpSelectorArea />
          ) : activeView === 'zyga-birthday' ? (
            <ZygaBirthdayDashboard />
          ) : activeView === 'music' ? (
            <ZygMusicArea onRequestUpgrade={() => setUpgradeModalOpen(true)} />
          ) : activeView === 'more' ? (
            <div className="flex flex-1 items-center justify-center p-6 bg-black text-white dark:text-white">
              <div className="w-full max-w-3xl space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-xl text-white">More</h3>
                  <button
                    onClick={() => setActiveView('chat')}
                    className="rounded-full border border-white/20 p-2 text-white hover:bg-white/10 transition-colors"
                  >
                    Back
                  </button>
                </div>
                {/* More page with icons; excludes Birthday */}
                <div className="grid gap-4">
                  <button
                    onClick={() => setActiveView('notes')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <StickyNote size={18} /> Notes
                  </button>
                  <button
                    onClick={() => setActiveView('tasks')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <ListTodo size={18} /> Tasks
                  </button>
                  <button
                    onClick={() => setActiveView('reach')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <Target size={18} /> Reach
                  </button>
                  <button
                    onClick={() => setActiveView('mcp-selector')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <Blocks size={18} /> MCP
                  </button>
                  <button
                    onClick={() => setActiveView('images')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <Image size={18} /> Images
                  </button>
                  <button
                    onClick={() => setActiveView('games')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <Gamepad2 size={18} /> Games
                  </button>
                  <button
                    onClick={() => setActiveView('music')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <Music size={18} /> ZygMusic
                  </button>
                  <button
                    onClick={() => setActiveView('apps')}
                    className="rounded-xl border border-white/20 p-4 text-left hover:bg-white/10 text-white flex items-center gap-3"
                  >
                    <Blocks size={18} /> Zyg's Apps
                  </button>
                </div>
              </div>
            </div>
          ) : null}
      </div>
      {user && !user.displayName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70 p-4">
          <div className="w-full max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-xl dark:border-ink-700 dark:bg-ink-900">
            <div className="grid gap-2">
              <p className="text-xs uppercase tracking-[0.3em] text-ink-400">Welcome</p>
              <h2 className="font-display text-xl font-semibold">What should ZygAI call you?</h2>
              <p className="text-xs text-ink-500 dark:text-ink-200">
                This is only for greetings and conversation, not marketing.
              </p>
            </div>
            <div className="mt-4 grid gap-2">
              <input
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Your name"
                className="rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-900 outline-none transition focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
              />
              {nameError && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                  {nameError}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                onClick={async () => {
                  if (!nameDraft.trim()) {
                    setNameError('Please enter a name.');
                    return;
                  }
                  if (!token) return;
                  setNameSaving(true);
                  setNameError(null);
                  try {
                    const response = await fetch(`${API_BASE}/auth/profile`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                      },
                      body: JSON.stringify({ displayName: nameDraft.trim() })
                    });
                    const data = await response.json().catch(() => ({}));
                    if (!response.ok) {
                      throw new Error(data?.error || 'Failed to save name.');
                    }
                    await refreshUser();
                  } catch (error) {
                    setNameError(error instanceof Error ? error.message : 'Failed to save name.');
                  } finally {
                    setNameSaving(false);
                  }
                }}
                disabled={nameSaving}
                className="rounded-2xl bg-ink-900 px-4 py-2 text-xs font-semibold text-ink-50 transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500 dark:bg-ink-50 dark:text-ink-900"
              >
                {nameSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="absolute inset-0 bg-ink-900/50"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative z-10 h-full w-[240px]">
               <Sidebar
                 sessions={sessions}
                 activeSessionId={activeSessionId}
                 onNewChat={() => {
                   createSession(modelId);
                   setMobileSidebarOpen(false);
                 }}
                 onSelectSession={(id) => {
                   setActiveSession(id);
                   setMobileSidebarOpen(false);
                 }}
                 onDeleteSession={deleteSession}
                 onRenameSession={renameSession}
                 onSetView={(view: string) => setActiveView(view as any)}
                 plan={user.plan}
                 displayName={user.displayName}
                 onLogout={logout}
                 onOpenAccountSettings={() => {
                   setAccountSettingsOpen(true);
                   setMobileSidebarOpen(false);
                 }}
                 onOpenBirthdayWish={() => {
                   setBirthdayWishOpen(true);
                   setMobileSidebarOpen(false);
                 }}
                  onRequestUpgrade={() => {
                    setUpgradeModalOpen(true);
                    setMobileSidebarOpen(false);
                  }}
                  isAdmin={user.role === 'admin'}
                />

          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={
          user.plan === 'free' && ((activeView === 'chat' && sessions.length > 5) || upgradeModalOpen)
        }
        onClose={() => setUpgradeModalOpen(false)}
      />
      <AccountSettingsModal
        isOpen={accountSettingsOpen}
        onClose={() => setAccountSettingsOpen(false)}
      />
      <BirthdayWishModal
        isOpen={birthdayWishOpen}
        onClose={() => setBirthdayWishOpen(false)}
      />
</div>
  );
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-ink-50 text-ink-900 p-4">
          <div className="text-center">
            <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
            <p className="text-sm text-ink-500 mb-4">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-ink-900 text-white rounded-lg text-sm font-medium"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
      <ChatProvider>
        <TimeCreditsProvider>
          <AppShell />
        </TimeCreditsProvider>
      </ChatProvider>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
