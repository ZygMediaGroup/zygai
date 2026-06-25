import React, { useState, useEffect } from 'react';
import { Copy, Check, ChevronDown, ChevronUp, Save, Eye, FileCode, Play, Terminal, Edit3 } from 'lucide-react';
import Prism from 'prismjs';

// Import common language components
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-markup'; // for HTML

// Import line numbers plugin
import 'prismjs/plugins/line-numbers/prism-line-numbers';

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  onPreview?: () => void;
  onOpenInterpreter?: (code: string, language: string) => void;
  onCodeChange?: (newCode: string) => void;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = 'code', filename, onPreview, onOpenInterpreter, onCodeChange }) => {
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState(code);

  useEffect(() => {
    setEditedCode(code);
  }, [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRun = () => {
    if (language === 'html' || language === 'htm' || language === 'markup') {
      const win = window.open('', '_blank');
      if (win) {
        // Using Blob and URL.createObjectURL instead of deprecated document.write
        const blob = new Blob([editedCode], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        win.location.href = url;
      }
    } else if (language === 'javascript' || language === 'js') {
      try {
        // Using indirect eval to avoid security risks and minification issues
        (0, eval)(editedCode);
      } catch (error) {
        console.error('JavaScript execution error:', error);
      }
    }
  };

  const handleSave = () => {
    if (onCodeChange) {
      onCodeChange(editedCode);
    }
    setIsEditing(false);
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const highlightCode = (code: string, lang: string) => {
    let normalizedLang = lang.toLowerCase();

    // Auto-detect language if 'code'
    if (normalizedLang === 'code') {
      const trimmed = code.trim();
      if (trimmed.startsWith('<') && trimmed.includes('</')) {
        normalizedLang = 'markup'; // HTML
      } else if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        normalizedLang = 'json';
      } else if (trimmed.includes('function') || trimmed.includes('const ') || trimmed.includes('let ')) {
        normalizedLang = 'javascript';
      } else if (trimmed.includes('def ') || trimmed.includes('import ')) {
        normalizedLang = 'python';
      } else if (trimmed.includes('#!/') || trimmed.includes('echo ')) {
        normalizedLang = 'bash';
      }
    }

    const grammar = Prism.languages[normalizedLang];
    if (grammar) {
      return Prism.highlight(code, grammar, normalizedLang);
    }
    // Fallback to plain text
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  const highlighted = highlightCode(code, language);
  const lines = highlighted.split('\n');
  
  // Map language to proper filename
  const getDisplayName = () => {
    if (filename) return filename;
    const lang = language.toLowerCase();
    if (lang === 'code') return 'code';
    if (lang === 'javascript' || lang === 'js') return 'index.js';
    if (lang === 'css') return 'styles.css';
    if (lang === 'html' || lang === 'htm' || lang === 'markup') return 'index.html';
    return `index.${lang}`;
  };
  
  const displayName = getDisplayName();

  return (
    <div className="rounded-md overflow-hidden border border-gray-300 dark:border-gray-700 my-3 shadow-xl bg-gray-50 dark:bg-gray-900">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-200 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileCode size={14} className="text-gray-500 dark:text-gray-500" />
          <span className="text-xs font-mono text-gray-800 dark:text-gray-300">
            {displayName}:
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>

          {!isEditing && onCodeChange && (
            <button
              onClick={handleEdit}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400"
              title="Edit"
            >
              <Edit3 size={15} />
            </button>
          )}
          {isEditing && (
            <button
              onClick={handleSave}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-400"
              title="Save"
            >
              <Save size={15} />
            </button>
          )}

           <button
             onClick={handleCopy}
             className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-blue-700 dark:hover:text-blue-400"
             title="Copy"
           >
             {copied ? <Check size={15} className="text-green-600 dark:text-green-400" /> : <Copy size={15} />}
           </button>

           {(language === 'html' || language === 'htm' || language === 'markup' ||
             language === 'javascript' || language === 'js') && (
             <button
               onClick={handleRun}
               className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-400"
               title="Run Code"
             >
               <Play size={15} />
             </button>
           )}

            <button
              onClick={onPreview}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-purple-700 dark:hover:text-purple-400"
              title="Preview"
            >
              <Eye size={15} />
            </button>
            <button
              onClick={() => onOpenInterpreter?.(code, language)}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-700 rounded transition text-gray-500 dark:text-gray-400 hover:text-saffron-500 dark:hover:text-saffron-400"
              title="Open in Code Interpreter"
            >
              <Terminal size={15} />
            </button>
         </div>
       </div>

      {!collapsed && (
        <div className="relative overflow-auto max-h-[520px]">
          {isEditing ? (
            <textarea
              value={editedCode}
              onChange={(e) => setEditedCode(e.target.value)}
              className="w-full h-full p-3 font-mono text-sm leading-relaxed text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 border-none resize-none focus:outline-none"
              style={{ minHeight: '200px' }}
            />
          ) : (
            <pre className="p-3 font-mono text-sm leading-relaxed text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 m-0">
              <code>
                {lines.map((line, i) => (
                  <div key={i} className="flex">
                    <span className="select-none text-gray-500 dark:text-gray-600 w-7 text-right pr-3 mr-1 border-r border-gray-300 dark:border-gray-700">
                      {i + 1}
                    </span>
                    <span
                      className="pl-2 whitespace-pre-wrap break-all"
                      dangerouslySetInnerHTML={{ __html: line }}
                    />
                  </div>
                ))}
              </code>
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default CodeBlock;
