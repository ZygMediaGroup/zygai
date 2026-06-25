import React, { useState, useEffect } from 'react';
import { X, Megaphone } from 'lucide-react';
import { API_BASE } from '@/utils/apiBase';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: true
});

interface AnnouncementDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const AnnouncementDialog: React.FC<AnnouncementDialogProps> = ({ isOpen, onClose }) => {
  const [announcement, setAnnouncement] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Fetch latest announcement when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchAnnouncement = async () => {
        setLoading(true);
        try {
          const response = await fetch(`${API_BASE}/announcement`);
          if (response.ok) {
            const data = await response.json();
            setAnnouncement(data.message || '');
          }
        } catch {
          // No announcement or error
        } finally {
          setLoading(false);
        }
      };
      fetchAnnouncement();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-ink-900/70 backdrop-blur-sm p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900 sm:max-h-[88dvh] sm:max-w-lg sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-4 py-4 sm:items-center sm:px-5 dark:border-ink-800">
          <div className="flex min-w-0 items-center gap-2">
            <Megaphone size={20} className="mt-0.5 shrink-0 text-saffron-500 sm:mt-0" />
            <h2 className="min-w-0 text-base font-semibold text-ink-900 dark:text-ink-50 sm:text-lg">
              Important Announcement
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-6">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-sm text-ink-500">
              Loading announcement...
            </div>
          ) : announcement ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 sm:px-5 sm:py-4">
              <div
                className="prose prose-sm max-w-none break-words text-sm leading-relaxed text-amber-800 dark:prose-invert dark:text-amber-400 sm:prose-base"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(marked.parse(announcement) as string)
                }}
              />
            </div>
          ) : (
            <div className="text-center py-8 text-ink-400">
              <Megaphone size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">No announcements at this time.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-ink-100 bg-ink-50/50 px-4 py-4 dark:border-ink-800 dark:bg-ink-900/50 sm:px-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnnouncementDialog;
