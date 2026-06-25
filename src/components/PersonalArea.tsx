import React, { useEffect, useState, useRef } from 'react';
import { Plus, Edit2, Trash2, Save, X, FileText, Upload, Search, Brain, Sparkles, AlertCircle, Globe } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

interface PersonalKnowledge {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  is_global: number;
  document_count: number;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

interface Document {
  id: string;
  filename: string;
  mime_type: string;
  file_size: number;
  status: string;
  chunk_count: number;
  error_message?: string;
  created_at: string;
}

interface Skill {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  skill_type: string;
  config: Record<string, any>;
  enabled: boolean;
  is_global?: number;
  knowledge_id?: string | null;
  created_at: string;
  updated_at: string;
}

type Tab = 'knowledge' | 'skills';

const PERSONAL_KNOWLEDGE_LIMITS: Record<string, number> = {
  free: 2,
  go: 50,
  plus: 100,
  beta: 100
};

const PERSONAL_SKILLS_LIMITS: Record<string, number> = {
  free: 2,
  go: 50,
  plus: 100,
  beta: 100
};

const PLAN_LABELS: Record<string, string> = {
  free: 'ZygAI Free',
  go: 'ZygAI Go',
  plus: 'ZygAI Plus',
  beta: 'ZygAI Beta'
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] || '');
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

const PersonalArea: React.FC = () => {
  const { token, user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('knowledge');
  const [knowledge, setKnowledge] = useState<PersonalKnowledge[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // Knowledge forms
  const [isCreatingKnowledge, setIsCreatingKnowledge] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newKnowledge, setNewKnowledge] = useState({ name: '', description: '', system_prompt: '' });
  const [editKnowledge, setEditKnowledge] = useState({ name: '', description: '', system_prompt: '' });

  // Expanded knowledge details
  const [expandedKnowledge, setExpandedKnowledge] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Record<string, Document[]>>({});
  const [uploadingDocFor, setUploadingDocFor] = useState<string | null>(null);
  const [newKnowledgeFiles, setNewKnowledgeFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const newFileInputRef = useRef<HTMLInputElement | null>(null);
  const newFolderInputRef = useRef<HTMLInputElement | null>(null);

  // RAG query
  const [queryKnowledgeId, setQueryKnowledgeId] = useState<string | null>(null);
  const [queryText, setQueryText] = useState('');
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [queryLoading, setQueryLoading] = useState(false);

  // Skills forms
  const [isCreatingSkill, setIsCreatingSkill] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [newSkill, setNewSkill] = useState<{name: string, description: string, skill_type: string, config: any, knowledge_id: string | null}>({ name: '', description: '', skill_type: 'prompt', config: {}, knowledge_id: null });
  const [editSkill, setEditSkill] = useState<Partial<Skill>>({});

  const getAuthHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  const userPlan = (user?.plan as keyof typeof PERSONAL_KNOWLEDGE_LIMITS) || 'free';
  const knowledgeLimit = PERSONAL_KNOWLEDGE_LIMITS[userPlan] ?? 2;
  const skillsLimit = PERSONAL_SKILLS_LIMITS[userPlan] ?? 2;
  const currentKnowledgeCount = knowledge.length;
  const currentSkillsCount = skills.length;

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      const headers = getAuthHeaders();
      const [kRes, sRes] = await Promise.all([
        fetch(`${API_BASE}/personal`, { headers }),
        fetch(`${API_BASE}/personal-skills`, { headers })
      ]);
      const [kData, sData] = await Promise.all([
        kRes.json().catch(() => ({})),
        sRes.json().catch(() => ({}))
      ]);
      if (!kRes.ok) throw new Error(kData?.error || 'Failed to load knowledge');
      if (!sRes.ok) throw new Error(sData?.error || 'Failed to load skills');
      setKnowledge(kData.personal || []);
      setSkills(sData.skills || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---- Knowledge CRUD ----
  const createKnowledge = async () => {
    if (!newKnowledge.name.trim()) return;
    setUploadingDocFor('new');
    try {
      const res = await fetch(`${API_BASE}/personal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(newKnowledge)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create');
      
      let targetKbId = data.id || data.knowledge?.id || data.personal?.id;
      
      if (!targetKbId && newKnowledgeFiles.length > 0) {
         const kRes = await fetch(`${API_BASE}/personal`, { headers: getAuthHeaders() });
         const kData = await kRes.json().catch(() => ({}));
         const created = (kData.personal || []).find((k: any) => k.name === newKnowledge.name);
         if (created) targetKbId = created.id;
      }

      if (targetKbId && newKnowledgeFiles.length > 0) {
         const filesPayload = await Promise.all(newKnowledgeFiles.map(async f => ({
           file: await fileToBase64(f),
           fileName: f.name,
           mimeType: f.type || 'application/octet-stream'
         })));
         
         const docRes = await fetch(`${API_BASE}/personal/${targetKbId}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ files: filesPayload })
         });
         if (!docRes.ok) {
            const docData = await docRes.json().catch(() => ({}));
            throw new Error(docData?.error || 'Failed to upload documents');
         }
      }

      await loadAll();
      setIsCreatingKnowledge(false);
      setNewKnowledge({ name: '', description: '', system_prompt: '' });
      setNewKnowledgeFiles([]);
    } catch (err: any) { 
      setError(err.message); 
    } finally {
      setUploadingDocFor(null);
    }
  };

  const updateKnowledge = async () => {
    if (!editingId || !editKnowledge.name?.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/personal/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(editKnowledge)
      });
      if (!res.ok) throw new Error('Failed to update');
      await loadAll();
      setEditingId(null);
    } catch (err: any) { setError(err.message); }
  };

  const deleteKnowledge = async (id: string) => {
    if (!confirm('Delete this knowledge base? All documents and chunks will be permanently deleted.')) return;
    try {
      const res = await fetch(`${API_BASE}/personal/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      await loadAll();
      setExpandedKnowledge(null);
    } catch (err: any) { setError(err.message); }
  };

  const toggleGlobalStatus = async (kb: PersonalKnowledge) => {
    try {
      const newStatus = kb.is_global === 1 ? 0 : 1;
      const res = await fetch(`${API_BASE}/personal/${kb.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ name: kb.name, is_global: newStatus === 1 })
      });
      if (!res.ok) throw new Error('Failed to update global status');
      setKnowledge(prev => prev.map(k => k.id === kb.id ? { ...k, is_global: newStatus } : k));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggleGlobalSkillStatus = async (skill: Skill) => {
    try {
      const newStatus = skill.is_global === 1 ? 0 : 1;
      const res = await fetch(`${API_BASE}/personal-skills/${skill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_global: newStatus === 1 })
      });
      if (!res.ok) throw new Error('Failed to update global status');
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, is_global: newStatus } : s));
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ---- Documents ----
  const loadDocuments = async (knowledgeId: string) => {
    if (documents[knowledgeId]) return;
    try {
      const res = await fetch(`${API_BASE}/personal/${knowledgeId}/documents`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setDocuments(prev => ({ ...prev, [knowledgeId]: data.documents || [] }));
    } catch {}
  };

  const toggleExpand = (id: string) => {
    if (expandedKnowledge === id) {
      setExpandedKnowledge(null);
    } else {
      setExpandedKnowledge(id);
      loadDocuments(id);
    }
  };

  const handleFileSelect = async (kbId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const allowedExts = ['.pdf', '.docx', '.txt', '.md', '.html', '.htm', '.csv'];
    const fileArray = Array.from(files).filter(f => 
      allowedExts.some(ext => f.name.toLowerCase().endsWith(ext))
    );

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const validSizeFiles = fileArray.filter(f => f.size <= MAX_FILE_SIZE);
    if (validSizeFiles.length < fileArray.length) {
      alert('Some files were skipped because they exceed the 10MB size limit per file.');
    }

    if (validSizeFiles.length === 0) {
      alert('No valid documents found in selection.');
      if (e.target) e.target.value = '';
      return;
    }

    if (user?.role !== 'admin') {
      const currentDocsCount = documents[kbId]?.length || 0;
      if (currentDocsCount + validSizeFiles.length > 20) {
        alert('Maximum 20 files allowed per Knowledge Base.');
        if (e.target) e.target.value = '';
        return;
      }
      const totalSize = validSizeFiles.reduce((acc, f) => acc + f.size, 0);
      if (totalSize > 50 * 1024 * 1024) {
        alert('Total dataset size cannot exceed 50MB per upload batch.');
        if (e.target) e.target.value = '';
        return;
      }
    }

    if (e.target) e.target.value = ''; // reset for same file selection

    setUploadingDocFor(kbId);
    setError(undefined);
    try {
      const filesPayload = await Promise.all(validSizeFiles.map(async f => ({
        file: await fileToBase64(f),
        fileName: f.name,
        mimeType: f.type || 'application/octet-stream'
      })));

      const res = await fetch(`${API_BASE}/personal/${kbId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ files: filesPayload })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to upload documents');

      await loadDocuments(kbId);
      await loadAll(); // refresh doc count
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUploadingDocFor(null);
    }
  };

  const handleNewKnowledgeFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const allowedExts = ['.pdf', '.docx', '.txt', '.md', '.html', '.htm', '.csv'];
      const files = Array.from(e.target.files).filter(f => 
        allowedExts.some(ext => f.name.toLowerCase().endsWith(ext))
      );
      
      const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
      const validSizeFiles = files.filter(f => f.size <= MAX_FILE_SIZE);
      if (validSizeFiles.length < files.length) {
        alert('Some files were skipped because they exceed the 10MB size limit per file.');
      }

      if (validSizeFiles.length === 0) {
        if (e.target.value) e.target.value = '';
        return;
      }

      const combined = [...newKnowledgeFiles, ...validSizeFiles];
      
      if (user?.role !== 'admin') {
        if (combined.length > 20) {
          alert('Maximum 20 files allowed per Knowledge Base.');
          e.target.value = '';
          return;
        }
        const totalSize = combined.reduce((acc, f) => acc + f.size, 0);
        if (totalSize > 50 * 1024 * 1024) {
          alert('Total dataset size cannot exceed 50MB.');
          e.target.value = '';
          return;
        }
      }
      setNewKnowledgeFiles(combined);
    }
    e.target.value = '';
  };

   const deleteDocument = async (knowledgeId: string, docId: string) => {
    if (!confirm('Delete this document?')) return;
    try {
      const res = await fetch(`${API_BASE}/personal/${knowledgeId}/documents/${docId}`, {
        method: 'DELETE', headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Failed to delete');
      await loadDocuments(knowledgeId);
    } catch (err: any) { setError(err.message); }
  };

  // ---- RAG Query ----
  const queryKnowledge = async () => {
    if (!queryKnowledgeId || !queryText.trim()) return;
    setQueryLoading(true);
    setQueryResults([]);
    try {
      const res = await fetch(`${API_BASE}/personal/${queryKnowledgeId}/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ query: queryText, limit: 5 })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Query failed');
      setQueryResults(data.results || []);
    } catch (err: any) { setError(err.message); }
    finally { setQueryLoading(false); }
  };

  // ---- Skills CRUD ----
  const createSkill = async () => {
    if (!newSkill.name.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/personal-skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(newSkill)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create');
      await loadAll();
      setIsCreatingSkill(false);
      setNewSkill({ name: '', description: '', skill_type: 'prompt', config: {}, knowledge_id: null });
    } catch (err: any) { setError(err.message); }
  };

  const publishToMarketplace = async (skill: Skill) => {
    if (!confirm(`Publish "${skill.name}" to the public marketplace?`)) return;
    const category = prompt('Enter a category tag (e.g., Coding, Writing, Productivity, Fun):') || 'General';

    try {
      const res = await fetch(`${API_BASE}/marketplace/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          type: skill.skill_type === 'prompt' ? 'prompt' : 'zyg',
          title: skill.name,
          description: skill.description || '',
          content: skill.config ? JSON.stringify(skill.config, null, 2) : '',
          category
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to publish');
      alert('Successfully published to the marketplace!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const updateSkill = async () => {
    if (!editingSkillId || !editSkill.name?.trim()) return;
    try {
      const payload = {
        name: editSkill.name.trim(),
        description: editSkill.description?.trim() || '',
        skill_type: (editSkill.skill_type || 'prompt').toLowerCase(),
        config: editSkill.config || {},
        knowledge_id: editSkill.knowledge_id || null,
        enabled: editSkill.enabled ?? true
      };
      const res = await fetch(`${API_BASE}/personal-skills/${editingSkillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to update');
      await loadAll();
      setEditingSkillId(null);
    } catch (err: any) { setError(err.message); }
  };

  const deleteSkill = async (id: string) => {
    if (!confirm('Delete this skill?')) return;
    try {
      const res = await fetch(`${API_BASE}/personal-skills/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to delete');
      await loadAll();
    } catch (err: any) { setError(err.message); }
   };

   // Render helpers
  const renderKnowledgeList = () => (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-xl sm:text-2xl text-ink-900 dark:text-ink-50">Personal Knowledge</h1>
        <button
          onClick={() => isCreatingKnowledge ? setIsCreatingKnowledge(false) : setIsCreatingKnowledge(true)}
          disabled={currentKnowledgeCount >= knowledgeLimit}
          className={clsx(
            'flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition shrink-0',
            currentKnowledgeCount >= knowledgeLimit
              ? 'cursor-not-allowed opacity-50 bg-ink-200 text-ink-400 dark:bg-ink-800 dark:text-ink-500'
              : 'bg-saffron-500 text-ink-900 hover:bg-saffron-600 active:scale-95 shadow-sm hover:shadow-md dark:bg-ink-100 dark:text-black dark:hover:bg-white'
          )}
          title={currentKnowledgeCount >= knowledgeLimit ? `Limit reached (${knowledgeLimit})` : 'New Knowledge Base'}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Knowledge Base</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {currentKnowledgeCount >= knowledgeLimit && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
          You've reached the {knowledgeLimit} knowledge base limit for {PLAN_LABELS[userPlan]}.
          <a href="/billing" className="ml-2 underline">Upgrade</a> for more.
        </div>
      )}

      {/* Create Form */}
      {isCreatingKnowledge && (
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-950">
          <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Create New Knowledge Base</h3>
          <p className="mt-1 text-sm text-ink-500">Upload documents and define a system prompt for your AI assistant to learn from.</p>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Name *</label>
              <input
                value={newKnowledge.name}
                onChange={e => setNewKnowledge(prev => ({ ...prev, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                placeholder="e.g., Research Papers"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Description</label>
              <input
                value={newKnowledge.description}
                onChange={e => setNewKnowledge(prev => ({ ...prev, description: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                placeholder="Brief description"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">System Prompt</label>
              <p className="text-xs text-ink-500">Instructions for how the AI should use this knowledge.</p>
              <textarea
                value={newKnowledge.system_prompt}
                onChange={e => setNewKnowledge(prev => ({ ...prev, system_prompt: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                placeholder="When answering questions, use these documents as reference..."
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Initial Documents (Optional)</label>
              <p className="text-xs text-ink-500 mb-2">Upload txt, pdf, html, docx, csv, etc. {user?.role !== 'admin' ? '(Max 20 files, 20MB total)' : '(Unlimited)'}</p>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  multiple
                  ref={newFileInputRef}
                  accept=".pdf,.docx,.txt,.md,.html,.htm,.csv"
                  onChange={handleNewKnowledgeFiles}
                  className="hidden"
                />
                <input
                  type="file"
                  multiple
                  {...{ webkitdirectory: "" }}
                  ref={newFolderInputRef}
                  onChange={handleNewKnowledgeFiles}
                  className="hidden"
                />
                <button
                  onClick={() => newFileInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
                >
                  <Upload size={14} /> Select Files
                </button>
                <button
                  onClick={() => newFolderInputRef.current?.click()}
                  className="flex items-center gap-2 rounded-lg bg-ink-100 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
                >
                  <Upload size={14} /> Select Folder
                </button>
              </div>
              {newKnowledgeFiles.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {newKnowledgeFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-md bg-saffron-50 px-2 py-1 text-xs text-saffron-700 border border-saffron-200 dark:bg-ink-800 dark:text-ink-100 dark:border-ink-700">
                      {f.name}
                      <button onClick={() => setNewKnowledgeFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-ink-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={createKnowledge} disabled={uploadingDocFor === 'new'} className="flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:bg-ink-700 dark:bg-ink-100 dark:text-black disabled:opacity-50">
                <Save size={16} /> {uploadingDocFor === 'new' ? 'Creating...' : 'Create'}
              </button>
              <button onClick={() => setIsCreatingKnowledge(false)} className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm medium hover:bg-gray-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200">
                <X size={16} className="mr-2 inline" /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {knowledge.map((kb) => (
        <div key={kb.id} className="rounded-2xl border border-ink-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 dark:border-ink-800 dark:bg-ink-950">
          <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-6">
            <div className="flex-1">
              {editingId === kb.id ? (
                <div className="space-y-3">
                  <input
                    value={editKnowledge.name}
                    onChange={e => setEditKnowledge(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                  />
                  <input
                    value={editKnowledge.description}
                    onChange={e => setEditKnowledge(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                    placeholder="Description"
                  />
                  <textarea
                    value={editKnowledge.system_prompt}
                    onChange={e => setEditKnowledge(prev => ({ ...prev, system_prompt: e.target.value }))}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                    placeholder="System prompt"
                    rows={2}
                  />
                  <div className="flex gap-2 shrink-0">
                    <button onClick={updateKnowledge} className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ink-50 dark:bg-ink-100 dark:text-black">
                      <Save size={12} /> Save
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{kb.name}</h3>
                    <p className="mt-1 text-sm text-ink-600 dark:text-ink-200">{kb.description || 'No description'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-ink-400">
                      <span>{kb.document_count} docs</span>
                      <span>{kb.chunk_count} chunks</span>
                      {user?.role === 'admin' && (
                        <button
                          onClick={() => toggleGlobalStatus(kb)}
                          className={clsx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all", kb.is_global === 1 ? "bg-saffron-100 text-saffron-700 dark:bg-ink-800 dark:text-ink-100" : "bg-ink-100 text-ink-400 dark:bg-ink-800")}
                          title="Make this knowledge base available to all users"
                        >
                          <Globe size={10} /> {kb.is_global === 1 ? 'Public' : 'Private'}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleExpand(kb.id)} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-600 transition-all hover:bg-ink-50 hover:border-saffron-300 hover:text-saffron-600 active:scale-95 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800">
                      {expandedKnowledge === kb.id ? 'Collapse' : 'Manage'}
                    </button>
                    <button onClick={() => { setEditingId(kb.id); setEditKnowledge({ name: kb.name, description: kb.description || '', system_prompt: kb.system_prompt || '' }); }} 
                            className="rounded-full p-2 border border-ink-200 transition-all hover:text-saffron-500 hover:border-saffron-300 hover:scale-110 dark:border-ink-700 dark:hover:text-ink-100">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteKnowledge(kb.id)} className="rounded-full p-2 border border-red-200 text-red-500 transition-all hover:bg-red-50 hover:border-red-400 hover:scale-110 dark:border-red-800 dark:text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Expanded details */}
          {expandedKnowledge === kb.id && (
            <div className="border-t border-ink-200 p-6 dark:border-ink-800 space-y-6">
              {/* Document upload & list */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-ink-700 dark:text-ink-200">Documents & RAG</h4>
                
                {/* Upload */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleFileSelect(kb.id, e)}
                    className="hidden"
                    multiple
                    accept=".pdf,.docx,.txt,.md,.html,.htm,.csv"
                  />
                  <input
                    type="file"
                    ref={folderInputRef}
                    onChange={(e) => handleFileSelect(kb.id, e)}
                    className="hidden"
                    multiple
                    {...{ webkitdirectory: "" }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingDocFor === kb.id}
                    className="flex items-center gap-2 rounded-lg bg-saffron-500 px-4 py-2 text-sm font-semibold text-ink-900 transition-all hover:bg-saffron-600 active:scale-95 shadow-sm disabled:opacity-50"
                  >
                    <Upload size={16} />
                    {uploadingDocFor === kb.id ? 'Uploading...' : `Upload Files`}
                  </button>
                  <button
                    onClick={() => folderInputRef.current?.click()}
                    disabled={uploadingDocFor === kb.id}
                    className="flex items-center gap-2 rounded-lg border border-saffron-400 px-4 py-2 text-sm font-semibold text-saffron-600 transition-all hover:bg-saffron-50 active:scale-95 disabled:opacity-50 dark:text-saffron-400 dark:hover:bg-saffron-900/20"
                  >
                    <Upload size={16} />
                    {uploadingDocFor === kb.id ? 'Uploading...' : `Upload Folder`}
                  </button>
                  {user?.role !== 'admin' && (
                    <span className="text-xs text-ink-500">(Max 20MB)</span>
                  )}
                </div>

                {/* Documents list */}
                <div className="mt-4 space-y-2">
                  {(documents[kb.id] || []).map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50/50 px-4 py-3 text-sm transition hover:border-ink-300 dark:border-ink-700 dark:bg-ink-800/50">
                      <div className="flex items-center gap-3">
                        <FileText size={16} className="text-ink-400" />
                        <div>
                          <p className="font-medium text-ink-900 dark:text-ink-50">{doc.filename}</p>
                          <p className="text-xs text-ink-400">
                            {(doc.file_size / 1024).toFixed(1)} KB · 
                            {doc.status === 'processing' ? ' Processing...' :
                             doc.status === 'ready' ? ` ${doc.chunk_count} chunks` :
                             ` Error: ${doc.error_message}`}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => deleteDocument(kb.id, doc.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 transition hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-900/20">Remove</button>
                    </div>
                  ))}
                  {(documents[kb.id] || []).length === 0 && !uploadingDocFor && (
                    <p className="text-sm text-ink-400">No documents uploaded yet.</p>
                  )}
                </div>
              </div>

              {/* RAG Query */}
              <div>
                <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
                  <Search size={16} /> Test Search
                </h4>
                <div className="flex gap-2">
                  <input
                    value={queryText}
                    onChange={e => setQueryText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && queryKnowledge()}
                    placeholder="Ask a question about your documents..."
                    className="flex-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                  />
                  <button
                    onClick={() => { setQueryKnowledgeId(kb.id); queryKnowledge(); }}
                    disabled={queryLoading}
                    className="flex items-center gap-2 rounded-lg bg-saffron-500 px-4 py-2 text-sm font-semibold text-ink-900 transition-all hover:bg-saffron-600 active:scale-95 shadow-sm disabled:opacity-50"
                  >
                    <Search size={16} /> {queryLoading ? 'Searching...' : 'Search'}
                  </button>
                </div>

                {queryKnowledgeId === kb.id && queryResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <h5 className="text-xs font-medium text-ink-500">Found {queryResults.length} matches</h5>
                    {queryResults.map((r) => (
                      <div key={r.id} className="rounded-lg border border-ink-200 bg-white p-3 text-sm leading-relaxed dark:border-ink-700 dark:bg-ink-800">
                        <p className="text-ink-800 dark:text-ink-100">{r.content}</p>
                        <p className="mt-1 text-xs text-ink-400">Relevance: {r.score}</p>
                      </div>
                    ))}
                  </div>
                )}
                {queryKnowledgeId === kb.id && !queryLoading && queryResults.length === 0 && queryText && (
                  <p className="mt-3 text-sm text-ink-500">No results found. Try different keywords.</p>
                )}
              </div>

              {/* System Prompt */}
              {kb.system_prompt && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-ink-700 dark:text-ink-200">System Prompt</h4>
                  <div className="rounded-lg border border-ink-200 bg-gray-50 px-4 py-3 text-sm italic text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200">
                    {kb.system_prompt}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {!loading && knowledge.length === 0 && !isCreatingKnowledge && (
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-ink-900">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink-100 dark:bg-ink-800"><Brain className="text-ink-400 dark:text-ink-500" size={32} /></div>
          <p>No personal knowledge bases yet. Create one to start building your own AI memory.</p>
        </div>
      )}
    </div>
  );

  const renderSkillsTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-xl sm:text-2xl text-ink-900 dark:text-ink-50">Personal Skills</h1>
        <button
          onClick={() => setIsCreatingSkill(true)}
          disabled={currentSkillsCount >= skillsLimit}
          className={clsx(
            'flex items-center gap-2 rounded-xl px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold transition shrink-0',
            currentSkillsCount >= skillsLimit
              ? 'cursor-not-allowed opacity-50 bg-ink-200 text-ink-400 dark:bg-ink-800 dark:text-ink-500'
              : 'bg-saffron-500 text-ink-900 hover:bg-saffron-600 active:scale-95 shadow-sm hover:shadow-md'
          )}
          title={currentSkillsCount >= skillsLimit ? `Limit reached (${skillsLimit})` : 'New Skill'}
        >
          <Plus size={16} /> <span className="hidden sm:inline">New Skill</span>
          <span className="sm:hidden">New</span>
        </button>
      </div>

      {currentSkillsCount >= skillsLimit && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
          You've reached the {skillsLimit} skills limit for {PLAN_LABELS[userPlan]}.
          <a href="/billing" className="ml-2 underline">Upgrade</a> for more.
        </div>
      )}

      {currentSkillsCount >= skillsLimit && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
          You've reached the {skillsLimit} skills limit for {PLAN_LABELS[userPlan]}.
          <a href="/billing" className="ml-2 underline">Upgrade</a> for more.
        </div>
      )}

      {/* Create skill */}
      {isCreatingSkill && (
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm dark:border-ink-800 dark:bg-ink-950">
          <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Create New Skill</h3>
          <p className="mt-1 text-sm text-ink-500">Define a custom skill or prompt for the AI to use.</p>
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Name *</label>
              <input value={newSkill.name} onChange={e => setNewSkill(prev => ({ ...prev, name: e.target.value }))}
                     className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" placeholder="Skill name" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Description</label>
              <input value={newSkill.description} onChange={e => setNewSkill(prev => ({ ...prev, description: e.target.value }))}
                     className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" placeholder="Brief description" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Type</label>
              <select value={newSkill.skill_type} onChange={e => setNewSkill(prev => ({ ...prev, skill_type: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                <option value="prompt">Prompt</option>
                <option value="function">Function Call</option>
                <option value="agent">Agent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Configuration (JSON)</label>
              <textarea value={JSON.stringify(newSkill.config, null, 2)} onChange={e => {
                try { setNewSkill(prev => ({ ...prev, config: JSON.parse(e.target.value) })); } catch {}
              }} className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-mono dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" rows={4} placeholder={`{\n  "prompt_template": "You are..."\n}`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200">Linked Knowledge Base (Optional)</label>
              <select value={newSkill.knowledge_id || ''} onChange={e => setNewSkill(prev => ({ ...prev, knowledge_id: e.target.value || null }))}
                      className="mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                <option value="">None</option>
                {knowledge.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={createSkill} className="flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-ink-50 hover:bg-ink-700 dark:bg-ink-100 dark:text-black dark:hover:bg-white">
                <Save size={16} /> Create
              </button>
              <button onClick={() => setIsCreatingSkill(false)} className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm hover:bg-gray-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-ink-800">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Skills list */}
      {skills.map((skill) => (
        <div key={skill.id} className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 dark:border-ink-800 dark:bg-ink-950">
          {editingSkillId === skill.id ? (
            <div className="space-y-3">
              <input value={editSkill.name} onChange={e => setEditSkill(prev => ({ ...prev, name: e.target.value }))}
                     className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" />
              <input value={editSkill.description} onChange={e => setEditSkill(prev => ({ ...prev, description: e.target.value }))}
                     className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" placeholder="Description" />
              <select value={editSkill.skill_type} onChange={e => setEditSkill(prev => ({ ...prev, skill_type: e.target.value }))}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                <option value="prompt">Prompt</option>
                <option value="function">Function Call</option>
                <option value="agent">Agent</option>
              </select>
              <textarea value={JSON.stringify(editSkill.config, null, 2)} onChange={e => {
                try { setEditSkill(prev => ({ ...prev, config: JSON.parse(e.target.value) })); } catch {}
              }} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-mono dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50" rows={4} />
              <label className="block text-sm font-medium text-ink-700 dark:text-ink-200 mt-2">Linked Knowledge Base</label>
              <select value={editSkill.knowledge_id || ''} onChange={e => setEditSkill(prev => ({ ...prev, knowledge_id: e.target.value || null }))}
                      className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50">
                <option value="">None</option>
                {knowledge.map(kb => (
                  <option key={kb.id} value={kb.id}>{kb.name}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={updateSkill} className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-semibold text-ink-50 dark:bg-ink-100 dark:text-black dark:hover:bg-white">
                  <Save size={12} /> Save
                </button>
                <button onClick={() => setEditingSkillId(null)} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs hover:bg-gray-50 dark:border-ink-700 dark:text-ink-200 dark:hover:bg-ink-800">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <Sparkles size={18} className="text-saffron-500" />
                  <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-50">{skill.name}</h3>
                </div>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-200">{skill.description || 'No description'}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-ink-400">
                  <span>Type: {skill.skill_type}</span>
                  <span>{skill.enabled ? 'Enabled' : 'Disabled'}</span>
                  {skill.knowledge_id && (
                    <span className="flex items-center gap-1 text-saffron-600 dark:text-saffron-400 font-semibold">
                      <Brain size={12} />
                      {knowledge.find(k => k.id === skill.knowledge_id)?.name || 'Linked Knowledge'}
                    </span>
                  )}
                  {user?.role === 'admin' && (
                    <button
                      onClick={() => toggleGlobalSkillStatus(skill)}
                      className={clsx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold transition-all", skill.is_global === 1 ? "bg-saffron-100 text-saffron-700 dark:bg-ink-800 dark:text-ink-100" : "bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-200")}
                      title="Make this skill available to all users"
                    >
                      <Globe size={10} /> {skill.is_global === 1 ? 'Public' : 'Private'}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {(skill.user_id === user?.id || user?.role === 'admin') && (
                  <>
                    <button onClick={() => publishToMarketplace(skill)} className="rounded-full p-2 border border-ink-200 transition-all hover:text-saffron-500 hover:border-saffron-300 hover:scale-110 dark:border-ink-700" title="Publish to Marketplace">
                      <Globe size={16} />
                    </button>
                    <button onClick={() => { setEditingSkillId(skill.id); setEditSkill(skill); }}
                            className="rounded-full p-2 border border-ink-200 transition-all hover:text-saffron-500 hover:border-saffron-300 hover:scale-110 dark:border-ink-700">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteSkill(skill.id)} className="rounded-full p-2 border border-red-200 text-red-500 transition-all hover:bg-red-50 hover:border-red-400 hover:scale-110 dark:border-red-800 dark:text-red-400">
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      {skills.length === 0 && !isCreatingSkill && (
        <div className="rounded-2xl border border-ink-200 bg-white p-8 text-center text-sm text-ink-500 dark:border-ink-800 dark:bg-ink-950">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-saffron-50 dark:bg-ink-900"><Sparkles className="text-saffron-400 dark:text-ink-100" size={32} /></div>
          <p>No personal skills yet. Create custom AI skills to enhance your assistant.</p>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto bg-[var(--bg)] p-6">
        <div className="mx-auto max-w-4xl space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded-xl bg-ink-100 dark:bg-ink-800" />
          <div className="h-10 w-full rounded-2xl bg-ink-100 dark:bg-ink-800" />
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-ink-200 bg-white p-6 dark:border-ink-800 dark:bg-ink-900">
              <div className="h-5 w-1/3 rounded-lg bg-ink-100 dark:bg-ink-800 mb-3" />
              <div className="h-4 w-2/3 rounded bg-ink-100 dark:bg-ink-800 mb-2" />
              <div className="h-3 w-1/4 rounded bg-ink-100 dark:bg-ink-800" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-4xl p-6">
        {/* Tab Navigation */}
        <div className="mb-6 flex gap-1 bg-ink-100/60 dark:bg-ink-800/60 rounded-2xl p-1">
          <button
            onClick={() => setActiveTab('knowledge')}
            className={clsx("flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all", activeTab === 'knowledge' ? "bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-50" : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-300")}
          >
            <Brain size={15} />
            <span className="hidden xs:inline">Knowledge</span>
            <span className="rounded-full bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold">{currentKnowledgeCount}/{knowledgeLimit}</span>
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            className={clsx("flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all", activeTab === 'skills' ? "bg-white text-ink-900 shadow-sm dark:bg-ink-900 dark:text-ink-50" : "text-ink-500 hover:text-ink-700 dark:hover:text-ink-300")}
          >
            <Sparkles size={15} />
            Skills
            <span className="rounded-full bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 text-[10px] font-bold">{currentSkillsCount}/{skillsLimit}</span>
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900 dark:text-red-400">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {activeTab === 'knowledge' && renderKnowledgeList()}
        {activeTab === 'skills' && renderSkillsTab()}
      </div>
    </div>
  );
};

export default PersonalArea;
