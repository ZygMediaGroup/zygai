import React, { useEffect, useState } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Calendar, ListTodo, X, Save } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'completed';
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

const TasksArea: React.FC = () => {
  const { token } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');

  const fetchTasks = async () => {
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.tasks) setTasks(data.tasks);
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchTasks();
  }, [token]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle,
          due_at: newDue ? new Date(newDue).toISOString() : null
        })
      });
      if (res.ok) {
        setNewTitle('');
        setNewDue('');
        setIsCreating(false);
        fetchTasks();
      }
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  const handleToggleStatus = async (task: Task) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    try {
      const res = await fetch(`${API_BASE}/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) fetchTasks();
    } catch (err) {
      console.error('Failed to update task:', err);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/tasks/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) fetchTasks();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="flex flex-col h-full bg-white dark:bg-ink-900">
      <div className="p-6 border-b border-ink-100 dark:border-ink-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl dark:bg-emerald-900/30">
              <ListTodo className="text-emerald-600 dark:text-emerald-400" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-ink-900 dark:text-ink-50">Tasks & Todos</h1>
              <p className="text-sm text-ink-500">Stay organized and productive.</p>
            </div>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 transition-colors shadow-sm"
          >
            <Plus size={18} />
            Add Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isCreating && (
          <div className="mb-8 p-4 bg-ink-50 border border-ink-200 rounded-2xl dark:bg-ink-900 dark:border-ink-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-ink-900 dark:text-ink-50">New Task</h3>
              <button onClick={() => setIsCreating(false)} className="text-ink-400 hover:text-ink-600">
                <X size={20} />
              </button>
            </div>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full p-3 bg-white border border-ink-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:bg-ink-900 dark:border-ink-700 dark:text-ink-100 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-white border border-ink-100 rounded-xl dark:bg-ink-900 dark:border-ink-700">
                <Calendar size={16} className="text-ink-400" />
                <input
                  type="datetime-local"
                  value={newDue}
                  onChange={(e) => setNewDue(e.target.value)}
                  className="bg-transparent border-none text-sm text-ink-700 dark:text-ink-300 focus:outline-none"
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!newTitle.trim()}
                className="ml-auto flex items-center gap-2 px-6 py-2 bg-emerald-500 text-white rounded-xl font-bold hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                <Save size={18} />
                Save Task
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
          </div>
        ) : tasks.length > 0 ? (
          <div className="space-y-6">
            {pendingTasks.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-ink-400 mb-3 ml-1">Pending</h2>
                <div className="space-y-2">
                  {pendingTasks.map(task => (
                    <div key={task.id} className="group flex items-center gap-4 p-4 bg-white border border-ink-100 rounded-2xl hover:border-emerald-200 transition-all dark:bg-ink-900 dark:border-ink-800 shadow-sm">
                      <button onClick={() => handleToggleStatus(task)} className="text-ink-300 hover:text-emerald-500 transition-colors">
                        <Circle size={24} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink-900 font-medium dark:text-ink-50 truncate">{task.title}</p>
                        {task.due_at && (
                          <p className="text-[11px] text-ink-400 flex items-center gap-1 mt-0.5">
                            <Calendar size={12} />
                            {new Date(task.due_at).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 p-2 text-ink-300 hover:text-red-500 transition-all">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedTasks.length > 0 && (
              <div>
                <h2 className="text-xs font-bold uppercase tracking-widest text-ink-400 mb-3 ml-1">Completed</h2>
                <div className="space-y-2 opacity-60">
                  {completedTasks.map(task => (
                    <div key={task.id} className="group flex items-center gap-4 p-4 bg-ink-50 border border-ink-100 rounded-2xl dark:bg-ink-900 dark:border-ink-900">
                      <button onClick={() => handleToggleStatus(task)} className="text-emerald-500">
                        <CheckCircle2 size={24} />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-ink-500 line-through truncate">{task.title}</p>
                      </div>
                      <button onClick={() => handleDelete(task.id)} className="opacity-0 group-hover:opacity-100 p-2 text-ink-300 hover:text-red-500 transition-all">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-ink-50 rounded-full flex items-center justify-center mb-4 dark:bg-ink-900">
              <ListTodo size={40} className="text-ink-200 dark:text-ink-700" />
            </div>
            <h3 className="text-lg font-bold text-ink-900 dark:text-ink-50">No tasks yet</h3>
            <p className="text-sm text-ink-500 max-w-xs mt-2">
              Add a new task or ask ZygAI to help you track your todos!
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksArea;
