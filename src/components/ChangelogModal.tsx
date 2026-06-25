import React, { useState, useEffect } from 'react';
import { X, ClipboardList } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true
});

interface Changelog {
  id: number;
  version: string;
  content: string;
  created_at: string;
}

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  const [changelogs, setChangelogs] = useState<Changelog[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch latest public changelogs when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchChangelogs = async () => {
        setLoading(true);
        try {
          const response = await fetch(`${API_BASE}/changelogs`);
          if (response.ok) {
            const data = await response.json();
            setChangelogs(data.changelogs || []);
          }
        } catch {
          // No changelogs or error
        } finally {
          setLoading(false);
        }
      };
      fetchChangelogs();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-900/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-6 py-5 border-b border-ink-100 dark:border-ink-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-100 text-saffron-600 dark:bg-saffron-900/30 dark:text-saffron-400">
              <ClipboardList size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink-900 dark:text-ink-50">
                What's New
              </h2>
              <p className="text-xs font-semibold text-ink-500 uppercase tracking-widest">Release Notes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-ink-100 text-ink-500 transition-colors dark:hover:bg-ink-800"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-ink-500">
              Loading release notes...
            </div>
          ) : changelogs.length > 0 ? (
            changelogs.map((log) => (
              <div key={log.id} className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <h3 className="text-xl font-bold text-ink-900 dark:text-ink-50">{log.version}</h3>
                  <span className="text-xs font-bold uppercase tracking-widest text-ink-400 border border-ink-200 dark:border-ink-700 px-3 py-1 rounded-full">
                    {new Date(log.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div
                  className="blog-content text-[15px] leading-relaxed text-ink-800 dark:text-ink-200"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(marked.parse(log.content) as string)
                  }}
                />
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-ink-400">
              <ClipboardList size={32} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">No release notes available at this time.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;