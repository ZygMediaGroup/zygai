import React, { useMemo, useState, useEffect } from 'react';
import { Copy, Pencil, Trash2, Bot, Sparkles, Blocks } from 'lucide-react';
import { Message } from '@/types';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import CodeBlock from './CodeBlock';
import CodeInterpreterModal from './CodeInterpreterModal';

marked.setOptions({
  gfm: true,
  breaks: true
});

interface MessageBubbleProps {
  message: Message;
  onDelete?: () => void;
  onEdit?: (content: string) => void;
  isStreaming?: boolean;
  onStop?: () => void;
  onRegenerate?: () => void;
  activeZygName?: string;
  activeZygIcon?: string;
  activeZygColor?: string;
  activeMcpServers?: string[];
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onDelete, onEdit, isStreaming = false, onStop, onRegenerate, activeZygName, activeMcpServers = [] }) => {
  const [editing, setEditing] = useState(false);
  const [interpreterOpen, setInterpreterOpen] = useState(false);
  const [interpreterCode, setInterpreterCode] = useState('');
  const [interpreterLanguage, setInterpreterLanguage] = useState<string>('html');
  const [showSources, setShowSources] = useState(false);
  const [showThoughts, setShowThoughts] = useState(true);
  const [showEnvironment, setShowEnvironment] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [thinkingTime, setThinkingTime] = useState(0);



  const isZygAI = (() => {
    if (typeof message.content === 'string' && message.content.trim().startsWith('{') && message.content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(message.content);
        return parsed.provider === 'zygai';
      } catch {}
    }
    return false;
  })();

  const rawContent = useMemo(() => {
    let content = typeof message.content === 'string'
      ? message.content
      : message.content?.filter(b => b.type === 'text').map(b => b.text).join(' ') || '';

    if (!isStreaming && content.trim().startsWith('{') && content.trim().endsWith('}')) {
      try {
        const parsed = JSON.parse(content);
        if (parsed && 'message' in parsed && typeof parsed.message === 'string') {
          content = parsed.message;
        }
      } catch (e) {}
    }

    // Strip environment details first, even during streaming
    content = content.replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '');

    return content;
  }, [message.content, isStreaming]);

  // Unified thoughts extraction
  const thoughts = useMemo(() => {
    if (message.reasoning_content) return message.reasoning_content;
    
    // Check for environment_details or think tags (handling unclosed tags for streaming)
    const envMatch = rawContent.match(/<environment_details>([\s\S]*?)(?:<\/environment_details>|$)/i);
    if (envMatch) return envMatch[1].trim();

    const thinkMatch = rawContent.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
    return thinkMatch ? thinkMatch[1].trim() : '';
  }, [message.reasoning_content, rawContent]);

  const environmentDetails = useMemo(() => {
    const envMatch = rawContent.match(/<environment_details>([\s\S]*?)(?:<\/environment_details>|$)/i);
    return envMatch?.[1]?.trim();
  }, [rawContent]);

  const isMetadataMessage = rawContent === '{"message":"","provider":"openrouter","model":"mistralai/mistral-nemo"}';
  const hasReasoning = thoughts.length > 0;
  const shouldSkip = !rawContent.trim() && !hasReasoning && message.role !== 'assistant';

  // Always strip system tags even during streaming
  const shouldParse = !isStreaming;

  const preProcessed = useMemo(() => {
    // Always strip think tags even during streaming
    return rawContent
      .replace(/<environment_details>[\s\S]*?(?:<\/environment_details>|$)/gi, '')
      .replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/gi, '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .trim();
  }, [rawContent, shouldParse]);

  const parseSegments = useMemo(() => (content: string) => {
    if (!shouldParse) {
      return [{ type: 'text' as const, content }];
    }

    const segments: Array<{ type: 'text' | 'code'; content: string; lang?: string }> = [];
    const fixedContent = content
      .replace(/<environment_details>[\s\S]*?(?:<\/environment_details>|$)/gi, '')
      .replace(/<system-reminder>[\s\S]*?(?:<\/system-reminder>|$)/gi, '')
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
      .replace(/&#96;/g, '`')
      .replace(/\\`/g, '`');

    const codeBlockRegex = /```([^`\n]*)\r?\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;
    while ((match = codeBlockRegex.exec(fixedContent)) !== null) {
      if (match.index > lastIndex) {
        const textPart = fixedContent.slice(lastIndex, match.index);
        const cleanText = textPart.replace(/<[^>]+>/g, '').trim();
        if (cleanText) segments.push({ type: 'text', content: cleanText });
      }
      const lang = match[1]?.trim() || 'code';
      const code = match[2]?.trimEnd() || '';
      segments.push({ type: 'code', content: code, lang: lang || undefined });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < fixedContent.length) {
      const textPart = fixedContent.slice(lastIndex);
      const cleanText = textPart.replace(/<[^>]+>/g, '').trim();
      if (cleanText) segments.push({ type: 'text', content: cleanText });
    }
    return segments;
  }, [shouldParse]);

  const segments = useMemo(() => parseSegments(preProcessed), [parseSegments, preProcessed]);

  // Thinking timer - runs for the entire streaming duration
  useEffect(() => {
    if (isStreaming) {
      // Reset timer when streaming starts
      setThinkingTime(0);
      const interval = setInterval(() => {
        setThinkingTime(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
    // When streaming ends, keep the final time (no cleanup needed)
  }, [isStreaming]);

  const contentStr = useMemo(() => {
    if (!shouldParse) {
      return rawContent
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
        .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/<[^>]+>/g, '').trim();
    }
    return preProcessed.replace(/<[^>]+>/g, '').trim();
  }, [preProcessed, rawContent, shouldParse]);

  const [draft, setDraft] = useState(contentStr);

  useEffect(() => {
    setDraft(contentStr);
  }, [contentStr]);

  const htmlSegments = useMemo(() => {
    try {
      if (isStreaming) {
        const safeContent = preProcessed || '';
        const html = marked.parse(safeContent + (safeContent ? '<span class="streaming-cursor">|</span>' : ''), { async: false });
        return [DOMPurify.sanitize(String(html))];
      }

      return segments.map((segment) => {
        if (segment.type !== 'text') return null;
        try {
          const html = marked.parse(segment.content, { async: false });
          return DOMPurify.sanitize(String(html));
        } catch {
          return DOMPurify.sanitize(String(segment.content));
        }
      });
    } catch (e) {
      return [''];
    }
  }, [segments, isStreaming, rawContent]);

  if (isMetadataMessage) return null;
  if (shouldSkip) return null;

   const handleCopy = async () => {
     if (navigator.clipboard) {
       let textToCopy = contentStr;
       if (thoughts) textToCopy += `\n\n---\n💭 AI Thinking:\n${thoughts}`;
       if (environmentDetails) textToCopy += `\n\n---\n📋 Context:\n${environmentDetails}`;
       await navigator.clipboard.writeText(textToCopy);
     }
    };

    const handleSpeak = () => {
     if ('speechSynthesis' in window) {
       if (isSpeaking) {
         window.speechSynthesis.cancel();
         setIsSpeaking(false);
       } else {
         const utterance = new SpeechSynthesisUtterance(contentStr);
         utterance.onend = () => setIsSpeaking(false);
         window.speechSynthesis.speak(utterance);
         setIsSpeaking(true);
       }
     }
   };

  const handleOpenInterpreter = (code: string, language: string) => {
    setInterpreterCode(code);
    setInterpreterLanguage(
      ['javascript', 'js', 'jsx'].includes(language.toLowerCase()) ? 'javascript' :
      ['typescript', 'ts', 'tsx'].includes(language.toLowerCase()) ? 'typescript' :
      ['python', 'py'].includes(language.toLowerCase()) ? 'python' :
      ['bash', 'sh', 'shell'].includes(language.toLowerCase()) ? 'bash' :
      ['css', 'style'].includes(language.toLowerCase()) ? 'css' :
      ['html', 'htm', 'markup'].includes(language.toLowerCase()) ? 'html' :
      language.toLowerCase() || 'html'
    );
    setInterpreterOpen(true);
  };

  // Extract code files for "Preview All" functionality
  const codeFiles = useMemo(() => {
    const files: Record<string, string> = {};
    segments.forEach((segment) => {
      if (segment.type === 'code') {
        const lang = segment.lang?.toLowerCase() || '';
        if (lang === 'html' || lang === 'htm' || lang === 'markup') {
          files['html'] = segment.content;
        } else if (lang === 'css') {
          files['css'] = segment.content;
        } else if (lang === 'javascript' || lang === 'js') {
          files['js'] = segment.content;
        }
      }
    });
    return files;
  }, [segments]);

  const hasMultipleFiles = Object.keys(codeFiles).length > 1;

  const handlePreviewAll = () => {
    // Combine HTML, CSS, and JS into a single file
    let combinedCode = codeFiles['html'] || '';
    
    if (codeFiles['css']) {
      // Inject CSS into HTML
      combinedCode = combinedCode.replace(
        '</head>',
        `<style>${codeFiles['css']}</style></head>`
      ) || combinedCode.replace(
        '</body>',
        `<style>${codeFiles['css']}</style></body>`
      ) || `<style>${codeFiles['css']}</style>${combinedCode}`;
    }
    
    if (codeFiles['js']) {
      // Inject JS into HTML
      combinedCode = combinedCode.replace(
        '</body>',
        `<script>${codeFiles['js']}</script></body>`
      ) || `${combinedCode}<script>${codeFiles['js']}</script>`;
    }

    setInterpreterCode(combinedCode);
    setInterpreterLanguage('html');
    setInterpreterOpen(true);
  };

  // ASSISTANT: No bubble, just clean text
  if (message.role === 'assistant') {
    return (
      <>
        <div className="w-full py-2">
           {activeMcpServers.length > 0 ? (
             <div className="flex items-center gap-2 mb-2 text-emerald-600 dark:text-emerald-400 select-none">
               <Blocks size={16} />
               <span className="text-xs font-bold uppercase tracking-widest">
                 {activeMcpServers.length === 1
                   ? activeMcpServers[0]
                   : `${activeMcpServers[0]} +${activeMcpServers.length - 1}`}
               </span>
             </div>
           ) : activeZygName ? (
             <div className="flex items-center gap-2 mb-2 text-saffron-600 dark:text-saffron-400 select-none">
               <Bot size={16} />
               <span className="text-xs font-bold uppercase tracking-widest">{activeZygName}</span>
             </div>
           ) : (
             <div className="flex items-center gap-2 mb-2 text-ink-400 dark:text-ink-500 select-none">
               <Sparkles size={16} />
               <span className="text-xs font-bold uppercase tracking-widest">ZygAI</span>
             </div>
           )}
           {/* Unified Thinking section — shows during streaming and after */}
           {(hasReasoning || isStreaming) && (
             <div className="mb-4">
               <button
                 onClick={() => setShowThoughts(!showThoughts)}
                 className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-2 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full text-left"
                 aria-expanded={showThoughts}
               >
                 <span aria-hidden="true">💭</span>
                 <span>
                   {isStreaming
                     ? `Thinking... ${thinkingTime}s`
                     : `Thought for ${thinkingTime}s`}
                 </span>
                 {isStreaming && (
                   <span className="flex gap-0.5 items-center ml-1" aria-hidden="true">
                     <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                     <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                     <span className="w-1 h-1 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                   </span>
                 )}
                 <svg className={`w-4 h-4 transition-transform ml-auto ${showThoughts ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                   <path d="M6 9l6 6 6-6" />
                 </svg>
               </button>

               {showThoughts && (
                 <div className="text-gray-600 dark:text-gray-400 text-sm whitespace-pre-wrap leading-relaxed pl-3 border-l-2 border-indigo-200 dark:border-indigo-900/50 italic">
                   {thoughts
                     ? thoughts
                     : isStreaming && <span className="animate-pulse text-gray-400">Analyzing...</span>}
                 </div>
               )}
             </div>
           )}
          
          <div className="chat-markdown text-[15px] leading-relaxed break-words text-gray-800 dark:text-white">
            {isStreaming ? (
              <span dangerouslySetInnerHTML={{ __html: htmlSegments[0] || '' }} />
            ) : (
              segments.map((segment, index) =>
                segment.type === 'text' ? (
                  <div key={`text-${index}`} dangerouslySetInnerHTML={{ __html: htmlSegments[index] || '' }} />
                ) : (
                  <CodeBlock key={`code-${index}`} code={segment.content} language={segment.lang} onOpenInterpreter={handleOpenInterpreter} />
                )
              )
            )}
          </div>
          
           <div className="flex items-center gap-4 mt-2">
             {hasMultipleFiles && (
               <button 
                 onClick={handlePreviewAll}
                 className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium flex items-center gap-1"
                 title="Preview all files combined"
               >
                 👁️ Preview all
               </button>
             )}
             
             {isStreaming && onStop && (
               <button 
                 onClick={onStop}
                 className="text-sm text-red-500 hover:text-red-600 font-medium flex items-center gap-1"
               >
                 ⏹️ Stop generating
               </button>
             )}
             
             {!isStreaming && onRegenerate && (
               <button 
                 onClick={onRegenerate}
                 className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-medium flex items-center gap-1"
               >
                 🔄 Regenerate
               </button>
              )}



              {environmentDetails && (
               <button
                 onClick={() => setShowEnvironment(!showEnvironment)}
                 className="text-xs text-gray-500 hover:text-blue-600"
               >
                 {showEnvironment ? '✓ Hide context' : (activeMcpServers.length > 0 ? '🔧 MCP Context' : '📋 Context')}
               </button>
             )}
            </div>

            {isZygAI && showThoughts && thoughts && (
              <div className="mt-2 p-4 text-sm text-gray-600 dark:text-gray-300 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl whitespace-pre-wrap border border-indigo-100 dark:border-indigo-800/50">
                {thoughts}
              </div>
            )}

            {showEnvironment && environmentDetails && (
             <div className="mt-2 p-3 text-xs text-gray-500 bg-blue-50 dark:bg-blue-900/20 rounded whitespace-pre-wrap border border-blue-100 dark:border-blue-800">
               {activeMcpServers.length > 0 && (
                 <div className="mb-2 pb-2 border-b border-blue-200 dark:border-blue-700">
                   <div className="font-medium text-emerald-700 dark:text-emerald-300">
                     🔧 Using MCP Tools from: {activeMcpServers.join(', ')}
                   </div>
                 </div>
               )}
               {environmentDetails}
             </div>
           )}

           {message.role === 'assistant' && !isStreaming && (
             <div className="mt-3 flex gap-2">
               <button 
                 onClick={handleSpeak}
                 className={`text-xs ${isSpeaking ? 'text-red-500' : 'text-gray-500 hover:text-blue-600'} flex items-center gap-1`}
               >
                 {isSpeaking ? '⏹️ Stop reading' : '🔊 Read aloud'}
               </button>
             </div>
            )}

           {message.sources && message.sources.length > 0 && (
            <div className="mt-2">
              <button onClick={() => setShowSources(!showSources)} className="text-xs text-gray-500 hover:text-purple-600">
                {showSources ? '✓ Hide sources' : `📚 ${message.sources.length} sources`}
              </button>
              {showSources && (
                <div className="mt-1 space-y-1 text-xs">
                  {message.sources.map((source, i) => (
                    <a key={i} href={source.url} target="_blank" rel="noreferrer" className="block text-blue-600 hover:underline">
                      {i + 1}. {source.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <CodeInterpreterModal isOpen={interpreterOpen} onClose={() => setInterpreterOpen(false)} code={interpreterCode} language={interpreterLanguage} />
      </>
    );
  }

   // USER MESSAGE: Bubble style
  return (
    <>
      <div className="ml-auto max-w-[80%] xs:max-w-[75%] sm:max-w-[65%] rounded-2xl rounded-br-md bg-gradient-to-br from-blue-500 to-blue-600 text-white px-3 py-2 xs:px-4 xs:py-3 shadow-md dark:from-black dark:to-black dark:border dark:border-ink-800">
        <p className="text-[10px] font-bold text-blue-100 dark:text-ink-400 mb-1" aria-hidden="true">👤</p>
        
         {/* Render attached user images */}
         {(message as any).userImages && (message as any).userImages.length > 0 && (
           <div className="mb-2 flex flex-wrap gap-2">
             {(message as any).userImages.map((img: string, i: number) => {
               // Convert cognivision:// URLs to API endpoint
               const imageUrl = img.startsWith('cognivision://') 
                 ? `/api/temp-image/${img.replace('cognivision://', '')}`
                 : img;
              
               return (
                 <img 
                   key={i} 
                   src={imageUrl} 
                   alt={`User attached image ${i + 1}`} 
                   className="rounded-lg max-w-full max-h-[200px] object-contain bg-white/10"
                 />
               );
             })}
           </div>
         )}
        
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea 
              className="w-full bg-white/10 rounded p-2 text-sm text-white min-h-[80px]" 
              value={draft} 
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              aria-label="Edit message"
            />
            <div className="flex gap-2 justify-end">
              <button 
                onClick={() => setEditing(false)}
                className="text-xs px-3 py-1 hover:bg-white/10 rounded"
              >
                Cancel
              </button>
              <button 
                onClick={() => {
                  onEdit?.(draft);
                  setEditing(false);
                }}
                className="text-xs px-3 py-1 bg-white/20 hover:bg-white/30 rounded font-medium flex items-center gap-1"
              >
                <span aria-hidden="true">✓</span> Regenerate
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[14px] xs:text-[15px] leading-relaxed break-words">{contentStr}</div>
        )}
        <div className="flex items-center gap-2 mt-1 xs:mt-2 pt-1 xs:pt-2 border-t border-white/20 dark:border-ink-800">
          <span className="text-[10px] text-blue-200 dark:text-ink-500">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div className="flex gap-1 ml-auto">
            <button onClick={handleCopy} className="p-1 hover:bg-white/10 dark:hover:bg-ink-800 rounded" aria-label="Copy message"><Copy size={14} aria-hidden="true" /></button>
            {onEdit && !editing && <button onClick={() => setEditing(true)} className="p-1 hover:bg-white/10 dark:hover:bg-ink-800 rounded" aria-label="Edit message"><Pencil size={14} aria-hidden="true" /></button>}
            {onDelete && <button onClick={onDelete} className="p-1 hover:bg-white/10 dark:hover:bg-ink-800 rounded" aria-label="Delete message"><Trash2 size={14} aria-hidden="true" /></button>}
          </div>
        </div>
      </div>
      <CodeInterpreterModal isOpen={interpreterOpen} onClose={() => setInterpreterOpen(false)} code={interpreterCode} language={interpreterLanguage} />
    </>
  );
};

export default MessageBubble;
