import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import ReactDOM from 'react-dom';
import { Lock, LogOut, MoreVertical, Pencil, Trash2, ChevronRight, Brain, Image, Shield, Pin, PinOff, Bot, MessageSquare, Blocks, Sparkles, Target, Heart, Gift, GraduationCap, Gamepad2, StickyNote, ListTodo, Music2 } from 'lucide-react';
import { ChatSession } from '@/types';
import clsx from 'clsx';
import { API_BASE } from '@/utils/apiBase';
import { useAuth } from '@/contexts/AuthContext';

export const getPlanLabel = (plan: 'free' | 'go' | 'plus' | 'beta') => {
  switch (plan) {
    case 'go': return 'ZygAI Go';
    case 'plus': return 'ZygAI Plus';
    case 'beta': return 'ZygAI Beta';
    default: return 'ZygAI Free';
  }
};

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession?: (id: string) => void;
  onRenameSession?: (id: string, title: string) => void;
  onTogglePinSession?: (id: string, isPinned: boolean) => void;
  onSetView?: (view: string) => void;
  plan: 'free' | 'go' | 'plus' | 'beta';
  displayName?: string | null;
  onLogout?: () => void;
  onOpenAccountSettings?: () => void;
  onRequestUpgrade?: () => void;
  onSearch?: (query: string) => void;
  onOpenBirthdayWish?: () => void;
  isAdmin?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({
  sessions,
  activeSessionId,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onRenameSession,
  onTogglePinSession,
  onSetView,
  plan,
  displayName,
  onLogout,
  onOpenAccountSettings,
  onRequestUpgrade,
  onSearch,
  onOpenBirthdayWish,
  isAdmin
}) => {
  const { user } = useAuth();
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const menuButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const [moreMenuPos, setMoreMenuPos] = useState({ top: 0, left: 0 });
  const menuPortalRef = useRef<HTMLDivElement | null>(null);
   const [marketplaceAccess, setMarketplaceAccess] = useState({ zygs: true, prompts: true, vibeCoder: false, reach: false });

  useEffect(() => {
    fetch(`${API_BASE}/settings/public`)
      .then(res => res.json())
      .then(data => setMarketplaceAccess({ 
        zygs: data.zygsMarketplacePublic !== false, 
        prompts: data.promptsMarketplacePublic !== false,
        vibeCoder: data.vibeCoderPublic === true,
        reach: data.reachPublic === true
      }))
      .catch(() => {});
  }, []);

   const avatarInitial = displayName ? displayName.slice(0, 2).toUpperCase() : 'Z';
   const planLabel = getPlanLabel(plan);

   const isZyga = user?.email === 'zygai@zygai.app';
   const showWishButton = !isZyga && Date.now() < new Date('2026-06-04T20:59:59Z').getTime();

    useEffect(() => {
      if (menuSessionId) {
        const button = menuButtonRefs.current.get(menuSessionId);
        if (button) {
          const rect = button.getBoundingClientRect();
          const left = rect.left + window.scrollX + rect.width / 2;
          const top = rect.top + window.scrollY + rect.height / 2;

          setMenuPos({
            top,
            left
          });
        }
      }
    }, [menuSessionId]);

    useLayoutEffect(() => {
      if (moreOpen && moreButtonRef.current) {
        const rect = moreButtonRef.current.getBoundingClientRect();
        setMoreMenuPos({
          top: rect.bottom + window.scrollY + 8,
          left: rect.left + window.scrollX + rect.width / 2
        });
      }
    }, [moreOpen]);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuSessionId) {
          const clickedInsideToggle = menuButtonRefs.current.get(menuSessionId)?.contains(event.target as Node);
          const clickedInsidePortal = menuPortalRef.current?.contains(event.target as Node);
          if (!clickedInsideToggle && !clickedInsidePortal) {
            setMenuSessionId(null);
          }
        }
        // Close more dropdown on click outside
        if (moreOpen && !(event.target as Element).closest('.more-dropdown-container')) {
          setMoreOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [menuSessionId, moreOpen]);

  return (
    <aside className="flex h-full w-[260px] min-w-[260px] flex-col bg-white border-r border-ink-200 shadow-sm dark:bg-ink-900/80 dark:border-ink-800">
      <div className="px-3 py-3 border-b border-ink-200 dark:border-ink-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <p className="font-display text-base font-semibold text-ink-900 dark:text-ink-50">ZygAI</p>
            <p className="text-[10px] uppercase tracking-[0.4em] text-ink-400 dark:text-ink-500">Workspace</p>
          </div>
        </div>
      </div>

       <div className="px-3 py-1">
        <div className="relative">
          <input
            type="text"
            placeholder="Search chats..."
            aria-label="Search chats"
            onChange={(e) => onSearch?.(e.target.value)}
            className="w-full rounded-lg border border-ink-200 bg-ink-100 px-3 py-2 text-xs text-ink-800 placeholder-ink-400 focus:border-saffron-400 focus:outline-none focus:ring-1 focus:ring-saffron-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100 dark:placeholder-ink-500"
          />
          <svg className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>
       <div className="px-3 py-1">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-[20px] border border-dashed border-ink-200 bg-transparent px-2 py-1.5 text-xs font-semibold text-ink-500 transition hover:bg-white hover:border-saffron-300 hover:text-ink-900 dark:hover:bg-ink-900"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New chat
        </button>
        </div>

        <div className="px-3 py-1 mb-2 space-y-1">
          <button
            className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all group dark:text-ink-300 dark:hover:bg-ink-800"
            onClick={() => onSetView?.('personal')}
          >
            <Brain size={18} className="text-ink-500 group-hover:text-ink-700 flex-shrink-0 dark:group-hover:text-ink-100" aria-hidden="true" />
            <span className="flex-1 text-left">Personal</span>
          </button>

          <button
            className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-bold text-saffron-600 hover:bg-saffron-50 transition-all group dark:text-ink-50 dark:hover:bg-ink-800"
            onClick={() => onSetView?.('learning')}
          >
            <GraduationCap size={18} className="text-saffron-500 group-hover:scale-110 transition-transform flex-shrink-0 dark:text-ink-50" aria-hidden="true" />
            <span className="flex-1 text-left">AI Learning</span>
            <span className="text-[8px] bg-saffron-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter dark:bg-ink-700 dark:text-ink-50">New</span>
          </button>

          {(isAdmin || marketplaceAccess.zygs) && (
            <button
              className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all group dark:text-ink-300 dark:hover:bg-ink-800"
              onClick={() => onSetView?.('zygs_marketplace')}
            >
              <Bot size={18} className="text-ink-500 group-hover:text-ink-700 flex-shrink-0 dark:group-hover:text-ink-100" aria-hidden="true" />
              <span className="flex-1 text-left">Zyg's</span>
            </button>
          )}

          {(isAdmin || marketplaceAccess.prompts) && (
            <button
              className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all group dark:text-ink-300 dark:hover:bg-ink-800"
              onClick={() => onSetView?.('prompts_marketplace')}
            >
              <MessageSquare size={18} className="text-ink-500 group-hover:text-ink-700 flex-shrink-0 dark:group-hover:text-ink-100" aria-hidden="true" />
              <span className="flex-1 text-left">Prompts</span>
            </button>
          )}

          {(isAdmin || marketplaceAccess.vibeCoder) && (
            <button
              className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all group dark:text-ink-300 dark:hover:bg-ink-800"
              onClick={() => onSetView?.('vibe_coder')}
            >
              <Sparkles size={18} className="text-ink-500 group-hover:text-ink-700 flex-shrink-0 dark:group-hover:text-ink-100" aria-hidden="true" />
              <span className="flex-1 text-left">Vibe Coder</span>
            </button>
          )}

          {(isAdmin || marketplaceAccess.reach) && (
            <button
              className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all group dark:text-ink-300 dark:hover:bg-ink-900"
              onClick={() => onSetView?.('reach')}
            >
              <Target size={18} className="text-ink-500 group-hover:text-ink-700 flex-shrink-0 dark:group-hover:text-ink-100" aria-hidden="true" />
              <span className="flex-1 text-left">ZygAI Reach</span>
            </button>
          )}

          {showWishButton && (
            <button
              className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-bold text-rose-600 hover:bg-rose-50 transition-all group dark:text-rose-400 dark:hover:bg-rose-950/30 animate-pulse"
              onClick={onOpenBirthdayWish}
            >
              <Heart size={18} className="text-rose-500 group-hover:scale-110 transition-transform fill-rose-500" aria-hidden="true" />
              <span className="flex-1 text-left">Wish Zyg Best!</span>
            </button>
          )}

        <button
          ref={moreButtonRef}
          className="w-full flex items-center gap-3 p-2 rounded-xl text-sm font-medium text-ink-600 hover:bg-ink-50 transition-all group relative more-dropdown-container dark:text-ink-300 dark:hover:bg-ink-900"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          aria-haspopup="true"
        >
            <MoreVertical size={18} className="text-ink-500 group-hover:text-ink-700 flex-shrink-0 dark:group-hover:text-ink-100" aria-hidden="true" />
            <span className="flex-1 text-left">More</span>
          </button>
        </div>
        {moreOpen && ReactDOM.createPortal(
          <div
            className="rounded-2xl bg-white border border-ink-200 shadow-2xl overflow-hidden more-dropdown-container"
            style={{
              position: 'fixed',
              top: moreMenuPos.top,
              left: moreMenuPos.left,
              width: '14rem',
              transform: 'translate(-50%, 0)',
              zIndex: 50
            }}
          >
             <button
               className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-violet-50 transition-all whitespace-nowrap"
               onClick={() => {
                 onSetView?.('music');
                 setMoreOpen(false);
               }}
             >
              <Music2 size={18} className="text-violet-500 flex-shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left font-semibold text-violet-700 dark:text-violet-400">ZygMusic</span>
              <span className="text-[8px] bg-violet-500 text-white px-1.5 py-0.5 rounded-full font-black uppercase tracking-tighter">New</span>
              <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} />
            </button>

            <div className="border-t border-ink-100 mx-2 dark:border-ink-800"></div>

             <button
               className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-all whitespace-nowrap"
               onClick={() => {
                 onSetView?.('notes');
                 setMoreOpen(false);
               }}
             >
              <StickyNote size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left">Notes</span>
              <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} />
            </button>

             <button
               className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-all whitespace-nowrap"
               onClick={() => {
                 onSetView?.('tasks');
                 setMoreOpen(false);
               }}
             >
              <ListTodo size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left">Tasks</span>
              <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} />
            </button>

            <div className="border-t border-ink-100 mx-2 dark:border-ink-800"></div>

             <button
               className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-all whitespace-nowrap"
               onClick={() => {
                 onSetView?.('images');
                 setMoreOpen(false);
               }}
             >
              <Image size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left">Images</span>
              <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} />
            </button>

            <div className="border-t border-ink-100 mx-2 dark:border-ink-800"></div>

             <button
                className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-all whitespace-nowrap"
                onClick={() => {
                  onSetView?.('games');
                  setMoreOpen(false);
                }}
              >
               <Gamepad2 size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} />
               <span className="flex-1 text-left text-ink-900 font-bold">Games</span>
               <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} />
             </button>
            
            <div className="border-t border-ink-100 mx-2 dark:border-ink-800"></div>
            
            <button
               className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-all whitespace-nowrap"
               onClick={() => {
                 onSetView?.('apps');
                 setMoreOpen(false);
               }}
             >
              <Blocks size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} />
              <span className="flex-1 text-left">Zyg's Apps</span>
              <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} />
            </button>

            {isZyga && Date.now() >= new Date('2026-06-04T21:00:00Z').getTime() && (
              <>
                <div className="border-t border-ink-100 mx-2 dark:border-ink-800"></div>
                <button
                  className="flex items-center gap-3 w-full px-4 py-3 text-sm text-rose-600 hover:bg-rose-50 transition-all whitespace-nowrap"
                  onClick={() => {
                    onSetView?.('zyga-birthday');
                    setMoreOpen(false);
                  }}
                >
                  <Gift size={18} className="text-rose-500 flex-shrink-0" strokeWidth={2} />
                  <span className="flex-1 font-bold text-left">Birthday Wishes</span>
                  <ChevronRight size={16} className="ml-auto text-rose-400 flex-shrink-0" strokeWidth={1.5} />
                </button>
              </>
            )}
            </div>,
            document.body
           )}
        <div className="flex-1 overflow-y-auto px-2 pb-1 scrollbar-hidden">
    {[...sessions].sort((a, b) => {
      const aPinned = (a as any).isPinned ? 1 : 0;
      const bPinned = (b as any).isPinned ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return 0;
    }).map((session) => {
          const isActive = activeSessionId === session.id;
          const isEditing = editingSessionId === session.id;
          return (
            <div
              key={session.id}
              role="button"
              tabIndex={0}
              className={clsx(
                'group relative px-[10px] py-2 rounded-xl cursor-pointer text-sm transition-all flex items-center gap-2',
                isActive
                  ? 'bg-ink-50 font-medium text-ink-900 shadow-sm'
                  : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
              )}
              onClick={() => {
                setMenuSessionId(null);
                onSelectSession(session.id);
                onSetView?.('chat');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setMenuSessionId(null);
                  onSelectSession(session.id);
                  onSetView?.('chat');
                }
              }}
            >
              {isActive && (
                <span className="inline-block w-2 h-2 rounded-full bg-saffron-400 flex-shrink-0" />
              )}
              {isEditing ? (
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    const newTitle = editTitle.trim() || 'New chat';
                    onRenameSession?.(session.id, newTitle);
                    setEditingSessionId(null);
                    setEditTitle('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === 'Escape') {
                      setEditingSessionId(null);
                      setEditTitle('');
                    }
                  }}
                  autoFocus
                  className="flex-1 px-2 py-1 bg-ink-100 rounded-lg text-sm font-medium text-ink-900 outline-none focus:ring-2 focus:ring-saffron-400 focus:border-transparent placeholder:text-ink-500 min-w-0"
                  placeholder="Chat name"
                />
              ) : (
                <div className="flex items-center flex-1 gap-2 min-w-0">
                  <span className="truncate font-medium">{session.title}</span>
              {(session as any).isPinned && (
                <Pin size={12} className="text-ink-400 ml-1 flex-shrink-0" fill="currentColor" />
              )}
                  <button
                    ref={(el) => {
                      if (el) {
                        menuButtonRefs.current.set(session.id, el);
                      } else {
                        menuButtonRefs.current.delete(session.id);
                      }
                    }}
                    className="p-1.5 ml-auto rounded-full opacity-0 group-hover:opacity-100 hover:bg-ink-200 text-ink-500 hover:text-ink-900 transition-all flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuSessionId(session.id);
                    }}
                    aria-label="Chat options"
                    aria-haspopup="true"
                    aria-expanded={menuSessionId === session.id}
                  >
                    <MoreVertical size={16} strokeWidth={2.5} aria-hidden="true" />
                  </button>
                </div>
              )}
                {menuSessionId === session.id && ReactDOM.createPortal(
                  <div
                    ref={menuPortalRef}
                    role="menu"
                    className="rounded-2xl bg-white border border-ink-200 shadow-2xl overflow-hidden"
                    style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: '14rem', transform: 'translateY(-50%)', zIndex: 50 }}
                  >
                    <button
                      role="menuitem"
                      className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-colors whitespace-nowrap"
                      onClick={() => {
                        setMenuSessionId(null);
                        setEditingSessionId(session.id);
                        setEditTitle(session.title);
                      }}
                    >
                      <Pencil size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
                      <span className="flex-1 text-left">Rename</span>
                      <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    </button>

                    <div className="border-t border-ink-200 mx-1"></div>
                      <button
                        role="menuitem"
                        className="flex items-center gap-3 w-full px-4 py-3 text-sm text-ink-900 hover:bg-ink-50 transition-colors whitespace-nowrap"
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePinSession?.(session.id, !(session as any).isPinned);
                          setMenuSessionId(null);
                        }}
                      >
                        {(session as any).isPinned ? (
                          <PinOff size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
                        ) : (
                          <Pin size={18} className="text-ink-600 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
                        )}
                        <span className="flex-1 text-left">{(session as any).isPinned ? 'Unpin chat' : 'Pin chat'}</span>
                        <ChevronRight size={16} className="ml-auto text-ink-400 flex-shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      </button>

                    <div className="border-t border-ink-200 mx-1"></div>
                    <button
                      role="menuitem"
                      className="flex items-center gap-3 w-full px-4 py-3 text-red-600 hover:bg-red-50 transition-colors whitespace-nowrap"
                      onClick={(e) => {
                        e.stopPropagation();
                        console.log('Deleting session:', session.id);
                        onDeleteSession?.(session.id);
                        setMenuSessionId(null);
                      }}
                    >
                      <Trash2 size={18} className="text-red-600 flex-shrink-0" strokeWidth={2} aria-hidden="true" />
                      <span className="flex-1 text-left">Delete</span>
                      <ChevronRight size={16} className="ml-auto text-red-400 flex-shrink-0" strokeWidth={1.5} aria-hidden="true" />
                    </button>
                  </div>,
                  document.body
                )}
            </div>
          );
        })}
        </div>

      <div className="border-t border-ink-200 bg-ink-50 px-3 py-3 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white text-sm font-semibold" aria-hidden="true">
            {avatarInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink-900 truncate dark:text-ink-50">{displayName || 'Zygimantas'}</p>
            <p className="text-[10px] uppercase tracking-[0.3em] text-saffron-500">{planLabel}</p>
          </div>
          {isAdmin && (
            <button
              onClick={() => onSetView?.('admin')}
              className="flex items-center justify-center w-6 h-6 rounded-full hover:bg-ink-200 text-ink-500 hover:text-ink-900 transition-all dark:hover:bg-ink-800 dark:text-ink-400 dark:hover:text-ink-100"
              title="Admin Panel"
              aria-label="Admin Panel"
            >
              <Shield size={14} className="flex-shrink-0" strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold">
          {onRequestUpgrade && plan === 'free' && (
            <button
              onClick={onRequestUpgrade}
              className="flex-1 min-w-[100px] rounded-2xl bg-gradient-to-br from-saffron-400 to-saffron-500 px-2 py-1.5 text-white shadow-sm"
            >
              Upgrade plan
            </button>
          )}
          {onOpenAccountSettings && (
            <button
              onClick={onOpenAccountSettings}
              className="flex-1 min-w-[100px] rounded-2xl border border-ink-200 bg-white px-2 py-1.5 text-ink-700 hover:border-saffron-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:hover:border-saffron-500"
            >
              <Lock size={14} className="mr-1 inline" aria-hidden="true" />
              Account
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              className="flex-1 min-w-[100px] rounded-2xl border border-ink-200 bg-white px-2 py-1.5 text-red-600 hover:border-red-400 dark:border-ink-700 dark:bg-ink-900 dark:text-red-400 dark:hover:border-red-600"
            >
              <LogOut size={14} className="mr-1 inline" aria-hidden="true" />
              Sign out
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
