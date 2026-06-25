import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Sparkles, Code, Zap, SendHorizontal, Play, Terminal, Loader2, Square, Download, History, Trash2, Plus, File, FileCode, FileJson, FileText, Layout, Paperclip, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanQuotas } from '@/hooks/usePlanQuotas';
import { useUserCampaigns } from '@/hooks/useUserCampaigns';
import { useImageAttachment } from '@/hooks/useImageAttachment';
import { API_BASE } from '@/utils/apiBase';
import CodeBlock from './CodeBlock';
import CodeInterpreterModal from './CodeInterpreterModal';
import PlanQuotaMeter from './PlanQuotaMeter';
import clsx from 'clsx';

interface VibeCoderAreaProps {
  onRequestUpgrade?: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
  name?: string;
}

interface VibeFile {
  id: string;
  name: string;
  language: string;
  content: string;
  updatedAt: number;
}

interface VibeSession {
  id: string;
  title: string;
  name?: string;
  messages: Message[];
  files?: Record<string, VibeFile>;
  updatedAt: number;
}

interface VibeModelOption {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  limits?: {
    inputLimit?: string | number;
    outputLimit?: string | number;
    dailyLimit?: string | number;
  };
}

const VIBE_SESSIONS_KEY = 'zygai:vibe_sessions';
const VIBE_SELECTED_MODEL_KEY = 'zygai:vibe_selected_model';
const DAYS_90_MS = 90 * 24 * 60 * 60 * 1000;

const VibeCoderArea: React.FC<VibeCoderAreaProps> = () => {
  const { token } = useAuth();
  const { quotas, refreshQuotas } = usePlanQuotas();
  useUserCampaigns();
  const { attachments, attach, clear: clearAttachment, clearAll: clearAllAttachments, isUploading: isUploadingImage } = useImageAttachment();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [interpreterOpen, setInterpreterOpen] = useState(false);
  const [interpreterCode, setInterpreterCode] = useState('');
  const [interpreterLang, setInterpreterLang] = useState<string>('html');

  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem(VIBE_SELECTED_MODEL_KEY) || 'zygai-ollama@@gemma4:e4b');
  const [availableModels, setAvailableModels] = useState<VibeModelOption[]>([
    { id: 'zygai-ollama@@gemma4:e4b', provider: 'zygai-ollama', modelId: 'gemma4:e4b', name: 'Gemma 4 (ZygAI Native)' }
  ]);


  const wsRef = useRef<WebSocket | null>(null);

  const [vibeSessions, setVibeSessions] = useState<VibeSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>('code');
  const [mobileView, setMobileView] = useState<'chat' | 'workspace'>('chat');
  const [projectFiles, setProjectFiles] = useState<Record<string, VibeFile>>({});
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeFileName === null && Object.keys(projectFiles).length > 0) {
      const files = Object.keys(projectFiles);
      if (files.includes('index.html')) setActiveFileName('index.html');
      else if (files.includes('main.py')) setActiveFileName('main.py');
      else if (files.includes('script.js')) setActiveFileName('script.js');
      else setActiveFileName(files[0]);
    }
  }, [projectFiles, activeFileName]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/feature-models`).then(r => r.json()),
      fetch(`${API_BASE}/model-limits`).then(r => r.json()).catch(() => ({ limits: [] }))
    ])
      .then(([featureData, limitsData]) => {
        const setting = featureData?.settings?.find((x: any) => x.featureKey === 'vibe_coder');
        const rawOptions = Array.isArray(setting?.modelOptions) && setting.modelOptions.length
          ? setting.modelOptions
          : (Array.isArray(setting?.modelIds) && setting.modelIds.length
            ? setting.modelIds.map((modelId: string) => ({ provider: setting.provider || 'zygai-ollama', modelId }))
            : (setting?.modelId ? [{ provider: setting.provider || 'zygai-ollama', modelId: setting.modelId }] : []));
        
        // Build map of model_id -> vibe_coder_limit
        const vibeLimitsMap: Record<string, number | null> = {};
        (limitsData.limits || []).forEach((limit: any) => {
          vibeLimitsMap[limit.model_id] = limit.vibe_coder_limit;
        });
        
        const models = rawOptions
          .map((option: any) => ({
            provider: typeof option?.provider === 'string' && option.provider.trim() ? option.provider.trim() : 'zygai-ollama',
            modelId: typeof option?.modelId === 'string' ? option.modelId.trim() : '',
            name: typeof option?.label === 'string' && option.label.trim() ? option.label.trim() : '',
            limits: {
              inputLimit: option.inputLimit || option.inputTokenLimit || 'Unlimited',
              outputLimit: option.outputLimit || option.outputTokenLimit || 'Unlimited',
              dailyLimit: option.dailyLimit || option.dailyRequestLimit || 'Unlimited'
            }
          }))
          .filter((option: { provider: string; modelId: string; name: string; limits?: any }) => option.modelId)
          .map((option: { provider: string; modelId: string; name: string; limits?: any }) => {
            // Override dailyLimit with vibe_coder_limit if available
            const vibeLimit = vibeLimitsMap[option.modelId];
            if (vibeLimit !== null && vibeLimit !== undefined) {
              option.limits.dailyLimit = vibeLimit;
            }
            return {
              ...option,
              id: `${option.provider}@@${option.modelId}`,
              name: option.name || `${option.modelId} (${option.provider})`
            };
          });
        if (models.length > 0) {
          setAvailableModels(models);
          const defaultId = `${setting?.provider || models[0].provider}@@${setting?.modelId || models[0].modelId}`;
          const savedId = localStorage.getItem(VIBE_SELECTED_MODEL_KEY);
          if (savedId && models.some((model: VibeModelOption) => model.id === savedId)) {
            setSelectedModel(savedId);
          } else {
            setSelectedModel(models.some((model: VibeModelOption) => model.id === defaultId) ? defaultId : models[0].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem(VIBE_SELECTED_MODEL_KEY, selectedModel);
  }, [selectedModel]);

  const extractArtifacts = useCallback((content: string, existingFiles: Record<string, VibeFile> = {}) => {
    const matches = Array.from(content.matchAll(/```([\w.-]+)?(?:\s+([\w.-]+))?\n([\s\S]*?)```/g));
    const newFiles = { ...existingFiles };
    const now = Date.now();

    matches.forEach((match, idx) => {
      const lang = match[1] || 'code';
      let filename = match[2];
      const codeContent = match[3];

      if (!filename) {
        const firstLine = codeContent.split('\n')[0].trim();
        const commentMatch = firstLine.match(/^(?:\/\/|#|<!--|\/\*)\s*([\w.-]+\.\w+)\s*(?:-->|\*\/)?$/);
        if (commentMatch) {
          filename = commentMatch[1];
        }
      }

      const langLower = lang.toLowerCase();
      if (!filename) {
        if (langLower === 'python' || langLower === 'py') filename = 'main.py';
        else if (langLower === 'javascript' || langLower === 'js') filename = 'script.js';
        else if (langLower === 'html') filename = 'index.html';
        else if (langLower === 'css') filename = 'style.css';
        else filename = `artifact-${idx + 1}.${langLower === 'code' ? 'txt' : langLower}`;
      }

      newFiles[filename] = {
        id: filename,
        name: filename,
        language: lang,
        content: codeContent,
        updatedAt: now
      };
    });

    return newFiles;
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(VIBE_SESSIONS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const filtered = parsed.filter((s: any) => Date.now() - s.updatedAt < DAYS_90_MS);
        setVibeSessions(filtered);
      } catch (e) {
        console.error('Failed to load vibe sessions', e);
      }
    }
  }, []);

  const saveSessions = (sessions: VibeSession[]) => {
    localStorage.setItem(VIBE_SESSIONS_KEY, JSON.stringify(sessions));
  };

  const startNewVibe = () => {
    setActiveSessionId(null);
    setMessages([]);
    setProjectFiles({});
    setActiveFileName(null);
    setInput('');
  };

  const loadVibeSession = (session: VibeSession) => {
    setActiveSessionId(session.id);
    setMessages(session.messages);
    setProjectFiles(session.files || {});
    setActiveFileName(null);
    setShowHistory(false);
  };

  const deleteVibeSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = vibeSessions.filter(s => s.id !== id);
    setVibeSessions(updated);
    saveSessions(updated);
    if (activeSessionId === id) startNewVibe();
  };

  const handleSend = async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (isGenerating) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      images: attachments.map(a => a.url)
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setIsGenerating(true);
    clearAllAttachments();

    let sessionId = activeSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      setActiveSessionId(sessionId);
    }

    try {
      const wsBase = API_BASE.startsWith('http')
        ? API_BASE.replace(/^http/, 'ws')
        : `${window.location.protocol.replace('http', 'ws')}//${window.location.host}${API_BASE}`;
      const wsUrl = `${wsBase}/chat/ws?token=${encodeURIComponent(token || '')}&vibe=true`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      let assistantContent = '';
      const assistantId = (Date.now() + 1).toString();

      ws.onopen = () => {
        ws.send(JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content, images: m.images })),
          model: selectedModel
        }));
      };

      ws.onclose = () => {
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chunk') {
          assistantContent += data.content;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.id === assistantId) {
              return [...prev.slice(0, -1), { ...last, content: assistantContent }];
            }
            return [...prev, { id: assistantId, role: 'assistant', content: assistantContent }];
          });
        } else if (data.type === 'done') {
          setIsGenerating(false);
          refreshQuotas();

          setProjectFiles(prev => {
            const finalFiles = extractArtifacts(assistantContent, prev);

            const updatedSession: VibeSession = {
              id: sessionId!,
              title: newMessages[0].content.slice(0, 40) + '...',
              messages: [...newMessages, { id: assistantId, role: 'assistant', content: assistantContent }],
              files: finalFiles,
              updatedAt: Date.now()
            };

            setVibeSessions(prevSessions => {
              const idx = prevSessions.findIndex(s => s.id === sessionId);
              let updated;
              if (idx >= 0) {
                updated = [...prevSessions];
                updated[idx] = updatedSession;
              } else {
                updated = [updatedSession, ...prevSessions];
              }
              saveSessions(updated);
              return updated;
            });

            return finalFiles;
          });
        } else if (data.type === 'error') {
          setIsGenerating(false);
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${data.error || data.content || 'Unknown error'}` }]);
        }
      };

      ws.onerror = () => {
        setIsGenerating(false);
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: 'Connection error. Please try again.' }]);
      };

    } catch (err) {
      setIsGenerating(false);
      console.error(err);
    }
  };

  const stopGeneration = () => {
    if (wsRef.current) {
      wsRef.current.close();
      setIsGenerating(false);
    }
  };

  const enhancePrompt = async () => {
    if (!input.trim() || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const wsBase = API_BASE.startsWith('http')
        ? API_BASE.replace(/^http/, 'ws')
        : `${window.location.protocol.replace('http', 'ws')}//${window.location.host}${API_BASE}`;
      const wsUrl = `${wsBase}/chat/ws?token=${encodeURIComponent(token || '')}&vibe=true`;
      const ws = new WebSocket(wsUrl);

      let result = '';

      ws.onopen = () => {
        ws.send(JSON.stringify({
          model: selectedModel,
          messages: [{
            role: 'user',
            content: `You are a prompt engineer. Rewrite the following vague or short app idea into a clear, detailed, well-structured prompt for an AI code generator. Keep it concise but specific — include UI details, features, and tech if implied. Return ONLY the improved prompt, nothing else.\n\nOriginal: ${input}`
          }]
        }));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'chunk') {
          result += data.content;
        } else if (data.type === 'done') {
          if (result.trim()) setInput(result.trim());
          setIsEnhancing(false);
          ws.close();
        } else if (data.type === 'error') {
          setIsEnhancing(false);
          ws.close();
        }
      };

      ws.onerror = () => setIsEnhancing(false);
      ws.onclose = () => setIsEnhancing(false);
    } catch (e) {
      console.error('Enhance failed', e);
      setIsEnhancing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => attach(file));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleCodeChange = (filename: string, newCode: string) => {
    setProjectFiles(prev => ({
      ...prev,
      [filename]: { ...prev[filename], content: newCode, updatedAt: Date.now() }
    }));
  };

  const openInterpreter = (code: string, lang: string) => {
    setInterpreterCode(code);
    setInterpreterLang(lang);
    setInterpreterOpen(true);
  };

  const handleDownloadZip = async () => {
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    Object.values(projectFiles).forEach(file => {
      zip.file(file.name, file.content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zygai-project-${activeSessionId || 'export'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const latestArtifacts = useMemo(() => {
    return Object.values(projectFiles).sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projectFiles]);

  const combinedPreviewCode = useMemo(() => {
    const htmlFile = projectFiles['index.html']?.content || '';
    const cssFile = projectFiles['style.css']?.content || '';
    const jsFile = projectFiles['script.js']?.content || '';

    if (htmlFile) {
      let combined = htmlFile;
      if (cssFile && !htmlFile.includes('<style')) {
        combined = combined.replace('</head>', `<style>${cssFile}</style></head>`);
      }
      if (jsFile && !htmlFile.includes('<script')) {
        combined = combined.replace('</body>', `<script>${jsFile}</script></body>`);
      }
      return combined;
    }

    // Fallback to active file if no index.html
    const active = latestArtifacts.find(f => f.name === activeFileName);
    if (active?.language === 'html') return active.content;
    
    return '';
  }, [projectFiles, activeFileName, latestArtifacts]);

  const previewLang = useMemo(() => {
    if (projectFiles['index.html']) return 'html';
    const active = latestArtifacts.find(f => f.name === activeFileName);
    return active?.language || 'html';
  }, [projectFiles, activeFileName, latestArtifacts]);

  const renderHistoryDropdown = () => (
    <div 
      className="absolute top-full right-0 mt-2 w-72 rounded-2xl border border-ink-200 bg-white p-2 shadow-xl z-50 dark:border-ink-800 dark:bg-ink-900"
    >
      <div className="flex items-center justify-between p-2 mb-2 border-b border-ink-100 dark:border-ink-800">
        <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">Recent Vibes</span>
        <button onClick={startNewVibe} className="text-[10px] font-bold text-saffron-500 hover:text-saffron-600 uppercase tracking-widest">New</button>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-1">
        {vibeSessions.length === 0 ? (
          <div className="p-4 text-center text-xs text-ink-400 italic">No history found</div>
        ) : (
          vibeSessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => loadVibeSession(s)}
              className={clsx(
                "group flex items-center justify-between rounded-xl px-3 py-2 text-sm cursor-pointer transition",
                activeSessionId === s.id ? "bg-saffron-50 text-saffron-900 dark:bg-saffron-900/20 dark:text-saffron-400" : "text-ink-600 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800"
              )}
            >
              <div className="flex-1 min-w-0 mr-2">
                <p className="truncate font-medium">{s.title || 'Untitled Vibe'}</p>
                <p className="text-[10px] opacity-60">{new Date(s.updatedAt).toLocaleDateString()}</p>
              </div>
              <button 
                onClick={(e) => deleteVibeSession(e, s.id)}
                className="p-1 opacity-0 group-hover:opacity-100 text-ink-400 hover:text-red-500 transition-opacity"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );

  if (messages.length === 0 && Object.keys(projectFiles).length === 0) {
    return (
      <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg)] p-4 sm:p-6 overflow-y-auto">
        <div className="absolute top-4 right-4 lg:right-6 z-10">
          <div className="relative" ref={historyRef}>
            <button 
              onClick={() => setShowHistory(!showHistory)} 
              className="flex items-center gap-2 rounded-xl bg-white/80 backdrop-blur px-4 py-2.5 text-xs font-bold uppercase tracking-widest text-ink-600 shadow-sm transition hover:bg-white dark:bg-ink-800/80 dark:text-ink-200 dark:hover:bg-ink-800"
            >
              <History size={14} /> History
            </button>
            {showHistory && renderHistoryDropdown()}
          </div>
        </div>
        <div className="w-full max-w-3xl rounded-3xl border border-ink-200 bg-white p-3 sm:p-10 text-center shadow-lg sm:shadow-2xl dark:border-ink-800 dark:bg-ink-950">
          <div className="mx-auto mb-2 sm:mb-6 relative flex h-10 w-10 sm:h-20 sm:w-20 items-center justify-center rounded-xl sm:rounded-3xl bg-gradient-to-br from-saffron-400 to-saffron-600 shadow-lg dark:from-ink-100 dark:to-white dark:shadow-none">
            <div className="absolute inset-0 rounded-xl sm:rounded-3xl bg-saffron-400/30 animate-ping dark:bg-white/10" style={{ animationDuration: '2s' }} />
            <Code className="text-ink-900 relative z-10 dark:text-black" size={40} />
          </div>
          <h1 className="mb-0.5 sm:mb-3 font-display text-base sm:text-4xl font-bold text-ink-900 dark:text-ink-50">Vibe Coder</h1>
          <p className="mb-2 sm:mb-8 text-[10px] sm:text-lg text-ink-500 dark:text-ink-300 px-2">Describe what you want to build.</p>
          <PlanQuotaMeter quota={quotas.vibe_coder} className="mx-auto mb-2 max-w-sm text-left scale-[0.7] origin-center sm:scale-100" />
          <div className="relative mx-auto max-w-2xl">
            <textarea 
              name="vibe-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="e.g., Build an app..."
              className="w-full rounded-xl sm:rounded-2xl border border-ink-200 bg-ink-50/80 p-2 sm:p-5 pb-12 sm:pb-16 pr-10 sm:pr-14 text-xs sm:text-base shadow-inner transition-all focus:border-saffron-400 focus:outline-none focus:ring-2 focus:ring-saffron-400/30 focus:bg-white dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50 dark:focus:bg-ink-900 min-h-[80px] sm:min-h-[140px] resize-none"
            />
        {attachments.length > 0 && (
          <div className="absolute top-2 right-2 sm:top-4 sm:right-5 flex flex-wrap gap-1 sm:gap-2 pointer-events-none">
            {attachments.map((att, idx) => (
              <div key={idx} className="relative pointer-events-auto group">
                <img src={att.previewUrl || att.url} alt="preview" className="h-6 w-6 sm:h-10 sm:w-10 object-cover rounded-md border border-ink-200 dark:border-ink-700 shadow-sm" />
                <button 
                  onClick={() => clearAttachment(idx)}
                  className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={8} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-5 z-10 flex items-center gap-1 sm:gap-2 max-w-[calc(100%-3rem)] sm:max-w-none">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploadingImage || isGenerating}
            className="flex items-center justify-center rounded-lg bg-ink-100 p-1.5 sm:px-2 sm:py-1.5 text-ink-700 transition hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700 disabled:opacity-50 shrink-0"
            title="Attach Image"
          >
            {isUploadingImage ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
          </button>
          <button
            onClick={enhancePrompt}
            disabled={!input.trim() || isEnhancing || isGenerating}
            className="flex items-center justify-center rounded-lg bg-violet-100 p-1.5 sm:px-2 sm:py-1.5 text-violet-700 transition hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50 disabled:opacity-40 shrink-0"
            title="Enhance prompt with AI"
          >
            {isEnhancing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          </button>
          <select
            name="vibe-model-select"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="rounded-lg border-none bg-ink-100 px-2 py-1.5 text-[10px] sm:text-xs font-semibold text-ink-700 transition hover:bg-ink-200 focus:ring-2 focus:ring-saffron-400/20 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700 cursor-pointer min-w-0 max-w-[140px] sm:max-w-[220px] truncate"
          >
            {availableModels.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
            <button 
            onClick={isGenerating ? stopGeneration : handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isGenerating}
            className={clsx(
              "absolute bottom-1.5 right-1.5 sm:bottom-4 sm:right-4 z-10 rounded-lg sm:rounded-xl p-1.5 sm:p-3 shadow-sm transition-all duration-150 disabled:opacity-50 hover:scale-105 active:scale-95",
              isGenerating ? "bg-red-500 text-white hover:bg-red-600" : "bg-saffron-500 text-ink-900 hover:bg-saffron-600 shadow-saffron-200/50 dark:shadow-none"
            )}
            >
            {isGenerating ? <Square size={16} className="sm:hidden" fill="currentColor" /> : <SendHorizontal size={16} className="sm:hidden" />}{isGenerating ? <Square size={22} fill="currentColor" className="hidden sm:block" /> : <SendHorizontal size={22} className="hidden sm:block" />}
            </button>
          </div>

          <div className="mx-auto mt-4 sm:mt-12 grid max-w-2xl gap-2 sm:gap-4 grid-cols-3">
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 sm:p-4 text-left dark:border-ink-800 dark:bg-ink-950/50 transition-all hover:border-saffron-300 hover:shadow-md dark:hover:border-saffron-700/50 cursor-default">
              <Zap className="mb-1.5 sm:mb-2 text-saffron-500" size={20} />
              <h3 className="text-[11px] sm:text-sm font-semibold text-ink-900 dark:text-ink-50">Rapid Prototyping</h3>
              <p className="mt-0.5 text-[10px] sm:text-xs text-ink-500">Build lively, interactive apps.</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 sm:p-4 text-left dark:border-ink-800 dark:bg-ink-950/50 transition-all hover:border-saffron-300 hover:shadow-md dark:hover:border-saffron-700/50 cursor-default">
              <Terminal className="mb-1.5 sm:mb-2 text-saffron-500" size={20} />
              <h3 className="text-[11px] sm:text-sm font-semibold text-ink-900 dark:text-ink-50">Web Development</h3>
              <p className="mt-0.5 text-[10px] sm:text-xs text-ink-500">Create responsive UI pages.</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3 sm:p-4 text-left dark:border-ink-800 dark:bg-ink-950/50 transition-all hover:border-saffron-300 hover:shadow-md dark:hover:border-saffron-700/50 cursor-default">
              <Sparkles className="mb-1.5 sm:mb-2 text-saffron-500" size={20} />
              <h3 className="text-[11px] sm:text-sm font-semibold text-ink-900 dark:text-ink-50">Data Visualization</h3>
              <p className="mt-0.5 text-[10px] sm:text-xs text-ink-500">Analyze complex datasets.</p>
            </div>
          </div>

          {/* Templates */}
          <div className="mx-auto mt-4 sm:mt-6 w-full max-w-2xl">
            <p className="mb-2 sm:mb-3 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-ink-400 dark:text-ink-500">
              Start from a template
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { emoji: '🧮', label: 'Calculator', prompt: 'Build a sleek calculator app with keyboard support and a clean modern UI.' },
                { emoji: '✅', label: 'Todo App', prompt: 'Build a todo list app with add, complete, and delete functionality. Include local storage persistence.' },
                { emoji: '🌦️', label: 'Weather Card', prompt: 'Build a beautiful weather card UI with temperature, humidity, wind speed, and a 5-day forecast section.' },
                { emoji: '⏱️', label: 'Pomodoro Timer', prompt: 'Build a Pomodoro timer with 25min work and 5min break cycles, sound notification, and session counter.' },
                { emoji: '🎨', label: 'Color Palette', prompt: 'Build a color palette generator that creates harmonious color schemes and lets you copy HEX/RGB values.' },
                { emoji: '📊', label: 'Dashboard', prompt: 'Build a modern analytics dashboard with charts, KPI cards, and a sidebar navigation. Use dummy data.' },
              ].map(({ emoji, label, prompt }) => (
                <button
                  key={label}
                  onClick={() => { setInput(prompt); }}
                  className="flex items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 py-2.5 text-left transition-all hover:border-saffron-300 hover:shadow-md hover:scale-[1.02] active:scale-[0.98] dark:border-ink-800 dark:bg-ink-900 dark:hover:border-saffron-700/50 group"
                >
                  <span className="text-lg shrink-0">{emoji}</span>
                  <span className="text-[11px] sm:text-xs font-semibold text-ink-700 dark:text-ink-300 group-hover:text-saffron-600 dark:group-hover:text-saffron-400 transition-colors">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full flex-1 overflow-hidden bg-[var(--bg)] lg:flex-row">
      {/* Mobile view switcher */}
      <div className="flex border-b border-ink-200 bg-white p-1 lg:hidden dark:border-ink-800 dark:bg-ink-900">
        <button
          onClick={() => setMobileView('chat')}
          className={clsx("flex-1 rounded-lg py-2 text-sm font-bold transition", mobileView === 'chat' ? "bg-saffron-500 text-ink-900" : "text-ink-500")}
        >
          Chat
        </button>
        <button
          onClick={() => setMobileView('workspace')}
          className={clsx("flex-1 rounded-lg py-2 text-sm font-bold transition", mobileView === 'workspace' ? "bg-saffron-500 text-ink-900" : "text-ink-500")}
        >
          Workspace
        </button>
      </div>

      {/* Left Panel: Chat */}
      <div className={clsx("flex w-full flex-col border-r border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-900 lg:w-1/3 lg:min-w-[350px] lg:max-w-[500px]", mobileView !== 'chat' && "hidden lg:flex")}>
        <div className="flex items-center justify-between border-b border-ink-100 p-4 dark:border-ink-800">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-saffron-400 to-saffron-600 shadow-sm">
              <Sparkles className="text-ink-900" size={14} />
            </div>
            <h2 className="font-display font-semibold text-ink-900 dark:text-ink-50">Vibe Coder</h2>
          </div>
        <div className="flex items-center gap-2">
          <PlanQuotaMeter quota={quotas.vibe_coder} compact className="hidden xl:block" />
          <select
            name="vibe-model-select-sidebar"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className="rounded-lg border-none bg-ink-50 px-2 py-1.5 text-xs font-semibold text-ink-600 transition hover:bg-ink-100 focus:ring-2 focus:ring-saffron-400/20 dark:bg-ink-950 dark:text-ink-300 dark:hover:bg-ink-800 cursor-pointer max-w-[150px]"
          >
            {availableModels.map((m: any) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <button 
            onClick={startNewVibe} 
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 active:scale-95 dark:hover:bg-ink-800 dark:hover:text-ink-200"
            title="New Vibe"
          >
            <Plus size={13} /> <span className="hidden sm:inline">New</span>
          </button>
          <div className="relative" ref={historyRef}>
            <button 
              onClick={() => setShowHistory(!showHistory)} 
              className="flex items-center gap-2 rounded-xl p-2 text-xs font-semibold text-ink-400 transition hover:bg-ink-50 hover:text-ink-600 dark:hover:bg-ink-800 dark:hover:text-ink-200"
              title="History"
            >
              <History size={14} />
            </button>
            {showHistory && renderHistoryDropdown()}
          </div>
        </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {messages.map(msg => (
            <div key={msg.id} className={clsx("flex flex-col", msg.role === 'user' ? "items-end" : "items-start")}>
              {msg.role === 'assistant' ? (
              <div className="w-full text-sm text-ink-800 dark:text-ink-200 whitespace-pre-wrap chat-markdown border-l-2 border-saffron-400/60 pl-3 py-0.5 bg-ink-50/50 dark:bg-ink-800/30 rounded-r-lg">
                  {msg.content.replace(/```[\s\S]*?```/g, '[Code block rendered in workspace]')}
                </div>
              ) : (
                <div className="flex flex-col items-end gap-2 max-w-[85%]">
                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 justify-end">
                      {msg.images.map((img, idx) => (
                        <img key={idx} src={img} alt="User attachment" className="h-32 w-32 object-cover rounded-lg border border-ink-200 dark:border-ink-700 shadow-sm" />
                      ))}
                    </div>
                  )}
                  {msg.content && (
                    <div className="rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 px-4 py-3 text-sm text-ink-900 shadow-md">
                      {msg.content}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {isGenerating && (
            <div className="flex items-center gap-3 text-sm text-ink-500 dark:text-ink-400 pl-1">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-saffron-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-saffron-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-saffron-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs font-medium">Vibe Coder is crafting...</span>
            </div>
          )}

        </div>

        <div className="border-t border-ink-100 p-4 dark:border-ink-800">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group">
                  <img src={att.previewUrl || att.url} alt="preview" className="h-14 w-14 object-cover rounded-lg border border-ink-200 dark:border-ink-700" />
                  <button 
                    onClick={() => clearAttachment(idx)}
                    className="absolute -top-1.5 -right-1.5 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea 
              name="vibe-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Ask for changes..."
              className="w-full rounded-xl border border-ink-200 bg-ink-50/80 py-2.5 pl-16 pr-12 text-sm shadow-inner transition-all focus:border-saffron-400 focus:outline-none focus:ring-2 focus:ring-saffron-400/30 focus:bg-white dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50 dark:focus:bg-ink-900 resize-none"
              rows={1}
            />
            <input 
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage || isGenerating}
              className="absolute bottom-3 left-3 z-10 p-1 text-ink-400 hover:text-ink-600 dark:hover:text-ink-200 transition-colors disabled:opacity-50"
              title="Attach Image"
            >
              {isUploadingImage ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
            </button>
            <button
              onClick={enhancePrompt}
              disabled={!input.trim() || isEnhancing || isGenerating}
              title="Enhance prompt with AI"
              className="absolute bottom-2.5 left-9 z-10 flex items-center justify-center rounded-lg bg-violet-100 p-1.5 text-violet-700 transition hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:hover:bg-violet-900/50 disabled:opacity-40"
            >
              {isEnhancing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            </button>
            <button 
            onClick={isGenerating ? stopGeneration : handleSend}
            disabled={(!input.trim() && attachments.length === 0) || isGenerating}
            className={clsx(
              "absolute bottom-3 right-3 z-10 rounded-lg p-2 shadow-sm transition-all duration-150 disabled:opacity-50 hover:scale-105 active:scale-95",
              isGenerating ? "bg-red-500 text-white hover:bg-red-600 shadow-red-200 dark:shadow-red-900/30" : "bg-saffron-500 text-ink-900 hover:bg-saffron-600 shadow-saffron-200 dark:shadow-saffron-900/30"
            )}
            >
            {isGenerating ? <Square size={18} fill="currentColor" /> : <SendHorizontal size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Right Panel: Code Workspace */}
      <div className={clsx("flex flex-1 flex-col bg-ink-50 dark:bg-ink-900", mobileView !== 'workspace' && "hidden lg:flex")}>
        <div className="flex items-center justify-between border-b border-ink-200 bg-white px-3 sm:px-5 py-3 dark:border-ink-800 dark:bg-ink-950">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-ink-700 dark:text-ink-200">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-saffron-400 to-saffron-600 dark:from-ink-100 dark:to-white">
                <Terminal size={13} className="text-ink-900 dark:text-black" />
              </div>
              <span className="hidden xs:inline">Workspace</span>
            </div>
            {latestArtifacts.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('code')}
                  className={clsx("px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded transition", activeTab === 'code' ? "bg-saffron-500 text-ink-900 dark:bg-ink-100 dark:text-black" : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800")}
                >
                  Code
                </button>
                <button
                  onClick={() => setActiveTab('preview')}
                  className={clsx("px-2 sm:px-3 py-1 text-[10px] sm:text-xs font-medium rounded transition", activeTab === 'preview' ? "bg-saffron-500 text-ink-900 dark:bg-ink-100 dark:text-black" : "text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800")}
                >
                  Preview
                </button>
              </div>
            )}
          </div>
          {latestArtifacts.length > 0 && activeTab === 'code' && (
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={handleDownloadZip}
                className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-ink-700 transition-all hover:bg-ink-200 active:scale-95 dark:bg-ink-800 dark:text-ink-200 hover:dark:bg-ink-700"
                title="Download ZIP"
              >
                <Download size={14} /> <span className="hidden md:inline">Download ZIP</span>
              </button>
              <button
                onClick={() => openInterpreter(combinedPreviewCode, previewLang)}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2 sm:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-700 transition-all hover:bg-emerald-200 active:scale-95 dark:bg-ink-800 dark:text-ink-100 hover:dark:bg-ink-700"
              >
                <Play size={14} fill="currentColor" /> <span className="hidden md:inline">Run {latestArtifacts.length > 1 ? 'All' : ''}</span>
                <span className="md:hidden">Run</span>
              </button>
            </div>
          )}
        </div>
        
        <div className="flex-1 flex min-h-0 overflow-hidden flex-col sm:flex-row">
          {latestArtifacts.length > 0 && activeTab === 'code' && (
            <div className="w-full sm:w-56 border-b sm:border-b-0 sm:border-r border-ink-200 bg-white p-2 sm:p-3 dark:border-ink-800 dark:bg-ink-950 overflow-x-auto sm:overflow-y-auto flex sm:flex-col gap-1 sm:block shrink-0">
              <div className="hidden sm:flex mb-4 items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-widest text-ink-400">
                <Layout size={12} /> Project Files
              </div>
              {latestArtifacts.map(file => {
                const extension = file.name.split('.').pop()?.toLowerCase();
                let Icon = File;
                if (['html', 'htm'].includes(extension || '')) Icon = Layout;
                else if (['js', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go'].includes(extension || '')) Icon = FileCode;
                else if (['json'].includes(extension || '')) Icon = FileJson;
                else if (['css'].includes(extension || '')) Icon = FileText;

                return (
                  <button
                    key={file.id}
                    onClick={() => setActiveFileName(file.name)}
                    className={clsx(
                      "flex items-center gap-2 rounded-lg px-3 sm:px-2 py-1.5 sm:py-2 text-xs sm:text-sm transition-all whitespace-nowrap sm:whitespace-normal sm:w-full hover:scale-[1.01]",
                      activeFileName === file.name 
                        ? "bg-saffron-100 text-saffron-900 dark:bg-saffron-900/30 dark:text-saffron-400 font-medium shadow-sm" 
                        : "text-ink-600 hover:bg-ink-50 dark:text-ink-400 dark:hover:bg-ink-800"
                    )}
                  >
                    <Icon size={14} className={activeFileName === file.name ? "text-saffron-500" : "text-ink-400"} />
                    <span className="truncate">{file.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex-1 overflow-auto p-3 sm:p-6">
            {latestArtifacts.length > 0 ? (
              activeTab === 'code' ? (
                <div className="mx-auto w-full max-w-5xl">
                  {latestArtifacts.map((artifact) => (
                    artifact.name === activeFileName && (
                      <div key={artifact.id} className="relative">
                        <CodeBlock
                          code={artifact.content}
                          language={artifact.language}
                          filename={artifact.name}
                          onCodeChange={(newCode) => handleCodeChange(artifact.name, newCode)}
                          onOpenInterpreter={(code, lang) => openInterpreter(code, lang)}
                        />
                      </div>
                    )
                  ))}
                  {!activeFileName && (
                    <div className="flex h-full items-center justify-center text-ink-400 dark:text-ink-600">
                      <p className="text-sm font-medium">Select a file from the sidebar to view code.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mx-auto w-full max-w-5xl">
                  <iframe
                    srcDoc={combinedPreviewCode}
                    className="w-full h-[400px] sm:h-[600px] border border-ink-200 rounded-lg dark:border-ink-700"
                    title="Live Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              )
            ) : (
              <div className="flex h-full items-center justify-center text-ink-400 dark:text-ink-600">
                <div className="text-center">
                  <Code size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-sm font-medium">Generated code will appear here.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <CodeInterpreterModal 
        isOpen={interpreterOpen} 
        onClose={() => setInterpreterOpen(false)} 
        code={interpreterCode} 
        language={interpreterLang} 
      />
    </div>
  );
};

export default VibeCoderArea;
