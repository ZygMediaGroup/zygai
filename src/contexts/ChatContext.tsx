import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  AppSettings,
  ChatSession,
  Message,
  ModelOption,
  Provider,
  SearchImage,
  SearchResult
} from '@/types';
import { cleanResponseContent } from '@/utils/contentCleaner';
import {
  buildChatExport,
  buildTextExport,
  DEFAULT_MODELS,
  loadActiveSessionId,
  loadSessions,
  loadSettings,
  saveActiveSessionId,
  saveSessions,
  saveSettings,
  fetchChatSessions,
  fetchChatSession,
  createChatSession,
  updateChatSession,
  deleteChatSession,
  saveChatMessage,
  deleteChatMessage
} from '@/utils/apiHelpers';
import { searchWeb, streamChatMessageWebSocket, generateChatTitle } from '@/hooks/useApi';
import { useModels } from '@/hooks/useModels';
import { useAuth } from '@/contexts/AuthContext';

interface ChatContextValue {
  sessions: ChatSession[];
  activeSessionId: string;
  models: ModelOption[];
  settings: AppSettings;
  isSending: boolean;
  typingIndicator: boolean;
  error?: string;
  modelLatency: Record<string, number>;
  setActiveSession: (id: string) => void;
  createSession: (modelId?: string, zygId?: string) => void;
  deleteSession: (id: string) => void;
  updateMessage: (sessionId: string, messageId: string, content: string) => void;
  deleteMessage: (sessionId: string, messageId: string) => void;
  renameSession: (id: string, title: string) => void;
  updateSessionModel: (sessionId: string, modelId: string) => void;
  updateSessionZyg: (sessionId: string, zygId: string | null) => void;
  sendMessage: (
    content: string,
    modelId: string,
    options?: { useWebSearch?: boolean; images?: string[]; attachedFiles?: any[]; tools?: any[]; selectedApiTools?: string[] }
  ) => Promise<void>;
  stopGeneration: () => void;
  updateSettings: (settings: AppSettings) => void;
  exportSessions: (format: 'json' | 'text') => string;
  clearAllSessions: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const playDing = () => {
  try {
    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gainNode.gain.value = 0.08;
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.15);
    oscillator.onended = () => {
      audioContext.close().catch(() => undefined);
    };
  } catch {
    // Ignore audio errors (e.g., blocked autoplay).
  }
};

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>  {
  const initialSessions = loadSessions();
  const [sessions, setSessions] = useState<ChatSession[]>(() => initialSessions);
  const sessionsRef = useRef(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const saved = loadActiveSessionId();
    if (saved && initialSessions.some((session) => session.id === saved)) {
      return saved;
    }
    return initialSessions[0]?.id ?? '';
  });
  const [isSending, setIsSending] = useState(false);
  const [typingIndicator, setTypingIndicator] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [modelLatency, setModelLatency] = useState<Record<string, number>>({});
  const streamingMessageId = useRef<string | null>(null);
  const streamingBuffer = useRef<string>('');
  const reasoningBuffer = useRef<string>('');
  const isInitialSyncDone = useRef(false);
  const { user } = useAuth();

    // Persist sessions and settings to local storage for instant reloads.
    useEffect(() => {
      saveSessions(sessions);
    }, [sessions]);

    useEffect(() => {
      if (activeSessionId) {
        saveActiveSessionId(activeSessionId);
      }
    }, [activeSessionId]);

    useEffect(() => {
      saveSettings(settings);
      document.documentElement.classList.toggle('dark', settings.theme.mode === 'dark' || settings.theme.mode === 'oled');
      document.documentElement.classList.toggle('oled', settings.theme.mode === 'oled');
    }, [settings]);

    // Sync sessions from server when user logs in
    useEffect(() => {
      if (!user) {
        isInitialSyncDone.current = false;
        return;
      }

      if (isInitialSyncDone.current) return;

      const syncFromServer = async () => {
        try {
          const serverSessionsList = await fetchChatSessions();
          const serverIds = new Set(serverSessionsList.map(s => s.id));
          // Fetch full sessions in parallel
          const fullServerSessions = await Promise.all(
            serverSessionsList.map(async (s) => {
              try {
                return await fetchChatSession(s.id);
              } catch (e) {
                console.error('Failed to fetch session details', e);
                return null;
              }
            })
          );
          const validServerSessions = fullServerSessions.filter((s): s is ChatSession => s !== null);
          // Preserve local sessions that are not on server (new unsynced sessions)
          const localSessions = sessionsRef.current;
          const localOnlySessions = localSessions.filter(ls => !serverIds.has(ls.id));
          // Merge: server sessions (authoritative) + local-only sessions
          const merged = [...validServerSessions, ...localOnlySessions];
          // Sort by updatedAt descending
          merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          setSessions(merged);
          saveSessions(merged);
          isInitialSyncDone.current = true;
        } catch (err) {
          console.error('Server sync failed:', err);
          // Don't mark as done so we can retry on next render if needed
        }
      };

      syncFromServer();
    }, [user]);

    const fetchedModels = useModels();
    const userPlan = user?.plan || 'free';
    const models = useMemo<ModelOption[]>(() => {
      const visible = fetchedModels
        .filter((m) => {
          const planAccess = m.planAccess || ['free', 'go', 'plus', 'beta'];
          if (!planAccess.includes(userPlan)) {
            return false;
          }
          return true;
        })
        .filter((m) => !m.hiddenFromChat)
        .map((m) => ({
          id: m.id,
          label: m.label || m.name,
          description: m.description || m.name,
          contextLength: m.contextLength || '4k',
          speedHint: m.speedHint || 'Fast',
          pricing: m.pricing || 'Free',
          provider: m.provider as Provider
        }));
      return visible.length > 0 ? visible : DEFAULT_MODELS;
    }, [fetchedModels, userPlan]);

    // Model version synchronization hook
    // Fetch model info on bootstrap to detect endpoint/model changes and force a reload if needed
    // modelInfoChecked kept for potential future use; not strictly required to read
    useEffect(() => {
      const checkModelInfo = async () => {
        try {
          const resp = await fetch('/api/model-info', { cache: 'no-store' });
          if (!resp.ok) throw new Error('Model info fetch failed');
          const data = await resp.json();
          const current = typeof data?.version === 'string' ? data.version : null;
          if (!current) return;
          const cached = localStorage.getItem('model_version');
          // If version changed, force a lightweight reload of model client state
          if (cached !== current) {
            localStorage.setItem('model_version', current);
            // Trigger a reload by resetting sessions/state that depend on model
            // We clear relevant caches by forcing a new session to be created and clearing model latency cache
            setSessions((prev) => {
              // no-op here since we can't access setSessions from here, but we can emit a global flag
              return prev;
            });
            // Inform user via console and let downstream logic reload model on next actions
            console.info('[ModelSync] Model version changed. New:', current);
            // If you have a dedicated reload function, call it here. As a safe default, we'll refresh the page to ensure a clean state.
            // Note: Avoid full page reload in production; this is a conservative fallback.
            // window.location.reload();
          } else {
            console.info('[ModelSync] Model version unchanged:', current);
          }
        } catch (err) {
          console.warn('[ModelSync] Could not fetch model-info:', err);
        } finally {
          // no-op
        }
      };
      checkModelInfo();
      return () => {
        // no cleanup needed
      };
    }, []);

    useEffect(() => {
      if (!activeSessionId) return;
      const exists = sessions.some((session) => session.id === activeSessionId);
      if (!exists && sessions.length > 0) {
        setActiveSessionId(sessions[0].id);
      }
    }, [activeSessionId, sessions]);

    const updateSession = useCallback((updatedSession: ChatSession) => {
      setSessions((prev) =>
        prev.map((session) => (session.id === updatedSession.id ? updatedSession : session))
      );
    }, []);

    const setActiveSession = (id: string) => setActiveSessionId(id);

    const createSession = useCallback((modelId?: string) => {
      const newSession: ChatSession = {
        id: createId(),
        title: 'New chat',
        modelId: modelId || settings.preferredModelId || 'claude-sonnet-4-6', // Fallback to a default model
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
      };
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      createChatSession(newSession.title, newSession.modelId, newSession.id).catch(console.error);
    }, [settings.preferredModelId, createChatSession]);

    useEffect(() => {
      if (sessions.length > 0) return;
      createSession();
    }, [sessions.length, createSession]);

  const deleteSession = useCallback((id: string) => {
    setSessions((prev) => {
      const newSessions = prev.filter((session) => session.id !== id);
      setActiveSessionId((currentActive) => {
        if (currentActive === id) {
          return newSessions[0]?.id ?? '';
        }
        return currentActive;
      });
      return newSessions;
    });
    deleteChatSession(id).catch(console.error);
  }, [deleteChatSession]);

  const renameSession = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, title, updatedAt: new Date().toISOString() } : session
      )
    );
    updateChatSession(id, { title }).catch(console.error);
  }, [updateChatSession]);

  const updateMessage = useCallback((sessionId: string, messageId: string, content: string, reasoning?: string) => {
    try {
      const cleanContent = cleanResponseContent(content);
      const isStreaming = streamingMessageId.current === messageId;

      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== sessionId) return s;
          return {
            ...s,
            messages: s.messages.map((m) => {
              if (m.id !== messageId) return m;
              const updated = {
                ...m,
                content: cleanContent,
                edited: true,
                ...(reasoning !== undefined ? { reasoning_content: reasoning } : {})
              };
              return updated;
            }),
            updatedAt: new Date().toISOString(),
          };
        })
      );

      // Skip server push if this is a streaming chunk update
      if (isStreaming) return;

      // Push to server
      const sess = sessionsRef.current.find((s) => s.id === sessionId);
      const msg = sess?.messages.find((m) => m.id === messageId);
      if (sess && msg) {
        const updatedMsg = {
          ...msg,
          content: cleanContent,
          edited: true,
          reasoning_content: reasoning !== undefined ? reasoning : msg.reasoning_content
        };
        saveChatMessage(sessionId, updatedMsg).catch(console.error);
      }
    } catch (e) {
      console.error('Error updating message:', e);
    }
  }, [saveChatMessage]);

   const stopGeneration = useCallback(() => {
     // Close WebSocket connection if exists
     const wsConnection = (window as any).__currentWsConnection;
     if (wsConnection && typeof wsConnection.close === 'function') {
       wsConnection.close();
     }
     // Clear streaming state
     streamingBuffer.current = '';
     reasoningBuffer.current = '';
     streamingMessageId.current = null;
     // Update UI state
     setIsSending(false);
     setTypingIndicator(false);
     // Clean up global reference
     (window as any).__currentWsConnection = undefined;
   }, []);

  const deleteMessage = useCallback((sessionId: string, messageId: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, messages: s.messages.filter((message) => message.id !== messageId), updatedAt: new Date().toISOString() }
          : s
      )
    );
    deleteChatMessage(sessionId, messageId).catch(console.error);
  }, [deleteChatMessage]);

  const updateSessionModel = useCallback((sessionId: string, modelId: string) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, modelId, updatedAt: new Date().toISOString() } : s));
    updateChatSession(sessionId, { modelId }).catch(console.error);
  }, [updateChatSession]);

  const updateSessionZyg = useCallback((sessionId: string, zygId: string | null) => {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, zygId, updatedAt: new Date().toISOString() } as ChatSession : s));
    updateChatSession(sessionId, { zygId } as any).catch(console.error);
  }, [updateChatSession]);

  const appendMessage = useCallback((sessionId: string, message: Message) => {
    try {
      const cleanMessage = {
        ...message,
        content: typeof message.content === 'string'
          ? cleanResponseContent(message.content)
          : message.content
      };
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session;
          return {
            ...session,
            messages: [...session.messages, cleanMessage],
            updatedAt: new Date().toISOString(),
          };
        })
      );
      saveChatMessage(sessionId, cleanMessage).catch(console.error);
    } catch (e) {
      console.error('Error appending message:', e);
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session;
          return {
            ...session,
            messages: [...session.messages, message],
            updatedAt: new Date().toISOString(),
          };
        })
      );
    }
  }, [saveChatMessage]);


      const sendMessage = useCallback(async (
        content: string,
        modelId: string,
        options?: { useWebSearch?: boolean; images?: string[]; attachedFiles?: any[]; tools?: any[]; selectedApiTools?: string[] }
      ) => {
        const { useWebSearch = false, images = [], attachedFiles = [], tools = [], selectedApiTools = [] } = options || {};
       if (!content.trim() && images.length === 0) return;
       if (!modelId || modelId === '') {
         setError('Please select a model first');
         return;
       }
       let session = sessions.find((item) => item.id === activeSessionId);
       if (!session) {
         const newSession: ChatSession = {
           id: createId(),
           title: 'New chat',
           modelId,
           createdAt: new Date().toISOString(),
           updatedAt: new Date().toISOString(),
           messages: []
         };
         setSessions((prev) => [newSession, ...prev]);
         setActiveSessionId(newSession.id);
         session = newSession;
       }

       setError(undefined);
       setIsSending(true);
       setTypingIndicator(true);

       const userMessage: Message = {
         id: createId(),
         role: 'user',
         content,
         createdAt: new Date().toISOString(),
         ...(images.length > 0 ? { userImages: images } : {}),
         ...(attachedFiles.length > 0 ? { attachedFiles } : {})
       };

       let searchResults: SearchResult[] = [];
       let searchImages: SearchImage[] = [];
       let searchResultsText = '';

       if (useWebSearch) {
         try {
           const { results, images } = await searchWeb(content.trim());
           searchResults = results;
           searchImages = images;
           searchResultsText = results
             .slice(0, 5)
             .map(
               (result, index) =>
                 `${index + 1}. ${result.title}\n${result.url}\n${result.snippet ?? ''}`
             )
             .join('\n\n');
         } catch (err) {
           const message = err instanceof Error ? err.message : 'Web search failed.';
           setError(message);
         }
       }

        const updatedMessages = [...session.messages, userMessage];
        updateSession({ ...session, messages: updatedMessages, updatedAt: new Date().toISOString(), modelId });
        // Save user message to server
        saveChatMessage(session.id, userMessage).catch(console.error);

       try {
          const model = models.find((item) => item.id === modelId) ?? models[0];
          if (model) {
            (model as any).supports_vision = true;
          }
         if (!model) {
           setError('No model available. Please refresh the page.');
           setIsSending(false);
           return;
         }
         const searchContextMessage = searchResultsText
           ? {
               id: createId(),
               role: 'system' as const,
               content: `Use these web sources to answer:\n${searchResultsText}`,
               createdAt: new Date().toISOString()
             }
           : null;

           // Create empty assistant message for streaming
           const aiMessageId = createId();
           streamingMessageId.current = aiMessageId;
           streamingBuffer.current = '';
           reasoningBuffer.current = '';
           const aiMessageBase: Message = {
             id: aiMessageId,
             role: 'assistant',
             content: '',
             createdAt: new Date().toISOString(),
             sources: searchResults.length ? searchResults : undefined,
             images: searchImages.length ? searchImages : undefined,
             reasoning_content: ''
           };
           appendMessage(session.id, aiMessageBase);

          const allMessages = searchContextMessage
            ? [...updatedMessages.slice(0, -1), searchContextMessage, userMessage]
            : updatedMessages;

const streamStart = performance.now();
          
          // Use WebSocket streaming
          const wsConnection = streamChatMessageWebSocket(
            {
              provider: model.provider as Provider,
              model: model.id,
              messages: allMessages,
              settings,
              zygId: (session as any).zygId,
               tools,
               selectedApiTools,
               sessionId: activeSessionId
            } as any,
            {
              onChunk: (chunk) => {
                streamingBuffer.current += chunk;
                updateMessage(session.id, aiMessageId, streamingBuffer.current);
              },
              onReasoningChunk: (chunk) => {
                reasoningBuffer.current += chunk;
                updateMessage(session.id, aiMessageId, streamingBuffer.current, reasoningBuffer.current);
              },
               onComplete: (fullMessage) => {
                 streamingMessageId.current = null; // clear streaming flag before final update
                 const finalContent = searchResultsText
                   ? `AI interpretation (from sources):\n${fullMessage}`
                   : fullMessage;
                 // Include accumulated reasoning if any
                 const finalReasoning = reasoningBuffer.current || undefined;
                 updateMessage(session.id, aiMessageId, finalContent, finalReasoning);
                 streamingBuffer.current = '';
                 reasoningBuffer.current = '';
               },
              onError: (err) => {
                setError(err.message);
                setIsSending(false);
                setTypingIndicator(false);
                streamingBuffer.current = '';
                streamingMessageId.current = null;
              },
              onDone: async () => {
                setIsSending(false);
                setTypingIndicator(false);
                playDing();
                if (model.id) {
                  const latency = Math.round(performance.now() - streamStart);
                  setModelLatency((prev) => ({ ...prev, [model.id]: latency }));
                }
                // Auto-generate title for new chats (if still default)
                const current = sessionsRef.current.find(s => s.id === session.id);
                if (current && current.title === 'New chat') {
                  try {
                    const title = await generateChatTitle(model, current.messages, settings);
                    renameSession(session.id, title);
                  } catch (e) {
                    console.error('Title generation failed:', e);
                  }
                }
              }
            }
          );
          
          // Store connection for potential cancellation
          (window as any).__currentWsConnection = wsConnection;
       } catch (err) {
         const message = err instanceof Error ? err.message : 'Something went wrong.';
         setError(message);
         setIsSending(false);
         setTypingIndicator(false);
       }
       }, [activeSessionId, sessions, models, settings, createSession, updateSession, appendMessage, updateMessage, renameSession, saveChatMessage, createChatSession]);

    const updateSettings = (nextSettings: AppSettings) => {
      setSettings(nextSettings);
    };

    const exportSessions = (format: 'json' | 'text') =>
      format === 'json' ? buildChatExport(sessions) : buildTextExport(sessions);

     const clearAllSessions = () => {
       setSessions([]);
       setActiveSessionId('');
     };

      const value: ChatContextValue = {
       sessions,
       activeSessionId,
       models,
       settings,
       isSending,
       typingIndicator,
       error,
       modelLatency,
       setActiveSession,
       createSession,
         deleteSession,
         renameSession,
         updateMessage,
       deleteMessage,
       updateSessionModel,
       updateSessionZyg,
        sendMessage,
        stopGeneration,
        updateSettings,
       exportSessions,
       clearAllSessions
     };

    return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
  };

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
