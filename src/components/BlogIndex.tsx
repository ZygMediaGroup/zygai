import React, { useEffect, useState } from 'react';
import { API_BASE } from '@/utils/apiBase';

interface BlogSummary {
  id: number;
  slug: string;
  title: string;
  meta_description?: string | null;
  created_at: string;
  updated_at: string;
}

const BlogIndex: React.FC = () => {
  const [posts, setPosts] = useState<BlogSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(`${API_BASE}/blog`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Failed to load blog.');
        setPosts(data.posts || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load blog.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    document.title = 'ZygAI Blog · Announcements';
    const existing = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const description = 'Product updates, launch notes, and platform announcements.';
    if (existing) {
      existing.setAttribute('content', description);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = description;
      document.head.appendChild(meta);
    }
  }, []);

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <div className="relative overflow-hidden border-b border-ink-100 bg-white/90 px-6 py-12 dark:border-ink-800 dark:bg-ink-900/80">
        <div className="absolute -left-24 -top-20 h-44 w-44 rounded-full bg-ink-200/60 blur-3xl dark:bg-ink-700/40" />
        <div className="absolute -right-20 top-8 h-48 w-48 rounded-full bg-saffron-200/50 blur-3xl" />
        <div className="mx-auto flex max-w-4xl flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-ink-400">
            ZygAI announcements
          </p>
          <h1 className="font-display text-4xl font-semibold sm:text-5xl">
            ZygAI Blog
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-200">
            Product updates, launch notes, and platform announcements.
          </p>
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl gap-6 px-6 py-12">
        {loading && <p className="text-sm text-ink-500">Loading announcements...</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && posts.length === 0 && (
          <div className="rounded-2xl border border-ink-100 bg-white p-5 text-sm text-ink-500 dark:border-ink-800 dark:bg-ink-900">
            No announcements yet.
          </div>
        )}
        {posts.map((post, index) => (
          <a
            key={post.id}
            href={`/blog/${post.slug}`}
            className={`group rounded-2xl border transition hover:-translate-y-0.5 hover:border-saffron-300 hover:shadow-lg dark:border-ink-800 ${
              index === 0
                ? 'border-ink-100 bg-white p-7 shadow-sm dark:bg-ink-900'
                : 'border-ink-100 bg-white p-5 dark:bg-ink-900'
            }`}
          >
            <div className="flex items-center justify-between gap-4">
              <h2
                className={`font-semibold text-ink-800 transition group-hover:text-ink-900 dark:text-ink-50 ${
                  index === 0 ? 'text-2xl' : 'text-xl'
                }`}
              >
                {post.title}
              </h2>
              <span className="text-xs uppercase tracking-[0.2em] text-ink-400">
                {new Date(post.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.28em] text-ink-400">
              /blog/{post.slug}
            </p>
            <p className="mt-3 text-sm text-ink-500 dark:text-ink-200">
              {post.meta_description || 'Latest announcement from the ZygAI team.'}
            </p>
          </a>
        ))}
      </div>
    </div>
  );
};

export default BlogIndex;
