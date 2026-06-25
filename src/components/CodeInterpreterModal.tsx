import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Square, Code2, Maximize } from 'lucide-react';

interface CodeInterpreterModalProps {
  isOpen: boolean;
  onClose: () => void;
  code?: string;
  language?: string;
}

const CodeInterpreterModal: React.FC<CodeInterpreterModalProps> = ({ isOpen, onClose, code: initialCode, language: initialLanguage = 'html' }) => {
  const [code, setCode] = useState(initialCode || '');
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [output, setOutput] = useState<string>('');
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Sync code and language when modal opens with new content
  useEffect(() => {
    if (isOpen) {
      setCode(initialCode || '');
      setLanguage(initialLanguage);
      setOutput('');
      setError(null);
    }
  }, [isOpen, initialCode, initialLanguage]);

  // When modal opens with HTML code, render immediately (no debounce)
  useEffect(() => {
    if (isOpen && initialLanguage === 'html' && initialCode && iframeRef.current) {
      iframeRef.current.srcdoc = initialCode;
    }
  }, [isOpen, initialCode, initialLanguage]);

  // Live HTML Preview — debounced while typing, iframe always in DOM so ref is always valid
  useEffect(() => {
    if (language === 'html' && isOpen) {
      const timeoutId = setTimeout(() => {
        if (iframeRef.current) {
          iframeRef.current.srcdoc = code;
        }
      }, 300);
      return () => clearTimeout(timeoutId);
    } else if (language !== 'html' && iframeRef.current) {
      // Clear preview when switching away from HTML
      iframeRef.current.srcdoc = '';
    }
  }, [code, language, isOpen]);

  const runCode = async () => {
    if (!code.trim()) return;
    setIsRunning(true);
    setError(null);
    setOutput('');

    try {
      if (language === 'html') {
        try {
          if (iframeRef.current) {
            iframeRef.current.srcdoc = code;
          }
          setOutput('HTML rendered in preview below.');
        } catch (htmlErr: any) {
          throw new Error(htmlErr.message || 'HTML rendering error');
        }
      } else {
        // Offload Python and JavaScript execution to Microsandbox backend
        const token = localStorage.getItem('zygai:token');
        const res = await fetch('/api/sandbox/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ code, language })
        });
        
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Execution failed in Microsandbox.');
        
        setOutput(data.output || 'Code executed successfully (no output)');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute code');
    } finally {
      setIsRunning(false);
    }
  };

  const stopCode = () => {
    // Ideally send abort signal
    setIsRunning(false);
    setError('Execution stopped');
  };

  const runInFullscreen = () => {
    if (!code.trim()) return;

    const win = window.open('', '_blank', 'width=1920,height=1080,scrollbars=yes');
    if (!win) return;

    if (language === 'html' || language === 'htm') {
      // For HTML, write directly
      win.document.write(code);
      win.document.close();
    } else {
      // For other languages, create a runner that uses the current theme values
      const computed = getComputedStyle(document.documentElement);
      const bodyBg = (computed.getPropertyValue('--bg') || '#121212').trim();
      const cardBg = (computed.getPropertyValue('--card-bg') || bodyBg).trim();
      const textColor = (computed.getPropertyValue('--ink-50') || '#e0e0e0').trim();
      const preBg = cardBg;
      const borderColor = (computed.getPropertyValue('--border') || '#333').trim();
      const errorColor = '#ff6b6b';

      const baseHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>${language} Runner</title>
          <style>
            :root { --bg: ${bodyBg}; --card-bg: ${cardBg}; --text-color: ${textColor}; --border: ${borderColor}; }
            body {
              margin: 0;
              padding: 20px;
              font-family: 'Monaco', 'Courier New', monospace;
              background: var(--bg);
              color: var(--text-color);
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              background: ${preBg};
              padding: 15px;
              border-radius: 8px;
              border: 1px solid var(--border);
              max-height: calc(100vh - 100px);
              overflow: auto;
            }
            .error { color: ${errorColor}; }
            .header { margin-bottom: 20px; color: var(--text-color); opacity: 0.75; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="header">▶ ${language.toUpperCase()} Execution Output</div>
          <pre id="output">Running...</pre>
          <script>
            async function execute() {
              try {
                const response = await fetch('/api/sandbox/execute', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...(localStorage.getItem('zygai:token') ? { 
                      Authorization: 'Bearer ' + localStorage.getItem('zygai:token')
                    } : {})
                  },
                  body: JSON.stringify({ 
                    code: ${JSON.stringify(code)},
                    language: '${language}'
                  })
                });
                const data = await response.json();
                const output = document.getElementById('output');
                if (response.ok) {
                  output.textContent = data.output || 'Code executed successfully (no output)';
                } else {
                  output.textContent = data.error || 'Execution failed';
                  output.classList.add('error');
                }
              } catch (err) {
                const output = document.getElementById('output');
                output.textContent = 'Error: ' + (err.message || err);
                output.classList.add('error');
              }
            }
            execute();
          </script>
        </body>
        </html>
      `;

      win.document.write(baseHtml);
      win.document.close();
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-ink-700 dark:bg-ink-900 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-100 dark:border-ink-800">
          <div className="flex items-center gap-2">
            <Code2 size={20} className="text-saffron-500" />
            <h2 className="text-lg font-semibold text-ink-900 dark:text-ink-50">Code Interpreter</h2>
            {['python', 'javascript', 'typescript', 'bash', 'ruby', 'go', 'php', 'rust', 'c', 'cpp', 'java'].includes(language.toLowerCase()) && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Microsandbox Ready</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => {
                const newLang = e.target.value;
                setLanguage(newLang);
                setOutput('');
                setError(null);
              }}
              className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-1 text-sm text-ink-700 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-200"
            >
              <option value="html">HTML</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="bash">Bash</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
              <option value="sql">SQL</option>
              <option value="ruby">Ruby</option>
              <option value="go">Go</option>
              <option value="php">PHP</option>
              <option value="rust">Rust</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
            </select>
            <button 
              onClick={runInFullscreen}
              className="p-2 rounded-lg hover:bg-saffron-100 dark:hover:bg-saffron-900/30 text-saffron-600 dark:text-saffron-400 transition-colors"
              title="Run in fullscreen"
            >
              <Maximize size={18} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-ink-100 text-ink-500 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Code Editor Area */}
        <div className="flex-1 min-h-0 p-5 space-y-4">

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
              <div className="flex items-start gap-3">
                <span className="text-lg">⚠️</span>
                <div className="flex-1">
                  <p className="font-medium">Error</p>
                  <p className="mt-1 whitespace-pre-wrap">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-ink-400 mb-2">Output</label>
            {/* Always keep iframe in DOM so ref stays alive — just hide it when not HTML */}
            <div className={`h-[60vh] min-h-[400px] rounded-xl border border-ink-200 bg-white dark:border-ink-700 overflow-hidden shadow-inner ${language === 'html' ? '' : 'hidden'}`}>
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts"
                title="HTML Preview"
                className="w-full h-full border-0"
              />
            </div>
            {language !== 'html' && (
              <div className="h-[60vh] min-h-[400px] p-4 rounded-xl border border-ink-200 bg-ink-950 font-mono text-sm text-emerald-400 whitespace-pre-wrap dark:border-ink-700 overflow-y-auto">
                {output || (isRunning ? 'Running...' : '// Output will appear here')}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-ink-100 dark:border-ink-800 bg-ink-50/50 dark:bg-ink-900/50">
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-600 hover:text-ink-900 disabled:opacity-50 transition-colors"
          >
            Needs changes?
          </button>
          {isRunning ? (
            <button
              onClick={stopCode}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors"
            >
              <Square size={16} fill="current" />
              Stop
            </button>
          ) : (
            <button
              onClick={runCode}
              disabled={!code.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-white bg-saffron-500 hover:bg-saffron-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              <Play size={16} fill="current" />
               Run Code
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeInterpreterModal;
