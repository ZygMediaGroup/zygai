import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Search, StickyNote, Bell, Calendar, X, Save } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';
import clsx from 'clsx';

interface Note {
  id: string;
  content: string;
  reminder_at: string | null;
  notified: number;
  created_at: string;
  updated_at: string;
}

const NotesArea: React.FC = () => {
  const { token } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newReminder, setNewReminder] = useState('');

  const fetchNotes = async () => {
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.notes) setNotes(data.notes);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchNotes();
  }, [token]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          content: newContent,
          reminder_at: newReminder ? new Date(newReminder).toISOString() : null
        })
      });
      if (res.ok) {
        setNewContent('');
        setNewReminder('');
        setIsCreating(false);
        fetchNotes();
      }
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/notes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchNotes();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const filteredNotes = notes.filter(n =>
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-ink-900">
      <div className="p-6 border-b border-ink-100 dark:border-ink-800">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-saffron-100 rounded-xl dark:bg-saffron-900/30">
              <StickyNote className="text-saffron-600 dark:text-saffron-400" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-ink-900 dark:text-ink-50">Notes & Reminders</h1>
              <p className="text-sm text-ink-500">Keep track of your thoughts and important tasks.</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-saffron-500 text-white rounded-xl font-semibold hover:bg-saffron-600 transition-colors shadow-sm"
          >
            <Plus size={18} />
            New Note
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" size={18} />
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-ink-50 border border-ink-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-100"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isCreating && (
          <div className="mb-6 p-4 bg-ink-50 border border-ink-200 rounded-2xl dark:bg-ink-900 dark:border-ink-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-ink-900 dark:text-ink-50">Create New Note</h3>
              <button onClick={() => setIsCreating(false)} className="text-ink-400 hover:text-ink-600">
                <X size={20} />
              </button>
            </div>
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="What's on your mind?"
              className="w-full h-32 p-3 bg-white border border-ink-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-saffron-400 dark:bg-ink-900 dark:border-ink-700 dark:text-ink-100 mb-4 resize-none"
            />
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-ink-100 rounded-xl dark:bg-ink-900 dark:border-ink-700">
                <Bell size={16} className="text-ink-400" />
                <input
                  type="datetime-local"
                  value={newReminder}
                  onChange={(e) => setNewReminder(e.target.value)}
                  className="bg-transparent border-none text-sm text-ink-700 dark:text-ink-300 focus:outline-none"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!newContent.trim()}
                className="ml-auto flex items-center gap-2 px-6 py-2 bg-saffron-500 text-white rounded-xl font-bold hover:bg-saffron-600 transition-colors disabled:opacity-50 shadow-sm"
              >
                <Save size={18} />
                Save Note
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-saffron-500"></div>
          </div>
        ) : filteredNotes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNotes.map((note) => (
              <div
                key={note.id}
                className="group relative p-5 bg-white border border-ink-100 rounded-2xl shadow-sm hover:shadow-md transition-all dark:bg-ink-900 dark:border-ink-800"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-ink-50 rounded-lg dark:bg-ink-900">
                    <StickyNote size={18} className="text-ink-400" />
                  </div>
                  <button
                    onClick={() => handleDelete(note.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-ink-400 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                <p className="text-ink-800 dark:text-ink-200 whitespace-pre-wrap mb-4 leading-relaxed">{note.content}</p>
                <div className="mt-auto flex items-center justify-between text-[11px] font-medium text-ink-400">
                  <div className="flex items-center gap-1.5">
                    <Calendar size={12} />
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  </div>
                  {note.reminder_at && (
                    <div className={clsx(
                      "flex items-center gap-1.5 px-2 py-0.5 rounded-full",
                      note.notified ? "bg-ink-100 text-ink-400 dark:bg-ink-900" : "bg-saffron-50 text-saffron-600 dark:bg-saffron-900/20 dark:text-saffron-400"
                    )}>
                      <Bell size={12} />
                      <span>{new Date(note.reminder_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-ink-50 rounded-full flex items-center justify-center mb-4 dark:bg-ink-900">
              <StickyNote size={40} className="text-ink-200 dark:text-ink-700" />
            </div>
            <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">No notes found</h3>
            <p className="text-sm text-ink-500 max-w-xs mt-2">
              Start by creating a new note or ask the AI to remember something for you!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesArea;
