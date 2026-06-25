import React from 'react'
import { AdminBlogPost } from '@/types/admin'
import { FileText } from 'lucide-react'

export type BlogFormState = {
  id: number|null
  title: string
  slug: string
  content: string
  metaTitle?: string
  metaDescription?: string
  metaImage?: string
  published: boolean
}

type BlogsPanelProps = {
  blogs: AdminBlogPost[]
  blogForm: BlogFormState
  onBlogFormChange: (patch: Partial<BlogFormState>) => void
  onSelectBlog: (p: AdminBlogPost) => void
  onSaveBlog: () => void
}

export const BlogsPanel: React.FC<BlogsPanelProps> = ({ blogs, blogForm, onBlogFormChange, onSelectBlog, onSaveBlog }) => (
  <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
    <div className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-saffron-100 dark:bg-saffron-900/40 text-saffron-600">
          <FileText size={20} />
        </div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Content Management</h3>
      </div>
      <button 
        className="rounded-xl border border-ink-200 dark:border-ink-700 px-4 py-2 text-xs font-bold uppercase tracking-widest transition hover:border-saffron-400 hover:text-saffron-500" 
        onClick={()=> onBlogFormChange({ id: null, title: '', slug: '' , content: '', metaTitle: '', metaDescription: '', metaImage: '', published: false })}
      >
        New Post
      </button>
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {blogs.length > 0 ? (
          blogs.map((b) => (
            <div 
              key={b.id} 
              className={`rounded-xl border p-4 cursor-pointer transition-all ${blogForm.id === b.id ? 'border-saffron-400 bg-saffron-50/50 dark:bg-saffron-900/20' : 'border-ink-100 dark:border-ink-800 hover:border-ink-200 dark:hover:border-ink-700'}`} 
              onClick={()=> onSelectBlog(b)}
            >
              <div className="font-bold text-ink-900 dark:text-ink-50 mb-1">{b.title}</div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-ink-500 font-mono">/{b.slug}</span>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${b.published ? 'text-emerald-500' : 'text-amber-500'}`}>
                  {b.published ? 'Published' : 'Draft'}
                </span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-ink-400 text-sm">No blog posts found.</div>
        )}
      </div>

      <div className="space-y-4 bg-ink-50/50 dark:bg-ink-800/30 p-6 rounded-2xl border border-ink-100 dark:border-ink-800">
        <div className="space-y-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-ink-400 mb-1 block ml-1">Title</label>
            <input 
              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-saffron-400 transition-colors" 
              placeholder="Post title..." 
              value={blogForm.title} 
              onChange={(e)=> onBlogFormChange({ title: e.target.value })} 
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-ink-400 mb-1 block ml-1">Slug</label>
            <input 
              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2.5 text-sm outline-none font-mono focus:border-saffron-400 transition-colors" 
              placeholder="url-slug-here" 
              value={blogForm.slug} 
              onChange={(e)=> onBlogFormChange({ slug: e.target.value })} 
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest font-bold text-ink-400 mb-1 block ml-1">Content</label>
            <textarea 
              className="w-full bg-white dark:bg-ink-900 border border-ink-100 dark:border-ink-700 rounded-xl px-4 py-2.5 text-sm h-48 outline-none focus:border-saffron-400 transition-colors resize-none" 
              placeholder="Write your content here..." 
              value={blogForm.content} 
              onChange={(e)=> onBlogFormChange({ content: e.target.value })} 
            />
          </div>
          <div className="flex items-center gap-2 ml-1">
            <input 
              type="checkbox" 
              id="published-toggle"
              checked={blogForm.published} 
              onChange={(e)=> onBlogFormChange({ published: e.target.checked })} 
              className="rounded border-ink-300 text-saffron-500 focus:ring-saffron-500"
            />
            <label htmlFor="published-toggle" className="text-xs font-bold text-ink-700 dark:text-ink-200 uppercase tracking-widest cursor-pointer">
              Publish publicly
            </label>
          </div>
        </div>
        <button 
          className="w-full rounded-xl bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-6 py-3 text-white text-xs font-bold uppercase tracking-widest transition hover:opacity-90 mt-4 shadow-lg shadow-ink-900/10 dark:shadow-none" 
          onClick={onSaveBlog}
        >
          {blogForm.id ? 'Update Post' : 'Create Post'}
        </button>
      </div>
    </div>
  </section>
)
