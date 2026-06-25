// @ts-ignore - server db module has no types
import { get } from '../../server/db.js';
// @ts-ignore - provider module has no types
import { zygAIOllamaProvider, zygAIOllamaProviderStream } from '../../server/providers/zygai-ollama.js';
// @ts-ignore - server index module has no types
import { callExa } from '../../server/exa.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIBE_CODER_SYSTEM_PROMPT = `You are Vibe Coder, a world-class AI software engineer and rapid prototyper.
Your goal is to help the user build lively, interactive visual experiences, responsive web apps, and complex data visualizations.
The user will provide natural language prompts focusing on the "vibe" or desired outcome rather than exact syntax.

Core Tenets:
1. Focus on creative intent and delivering functional, complete prototypes.
2. Write clean, modern, and well-documented code.
3. When providing code, ALWAYS use Markdown code blocks. If you generate HTML/JS/CSS, provide it as a single cohesive file where possible (e.g., using an HTML file with inline <style> and <script>), so it can be rendered perfectly in a live preview.
4. Assume the user doesn't want to deal with boilerplate. Give them code they can run instantly.

Capabilities:
- If you are stuck or need more information about a library, API, or technique, you can use Search.
- To search, output exactly: [SEARCH: your search query]
- Wait for the results, and then continue your generation.
`;

const VIBE_CODER_DEFAULT_MODEL = process.env.VIBE_CODER_MODEL || 'gemma4:e4b';

/**
 * Resolves local image paths or data URLs to base64 for the AI provider
 */
const resolveImageToBase64 = (imgData: string) => {
  if (!imgData) return null;
  
  // Handle permanent uploads
  if (imgData.startsWith('/uploads/')) {
    try {
      const filePath = path.join(__dirname, '../../public', imgData);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath).toString('base64');
      }
    } catch (e) {
      console.error('[VibeCoder] Failed to read uploaded image:', e);
    }
    return null;
  }
  
  // Handle data URLs
  if (imgData.startsWith('data:image/')) {
    const match = imgData.match(/^data:image\/[^;]+;base64,(.*)$/);
    return match ? match[1] : null;
  }
  
  // Assume it's already a raw base64 string
  return imgData;
};

/**
 * Register Vibe Coder WebSocket handler on a WebSocket.Server instance
 * Usage: registerVibeCoderWebSocket(wss, { auth })
 */
export function registerVibeCoderWebSocket(wss: any, options: { auth?: (token: string) => Promise<any> } = {}) {
  const { auth } = options;
  wss.on('connection', async (ws: any, req: any) => {
    // Extract token from URL query if needed
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    // Optional auth check
    if (auth) {
      const user = await auth(token || '');
      if (!user) {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid or missing token' }));
        ws.close();
        return;
      }
    }

    ws.on('message', async (msg: any) => {
      try {
        const { messages, useRag, model } = typeof msg === 'string' ? JSON.parse(msg) : JSON.parse(new TextDecoder().decode(msg));

        if (!messages || !Array.isArray(messages)) {
          ws.send(JSON.stringify({ type: 'error', error: 'Messages array is required.' }));
          return;
        }

        let additionalContext = '';

        // RAG Integration
        if (useRag) {
          try {
            const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
            if (lastUserMessage) {
              const ragServerUrl = process.env.RAG_SERVER_URL || 'http://localhost:8000';
              const ragResponse = await fetch(`${ragServerUrl}/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: lastUserMessage.content, limit: 5 })
              });

              if (ragResponse.ok) {
                const ragData = await ragResponse.json();
                const retrievedContext = Array.isArray(ragData.results)
                  ? ragData.results.map((r: any) => r.content || r.text).join('\n\n')
                  : ragData.context || '';
                if (retrievedContext) {
                  additionalContext = `\n\n### Codebase Context (from RAG):\nUse the following project context to inform your code generation, matching the project's style and existing utilities:\n${retrievedContext}\n`;
                }
              }
            }
          } catch (err) {
            console.error('Failed to fetch context from RAG server:', err);
          }
        }

        const systemMessage = { role: 'system', content: VIBE_CODER_SYSTEM_PROMPT + additionalContext };
        const selectedModel = model || VIBE_CODER_DEFAULT_MODEL;

        // Fetch the zygai-ollama provider row
        const providerRow = await get('SELECT * FROM api_providers WHERE LOWER(name) = ? OR provider_type = ? LIMIT 1', ['zygai-ollama', 'zygai-ollama']);
        if (!providerRow) {
          ws.send(JSON.stringify({
            type: 'error',
            error: 'ZygAI Ollama provider not configured. Please set up the Ollama provider in settings.'
          }));
          return;
        }

        // Process images in messages
        const processedMessages = messages.map(m => {
          if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
            return {
              ...m,
              userImages: m.images.map((img: string) => resolveImageToBase64(img)).filter(Boolean)
            };
          }
          return m;
        });

        let currentTurnMessages = [...processedMessages];
        let isFinished = false;
        let loopCount = 0;

        while (!isFinished && loopCount < 5) {
          loopCount++;
          try {
            const stream = zygAIOllamaProviderStream({
              providerRow,
              modelId: selectedModel,
              messages: currentTurnMessages, 
              customSystemPrompt: systemMessage.content
            });

            let fullContent = '';
            for await (const chunk of stream) {
              const content = chunk.choices?.[0]?.delta?.content || '';
              if (content) {
                fullContent += content;
                ws.send(JSON.stringify({ type: 'chunk', content }));
              }
            }

            // Check if the AI wants to search
            const searchMatch = fullContent.match(/\[SEARCH:\s*(.*?)\]/);
            if (searchMatch) {
              const query = searchMatch[1].trim();
              ws.send(JSON.stringify({ type: 'chunk', content: `\n\n*Searching Exa for: ${query}...*\n` }));
              
              try {
                const results = await callExa(query);
                const searchResultsText = results.length > 0
                  ? results.map((r: any, i: number) => `Result ${i+1}: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`).join('\n\n')
                  : 'No results found.';
                
                currentTurnMessages.push({ role: 'assistant', content: fullContent });
                currentTurnMessages.push({ role: 'user', content: `Search Results for "${query}":\n\n${searchResultsText}\n\nPlease use this information to continue.` });
                
                ws.send(JSON.stringify({ type: 'chunk', content: `\n*Found ${results.length} results. Continuing...*\n\n` }));
                continue; // Trigger another turn with search results
              } catch (searchErr: any) {
                ws.send(JSON.stringify({ type: 'chunk', content: `\n*Search failed: ${searchErr.message}*\n\n` }));
              }
            }
          } catch (err: any) {
            throw new Error(`AI request failed: ${err.message}`);
          }
          isFinished = true;
        }

        ws.send(JSON.stringify({ type: 'done' }));
      } catch (error: any) {
        console.error('Vibe Coder WS Error:', error);
        ws.send(JSON.stringify({ type: 'error', error: error.message || 'Failed to generate code in Vibe Coder.' }));
      }
    });
  });
}

/**
 * REST endpoint handler for Vibe Coder (non-streaming)
 */
export async function handleVibeCoderPost(req: any, res: any) {
  try {
    const { messages, useRag, model } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required.' });
    }

    let additionalContext = '';

    if (useRag) {
      try {
        const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
        if (lastUserMessage) {
          const ragServerUrl = process.env.RAG_SERVER_URL || 'http://localhost:8000';
          const ragResponse = await fetch(`${ragServerUrl}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: lastUserMessage.content, limit: 5 })
          });
          if (ragResponse.ok) {
            const ragData = await ragResponse.json();
            const retrievedContext = Array.isArray(ragData.results)
              ? ragData.results.map((r: any) => r.content || r.text).join('\n\n')
              : ragData.context || '';
            if (retrievedContext) {
              additionalContext = `\n\n### Codebase Context (from RAG):\nUse the following project context to inform your code generation, matching the project's style and existing utilities:\n${retrievedContext}\n`;
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch context from RAG server:', err);
      }
    }

    const systemMessage = { role: 'system', content: VIBE_CODER_SYSTEM_PROMPT + additionalContext };
    const selectedModel = model || VIBE_CODER_DEFAULT_MODEL;

    const providerRow = await get('SELECT * FROM api_providers WHERE LOWER(name) = ? OR provider_type = ? LIMIT 1', ['zygai-ollama', 'zygai-ollama']);
    if (!providerRow) {
      return res.status(500).json({ error: 'ZygAI Ollama provider not configured.' });
    }

    // Process images in messages
    const processedMessages = messages.map(m => {
      if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
        return {
          ...m,
          userImages: m.images.map((img: string) => resolveImageToBase64(img)).filter(Boolean)
        };
      }
      return m;
    });

    try {
      const result = await zygAIOllamaProvider({
        providerRow,
        modelId: selectedModel,
        messages: processedMessages,
        customSystemPrompt: systemMessage.content
      });
      return res.json({ content: result });
    } catch (err: any) {
      console.error('Vibe Coder Error:', err);
      return res.status(500).json({ error: `Failed to generate code: ${err.message}` });
    }
  } catch (error: any) {
    console.error('Vibe Coder Error:', error);
    return res.status(500).json({ error: 'Failed to generate code in Vibe Coder.' });
  }
}

// NOTE: To mount this on your Express app:
// import { registerVibeCoderWebSocket, handleVibeCoderPost } from './src/components/vibeCoder.js';
// registerVibeCoderWebSocket(wss, { auth: (token) => verifyToken(token) });
// app.post('/vibe-coder', handleVibeCoderPost);
