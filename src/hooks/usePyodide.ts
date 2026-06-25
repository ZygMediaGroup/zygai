import { useState, useEffect, useCallback, useRef } from 'react';

// @ts-ignore - Pyodide types not available
declare global {
  interface Window {
    loadPyodide: any;
  }
}

let globalPyodideInstance: any = null;
let globalPyodidePromise: Promise<any> | null = null;

export const usePyodide = () => {
  const [pyodide, setPyodide] = useState<any>(globalPyodideInstance);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isInitialized = useRef(false);

  const loadPyodide = useCallback(async () => {
    if (globalPyodideInstance) {
      return globalPyodideInstance;
    }

    if (globalPyodidePromise) {
      return globalPyodidePromise;
    }

    setIsLoading(true);
    setError(null);

    globalPyodidePromise = new Promise(async (resolve, reject) => {
      try {
        if (!window.loadPyodide) {
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
          
          script.onload = async () => {
            try {
              const instance = await window.loadPyodide({
                indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
                stdout: (text: string) => console.log('[Pyodide]', text),
                stderr: (text: string) => console.error('[Pyodide]', text)
              });

              // Setup persistent filesystem
              await instance.runPythonAsync(`
import os
if not os.path.exists('/mnt/uploads'):
    os.makedirs('/mnt/uploads', exist_ok=True)
`);

              globalPyodideInstance = instance;
              setPyodide(instance);
              setIsLoading(false);
              resolve(instance);
            } catch (err: any) {
              setError(err.message || 'Failed to initialize Pyodide');
              setIsLoading(false);
              reject(err);
            }
          };

          script.onerror = () => {
            const err = 'Failed to load Pyodide script';
            setError(err);
            setIsLoading(false);
            reject(new Error(err));
          };

          document.head.appendChild(script);
        } else {
          const instance = await window.loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
            stdout: (text: string) => console.log('[Pyodide]', text),
            stderr: (text: string) => console.error('[Pyodide]', text)
          });

          // Setup persistent filesystem
          await instance.runPythonAsync(`
import os
if not os.path.exists('/mnt/uploads'):
    os.makedirs('/mnt/uploads', exist_ok=True)
`);

          globalPyodideInstance = instance;
          setPyodide(instance);
          setIsLoading(false);
          resolve(instance);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to initialize Pyodide');
        setIsLoading(false);
        reject(err);
      }
    });

    return globalPyodidePromise;
  }, []);

  const runPython = useCallback(async (code: string): Promise<{ output: string; error: string | null; images: string[] }> => {
    if (!globalPyodideInstance) {
      throw new Error('Pyodide not initialized');
    }

    const images: string[] = [];
    
    try {
      // Capture stdout and stderr
      await globalPyodideInstance.runPythonAsync(`
import sys
from io import StringIO
old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = captured_stdout = StringIO()
sys.stderr = captured_stderr = StringIO()
`);

      try {
        // Auto-detect and load packages
        await globalPyodideInstance.loadPackagesFromImports(code);
        
        // Run user code
        await globalPyodideInstance.runPythonAsync(code);
      } finally {
        // Get outputs
        const stdout = await globalPyodideInstance.runPythonAsync('captured_stdout.getvalue()');
        const stderr = await globalPyodideInstance.runPythonAsync('captured_stderr.getvalue()');
        
        // Restore stdout/stderr
        await globalPyodideInstance.runPythonAsync(`
sys.stdout = old_stdout
sys.stderr = old_stderr
`);

        // Extract base64 images
        const base64Regex = /data:image\/[a-zA-Z]+;base64,([A-Za-z0-9+/=]+)/g;
        let match;
        while ((match = base64Regex.exec(stdout)) !== null) {
          images.push(match[0]);
        }

        return {
          output: stdout,
          error: stderr || null,
          images
        };
      }
    } catch (err: any) {
      return {
        output: '',
        error: err.message || 'Python execution error',
        images: []
      };
    }
  }, []);

  useEffect(() => {
    if (!isInitialized.current) {
      isInitialized.current = true;
      loadPyodide().catch(() => {});
    }
  }, [loadPyodide]);

  return {
    pyodide,
    isLoading,
    error,
    loadPyodide,
    runPython
  };
};
