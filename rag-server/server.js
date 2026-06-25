/**
 * RAG-Base Standalone Server
 * Independent, No-Database server for RAG operations
 * 
 * Runs 2 ports:
 * - API Port (default 3001): Communicates with ZygAI
 * - UI Port (default 3002): Standalone Frontend for training the model
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const API_PORT = process.env.RAG_PORT || 3001;
const UI_PORT = process.env.RAG_UI_PORT || 3002;
const RAG_API_KEY = process.env.RAG_API_KEY;
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
const STORE_FILE = path.join(__dirname, 'vector_store.json');

// --- In-Memory Vector Store ---
const vectorStore = {
  chunks: [], // Array of { text, embedding, metadata }
};

// Load existing knowledge on startup
if (fs.existsSync(STORE_FILE)) {
  try {
    const data = fs.readFileSync(STORE_FILE, 'utf-8');
    vectorStore.chunks = JSON.parse(data);
    console.log(`Loaded ${vectorStore.chunks.length} knowledge chunks from local storage.`);
  } catch (e) {
    console.error('Failed to load local vector store:', e.message);
  }
}

function saveStore() {
  fs.writeFileSync(STORE_FILE, JSON.stringify(vectorStore.chunks));
}

// --- Helpers ---
async function generateEmbedding(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text })
  });
  if (!response.ok) throw new Error(`Ollama failed: ${await response.text()}`);
  const data = await response.json();
  return data.embedding;
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return normA === 0 || normB === 0 ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}


// ============================================================================
// 1. API SERVER (Communicates with ZygAI)
// ============================================================================
const apiApp = express();
apiApp.use(cors());
apiApp.use(express.json({ limit: '50mb' }));

// Optional Security
if (RAG_API_KEY) {
  apiApp.use((req, res, next) => {
    const apiKey = req.headers['x-rag-api-key'];
    if (apiKey !== RAG_API_KEY) return res.status(401).json({ error: 'Unauthorized API Key' });
    next();
  });
}

// ZygAI Query Endpoint
apiApp.post('/api/rag/query', async (req, res) => {
  try {
    const { query, topK = 5, options = {}, sessionId } = req.body;
    const userId = req.body.userId || options.userId; // Extract user identity
    const effectiveSessionId = sessionId || options.sessionId;
    
    console.log(`\n[ZygAI -> RAG] Received query: "${query}" (User: ${userId || 'Global'}, Session: ${effectiveSessionId || 'None'})`);
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const queryEmbedding = await generateEmbedding(query);

    const results = vectorStore.chunks
    .filter(chunk => {
      // User privacy filter: ONLY allow matching User (Personal RAG)
      // Global RAG (null userId) is now restricted.
      const userMatches = chunk.metadata.userId && chunk.metadata.userId === userId;
      if (!userMatches) return false;
      
      // Session privacy filter (only if sessionId is provided and chunk has a sessionId)
      if (effectiveSessionId && chunk.metadata.sessionId && chunk.metadata.sessionId !== effectiveSessionId) {
        return false;
      }
      
      return true;
    })
    .map(chunk => {
      const score = cosineSimilarity(queryEmbedding, chunk.embedding);
      return { text: chunk.text, metadata: chunk.metadata, score, similarity: score };
    })
    .filter(r => r.score > 0.3) // Minimum similarity threshold
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

    console.log(`[RAG -> ZygAI] Found ${results.length} relevant chunks. Sending back to ZygAI.`);
    res.json({ results, query, method: 'dense', count: results.length });
  } catch (error) {
    console.error('Query error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mock endpoints to prevent rag-client.js from crashing ZygAI
apiApp.post('/api/rag/interactions', (req, res) => res.json({ stored: true }));
apiApp.get('/health', (req, res) => res.json({ status: 'healthy', chunks: vectorStore.chunks.length }));
apiApp.get('/version', (req, res) => res.json({ version: '2.0.0-nodb' }));

apiApp.listen(API_PORT, () => {
  console.log(`[API Server] Running on http://localhost:${API_PORT} (ZygAI communication)`);
});


// ============================================================================
// 2. FRONTEND TRAINING SERVER (For Admins to train the RAG)
// ============================================================================
const uiApp = express();
uiApp.use(cors());
uiApp.use(express.json({ limit: '50mb' }));

// Training Endpoint
uiApp.post('/api/train', async (req, res) => {
  try {
    const { text, source, userId } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required' });

    // Very simple semantic chunking (split by double newlines or max 1000 chars)
    const rawChunks = text.match(/[\s\S]{1,1000}(?=\n\n|$)/g) || [text];
    
    let added = 0;
    for (const chunkText of rawChunks) {
      if (!chunkText.trim()) continue;
      const embedding = await generateEmbedding(chunkText.trim());
      vectorStore.chunks.push({ text: chunkText.trim(), embedding, metadata: { source: source || 'Manual Entry', userId: userId || null } });
      added++;
    }

    saveStore(); // Save to file
    res.json({ success: true, chunksAdded: added, totalChunks: vectorStore.chunks.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

uiApp.get('/api/stats', (req, res) => res.json({ totalChunks: vectorStore.chunks.length }));

// Simple HTML Frontend
uiApp.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ZygAI RAG Training Station</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f9fafb; color: #111827; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
        .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; color: #f59e0b; }
        textarea { width: 100%; height: 250px; margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; font-family: inherit; resize: vertical; }
        input { width: 100%; margin-bottom: 1rem; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; box-sizing: border-box; }
        button { background: #f59e0b; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 1rem; width: 100%; }
        button:disabled { background: #d1d5db; cursor: not-allowed; }
        .stats { margin-top: 1rem; font-size: 0.875rem; color: #6b7280; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>RAG Training Station</h1>
        <p>Paste text below to embed it into the RAG model. ZygAI will use this knowledge automatically.</p>
        <input type="text" id="userId" placeholder="User ID (Optional - Leave blank for global knowledge)">
        <input type="text" id="source" placeholder="Information Source (e.g., 'Company Policy 2026', 'Manual')">
        <textarea id="text" placeholder="Paste the knowledge content here..."></textarea>
        <button onclick="train()" id="trainBtn">Embed Knowledge</button>
        <div class="stats" id="status">Active Knowledge Chunks: Loading...</div>
      </div>

      <script>
        async function updateStats() {
          try {
            const res = await fetch('/api/stats');
            const data = await res.json();
            document.getElementById('status').innerText = 'Active Knowledge Chunks: ' + data.totalChunks;
          } catch(e) {}
        }
        
        async function train() {
          const btn = document.getElementById('trainBtn');
          const text = document.getElementById('text').value;
          const source = document.getElementById('source').value;
          const userId = document.getElementById('userId').value;
          
          if (!text.trim()) return alert('Please enter some text to train on.');
          
          btn.disabled = true;
          btn.innerText = 'Generating Embeddings... (Please Wait)';
          
          try {
            const res = await fetch('/api/train', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ text, source, userId })
            });
            const data = await res.json();
            if(data.success) {
              alert('Success! Added ' + data.chunksAdded + ' new knowledge chunks.');
              document.getElementById('text').value = '';
              updateStats();
            } else {
              alert('Error: ' + data.error);
            }
          } catch (e) {
            alert('Error: ' + e.message);
          }
          btn.disabled = false;
          btn.innerText = 'Embed Knowledge';
        }
        
        updateStats();
      </script>
    </body>
    </html>
  `);
});

uiApp.listen(UI_PORT, () => {
  console.log(`[Frontend UI] Running on http://localhost:${UI_PORT} (RAG Training Panel)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
