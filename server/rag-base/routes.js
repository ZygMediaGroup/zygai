/**
 * RAG-Base API Routes
 * Integration endpoints for the RAG learning system
 */

import express from 'express';
import {
  generateEmbedding,
  generateBatchEmbeddings,
  storeEmbedding,
  getEmbeddingStats
} from './embeddings.js';
import {
  denseRetrieval,
  sparseRetrieval,
  hybridRetrieval,
  rerankResults
} from './retrieval.js';
import {
  createDocument,
  getDocument,
  listDocuments,
  deleteDocument,
  getStorageStats
} from './storage.js';
import {
  storeInteraction,
  recordFeedback,
  getInteractionHistory,
  getLearningInsights,
  getFailedRetrievals,
  getMethodPerformance
} from './learning.js';
import {
  chunkText,
  extractKeywords,
  getDocumentStats,
  truncateText
} from './utils.js';
import { executeRAGQuery, getRAGSystemInfo } from './index.js';

export const createRAGRouter = () => {
  const router = express.Router();

  // ==================== DOCUMENTS ====================

  /**
   * POST /rag/documents
   * Create a new document with embeddings
   */
  router.post('/documents', async (req, res) => {
    try {
      const { title, content, source, metadata, userId } = req.body;

      if (!content) {
        return res.status(400).json({ error: 'Content is required' });
      }

      const result = await createDocument({
        title,
        content,
        source,
        metadata,
        userId
      });

      res.json(result);
    } catch (error) {
      console.error('Error creating document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /rag/documents/:documentId
   * Retrieve a specific document
   */
  router.get('/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const { userId } = req.query;

      const doc = await getDocument(documentId, userId);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }

      res.json(doc);
    } catch (error) {
      console.error('Error getting document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /rag/documents
   * List documents with filtering
   */
  router.get('/documents', async (req, res) => {
    try {
      const { source, userId, limit = 20, offset = 0 } = req.query;

      const documents = await listDocuments({
        source,
        userId,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

      res.json(documents);
    } catch (error) {
      console.error('Error listing documents:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * DELETE /rag/documents/:documentId
   * Delete a document
   */
  router.delete('/documents/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;
      const { userId } = req.query;

      await deleteDocument(documentId, userId);
      res.json({ deleted: true });
    } catch (error) {
      console.error('Error deleting document:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== RETRIEVAL ====================

  /**
   * POST /rag/query
   * Execute a RAG query with specified method
   */
  router.post('/query', async (req, res) => {
    try {
      const { query, method = 'hybrid', topK = 10, options = {} } = req.body;

      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }

      // Generate embedding for query
      const queryEmbedding = await generateEmbedding(query);

      // Execute RAG query
      const result = await executeRAGQuery({
        query,
        queryEmbedding,
        method,
        topK,
        options: { ...options, rerank: true }
      });

      res.json(result);
    } catch (error) {
      console.error('Error executing query:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /rag/retrieve/dense
   * Pure dense retrieval (semantic search)
   */
  router.post('/retrieve/dense', async (req, res) => {
    try {
      const { query, topK = 10, threshold = 0.5 } = req.body;

      const queryEmbedding = await generateEmbedding(query);
      const results = await denseRetrieval(queryEmbedding, topK, threshold);

      res.json({ method: 'dense', results, count: results.length });
    } catch (error) {
      console.error('Error in dense retrieval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /rag/retrieve/sparse
   * Pure sparse retrieval (keyword-based BM25)
   */
  router.post('/retrieve/sparse', async (req, res) => {
    try {
      const { query, topK = 10 } = req.body;

      const results = await sparseRetrieval(query, topK);
      res.json({ method: 'sparse', results, count: results.length });
    } catch (error) {
      console.error('Error in sparse retrieval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /rag/retrieve/hybrid
   * Hybrid retrieval combining dense + sparse
   */
  router.post('/retrieve/hybrid', async (req, res) => {
    try {
      const { query, topK = 10, alpha = 0.6 } = req.body;

      const queryEmbedding = await generateEmbedding(query);
      const results = await hybridRetrieval(queryEmbedding, query, topK, alpha);

      res.json({ method: 'hybrid', results, count: results.length, alpha });
    } catch (error) {
      console.error('Error in hybrid retrieval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== LEARNING & FEEDBACK ====================

  /**
   * POST /rag/interactions
   * Store a query-answer interaction for learning
   */
  router.post('/interactions', async (req, res) => {
    try {
      const {
        query,
        answer,
        sourceChunks,
        method,
        userId,
        relevance,
        metadata
      } = req.body;

      const interactionId = await storeInteraction({
        query,
        answer,
        sourceChunks,
        method,
        userId,
        relevance,
        metadata
      });

      res.json({ interactionId, stored: true });
    } catch (error) {
      console.error('Error storing interaction:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /rag/interactions/:interactionId/feedback
   * Record user feedback on an interaction
   */
  router.post('/interactions/:interactionId/feedback', async (req, res) => {
    try {
      const { interactionId } = req.params;
      const { relevance, feedback } = req.body;

      if (!relevance || relevance < 1 || relevance > 5) {
        return res.status(400).json({ error: 'Relevance must be between 1-5' });
      }

      await recordFeedback(interactionId, relevance, feedback);
      res.json({ recorded: true });
    } catch (error) {
      console.error('Error recording feedback:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /rag/interactions
   * Get interaction history
   */
  router.get('/interactions', async (req, res) => {
    try {
      const { userId, method, minRelevance, limit = 50 } = req.query;

      const interactions = await getInteractionHistory({
        userId,
        method,
        minRelevance: minRelevance ? parseInt(minRelevance) : null,
        limit: parseInt(limit)
      });

      res.json(interactions);
    } catch (error) {
      console.error('Error getting interactions:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /rag/insights
   * Get learning insights
   */
  router.get('/insights', async (req, res) => {
    try {
      const { userId, days = 30 } = req.query;

      const insights = await getLearningInsights({
        userId,
        days: parseInt(days)
      });

      res.json(insights);
    } catch (error) {
      console.error('Error getting insights:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /rag/failed-retrievals
   * Get failed retrievals for analysis
   */
  router.get('/failed-retrievals', async (req, res) => {
    try {
      const { userId, limit = 20, minRelevance = 2 } = req.query;

      const failed = await getFailedRetrievals({
        userId,
        limit: parseInt(limit),
        minRelevance: parseInt(minRelevance)
      });

      res.json(failed);
    } catch (error) {
      console.error('Error getting failed retrievals:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /rag/method-performance/:method
   * Get performance metrics for a specific method
   */
  router.get('/method-performance/:method', async (req, res) => {
    try {
      const { method } = req.params;

      const performance = await getMethodPerformance(method);
      res.json({ method, performance });
    } catch (error) {
      console.error('Error getting method performance:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== SYSTEM ====================

  /**
   * GET /rag/stats
   * Get RAG system statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const [embeddingStats, storageStats, systemInfo] = await Promise.all([
        getEmbeddingStats(),
        getStorageStats(),
        getRAGSystemInfo()
      ]);

      res.json({
        embeddings: embeddingStats,
        storage: storageStats,
        system: systemInfo
      });
    } catch (error) {
      console.error('Error getting stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /rag/process-text
   * Process text: chunk, extract keywords, get stats
   */
  router.post('/process-text', async (req, res) => {
    try {
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'Text is required' });
      }

      const chunks = chunkText(text);
      const keywords = extractKeywords(text);
      const stats = getDocumentStats(text);

      res.json({
        chunks,
        keywords,
        stats,
        chunkCount: chunks.length
      });
    } catch (error) {
      console.error('Error processing text:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};

export default createRAGRouter;
