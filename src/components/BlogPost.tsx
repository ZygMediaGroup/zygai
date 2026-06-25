import React, { useEffect, useMemo, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { API_BASE } from '@/utils/apiBase';

marked.setOptions({
  gfm: true,
  breaks: true
});

const renderMarkdown = (markdown: string) => {
  if (!markdown) return '';
  const html = marked.parse(markdown, { async: false });
  return DOMPurify.sanitize(String(html));
};

const BlogPost: React.FC = () => {
  const slug = useMemo(() => {
    const parts = window.location.pathname.split('/').filter(Boolean);
    return parts[1] ? decodeURIComponent(parts[1]) : '';
  }, []);
  const [post, setPost] = useState<{
    title: string;
    content: string;
    meta_title?: string | null;
    meta_description?: string | null;
    meta_image?: string | null;
    created_at: string;
    updated_at: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!slug) {
      setError('Missing blog slug.');
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(undefined);
      try {
        const response = await fetch(`${API_BASE}/blog/${encodeURIComponent(slug)}`);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || 'Post not found.');
        setPost(data.post);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load post.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  useEffect(() => {
    if (!post) return;
    const title = post.meta_title || post.title;
    document.title = `${title} · ZygAI Blog`;
    if (post.meta_description) {
      const existing =
        document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (existing) {
        existing.setAttribute('content', post.meta_description);
      } else {
        const meta = document.createElement('meta');
        meta.name = 'description';
        meta.content = post.meta_description;
        document.head.appendChild(meta);
      }
    }
    if (post.meta_image) {
      const existing =
        document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
      if (existing) {
        existing.setAttribute('content', post.meta_image);
      } else {
        const meta = document.createElement('meta');
        meta.setAttribute('property', 'og:image');
        meta.content = post.meta_image;
        document.head.appendChild(meta);
      }
    }
  }, [post]);

  return (
    <div className="min-h-screen bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <div className="relative overflow-hidden border-b border-ink-100 bg-white/90 px-6 py-12 dark:border-ink-800 dark:bg-ink-900/80">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-saffron-200/50 blur-3xl" />
        <div className="absolute -left-20 top-16 h-40 w-40 rounded-full bg-ink-200/50 blur-2xl dark:bg-ink-700/40" />
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-ink-400">
            <a href="/blog" className="hover:text-ink-600">
              ZygAI Blog
            </a>
            {post?.created_at && (
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            )}
          </div>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">
            {post?.title || 'Announcements'}
          </h1>
          {post?.updated_at && post?.created_at !== post?.updated_at && (
            <p className="text-xs uppercase tracking-[0.28em] text-ink-400">
              Updated {new Date(post.updated_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
        {loading && <p className="text-sm text-ink-500">Loading announcement...</p>}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}
        {!loading && !error && post && (
          <article
            className="blog-content space-y-5 text-[15px] leading-relaxed text-ink-950 dark:text-ink-100"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(post.content) }}
          />
        )}
      </div>
    </div>
  );
};

export default BlogPost;
