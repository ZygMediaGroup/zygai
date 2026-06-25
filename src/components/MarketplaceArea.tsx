import React, { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Star, Trash2, Ban, Flame, Clock, Bot, MessageSquare, AlertCircle, Search, Copy, Check, Pin, Edit2, Save, X, Plus } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import { ModelOption } from '@/types';
import clsx from 'clsx';
import ZygStudioPublisher from './ZygStudioPublisher';
import type { StudioPayload } from './ZygStudioPublisher';

export interface MarketplaceItem {
  id: string;
  user_id: string;
  item_type: 'prompt' | 'zyg';
  title: string;
  description: string;
  content: string;
  upvotes: number;
  downvotes: number;
  is_featured: number;
  author_name: string;
  user_vote?: number;
  category?: string;
  created_at: string;
}

interface MarketplaceAreaProps {
  type: 'zyg' | 'prompt';
  onNavigateToChat?: (zygId: string) => void;
}

interface PublishData {
  title: string;
  description: string;
  category: string;
  content: string;
  instructions: string;
  targetUsers: string;
  capabilities: {
    webSearch: boolean;
    imageGeneration: boolean;
    knowledgeFiles: boolean;
    memory: boolean;
    apiActions: boolean;
    codeInterpreter: boolean;
  };
  conversationStarters: string[];
  variables: Array<{ id: string; name: string; type: string; required: boolean; description: string; defaultValue: string }>;
  workflow: string[];
}

const MarketplaceArea: React.FC<MarketplaceAreaProps> = ({ type, onNavigateToChat }) => {
  const { token, user } = useAuth();
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [sort, setSort] = useState<'top' | 'new' | 'featured'>('top');
  const [category, setCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [authorFilter, setAuthorFilter] = useState<{id: string, name: string} | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemData, setEditItemData] = useState<Partial<MarketplaceItem>>({});
  const [models, setModels] = useState<ModelOption[]>([]);
  
  // Publishing state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishData, setPublishData] = useState<PublishData>({
    title: '',
    description: '',
    category: 'General',
    content: '',
    instructions: '',
    targetUsers: '',
    capabilities: {
      webSearch: false,
      imageGeneration: false,
      knowledgeFiles: false,
      memory: false,
      apiActions: false,
      codeInterpreter: false,
    },
    conversationStarters: [],
    variables: [],
    workflow: [],
  });
  const CATEGORIES = ['All', 'Coding', 'Writing', 'Productivity', 'Education', 'Fun', 'General'];

  const getAuthHeaders = (): Record<string, string> => {
    const h: Record<string, string> = {};
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  };

  useEffect(() => {
    const fetchModels = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/feature-models`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const list: ModelOption[] = Array.isArray(data?.models) ? data.models : [];
          setModels(list);
        }
      } catch (err) {
        console.error('Failed to fetch models', err);
      }
    };
    fetchModels();
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
    loadItems(1, true);
  }, [type, sort, category, debouncedSearch, authorFilter, token]);

  const loadItems = async (currentPage: number, reset: boolean = false) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);

    try {
      const catParam = category !== 'All' ? `&category=${encodeURIComponent(category)}` : '';
      const searchParam = debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : '';
      const authorParam = authorFilter ? `&authorId=${encodeURIComponent(authorFilter.id)}` : '';
      const res = await fetch(`${API_BASE}/marketplace/items?type=${type}&sort=${sort}&page=${currentPage}${catParam}${searchParam}${authorParam}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load marketplace');
      
      if (reset) {
        setItems(data.items || []);
      } else {
        setItems(prev => [...prev, ...(data.items || [])]);
      }
      setHasMore(data.hasMore || false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadItems(nextPage, false);
  };

  const handleVote = async (itemId: string, voteType: number) => {
    if (!user) {
      alert('You must be logged in to vote.');
      return;
    }
    try {
      // Optimistic update
      setItems(prev => prev.map(item => {
        if (item.id !== itemId) return item;
        const oldVote = item.user_vote || 0;
        let newUpvotes = item.upvotes;
        let newDownvotes = item.downvotes;
        
        if (oldVote === 1) newUpvotes--;
        if (oldVote === -1) newDownvotes--;
        
        if (voteType === 1) newUpvotes++;
        if (voteType === -1) newDownvotes++;

        return { ...item, user_vote: voteType, upvotes: newUpvotes, downvotes: newDownvotes };
      }));

      const res = await fetch(`${API_BASE}/marketplace/items/${itemId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ vote: voteType })
      });
      if (!res.ok) throw new Error('Vote failed');
    } catch (err: any) {
      // Revert on failure by reloading
      loadItems(1, true);
    }
  };

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleImport = async (item: MarketplaceItem, silent = false): Promise<string | undefined> => {
    if (!user) {
      alert('You must be logged in to import.');
      return undefined;
    }
    try {
      let config = {};
      try { config = JSON.parse(item.content); } catch(e) { config = { prompt_template: item.content }; }
      const res = await fetch(`${API_BASE}/personal-skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: item.title,
          description: `Imported from Marketplace: ${item.description || ''}`,
          skill_type: item.item_type === 'zyg' ? 'agent' : 'prompt',
          config,
          is_global: false
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to import');
      if (!silent) alert(`Successfully imported "${item.title}" to your Personal Workspace!`);
      return data.skill?.id;
    } catch (err: any) {
      if (!silent) alert('Import failed: ' + err.message);
    }
  };

  const handleChat = async (item: MarketplaceItem) => {
    const newId = await handleImport(item, true);
    if (newId && onNavigateToChat) {
      onNavigateToChat(newId);
    }
  };

  const handleEdit = (item: MarketplaceItem) => {
    setEditingItemId(item.id);
    setEditItemData(item);
  };

  const handleUpdate = async () => {
    if (!editingItemId || !editItemData.title?.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/marketplace/items/${editingItemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          title: editItemData.title,
          description: editItemData.description,
          content: editItemData.content,
          category: editItemData.category
        })
      });
      if (!res.ok) throw new Error('Failed to update item');
      setEditingItemId(null);
      loadItems(1, true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePublishSubmitWithContent = async (payload: StudioPayload) => {
    const updatedPublishData = {
      ...publishData,
      title: payload.name || publishData.title,
      description: payload.description || publishData.description,
      instructions: payload.instructions || publishData.instructions,
      conversationStarters: payload.conversationStarters || publishData.conversationStarters,
    };
    if (!updatedPublishData.title.trim() || !updatedPublishData.content.trim()) {
      alert('Title and content are required.');
      return;
    }
    if (type === 'zyg') {
      try {
        JSON.parse(updatedPublishData.content);
      } catch {
        alert('Zyg configuration must be valid JSON.');
        return;
      }
    }
    try {
      let mergedContent = updatedPublishData.content;
      if (type === 'zyg') {
        try {
          const parsed = JSON.parse(updatedPublishData.content || '{}');
          mergedContent = JSON.stringify({
            ...parsed,
            studio: {
              instructions: updatedPublishData.instructions,
              targetUsers: updatedPublishData.targetUsers,
              capabilities: updatedPublishData.capabilities,
              conversationStarters: updatedPublishData.conversationStarters,
              variables: updatedPublishData.variables,
              workflow: updatedPublishData.workflow,
              modelId: payload.modelId,
              icon: payload.icon,
              iconColor: payload.iconColor,
            },
          });
        } catch {
          mergedContent = JSON.stringify({
            prompt_template: updatedPublishData.content,
            studio: {
              instructions: updatedPublishData.instructions,
              targetUsers: updatedPublishData.targetUsers,
              capabilities: updatedPublishData.capabilities,
              conversationStarters: updatedPublishData.conversationStarters,
              variables: updatedPublishData.variables,
              workflow: updatedPublishData.workflow,
              modelId: payload.modelId,
              icon: payload.icon,
              iconColor: payload.iconColor,
            },
          });
        }
      }

      const requestBody = {
        type,
        title: updatedPublishData.title,
        description: updatedPublishData.description,
        category: updatedPublishData.category,
        content: mergedContent,
      };
      const res = await fetch(`${API_BASE}/marketplace/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(requestBody)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to publish');
      setIsPublishing(false);
      setPublishData({
        title: '',
        description: '',
        category: 'General',
        content: '',
        instructions: '',
        targetUsers: '',
        capabilities: {
          webSearch: false,
          imageGeneration: false,
          knowledgeFiles: false,
          memory: false,
          apiActions: false,
          codeInterpreter: false,
        },
        conversationStarters: [],
        variables: [],
        workflow: [],
      });
      loadItems(1, true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this item?')) return;
    try {
      await fetch(`${API_BASE}/marketplace/items/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      loadItems(1, true);
    } catch (e) {}
  };

  const handleFeature = async (id: string, isFeatured: boolean) => {
    try {
      await fetch(`${API_BASE}/admin/marketplace/items/${id}/feature`, { 
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ is_featured: !isFeatured })
      });
      loadItems(1, true);
    } catch (e) {}
  };

  const handleBanUser = async (userId: string) => {
    if (!confirm('Ban this user from posting to the marketplace?')) return;
    try {
      await fetch(`${API_BASE}/admin/users/${userId}/marketplace-ban`, { 
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ banned: true })
      });
      alert('User banned from marketplace.');
    } catch (e) {}
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)]">
      <div className="mx-auto max-w-4xl p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-600 text-ink-900 shadow-md">
              <div className="absolute inset-0 rounded-2xl bg-saffron-400/25 animate-ping" style={{ animationDuration: '3s' }} />
              {type === 'zyg' ? <Bot size={24} className="relative z-10" /> : <MessageSquare size={24} className="relative z-10" />}
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-ink-50">
                {type === 'zyg' ? "Zyg's Marketplace" : "Prompts Marketplace"}
              </h1>
              <p className="text-sm text-ink-500">Discover and share the best community creations.</p>
            </div>
          </div>
          
          <button
            onClick={() => setIsPublishing(true)}
            className="flex items-center gap-2 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-ink-700 hover:scale-[1.02] active:scale-95 dark:bg-ink-100 dark:text-black dark:hover:bg-white shadow-md"
          >
            <Plus size={18} />
            Publish {type === 'zyg' ? 'Zyg' : 'Prompt'}
          </button>
        </div>

        {authorFilter && (
          <div className="mb-6 flex items-center justify-between rounded-2xl border border-saffron-200 bg-saffron-50 px-5 py-4 dark:border-ink-800 dark:bg-ink-900">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-200 text-saffron-700 dark:bg-ink-800 dark:text-ink-100">
                <span className="font-bold text-lg">{authorFilter.name.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-saffron-600 dark:text-ink-300">Author Profile</p>
                <p className="text-sm font-medium text-ink-900 dark:text-ink-50">Viewing items shared by <span className="font-bold">{authorFilter.name}</span></p>
              </div>
            </div>
            <button 
              onClick={() => setAuthorFilter(null)}
              className="rounded-xl bg-white px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink-600 shadow-sm transition hover:bg-ink-50 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700"
            >
              Clear filter
            </button>
          </div>
        )}

        {/* Navigation / Sort */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setSort('top')} className={clsx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all active:scale-95", sort === 'top' ? "bg-saffron-500 text-ink-900 shadow-sm dark:bg-ink-100 dark:text-black" : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700")}>
            <Flame size={16} /> Top Voted
          </button>
          <button onClick={() => setSort('new')} className={clsx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all active:scale-95", sort === 'new' ? "bg-saffron-500 text-ink-900 shadow-sm dark:bg-ink-100 dark:text-black" : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700")}>
            <Clock size={16} /> Newest
          </button>
          <button onClick={() => setSort('featured')} className={clsx("flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all active:scale-95", sort === 'featured' ? "bg-saffron-500 text-ink-900 shadow-sm dark:bg-ink-100 dark:text-black" : "bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700")}>
            <Star size={16} /> Featured
          </button>
          
          <div className="relative ml-auto flex-1 max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-4 text-sm font-semibold text-ink-700 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
            />
          </div>
          
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 focus:border-saffron-400 focus:outline-none dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200"
          >
            {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-900 dark:text-red-400">
            <AlertCircle size={16} /> {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4">
            {[1,2,3].map(i => (
              <div key={i} className="rounded-2xl border border-ink-200 bg-white p-5 dark:border-ink-800 dark:bg-ink-900 animate-pulse">
                <div className="flex gap-4">
                  <div className="flex flex-col gap-2 items-center justify-center w-10">
                    <div className="h-8 w-8 rounded-xl bg-ink-100 dark:bg-ink-800" />
                    <div className="h-4 w-6 rounded bg-ink-100 dark:bg-ink-800" />
                    <div className="h-8 w-8 rounded-xl bg-ink-100 dark:bg-ink-800" />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="h-5 w-2/3 rounded-lg bg-ink-100 dark:bg-ink-800" />
                    <div className="h-3 w-1/3 rounded bg-ink-100 dark:bg-ink-800" />
                    <div className="h-4 w-full rounded bg-ink-100 dark:bg-ink-800" />
                    <div className="h-4 w-4/5 rounded bg-ink-100 dark:bg-ink-800" />
                    <div className="flex gap-2 pt-1">
                      <div className="h-8 w-20 rounded-lg bg-ink-100 dark:bg-ink-800" />
                      <div className="h-8 w-20 rounded-lg bg-ink-100 dark:bg-ink-800" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-ink-200 bg-white p-12 text-center shadow-sm dark:border-ink-800 dark:bg-ink-900">
            <p className="text-ink-500">No items found in this category.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map(item => (
              <div 
                key={item.id} 
                className={clsx(
                  "group relative flex flex-col gap-3 rounded-2xl border p-4 sm:p-5 transition-all hover:shadow-lg hover:-translate-y-0.5",
                  item.item_type === 'zyg'
                    ? "border-saffron-200 bg-gradient-to-br from-white to-saffron-50/70 dark:border-saffron-900/40 dark:from-ink-900 dark:to-saffron-900/10 shadow-sm shadow-saffron-100/50 dark:shadow-none"
                    : "border-ink-200 bg-white shadow-sm dark:border-ink-800 dark:bg-ink-900"
                )}
              >
                
                {/* Voting Column */}
                <div className="flex shrink-0 flex-row items-center gap-1">
                  <button onClick={() => handleVote(item.id, item.user_vote === 1 ? 0 : 1)} className={clsx("rounded-lg p-1.5 transition-all active:scale-90", item.user_vote === 1 ? "bg-saffron-100 text-saffron-600 dark:bg-saffron-900/40 dark:text-saffron-400" : "text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800")}>
                    <ArrowUp size={14} strokeWidth={2.5} />
                  </button>
                  <span className={clsx("min-w-[1.5rem] text-center text-xs font-bold tabular-nums", (item.upvotes - item.downvotes) > 0 ? "text-saffron-600 dark:text-saffron-400" : "text-ink-500 dark:text-ink-400")}>{item.upvotes - item.downvotes}</span>
                  <button onClick={() => handleVote(item.id, item.user_vote === -1 ? 0 : -1)} className={clsx("rounded-lg p-1.5 transition-all active:scale-90", item.user_vote === -1 ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" : "text-ink-400 hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800")}>
                    <ArrowDown size={14} strokeWidth={2.5} />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {editingItemId === item.id ? (
                    <div className="space-y-3">
                      <input
                        value={editItemData.title || ''}
                        onChange={e => setEditItemData(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-bold dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                        placeholder="Title"
                      />
                      <input
                        value={editItemData.description || ''}
                        onChange={e => setEditItemData(prev => ({ ...prev, description: e.target.value }))}
                        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                        placeholder="Description"
                      />
                      <select
                        value={editItemData.category || 'General'}
                        onChange={e => setEditItemData(prev => ({ ...prev, category: e.target.value }))}
                        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                      >
                        {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <textarea
                        value={editItemData.content || ''}
                        onChange={e => setEditItemData(prev => ({ ...prev, content: e.target.value }))}
                        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-mono dark:border-ink-700 dark:bg-ink-900 dark:text-ink-50"
                        rows={4}
                        placeholder={item.item_type === 'zyg' ? 'JSON Config' : 'Prompt Content'}
                      />
                      <div className="flex gap-2">
                        <button onClick={handleUpdate} className="flex items-center gap-2 rounded-lg bg-ink-900 px-4 py-2 text-sm font-semibold text-white hover:bg-ink-700 dark:bg-ink-100 dark:text-ink-900">
                          <Save size={16} /> Save
                        </button>
                        <button onClick={() => setEditingItemId(null)} className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200">
                          <X size={16} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                    {item.item_type === 'zyg' && (
                      <Bot size={18} className="text-saffron-500 flex-shrink-0" />
                    )}
                    {item.item_type === 'prompt' && (
                      <MessageSquare size={18} className="text-ink-400 flex-shrink-0" />
                    )}
                    <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50 truncate">{item.title}</h3>
                    {item.is_featured === 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-saffron-400 to-saffron-500 px-2.5 py-0.5 text-xs font-bold text-ink-900 shadow-sm">
                        <Star size={10} fill="currentColor" /> Featured
                      </span>
                    )}
                    {item.category && (
                      <span className="inline-flex items-center rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-500 dark:bg-ink-800 dark:text-ink-400 max-w-[100px] truncate">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-ink-500 mb-3">
                    By <button 
                      onClick={() => setAuthorFilter({ id: item.user_id, name: item.author_name || 'Anonymous' })} 
                      className="font-semibold text-ink-700 hover:text-saffron-500 hover:underline dark:text-ink-300 dark:hover:text-saffron-400"
                    >{item.author_name || 'Anonymous'}</button> • {new Date(item.created_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-ink-700 dark:text-ink-200 mb-4 line-clamp-2">{item.description}</p>
                  
                  {/* Action Row */}
                  <div className="flex items-center gap-3">
                    {item.item_type === 'prompt' ? (
                      <>
                        <button onClick={() => handleCopy(item.content, item.id)} className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-xs sm:text-sm font-semibold text-ink-700 transition-all hover:bg-ink-200 active:scale-95 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700">
                          {copiedId === item.id ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} 
                          {copiedId === item.id ? 'Copied!' : 'Copy'}
                        </button>
                        <button onClick={() => handleImport(item)} className="flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white transition-all hover:bg-ink-700 active:scale-95 dark:bg-ink-100 dark:text-ink-900">
                          <Star size={14} /> Save
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => handleChat(item)} className="flex items-center gap-1.5 rounded-lg bg-saffron-500 px-3 py-1.5 text-xs sm:text-sm font-semibold text-ink-900 transition-all hover:bg-saffron-600 active:scale-95 shadow-sm">
                          <MessageSquare size={14} /> Chat
                        </button>
                        <button onClick={() => handleImport(item)} className="flex items-center gap-1.5 rounded-lg bg-ink-100 px-3 py-1.5 text-xs sm:text-sm font-semibold text-ink-700 transition-all hover:bg-ink-200 active:scale-95 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700">
                          <Pin size={14} /> Pin
                        </button>
                      </>
                    )}
                    
                    {/* Owner / Admin Tools */}
                    {(user?.id === item.user_id || user?.role === 'admin') && (
                      <div className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit(item)} className="rounded-lg border border-ink-200 p-2 text-ink-500 hover:text-saffron-500 hover:border-saffron-300" title="Edit Post"><Edit2 size={16} /></button>
                        <button onClick={() => handleDelete(item.id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50" title="Delete Post"><Trash2 size={16} /></button>
                        {user?.role === 'admin' && (
                          <>
                            <button onClick={() => handleFeature(item.id, Boolean(item.is_featured))} className="rounded-lg border border-ink-200 p-2 text-ink-500 hover:text-saffron-500 hover:border-saffron-300" title="Toggle Feature"><Star size={16} /></button>
                            <button onClick={() => handleBanUser(item.user_id)} className="rounded-lg border border-red-200 p-2 text-red-500 hover:bg-red-50" title="Ban User"><Ban size={16} /></button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                    </>
                  )}
                </div>

              </div>
            ))}

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-xl border border-ink-200 bg-white px-8 py-3 text-sm font-bold text-ink-700 transition-all hover:bg-ink-50 hover:shadow-md hover:-translate-y-0.5 active:scale-95 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-ink-800/50 disabled:opacity-50 shadow-sm"
                >
                  {loadingMore ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {isPublishing && (
        <ZygStudioPublisher
          type={type}
          models={models.map((m) => ({ id: m.id, label: m.label, provider: m.provider }))}
          isOpen={isPublishing}
          onClose={() => setIsPublishing(false)}
          initialData={{
            name: publishData.title,
            description: publishData.description,
            instructions: publishData.instructions,
            conversationStarters: publishData.conversationStarters,
            knowledgeFiles: [],
            modelId: (publishData as any).studio?.modelId,
            icon: (publishData as any).studio?.icon,
            iconColor: (publishData as any).studio?.iconColor,
          }}
          onSubmit={handlePublishSubmitWithContent}
        />
      )}
    </div>
  );
};

export default MarketplaceArea;
