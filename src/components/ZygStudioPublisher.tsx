import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE } from '@/utils/apiBase';
import {
  X,
  Plus,
  Upload,
  Send,
  MessageSquarePlus,
  ChevronRight,
  Sparkles,
  Palette,
  Type,
} from 'lucide-react';

export interface ConversationStarter {
  id: string;
  text: string;
}

export interface StudioPayload {
  type: 'zyg' | 'prompt';
  name: string;
  description: string;
  instructions: string;
  conversationStarters: string[];
  knowledgeFiles: File[];
  modelId?: string;
  icon?: string;
  iconColor?: string;
}

export interface ZygStudioPublisherProps {
  type: 'zyg' | 'prompt';
  models: { id: string; label: string; provider: string }[];
  initialData?: Partial<StudioPayload>;
  isOpen: boolean;
  onClose: () => void;
  // Accept either a StudioPayload or any server-created response object
  onSubmit: (payload: StudioPayload | any) => void;
}

const EMOJI_OPTIONS = ['🤖', '🧠', '⚡', '🔥', '💡', '🎯', '🚀', '✨', '🌟', '💎', '🎨', '📊', '🔬', '🎮', '📝', '🎵'];

const ICON_COLORS = [
  { name: 'Saffron', value: '#f59e0b', dark: '#f59e0b' },
  { name: 'Rose', value: '#f43f5e', dark: '#fb7185' },
  { name: 'Emerald', value: '#10b981', dark: '#34d399' },
  { name: 'Blue', value: '#3b82f6', dark: '#60a5fa' },
  { name: 'Purple', value: '#8b5cf6', dark: '#a78bfa' },
  { name: 'Cyan', value: '#06b6d4', dark: '#22d3ee' },
  { name: 'Pink', value: '#ec4899', dark: '#f472b6' },
  { name: 'Orange', value: '#f97316', dark: '#fb923c' },
];

const ZygStudioPublisher: React.FC<ZygStudioPublisherProps> = ({
  type,
  models,
  initialData,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [availableModels, setAvailableModels] = useState(models || []);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'configure'>('configure');
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [instructions, setInstructions] = useState(initialData?.instructions || '');
  const [starters, setStarters] = useState<ConversationStarter[]>(
    initialData?.conversationStarters?.map((text, index) => ({
      id: `starter-${index}-${Date.now()}`,
      text,
    })) || [],
  );
  const [newStarter, setNewStarter] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<File[]>(initialData?.knowledgeFiles || []);
  const [selectedModelId, setSelectedModelId] = useState(initialData?.modelId || '');
  const [selectedEmoji, setSelectedEmoji] = useState(initialData?.icon || (type === 'zyg' ? '🤖' : '💬'));
  const [selectedColor, setSelectedColor] = useState(initialData?.iconColor || ICON_COLORS[0].value);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    if (!initialData) return;
    if (initialData.name !== undefined) setName(initialData.name);
    if (initialData.description !== undefined) setDescription(initialData.description);
    if (initialData.instructions !== undefined) setInstructions(initialData.instructions);
    if (initialData.conversationStarters !== undefined) {
      setStarters(
        initialData.conversationStarters.map((text, index) => ({
          id: `starter-${index}-${Date.now()}`,
          text,
        })),
      );
    }
    if (initialData.knowledgeFiles) {
      setUploadedFiles(initialData.knowledgeFiles);
    }
    if (initialData.modelId) {
      setSelectedModelId(initialData.modelId);
    }
    if (initialData.icon) {
      setSelectedEmoji(initialData.icon);
    }
    if (initialData.iconColor) {
      setSelectedColor(initialData.iconColor);
    }
  }, [initialData]);

  useEffect(() => {
    // If parent passed models, use them; otherwise fetch from server
    if (models && models.length > 0) {
      setAvailableModels(models);
      return;
    }

    const loadModels = async () => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const res = await fetch('/api/models');
        if (!res.ok) throw new Error(`Failed to load models (${res.status})`);
        const json = await res.json();
        const list = Array.isArray(json?.models) ? json.models : json?.models || [];
        const mapped = list.map((m: any) => ({ id: String(m.id || m.modelId || m.name), label: m.label || m.name || m.id, provider: m.provider || m.providerType || '' }));
        setAvailableModels(mapped);
      } catch (err: any) {
        setModelsError(err?.message || 'Failed to load models');
      } finally {
        setModelsLoading(false);
      }
    };

    loadModels();
  }, [models]);

  const addStarter = () => {
    const trimmed = newStarter.trim();
    if (!trimmed) return;
    setStarters([...starters, { id: `starter-${Date.now()}`, text: trimmed }]);
    setNewStarter('');
  };

  const removeStarter = (id: string) => {
    setStarters(starters.filter((s) => s.id !== id));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles([...uploadedFiles, ...files]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const auth = useAuth();

  const handleSubmit = async () => {
    const payload: any = {
      name: name.trim(),
      description: description.trim(),
      skill_type: type === 'zyg' ? 'agent' : 'prompt',
      config: {
        prompt_template: instructions,
        modelId: selectedModelId || undefined,
        studio: { icon: selectedEmoji, iconColor: selectedColor }
      },
      knowledge_id: null,
      enabled: true
    };

    // Build a StudioPayload to return to parents (Marketplace expects `name` + `content`, etc.)
    const studioPayload: StudioPayload & { content?: string } = {
      type,
      name: name.trim(),
      description: description.trim(),
      instructions,
      conversationStarters: starters.map((s) => s.text),
      knowledgeFiles: uploadedFiles,
      modelId: selectedModelId || undefined,
      icon: selectedEmoji,
      iconColor: selectedColor,
    };

    // For marketplace publishing the consumer expects a `content` field.
    if (type === 'zyg') {
      try {
        studioPayload.content = JSON.stringify({
          prompt_template: instructions,
          studio: {
            instructions,
            conversationStarters: starters.map((s) => s.text),
            modelId: selectedModelId,
            icon: selectedEmoji,
            iconColor: selectedColor,
          },
        });
      } catch (e) {
        studioPayload.content = JSON.stringify({ prompt_template: instructions });
      }
    } else {
      studioPayload.content = instructions || '';
    }

    // If there are knowledge files, create a personal KB and upload documents
    try {
      if (uploadedFiles.length > 0 && auth?.token) {
        // create knowledge base
        const kbRes = await fetch(`${API_BASE}/personal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify({ name: `${name} Knowledge`, description: description || '', system_prompt: instructions || '' })
        });
        const kbData = await kbRes.json().catch(() => ({}));
        if (!kbRes.ok) throw new Error(kbData?.error || 'Failed to create knowledge base');
        const kbId = kbData.id || kbData.knowledge?.id || kbData.personal?.id;
        if (kbId) {
          payload.knowledge_id = kbId;
          const filesPayload = await Promise.all(uploadedFiles.map(async (f) => ({
            file: await fileToBase64(f),
            fileName: f.name,
            mimeType: f.type || 'application/octet-stream'
          })));

          const docRes = await fetch(`${API_BASE}/personal/${kbId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
            body: JSON.stringify({ files: filesPayload })
          });
          const docData = await docRes.json().catch(() => ({}));
          if (!docRes.ok) throw new Error(docData?.error || 'Failed to upload documents');
        }
      }

      // Create skill on server
      if (auth?.token) {
        const res = await fetch(`${API_BASE}/personal-skills`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Failed to create skill');
        // pass created skill and the original studio payload back to parent so
        // consumers (ChatArea expects `_createdSkill`, Marketplace expects StudioPayload)
        onSubmit({ _createdSkill: data.skill, ...studioPayload });
        onClose();
        return;
      }
    } catch (err: any) {
      console.error('ZygStudioPublisher submit error:', err?.message || err);
      // Fallback to client-side submit with original Studio payload
      const fallback: StudioPayload = {
        type,
        name,
        description,
        instructions,
        conversationStarters: starters.map((s) => s.text),
        knowledgeFiles: uploadedFiles,
        modelId: selectedModelId || undefined,
        icon: selectedEmoji,
        iconColor: selectedColor,
      };
      onSubmit(fallback);
      onClose();
    }
  };

  if (!isOpen) return null;

  const placeholderName = type === 'zyg' ? 'e.g. Expert Coder' : 'e.g. Write a blog post';
  const displayName = name || (type === 'zyg' ? 'Untitled Agent' : 'Untitled Prompt');
  const displayDescription = description || 'No description provided.';
  const selectedModel = availableModels.find((m) => m.id === selectedModelId);
  const displayModel = selectedModel?.label || 'No model selected';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-5 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div
              className="relative flex h-10 w-10 items-center justify-center rounded-2xl shadow-md text-lg"
              style={{
                background: `linear-gradient(135deg, ${selectedColor}40, ${selectedColor}80)`,
                border: `1px solid ${selectedColor}60`,
              }}
            >
              <span className="relative z-10 text-xl filter drop-shadow-sm">{selectedEmoji}</span>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-saffron-500">Studio</p>
              <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                {activeTab === 'create' ? `Create ${type === 'zyg' ? 'Agent' : 'Prompt'}` : 'Configure'}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-ink-100 text-ink-500 transition-colors dark:hover:bg-ink-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-ink-100 px-6 dark:border-ink-800">
          <button
            onClick={() => setActiveTab('create')}
            className={`px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'create'
                ? 'border-b-2 border-saffron-500 text-saffron-600 dark:text-saffron-400'
                : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}
          >
            Create
          </button>
          <button
            onClick={() => setActiveTab('configure')}
            className={`px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === 'configure'
                ? 'border-b-2 border-saffron-500 text-saffron-600 dark:text-saffron-400'
                : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}
          >
            Configure
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* Left Form / Create Area */}
          <div className="lg:col-span-3 space-y-0">
            {activeTab === 'create' ? (
              <div className="p-6">
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl shadow-md mb-4"
                    style={{
                      background: `linear-gradient(135deg, ${selectedColor}40, ${selectedColor}80)`,
                      border: `1px solid ${selectedColor}60`,
                    }}
                  >
                    <span className="text-4xl filter drop-shadow-sm">{selectedEmoji}</span>
                  </div>
                  <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50 mb-1">
                    {type === 'zyg' ? 'Build Your Agent' : 'Build Your Prompt'}
                  </h3>
                  <p className="text-sm text-ink-500 max-w-sm mb-6">
                    Start by defining what your {type === 'zyg' ? 'agent' : 'prompt'} will do, then move to Configure to fine-tune its behavior and knowledge.
                  </p>
                  <button
                    onClick={() => setActiveTab('configure')}
                    className="inline-flex items-center gap-2 rounded-xl bg-saffron-500 px-5 py-2.5 text-sm font-bold text-ink-900 transition hover:bg-saffron-600 shadow-sm"
                  >
                    Go to Configure <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Form Fields */}
                <div className="p-6 space-y-5 border-r border-ink-100 dark:border-ink-800">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={placeholderName}
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What does this do?"
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>

                  {/* Icon & Color Picker */}
                  {type === 'zyg' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                          <Type size={14} /> Icon / Emoji
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => { setShowEmojiPicker(!showEmojiPicker); setShowColorPicker(false); }}
                            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50 flex items-center gap-2"
                          >
                            <span className="text-lg">{selectedEmoji}</span>
                            <span className="text-xs text-ink-500 ml-auto">Change</span>
                          </button>
                          {showEmojiPicker && (
                            <div className="absolute z-20 mt-2 w-64 rounded-xl border border-ink-200 bg-white p-3 shadow-lg dark:border-ink-700 dark:bg-ink-900">
                              <div className="grid grid-cols-8 gap-2">
                                {EMOJI_OPTIONS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => { setSelectedEmoji(emoji); setShowEmojiPicker(false); }}
                                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-lg transition-colors ${
                                      selectedEmoji === emoji ? 'bg-saffron-100 ring-2 ring-saffron-400' : 'hover:bg-ink-100'
                                    }`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                          <Palette size={14} /> Color
                        </label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={() => { setShowColorPicker(!showColorPicker); setShowEmojiPicker(false); }}
                            className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50 flex items-center gap-2"
                          >
                            <span
                              className="h-4 w-4 rounded-full shadow-sm"
                              style={{ backgroundColor: selectedColor }}
                            />
                            <span className="text-xs text-ink-500 ml-auto">Change</span>
                          </button>
                          {showColorPicker && (
                            <div className="absolute z-20 mt-2 w-48 rounded-xl border border-ink-200 bg-white p-3 shadow-lg dark:border-ink-700 dark:bg-ink-900">
                              <div className="grid grid-cols-4 gap-2">
                                {ICON_COLORS.map((color) => (
                                  <button
                                    key={color.name}
                                    type="button"
                                    onClick={() => { setSelectedColor(color.value); setShowColorPicker(false); }}
                                    className={`flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm transition-transform ${
                                      selectedColor === color.value ? 'ring-2 ring-offset-2 ring-saffron-500 scale-110' : 'hover:scale-105'
                                    }`}
                                    style={{ backgroundColor: color.dark }}
                                    title={color.name}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                      Instructions
                    </label>
                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="How should the agent behave?"
                      rows={5}
                      className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 text-sm text-ink-900 outline-none focus:border-saffron-400 resize-none dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                      <MessageSquarePlus size={14} />
                      Conversation Starters
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {starters.map((starter) => (
                        <span
                          key={starter.id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                        >
                          {starter.text}
                          <button
                            onClick={() => removeStarter(starter.id)}
                            className="text-ink-400 hover:text-red-500 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newStarter}
                        onChange={(e) => setNewStarter(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addStarter();
                          }
                        }}
                        placeholder="Add a starter..."
                        className="flex-1 rounded-xl border border-ink-200 bg-ink-50 px-4 py-2 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                      />
                      <button
                        onClick={addStarter}
                        className="flex items-center gap-1.5 rounded-xl bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700 dark:bg-ink-100 dark:text-ink-900"
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    </div>
                  </div>

                  {/* Model Selector */}
                  {type === 'zyg' && (
                    <div>
                      <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                        <Sparkles size={14} />
                        Model
                      </label>
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedModelId}
                          onChange={(e) => setSelectedModelId(e.target.value)}
                          className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-900 outline-none focus:border-saffron-400 dark:border-ink-700 dark:bg-ink-950 dark:text-ink-50"
                        >
                          <option value="">{availableModels.length ? '-- Select a model for this Zyg --' : modelsLoading ? '-- Loading models --' : '-- No models available --'}</option>
                          {availableModels.length > 0 &&
                            availableModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.label} ({model.provider})
                              </option>
                            ))}
                        </select>
                        <button
                          onClick={() => {
                            // allow manual refresh
                            setAvailableModels([]);
                            setModelsError(null);
                            setModelsLoading(true);
                            fetch('/api/models')
                              .then((r) => {
                                if (!r.ok) throw new Error(`Failed to load models (${r.status})`);
                                return r.json();
                              })
                              .then((json) => {
                                const list = Array.isArray(json?.models) ? json.models : json?.models || [];
                                const mapped = list.map((m: any) => ({ id: String(m.id || m.modelId || m.name), label: m.label || m.name || m.id, provider: m.provider || m.providerType || '' }));
                                setAvailableModels(mapped);
                              })
                              .catch((err) => setModelsError(err?.message || 'Failed to load models'))
                              .finally(() => setModelsLoading(false));
                          }}
                          className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium border border-ink-200 bg-ink-50 dark:bg-ink-950"
                          title="Refresh models"
                        >
                          ↻
                        </button>
                      </div>
                      {modelsError && (
                        <p className="mt-1 text-[11px] text-rose-500">{modelsError}</p>
                      )}
                      {!modelsError && !availableModels.length && !modelsLoading && (
                        <p className="mt-1 text-[11px] text-rose-500">
                          No models available. Connect a model provider or add models in Settings, then refresh.
                        </p>
                      )}
                      {availableModels.length > 0 && selectedModelId && (
                        <p className="mt-1 text-[11px] text-ink-500">This model will be used when chatting with this Zyg.</p>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">
                      <Upload size={14} />
                      Knowledge
                    </label>
                    <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50 p-6 cursor-pointer hover:border-saffron-300 transition-colors dark:border-ink-700 dark:bg-ink-950">
                      <Upload className="w-6 h-6 text-ink-400" />
                      <span className="text-sm font-semibold text-ink-600 dark:text-ink-300">Upload files</span>
                      <span className="text-xs text-ink-400">PDF, TXT, DOCX, etc.</span>
                      <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                    </label>
                    {uploadedFiles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {uploadedFiles.map((file, index) => (
                          <div
                            key={index}
                            className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800"
                          >
                            <span className="text-xs font-medium text-ink-700 dark:text-ink-200 truncate">
                              {file.name}
                            </span>
                            <button
                              onClick={() => removeFile(index)}
                              className="text-ink-400 hover:text-red-500 transition-colors"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      onClick={handleSubmit}
                      className="w-full rounded-xl bg-saffron-500 px-4 py-3 text-sm font-bold text-ink-900 transition hover:bg-saffron-600 shadow-sm dark:bg-saffron-400 dark:text-ink-900"
                    >
                      {type === 'zyg' ? 'Create Agent' : 'Create Prompt'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Right Preview Panel */}
          <div className="lg:col-span-2 p-6 bg-ink-50/50 dark:bg-ink-800/30">
            <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-4">Preview</p>
            <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm dark:border-ink-700 dark:bg-ink-900">
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm text-xl"
                  style={{
                    background: `linear-gradient(135deg, ${selectedColor}40, ${selectedColor}80)`,
                    border: `1px solid ${selectedColor}60`,
                  }}
                >
                  <span className="filter drop-shadow-sm">{selectedEmoji}</span>
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-ink-900 dark:text-ink-50 truncate">{displayName}</h3>
                  <p className="text-xs text-ink-500 truncate">{displayDescription}</p>
                  {selectedModel && (
                    <p className="text-[10px] text-saffron-600 dark:text-saffron-400 mt-0.5 font-medium truncate">
                      {displayModel}
                    </p>
                  )}
                </div>
              </div>

              {instructions && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1">Instructions</p>
                  <p className="text-xs text-ink-600 dark:text-ink-300 line-clamp-3">{instructions}</p>
                </div>
              )}

              {starters.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-2">Conversation Starters</p>
                  <div className="flex flex-wrap gap-2">
                    {starters.map((starter) => (
                      <button
                        key={starter.id}
                        className="inline-flex items-center rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-700 hover:bg-saffron-100 hover:text-saffron-700 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-saffron-900/40 transition-colors"
                      >
                        {starter.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {uploadedFiles.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-2">Knowledge</p>
                  <div className="flex flex-wrap gap-2">
                    {uploadedFiles.map((f, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-semibold text-ink-600 dark:bg-ink-800 dark:text-ink-300"
                      >
                        <Upload size={10} />
                        {f.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800">
                <div className="flex items-center gap-2 rounded-xl border border-ink-200 bg-ink-50 px-3 py-2 dark:border-ink-700 dark:bg-ink-950">
                  <input
                    type="text"
                    placeholder="Send a message..."
                    disabled
                    className="flex-1 bg-transparent text-xs text-ink-500 outline-none"
                  />
                  <Send size={14} className="text-ink-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZygStudioPublisher;
