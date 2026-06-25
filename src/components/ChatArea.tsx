import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChatSession, ModelOption } from '@/types';
import clsx from 'clsx';
import { MoreHorizontal, Settings, Plus, Mic, Pencil, Trash2, Image as ImageIcon, Paperclip, Megaphone, Search, Sparkles, X, Bot, ChevronDown, Blocks } from 'lucide-react';
import AnnouncementDialog from './AnnouncementDialog';
import ZygStudioPublisher from './ZygStudioPublisher';
import MessageBubble from './MessageBubble';
import UsageLimitBanner from './UsageLimitBanner';
import PlanQuotaMeter from './PlanQuotaMeter';
import SpeechRecognition from 'react-speech-recognition';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanQuotas } from '@/hooks/usePlanQuotas';
import { useUserCampaigns } from '@/hooks/useUserCampaigns';
import { API_BASE } from '@/utils/apiBase';


interface ChatAreaProps {
  session?: ChatSession;
  models: ModelOption[];
  modelId: string;
   onSend: (message: string, useWebSearch?: boolean, images?: string[], attachedFiles?: any[], tools?: any[], selectedApiTools?: string[]) => void;
  isSending: boolean;
  typingIndicator: boolean;
  error?: string;
  onNewChat?: () => void;
  onOpenAccountSettings?: () => void;
  onModelChange?: (modelId: string) => void;
  onRenameSession?: (id: string, title: string) => void;
  onDeleteSession?: (id: string) => void;
  onUpdateSessionModel?: (sessionId: string, modelId: string) => void;
  onUpdateSessionZyg?: (sessionId: string, zygId: string | null) => void;
  onStopGeneration?: () => void;
  onRequestUpgrade?: () => void;
  isAdmin?: boolean;
}

interface FileType {
  id: string;
  name: string;
  url: string | null;
  sendUrl?: string;
  isImage: boolean;
  isDocument: boolean;
  size: number;
  fileType: string;
  textContent?: string;
  parsing?: boolean;
  parseError?: string;
}

interface Skill {
  id: string;
  name: string;
  description?: string;
  skill_type: string;
  config: Record<string, any>;
}

const ATTACHMENT_PREVIEW_LIMIT = 160;

const getPreviewSnippet = (text: string) =>
  text.length <= ATTACHMENT_PREVIEW_LIMIT ? text : `${text.slice(0, ATTACHMENT_PREVIEW_LIMIT)}…`;

const TypingIndicator = React.memo(({ activeZygName, activeZygIcon }: { activeZygName?: string; activeZygIcon?: string }) => (
  <div className="flex items-center gap-3 mt-4 mb-2">
    {activeZygName && (
      <div className="flex items-center gap-2 text-saffron-600 dark:text-saffron-400">
        <span className="text-lg">{activeZygIcon || '🤖'}</span>
        <span className="text-xs font-bold uppercase tracking-widest">
          {activeZygName} is responding
        </span>
      </div>
    )}
    <div className="thinking-indicator" style={{ margin: 0 }}>
      <div className="thinking-dot"></div>
      <div className="thinking-dot"></div>
      <div className="thinking-dot"></div>
    </div>
  </div>
));

const ChatArea: React.FC<ChatAreaProps> = ({
  session,
  models,
  modelId,
  onSend,
  isSending,
  typingIndicator,
  error,
  onNewChat,
  onOpenAccountSettings,
  onModelChange,
  onRenameSession,
  onDeleteSession,
  onUpdateSessionModel,
  onUpdateSessionZyg,
  onStopGeneration,
  onRequestUpgrade,
  isAdmin
}) => {
  const { token, user } = useAuth();
  const { quotas, refreshQuotas } = usePlanQuotas();
  const { campaigns, refreshCampaigns } = useUserCampaigns();
  const wasSendingRef = useRef(false);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<FileType[]>([]);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [selectedApiTools, setSelectedMcpServers] = useState<string[]>(() => {
    const saved = localStorage.getItem('zygai:selectedApiTools');
    return saved ? JSON.parse(saved) : [];
  });
  const [availableApiTools, setAvailableMcpServers] = useState<any[]>([]);
  const [usageInfo, setUsageInfo] = useState<any>(null);
  const [dismissBanner, setDismissBanner] = useState(false);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [zygs, setZygs] = useState<Skill[]>([]);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [showZygStudio, setShowZygStudio] = useState(false);

  const handleZygStudioSubmit = async (payload: any) => {
    // If publisher already created the skill on the server, accept it directly
    if (payload && payload._createdSkill) {
      setZygs((prev) => [payload._createdSkill, ...prev]);
      setShowZygStudio(false);
      return;
    }
    // Try to persist to server, fallback to local state
    try {
      if (token) {
        const res = await fetch(`${API_BASE}/personal-skills`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.skill) {
            setZygs((prev) => [data.skill, ...prev]);
            setShowZygStudio(false);
            return;
          }
        }
      }
    } catch (err) {
      console.error('Failed to create zyg on server, falling back to local', err);
    }

    // Fallback: add locally with a generated id
    const local = {
      id: `zyg-local-${Date.now()}`,
      name: payload.name || 'Untitled Zyg',
      description: payload.description || '',
      skill_type: payload.type === 'zyg' ? 'zyg' : 'prompt',
      config: {
        modelId: payload.modelId,
        icon: payload.icon,
        studio: { icon: payload.icon, iconColor: payload.iconColor },
      },
    } as Skill;
    setZygs((prev) => [local, ...prev]);
    setShowZygStudio(false);
  };

  // Background notifications support
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const sendNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      new Notification(title, { body, icon: '/logo.png' });
    }
  };

  useEffect(() => {
    if (wasSendingRef.current && !isSending && !error && session?.messages.length) {
      const lastMsg = session.messages[session.messages.length - 1];
      if (lastMsg.role === 'assistant' && lastMsg.content) {
        sendNotification('ZygAI Response Ready', lastMsg.content.slice(0, 100) + '...');
      }
    }
  }, [isSending, error, session?.messages]);

  // Speech recognition state
  const [listening, setListening] = useState(false);
  const browserSupportsSpeechRecognition = typeof SpeechRecognition !== 'undefined';

  // Refs for dropdowns and file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const zygDropdownRef = useRef<HTMLDivElement>(null);
  const mcpDropdownRef = useRef<HTMLDivElement>(null);
  const menuDropdownRef = useRef<HTMLDivElement>(null);
  const plusDropdownRef = useRef<HTMLDivElement>(null);

  // Dropdown visibility state
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showZygDropdown, setShowZygDropdown] = useState(false);
  const [showMcpDropdown, setShowMcpDropdown] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [showPlusDropdown, setShowPlusDropdown] = useState(false);
  const [showAnnouncementDialog, setShowAnnouncementDialog] = useState(false);

  useEffect(() => {
    const fetchSkills = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/personal-skills`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.skills) {
          setSkills(data.skills.filter((s: Skill) => s.skill_type !== 'agent' && s.skill_type !== 'zyg'));
          setZygs(data.skills.filter((s: Skill) => s.skill_type === 'agent' || s.skill_type === 'zyg'));
        }
      } catch (err) {
        console.error('Failed to fetch skills', err);
      }
    };
    fetchSkills();
  }, [token]);

  useEffect(() => {
    const fetchMcpServers = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/mcp-servers?enabled=true`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.servers) {
          setAvailableMcpServers(data.servers);
        }
      } catch (err) {
        console.error('Failed to fetch MCP servers', err);
      }
    };
    fetchMcpServers();
  }, [token]);

  // Save selected MCP servers to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('zygai:selectedApiTools', JSON.stringify(selectedApiTools));
  }, [selectedApiTools]);

  useEffect(() => {
    if (wasSendingRef.current && !isSending) {
      refreshQuotas();
      refreshCampaigns();
    }
    wasSendingRef.current = isSending;
  }, [isSending, refreshQuotas, refreshCampaigns]);

  // Disable web search when MCP servers are selected
  useEffect(() => {
    if (selectedApiTools.length > 0 && useWebSearch) {
      setUseWebSearch(false);
    }
  }, [selectedApiTools, useWebSearch]);

  const checkLimit = useCallback((): boolean => {
    const chatQuota = quotas.chat;

    // Check campaigns first (mirror server behavior)
    const chatCampaign = campaigns.find(c => c.featureKey === 'chat');

    const chatOk = chatCampaign
      ? chatCampaign.quotaUsed < chatCampaign.quotaLimit
      : (!chatQuota || chatQuota.isUnlimited || chatQuota.limit === null || chatQuota.used < chatQuota.limit);

    return chatOk;
  }, [quotas.chat, campaigns]);

  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();
      setListening(false);
    } else {
      SpeechRecognition.startListening({ continuous: true });
      setListening(true);
    }
  };


  const currentModel = models.find((m) => m.id === modelId);
  const modelLabel = currentModel?.label || 'Select Model';
  const isModelSelected = !!currentModel;
  const isZygAI = currentModel?.provider === 'zygai';

  // Model limits
  const [modelLimits, setModelLimits] = React.useState<Record<string, {free_limit:number|null,go_limit:number|null,plus_limit:number|null,beta_limit:number|null}>>({});
  const [modelUsage, setModelUsage] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    fetch(`${API_BASE}/model-limits`).then(r => r.ok ? r.json() : null).then(data => {
      if (data?.limits) {
        const map: Record<string, any> = {};
        data.limits.forEach((l: any) => { map[l.model_id] = l; });
        setModelLimits(map);
      }
    }).catch(() => {});
  }, []);

  React.useEffect(() => {
    const token = localStorage.getItem('zygai:token');
    if (!token) return;
    fetch(`${API_BASE}/model-limits/usage`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.usage) {
          const map: Record<string, number> = {};
          data.usage.forEach((u: any) => { map[u.model] = u.used; });
          setModelUsage(map);
        }
      }).catch(() => {});
  }, [modelId]);

  const getModelWarning = (mId: string, plan: string): string | null => {
    const limit = modelLimits[mId];
    if (!limit) return null;
    const planKey = `${plan}_limit` as keyof typeof limit;
    const max = limit[planKey];
    if (max === null || max === undefined) return null;
    const used = modelUsage[mId] || 0;
    if (used >= max) return `Limit reached (${used}/${max} today)`;
    if (used >= max - 2) return `${max - used} left today`;
    return null;
  };
  const activeZyg = zygs.find(z => z.id === (session as any)?.zygId);
  const zygLabel = activeZyg?.name || "Zyg's";
  const zygHasOwnModel = Boolean(
    activeZyg?.config?.studio?.modelId ||
    activeZyg?.config?.modelId ||
    activeZyg?.config?.model ||
    activeZyg?.config?.studio?.provider
  );

  const activeMcpServerNames = selectedApiTools
    .map(serverId => availableApiTools.find(s => s.id === serverId)?.name || serverId)
    .filter(Boolean);

  const handleSend = async () => {
  const imageFiles = files.filter((file) => file.isImage);

    if (isSending) return;
    if (files.some((file) => file.parsing)) return;

    if (!checkLimit()) {
      onRequestUpgrade?.();
      return;
    }

    const trimmedMessage = message.trim();
    const attachmentSnippets = files
      .filter((file) => file.textContent && !file.parseError)
      .map((file) => `[${file.isDocument ? 'Document' : 'Text file'}: ${file.name}]
${file.textContent}`);
    const attachmentText = attachmentSnippets.join('\n\n');
    const composedMessage = [trimmedMessage, attachmentText].filter(Boolean).join('\n\n');

    // Allow sending with just documents, just images, or text
    const hasDocuments = files.some(f => f.isDocument && f.textContent && !f.parseError);
    if (!composedMessage && imageFiles.length === 0 && !hasDocuments) return;
    if (!modelId || modelId === '') {
      alert('Please select a model first by clicking on the model name in the header');
      return;
    }

    const imageUrls: string[] = [];
    const attachedFiles: any[] = [];

    for (const file of files) {
      let finalUrl = file.url;

      // If the file is a local browser blob, upload it to the server's uploads folder
      if (file.url && file.url.startsWith('blob:')) {
        try {
          const response = await fetch(file.url);
          const blob = await response.blob();

          const formData = new FormData();
          formData.append('image', blob, file.name);

          const uploadRes = await fetch(`${API_BASE}/upload`, {
            method: 'POST',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: formData
          });

          if (uploadRes.ok) {
            const data = await uploadRes.json();
            finalUrl = data.url; // e.g. /uploads/1778726613313.png
            if (file.isImage && finalUrl) {
              imageUrls.push(finalUrl);
            }
          } else if (file.isImage && file.url) {
            imageUrls.push(file.url); // Fallback
          }
        } catch (error) {
          console.error('File upload failed:', error);
        }
      } else if (file.isImage && file.url) {
        imageUrls.push(file.url);
      }

      attachedFiles.push({
        id: file.id,
        name: file.name,
        url: finalUrl, // Now sends the permanent server URL (e.g. /uploads/xyz.pdf)
        isImage: file.isImage,
        isDocument: file.isDocument,
        fileType: file.fileType
      });
    }

    // Define tools for ZygAI provider
    const tools = isZygAI && useWebSearch ? [
      {
        type: "function",
        function: {
          name: "web_search",
          description: "Search the web for information to answer the user's query",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The search query based on the user's message" }
            },
            required: ["query"]
          }
        }
      }
    ] : [];

    onSend(composedMessage, useWebSearch, imageUrls, attachedFiles, tools, selectedApiTools);
    setMessage('');
    
    // Only clear files and revoke URLs AFTER we've completed all uploads
    setFiles((prev) => {
      prev.forEach((file) => file.url && URL.revokeObjectURL(file.url));
      return [];
    });
  };


  // Optimize error display
  const ErrorDisplay = React.memo(({ error }: { error?: string }) => (
    error ? (
      <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
        {error}
      </div>
    ) : null
  ));



  const createAttachmentId = () => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const updateFileEntry = (id: string, updates: Partial<FileType>) => {
    setFiles((prev) => prev.map((file) => (file.id === id ? { ...file, ...updates } : file)));
  };

  const parseDocumentFile = (file: File, fileId: string) => {
    updateFileEntry(fileId, { parsing: true, parseError: undefined });
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
       
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 60000);
       
      try {
         const response = await fetch(`${API_BASE}/parse-document`, {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json',
             ...(token ? { Authorization: `Bearer ${token}` } : {})
           },
           body: JSON.stringify({
             fileName: file.name,
             mimeType: file.type || 'application/octet-stream',
             file: base64
           }),
           signal: controller.signal
         });
         clearTimeout(timeoutId);
         const data = await response.json();
         if (!response.ok) {
           throw new Error(data.error || 'Failed to parse document');
         }
         updateFileEntry(fileId, {
           textContent: data.text,
           parsing: false
         });
       } catch (error) {
         clearTimeout(timeoutId);
         const message = error instanceof Error ? error.message : 'Failed to parse document';
         updateFileEntry(fileId, { parsing: false, parseError: message });
       }
    };
    reader.onerror = () => {
      updateFileEntry(fileId, { parsing: false, parseError: 'Failed to read file.' });
    };
    reader.readAsDataURL(file);
  };

  const parseImageFile = (file: File, fileId: string) => {
    // COGNIVISION: NO BASE64, NO RESIZING, NO LOSSY COMPRESSION
    // CogniVision takes raw file directly, handles all vision processing
    updateFileEntry(fileId, {
      fileType: file.type,
      parsing: false
    });
  };

  const handleAttachClick = (accept: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('accept', accept);
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files || []);
    if (chosen.length === 0) {
      event.target.value = '';
      return;
    }

    const newFiles: FileType[] = [];
    const filesToProcess: Array<{ file: File; id: string; kind: 'document' | 'image' }> = [];
    const existingNames = new Set(files.map(f => f.name));

    for (const file of chosen) {
      if (file.size > 10 * 1024 * 1024) {
        alert(`File "${file.name}" is too large. Maximum allowed size is 10MB.`);
        continue;
      }

      // Enforce maximum of 3 attachments total
      if (newFiles.length + files.length >= 3) {
        break;
      }
      // Skip duplicates by name
      if (existingNames.has(file.name)) {
        continue;
      }
      existingNames.add(file.name);

      const isImage = file.type.startsWith('image/');
      const isDocument = !isImage; // all non‑image files are treated as documents
      const url = (isImage || isDocument) ? URL.createObjectURL(file) : null;

      const entry: FileType = {
        id: createAttachmentId(),
        name: file.name.length > 20 ? `${file.name.substring(0, 17)}...` : file.name,
        url,
        isImage,
        isDocument,
        size: file.size,
        fileType:
          file.type ||
          (isDocument ? 'application/octet-stream' : isImage ? 'image/jpeg' : ''),
        parsing: false,
        parseError: undefined,
        textContent: undefined
      };

      newFiles.push(entry);

      if (isImage) {
        filesToProcess.push({ file, id: entry.id, kind: 'image' });
      } else {
        filesToProcess.push({ file, id: entry.id, kind: 'document' });
      }
    }

    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
    }

    filesToProcess.forEach(({ file, id, kind }) => {
      if (kind === 'document') {
        parseDocumentFile(file, id);
      } else {
        parseImageFile(file, id);
      }
    });

     event.target.value = '';
  };

   const handleDocumentPreview = (file: FileType) => {
    if (!file.url) return;
    if (file.fileType === 'application/pdf') {
      window.open(file.url, '_blank');
      return;
    }
    // For other document types, open the blob (download or preview if browser supports)
    window.open(file.url, '_blank');
   };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const next = prev.filter((file) => {
        if (file.id === id && file.url) {
          URL.revokeObjectURL(file.url);
        }
        return file.id !== id;
      });
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const showWelcome = !session || session.messages.length === 0;
  const headerTitle = session?.title || 'Select or create a chat';
  const hasAttachmentText = files.some((file) => file.textContent && !file.parseError);
  const hasImages = files.some((file) => file.isImage);
  const isParsingDocument = files.some((file) => file.parsing);
  const isReadyToSend = Boolean(message.trim()) || hasAttachmentText || hasImages;
  const isSendDisabled = isSending || !isReadyToSend || isParsingDocument;
  const sendButtonTitle = isParsingDocument ? 'Waiting for document parsing...' : 'Send message (Enter)';

  useEffect(() => {
    const messagesEl = document.querySelector('.messages');
    const headerEl = document.querySelector('.header');
    if (!messagesEl || !headerEl) return;

    const handleScroll = () => {
      if (messagesEl.scrollTop > 0) {
        headerEl.classList.add('scrolled');
      } else {
        headerEl.classList.remove('scrolled');
      }
    };

    messagesEl.addEventListener('scroll', handleScroll);
    return () => messagesEl.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false);
      }
      if (zygDropdownRef.current && !zygDropdownRef.current.contains(event.target as Node)) {
        setShowZygDropdown(false);
      }
      if (mcpDropdownRef.current && !mcpDropdownRef.current.contains(event.target as Node)) {
        setShowMcpDropdown(false);
      }
      if (menuDropdownRef.current && !menuDropdownRef.current.contains(event.target as Node)) {
        setShowMenuDropdown(false);
      }
      if (plusDropdownRef.current && !plusDropdownRef.current.contains(event.target as Node)) {
        setShowPlusDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch usage info
  const fetchUsageInfo = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/user/time-credits`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsageInfo(data);
      }
    } catch (err) {
      console.error('Failed to fetch usage info:', err);
    }
  }, [token]);

  useEffect(() => {
    fetchUsageInfo();
    // Refresh usage info every 60 seconds
    const interval = setInterval(fetchUsageInfo, 60000);
    return () => clearInterval(interval);
  }, [fetchUsageInfo]);

  // Enforced limits (actually used to block requests)
  const chatQuota = quotas.chat;
  const chatCampaign = campaigns.find(c => c.featureKey === 'chat');

  const chatLimitReached = chatCampaign
    ? chatCampaign.quotaUsed >= chatCampaign.quotaLimit
    : (chatQuota && !chatQuota.isUnlimited && chatQuota.limit !== null && chatQuota.used >= chatQuota.limit);

  const anyEnforcedLimitReached = chatLimitReached;

  // Enforced limit percentages (including campaigns)
  const chatPercentage = chatCampaign
    ? Math.round((chatCampaign.quotaUsed / chatCampaign.quotaLimit) * 100)
    : (chatQuota && chatQuota.limit ? Math.round((chatQuota.used / chatQuota.limit) * 100) : 0);

  const enforcedPercentage = chatPercentage;

  // Final banner state - reflect actual enforced quota usage
  const usagePercentage = anyEnforcedLimitReached ? 100 : enforcedPercentage;
  const limitReached = !!anyEnforcedLimitReached;

  const resetTime = anyEnforcedLimitReached
    ? (chatLimitReached
        ? (chatCampaign ? 'soon (campaign exhausted)' : (chatQuota?.resetAt ? new Date(chatQuota.resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'soon'))
        : '')
    : usageInfo?.resetTime;

  return (
    <section className="main">
      {/* Header */}
      <header className="header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <div className="relative w-full sm:w-auto" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (!zygHasOwnModel) {
                    setShowModelDropdown((prev) => !prev);
                  }
                }}
                disabled={zygHasOwnModel}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:w-auto sm:px-2 sm:py-1 ${
                  zygHasOwnModel
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800 dark:text-gray-500'
                    : isModelSelected
                      ? 'bg-moss-50 text-moss-600 hover:bg-moss-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40'
                      : 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40'
                }`}
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-none stroke-current" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10" fill="none"/>
                  <path d="M12 8v4l3 3" fill="none"/>
                </svg>
                <span className="min-w-0 flex-1 truncate text-left sm:max-w-[120px]">{modelLabel}</span>
                <svg viewBox="0 0 24 24" className="w-3 h-3 fill-none stroke-current" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {showModelDropdown && !zygHasOwnModel && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-[min(18rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-lg dark:border-ink-800 dark:bg-ink-900 sm:w-48">
                  {models.map((model) => (
                     <button
                       key={model.id}
                       type="button"
                       onClick={() => {
                         // Update the parent's modelId state
                         onModelChange?.(model.id);
                         // Also update the session's modelId if there's an active session
                         if (session && onUpdateSessionModel) {
                           onUpdateSessionModel(session.id, model.id);
                         }
                         setShowModelDropdown(false);
                       }}
                        className={clsx(
                          'w-full text-left px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 first:rounded-t-xl last:rounded-b-xl flex items-center justify-between dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900',
                          model.id === modelId ? 'text-ink-900 bg-ink-100 dark:text-ink-100 dark:bg-ink-800' : ''
                        )}
                      >
                        <span>{model.label}</span>
                        {(() => {
                          const warn = getModelWarning(model.id, (user as any)?.plan || 'free');
                          if (!warn) return null;
                          const isExhausted = warn.startsWith('Limit');
                          return (
                            <span className={`ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full ${isExhausted ? 'bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400' : 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400'}`}>
                              {warn}
                            </span>
                          );
                        })()}
                      </button>
                  ))}
                </div>
              )}
            </div>

            {/* ZYG DROPDOWN */}
            <div className="relative w-full sm:w-auto" ref={zygDropdownRef}>
              <button
                type="button"
                onClick={() => setShowZygDropdown((prev) => !prev)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors sm:w-auto sm:px-2 sm:py-1 ${
                  activeZyg 
                    ? 'text-saffron-600 hover:bg-saffron-100 dark:bg-saffron-900/20 dark:text-saffron-400 dark:hover:bg-saffron-900/40' 
                    : 'bg-ink-50 text-ink-600 hover:bg-ink-100 dark:bg-ink-800 dark:text-ink-400 dark:hover:bg-ink-700'
                }`}
                style={activeZyg ? {
                  background: `linear-gradient(135deg, ${activeZyg.config?.studio?.iconColor || activeZyg.config?.iconColor || '#f59e0b'}20, ${activeZyg.config?.studio?.iconColor || activeZyg.config?.iconColor || '#f59e0b'}40)`,
                  border: `1px solid ${activeZyg.config?.studio?.iconColor || activeZyg.config?.iconColor || '#f59e0b'}60`,
                } : undefined}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="text-sm">{activeZyg ? (activeZyg.config?.studio?.icon || activeZyg.config?.icon || '🤖') : <Bot size={14} className="text-ink-400" />}</span>
                  <span className="min-w-0 truncate">{zygLabel}</span>
                  {zygHasOwnModel && (
                    <span className="text-[9px] font-bold uppercase tracking-wider text-saffron-500 dark:text-saffron-400 bg-saffron-100 dark:bg-saffron-900/40 px-1.5 py-0.5 rounded-full">
                      Own model
                    </span>
                  )}
                </span>
                <ChevronDown size={12} className="text-ink-400" />
              </button>
              {showZygDropdown && (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-[min(16rem,calc(100vw-1rem))] overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-lg dark:border-ink-800 dark:bg-ink-900 sm:w-48">
                   <button
                     type="button"
                     onClick={() => {
                       if (session && onUpdateSessionZyg) {
                         onUpdateSessionZyg(session.id, null);
                       }
                       setShowZygDropdown(false);
                     }}
                     className={clsx(
                       'w-full text-left px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 first:rounded-t-xl flex items-center justify-between dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900',
                       !(session as any)?.zygId ? 'text-ink-900 bg-ink-100 dark:text-ink-100 dark:bg-ink-800' : ''
                     )}
                   >
                     <span>No Zyg</span>
                   </button>
                   {zygs.map((zyg) => {
                     const zygColor = zyg.config?.studio?.iconColor || zyg.config?.iconColor || '#f59e0b';
                     const zygIcon = zyg.config?.studio?.icon || zyg.config?.icon || '🤖';
                     const hasOwnModel = Boolean(
                       zyg.config?.studio?.modelId ||
                       zyg.config?.modelId ||
                       zyg.config?.model ||
                       zyg.config?.studio?.provider
                     );
                     return (
                      <button
                        key={zyg.id}
                        type="button"
                        onClick={() => {
                          if (session && onUpdateSessionZyg) {
                            onUpdateSessionZyg(session.id, zyg.id);
                          }
                          setShowZygDropdown(false);
                        }}
                        className={clsx(
                          'w-full text-left px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 last:rounded-b-xl flex items-center gap-2 dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900',
                          zyg.id === (session as any)?.zygId ? 'text-ink-900 bg-ink-100 dark:text-ink-100 dark:bg-ink-800' : ''
                        )}
                      >
                        <span className="relative flex h-5 w-5 items-center justify-center rounded-md text-xs"
                          style={{
                            background: `linear-gradient(135deg, ${zygColor}40, ${zygColor}80)`,
                            border: `1px solid ${zygColor}60`,
                          }}
                        >
                          <span className="filter drop-shadow-sm">{zygIcon}</span>
                        </span>
                        <span className="flex-1 truncate">{zyg.name}</span>
                        {hasOwnModel && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-saffron-500 dark:text-saffron-400">
                            Auto
                          </span>
                        )}
                      </button>
                     );
                   })}
                </div>
              )}
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="header-title max-w-none sm:max-w-[300px]">
              {headerTitle}
            </div>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end">
          {/* Show campaign quotas first if available, otherwise show plan quotas */}
           {campaigns.filter(c => c.featureKey === 'chat').length > 0 ? (
             campaigns
               .filter(c => c.featureKey === 'chat')
               .map(campaign => (
                 <PlanQuotaMeter
                   key={campaign.id}
                   quota={{
                     feature: 'chat',
                     label: campaign.name,
                     limit: campaign.quotaLimit,
                     used: campaign.quotaUsed,
                     resetAt: campaign.expiresAt,
                     windowMs: 0,
                     plan: 'campaign',
                     isUnlimited: false
                   }}
                   compact
                   className="hidden min-w-[180px] sm:block"
                 />
               ))
           ) : (
             <PlanQuotaMeter quota={quotas.chat} compact className="hidden min-w-[180px] sm:block" />
           )}
           <button
            type="button"
            onClick={() => onNewChat?.()}
            className="rounded-full border border-ink-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-ink-500 hover:border-saffron-300 hover:text-ink-900 sm:py-1 sm:tracking-[0.3em]"
          >
            New chat
          </button>
          <button
            className="p-1 rounded-md hover:bg-ink-100 text-ink-500"
            title="Settings"
            aria-label="Settings"
            onClick={() => onOpenAccountSettings?.()}
          >
            <Settings size={15} aria-hidden="true" />
          </button>
          <button
            className="p-1 rounded-md hover:bg-ink-100 text-ink-500"
            title="Studio"
            aria-label="Open Studio"
            onClick={() => setShowZygStudio(true)}
          >
            <Sparkles size={15} aria-hidden="true" />
          </button>
          {isAdmin && (
            <button
              className="rounded-md p-2 text-saffron-500 hover:bg-ink-100 sm:p-1"
              title="View Announcements"
              aria-label="View Announcements"
              onClick={() => setShowAnnouncementDialog(true)}
            >
              <Megaphone size={15} aria-hidden="true" className="sm:size-[15px] size-[16px]" />
            </button>
          )}
          <div className="relative" ref={menuDropdownRef}>
            <button
              className="p-1 rounded-md hover:bg-ink-100 text-ink-500"
              title="More"
              aria-label="More options"
              aria-haspopup="true"
              aria-expanded={showMenuDropdown}
              onClick={() => setShowMenuDropdown((prev) => !prev)}
            >
              <MoreHorizontal size={15} aria-hidden="true" />
            </button>
            {showMenuDropdown && (
              <div className="absolute right-0 top-full z-50 mt-1 w-[min(12rem,calc(100vw-1rem))] rounded-xl border border-ink-200 bg-white shadow-lg sm:w-48" role="menu">
                <button
                  role="menuitem"
                  className="flex w-full items-center gap-3 whitespace-normal px-3 py-2 text-left text-sm text-ink-900 transition-colors hover:bg-ink-50 first:rounded-t-xl"
                  onClick={() => {
                    if (session && onRenameSession) {
                      const newTitle = prompt('Rename chat:', session.title);
                      if (newTitle && newTitle.trim()) {
                        onRenameSession(session.id, newTitle.trim());
                      }
                    }
                    setShowMenuDropdown(false);
                  }}
                >
                  <Pencil size={16} className="text-ink-600" strokeWidth={2} aria-hidden="true" />
                  <span>Rename</span>
                </button>
                 <button
                  role="menuitem"
                  className="flex w-full items-center gap-3 whitespace-normal px-3 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 last:rounded-b-xl"
                  onClick={() => {
                    if (session && onDeleteSession && confirm('Delete this chat? This action cannot be undone.')) {
                      onDeleteSession(session.id);
                    }
                    setShowMenuDropdown(false);
                  }}
                >
                  <Trash2 size={16} className="text-red-600" strokeWidth={2} aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <div className="messages" style={{ flex: 1, minHeight: 0 }}>
           {showWelcome ? (
            <div className="welcome">
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'5px'}}>
                <div className={clsx(
                  "welcome-icon flex items-center justify-center",
                  activeMcpServerNames.length > 0 ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" :
                  activeZyg ? "text-ink-900 dark:text-ink-50" : ""
                )}
                style={activeZyg ? {
                  background: `linear-gradient(135deg, ${activeZyg.config?.studio?.iconColor || activeZyg.config?.iconColor || '#f59e0b'}40, ${activeZyg.config?.studio?.iconColor || activeZyg.config?.iconColor || '#f59e0b'}80)`,
                  border: `1px solid ${activeZyg.config?.studio?.iconColor || activeZyg.config?.iconColor || '#f59e0b'}60`,
                } : undefined}
                aria-hidden="true">
                  {activeMcpServerNames.length > 0 ? (
                    <Blocks size={24} />
                  ) : activeZyg ? (
                    <span className="text-3xl filter drop-shadow-sm">{activeZyg.config?.studio?.icon || activeZyg.config?.icon || '🤖'}</span>
                  ) : (
                    <svg viewBox="0 0 24 24">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  )}
                </div>
                <h2>
                  {activeMcpServerNames.length > 0
                    ? (activeMcpServerNames.length === 1 ? activeMcpServerNames[0] : `${activeMcpServerNames[0]} +${activeMcpServerNames.length - 1}`)
                    : (activeZyg ? activeZyg.name : 'ZygAI')
                  }
                </h2>
                <p className="text-center max-w-md">
                  {activeMcpServerNames.length > 0
                    ? 'Enhanced with MCP tools for specialized assistance'
                    : (activeZyg?.description || 'How can I help you today?')
                  }
                </p>
             </div>

           </div>
           ) : (
              session?.messages.map((msg, index) => {
                const isStreaming = typingIndicator && index === session.messages.length - 1 && msg.role === 'assistant';
                return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={isStreaming}
                  onStop={isStreaming ? onStopGeneration : undefined}
                   onEdit={(newContent) => {
                      if (!checkLimit()) {
                        onRequestUpgrade?.();
                        return;
                      }
                      // Update message and regenerate from this point
                      onSend(newContent, false, (session.messages[index] as any).userImages || []);
                    }}
                   onDelete={() => {
                   }}
                    activeZygName={activeZyg?.name}
                    activeZygIcon={activeZyg?.config?.studio?.icon || activeZyg?.config?.icon}
                    activeMcpServers={activeMcpServerNames}
                 />
              )})
           )}
        {typingIndicator && <TypingIndicator activeZygName={activeZyg?.name} activeZygIcon={activeZyg?.config?.studio?.icon || activeZyg?.config?.icon} />}
        <ErrorDisplay error={error} />
      </div>

       {/* Usage Limit Banner */}
       {!dismissBanner && (
         <UsageLimitBanner
           percentage={usagePercentage}
           limitReached={limitReached}
           resetTime={resetTime}
           onDismiss={() => setDismissBanner(true)}
           onUpgrade={onRequestUpgrade || (() => window.location.href = '/upgrade')}
         />
       )}

       {/* Input Area */}
       <div className="input-wrap">
        <div className="input-box">
           <div className="input-row">
             <div className="input-left items-center flex-wrap gap-2">
               <div className="relative" ref={plusDropdownRef}>
                   <button
                     type="button"
                     onClick={() => setShowPlusDropdown((prev) => !prev)}
                     className="tool-pill flex items-center gap-2"
                   >
                     <Plus size={14} />
                     <span className="hidden sm:block flex-1 text-left text-[11px] font-semibold uppercase tracking-[0.2em]">
                       Add
                     </span>
                   </button>
                    {showPlusDropdown && (
                      <div 
                         className="rounded-xl border border-ink-200 bg-white shadow-lg z-50 absolute left-0 bottom-full mb-2 w-48 dark:bg-ink-900 dark:border-ink-800"
                      >
                      <button
                        type="button"
                        onClick={() => {
                          handleAttachClick('image/*');
                          setShowPlusDropdown(false);
                        }}
                        className={clsx(
                          'w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 first:rounded-t-xl dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900'
                        )}
                      >
                        <ImageIcon size={16} />
                        Add Photo
                      </button>
                       <button
                          type="button"
                          onClick={() => {
                            handleAttachClick('.pdf,.docx,.xlsx,.xlsm,.xlsb,.xls,.et,.ods,.odt,.csv,.html,.htm,.xml');
                            setShowPlusDropdown(false);
                          }}
                          className={clsx(
                            'w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900'
                          )}
                        >
                          <Paperclip size={16} />
                          Add Document
                         </button>
                          <button
                           type="button"
                           onClick={() => {
                             setShowPlusDropdown(false);
                             setShowSkillsModal(true);
                           }}
                           className={clsx(
                             'w-full flex items-center gap-3 px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 last:rounded-b-xl dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900'
                           )}
                         >
                           <Sparkles size={16} />
                           Use Skill
                          </button>

                      </div>
                 )}
               </div>
                <input
                  ref={fileInputRef}
                  id="file-input"
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFileChange}
                />
             </div>
              <div className="flex items-center gap-2">
              {isSending ? (
                <button
                  onClick={onStopGeneration}
                  className="send-btn bg-red-500 hover:bg-red-600 text-white"
                  title="Stop generating"
                  aria-label="Stop generating"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={handleSend}
                  disabled={isSendDisabled}
                  className={clsx(
                    'send-btn',
                    isSendDisabled ? 'opacity-50 cursor-not-allowed' : ''
                  )}
                  title={sendButtonTitle}
                  aria-label={sendButtonTitle}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => {
                  if (selectedApiTools.length > 0) return;
                  setUseWebSearch(!useWebSearch);
                }}
                className={clsx(
                  'flex items-center justify-center w-10 h-10 rounded-full transition-colors',
                  selectedApiTools.length > 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-ink-800 dark:text-ink-600' :
                  useWebSearch ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700'
                )}
                title={selectedApiTools.length > 0 ? 'Web search disabled when API tools are active' : (useWebSearch ? 'Disable web search' : 'Enable web search')}
                aria-label={selectedApiTools.length > 0 ? 'Web search disabled when API tools are active' : (useWebSearch ? 'Disable web search' : 'Enable web search')}
                aria-pressed={useWebSearch}
              >
                <Search size={18} aria-hidden="true" />
              </button>
              <div className="relative" ref={mcpDropdownRef}>
                <button
                  onClick={() => setShowMcpDropdown((prev) => !prev)}
                  className={clsx(
                    'flex items-center justify-center w-10 h-10 rounded-full transition-colors',
                    selectedApiTools.length > 0 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700'
                  )}
                  title={selectedApiTools.length > 0 ? 'API tools selected' : 'Select API tools'}
                  aria-label={selectedApiTools.length > 0 ? 'API tools selected' : 'Select API tools'}
                  aria-haspopup="true"
                  aria-expanded={showMcpDropdown}
                >
                  <Blocks size={18} aria-hidden="true" />
                </button>
                {showMcpDropdown && (
                  <div className="absolute right-0 bottom-full mb-2 w-64 max-h-64 overflow-y-auto rounded-xl border border-ink-200 bg-white shadow-lg z-50 dark:bg-ink-900 dark:border-ink-800" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSelectedMcpServers([]);
                        setShowMcpDropdown(false);
                      }}
                      className={clsx(
                        'w-full text-left px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 first:rounded-t-xl flex items-center justify-between dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900',
                        selectedApiTools.length === 0 ? 'text-ink-900 bg-ink-100 dark:text-ink-100 dark:bg-ink-800' : ''
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <X size={14} className="text-red-500" aria-hidden="true" />
                        <span>No Tools (Disabled)</span>
                      </div>
                      {selectedApiTools.length === 0 && (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <polyline points="20,6 9,17 4,12" />
                        </svg>
                      )}
                    </button>
                    
                    <div className="border-t border-ink-100 dark:border-ink-800 my-1" />

                    {availableApiTools.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-ink-500 italic dark:text-ink-400">No tools connected</div>
                    ) : (
                      availableApiTools.map((server) => (
                        <button
                          key={server.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            // Single-select logic for easy switching
                            setSelectedMcpServers([server.id]);
                            setShowMcpDropdown(false);
                          }}
                          className={clsx(
                            'w-full text-left px-3 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 hover:bg-ink-50 flex items-center justify-between last:rounded-b-xl dark:text-ink-400 dark:hover:text-ink-100 dark:hover:bg-ink-900',
                            selectedApiTools.includes(server.id) ? 'text-ink-900 bg-ink-100 dark:text-ink-100 dark:bg-ink-800' : ''
                          )}
                        >
                          <span>{server.name || server.id}</span>
                          {selectedApiTools.includes(server.id) && (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <polyline points="20,6 9,17 4,12" />
                            </svg>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {browserSupportsSpeechRecognition && (
                <button
                  onClick={toggleListening}
                  className={clsx(
                    'flex items-center justify-center w-10 h-10 rounded-full transition-colors',
                    listening ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700'
                  )}
                  title={listening ? 'Stop listening' : 'Start voice input'}
                  aria-label={listening ? 'Stop listening' : 'Start voice input'}
                  aria-pressed={listening}
                >
                  <Mic size={18} aria-hidden="true" />
                </button>
              )}

            </div>
          </div>
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {files.map((file) => (
                <div key={file.id} className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  {file.isImage ? (
                    <img src={file.url || ''} alt={file.name} className="h-4 w-4 rounded object-cover" />
                  ) : file.isDocument ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <Paperclip size={12} aria-hidden="true" />
                        <button
                          onClick={() => handleDocumentPreview(file)}
                          className="text-blue-600 hover:underline dark:text-blue-400"
                          title="Preview document"
                          aria-label={`Preview document ${file.name}`}
                        >
                          {file.name}
                        </button>
                      </div>
                      {file.parsing ? (
                        <span className="text-[10px] text-saffron-500">Parsing document...</span>
                      ) : file.parseError ? (
                        <span className="text-[10px] text-red-500">{file.parseError}</span>
                      ) : file.textContent !== undefined ? (
                        <p className="text-[10px] text-ink-500 leading-tight">{getPreviewSnippet(file.textContent || '')}</p>
                      ) : (
                        <span className="text-[10px] text-ink-400">Waiting for extracted text...</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <Paperclip size={12} aria-hidden="true" />
                      <span className="max-w-[120px] truncate">{file.name}</span>
                    </>
                  )}
                  <button type="button" onClick={() => removeFile(file.id)} className="text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-300" aria-label={`Remove ${file.name}`}>×</button>
                </div>
              ))}
            </div>
            )}
            <textarea
              id="message-input"
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything..."
              aria-label="Message input"
              className="w-full bg-transparent text-sm text-ink-800 resize-none outline-none min-h-[24px] max-h-32"
              rows={1}
            />
          </div>
        </div>

        {/* AI Disclaimer */}
        <p className="px-4 pb-1 text-center text-[10px] text-ink-400 dark:text-ink-600">
          ZygAI can make mistakes. Always verify important information.
        </p>

        {/* Announcement Dialog */}
        <AnnouncementDialog isOpen={showAnnouncementDialog} onClose={() => setShowAnnouncementDialog(false)} />
        
        {/* Zyg Studio Publisher Modal */}
        {showZygStudio && (
          <ZygStudioPublisher
            type="zyg"
            models={models}
            isOpen={showZygStudio}
            onClose={() => setShowZygStudio(false)}
            onSubmit={handleZygStudioSubmit}
          />
        )}

        {/* Skills Modal */}
        {showSkillsModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900 flex flex-col max-h-[80vh]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-800">
                <div className="flex items-center gap-2">
                  <Sparkles size={20} className="text-saffron-500" />
                  <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">
                    Use a Skill
                  </h2>
                </div>
                <button
                  onClick={() => setShowSkillsModal(false)}
                  className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="overflow-y-auto p-4 space-y-2">
                {skills.length === 0 ? (
                   <p className="text-center text-sm text-ink-500 py-8">No skills available. Create one in your Personal Workspace or download from the Marketplace.</p>
                ) : (
                  skills.map(skill => (
                    <button
                      key={skill.id}
                      onClick={() => {
                        const text = skill.config?.prompt_template || skill.config?.prompt || '';
                        if (text) {
                          setMessage(prev => prev ? prev + '\n\n' + text : text);
                        }
                        setShowSkillsModal(false);
                      }}
                      className="w-full text-left p-3 rounded-xl border border-ink-100 hover:border-saffron-400 hover:bg-saffron-50/50 dark:border-ink-800 dark:hover:bg-ink-800 transition-all"
                    >
                      <div className="font-semibold text-ink-900 dark:text-ink-50">{skill.name}</div>
                      {skill.description && <div className="text-xs text-ink-500 mt-1">{skill.description}</div>}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </section>

  );
};

export default ChatArea;
