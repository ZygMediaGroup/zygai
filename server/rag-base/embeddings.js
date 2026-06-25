import RAGClient from '../rag-client.js';

const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text';

/**
 * Generate embeddings for text using Ollama
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function generateEmbedding(text) {
  if (!text || text.trim().length === 0) {
    throw new Error('Text cannot be empty');
  }

  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text.trim()
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts (batch)
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function generateBatchEmbeddings(texts) {
  const validTexts = texts.filter(text => text && text.trim().length > 0);
  
  if (validTexts.length === 0) {
    throw new Error('No valid texts to embed');
  }

  try {
    return Promise.all(validTexts.map(t => generateEmbedding(t)));
  } catch (error) {
    console.error('Error generating batch embeddings:', error);
    throw error;
  }
}

/**
 * Store embedding in database
 * @param {string} documentId - Document ID
 * @param {string} text - Original text
 * @param {number[]} embedding - Embedding vector
 * @param {Object} metadata - Optional metadata
 */
export async function storeEmbedding(documentId, text, embedding, metadata = {}) {
  try {
    const uiPort = process.env.RAG_UI_PORT || 3002;
    const response = await fetch(`http://100.114.102.61:${uiPort}/api/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, source: metadata.source || documentId, userId: metadata.userId || null })
    });
    return { documentId, stored: response.ok };
  } catch (error) {
    console.error('Error storing embedding:', error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vectorA - First vector
 * @param {number[]} vectorB - Second vector
 * @returns {number} - Similarity score (0-1)
 */
export function cosineSimilarity(vectorA, vectorB) {
  const dotProduct = vectorA.reduce((sum, val, i) => sum + val * vectorB[i], 0);
  const magnitudeA = Math.sqrt(vectorA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vectorB.reduce((sum, val) => sum + val * val, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Retrieve embeddings and calculate similarity to query
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} limit - Number of results to return
 * @param {number} threshold - Minimum similarity threshold (0-1)
 * @returns {Promise<Array>} - Similar embeddings with scores
 */
export async function findSimilarEmbeddings(queryEmbedding, limit = 10, threshold = 0.5) {
  try {
    // Deprecated. Local standalone server handles querying directly via RAGClient
    console.warn('findSimilarEmbeddings is deprecated in No-DB mode.');
    return [];
  } catch (error) {
    console.error('Error finding similar embeddings:', error);
    throw error;
  }
}

/**
 * Delete embedding
 * @param {string} documentId - Document ID to delete
 */
export async function deleteEmbedding(documentId) {
  try {
    console.warn('deleteEmbedding is deprecated in No-DB mode.');
  } catch (error) {
    console.error('Error deleting embedding:', error);
    throw error;
  }
}

/**
 * Get embedding stats
 * @returns {Promise<Object>} - Statistics about stored embeddings
 */
export async function getEmbeddingStats() {
  try {
    const client = new RAGClient();
    const health = await client.health();
    return { total: health.chunks || 0, documents: health.chunks || 0 };
  } catch (error) {
    console.error('Error getting embedding stats:', error);
    throw error;
  }
}
