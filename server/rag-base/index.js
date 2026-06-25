// RAG-Base: Retrieval-Augmented Generation Learning System
// Supports multiple retrieval methods and learning from interactions

export * from './embeddings.js';
export * from './retrieval.js';
export * from './storage.js';
export * from './learning.js';
export * from './utils.js';

/**
 * RAG Methods available
 */
export const RAG_METHODS = {
  DENSE: 'dense',
  SPARSE: 'sparse',
  HYBRID: 'hybrid',
  DIVERSE: 'diverse'
};

/**
 * Execute a RAG query with specified method
 * @param {Object} config
 * @param {string} config.query - Query text
 * @param {number[]} config.queryEmbedding - Query embedding vector
 * @param {string} config.method - RAG method to use
 * @param {number} config.topK - Number of results
 * @param {Object} config.options - Method-specific options
 * @returns {Promise<Object>} - Query results with metadata
 */
export async function executeRAGQuery(config) {
  const {
    query,
    queryEmbedding,
    method = RAG_METHODS.HYBRID,
    topK = 10,
    options = {}
  } = config;

  const { denseRetrieval, sparseRetrieval, hybridRetrieval, rerankResults, diverseRetrieval } = await import('./retrieval.js');

  let results;
  const startTime = Date.now();

  try {
    switch (method) {
      case RAG_METHODS.DENSE:
        results = await denseRetrieval(
          queryEmbedding,
          topK,
          options.threshold || 0.5
        );
        break;

      case RAG_METHODS.SPARSE:
        results = await sparseRetrieval(query, topK);
        break;

      case RAG_METHODS.HYBRID:
        results = await hybridRetrieval(
          queryEmbedding,
          query,
          topK,
          options.alpha || 0.6
        );
        break;

      case RAG_METHODS.DIVERSE:
        const initialResults = await hybridRetrieval(queryEmbedding, query, topK * 2);
        results = diverseRetrieval(
          initialResults,
          topK,
          options.diversityWeight || 0.3
        );
        break;

      default:
        throw new Error(`Unknown RAG method: ${method}`);
    }

    // Apply reranking if specified
    if (options.rerank) {
      results = rerankResults(results, query, topK);
    }

    const executionTime = Date.now() - startTime;

    return {
      query,
      method,
      results,
      count: results.length,
      executionTimeMs: executionTime,
      timestamp: new Date()
    };
  } catch (error) {
    console.error(`Error executing ${method} RAG query:`, error);
    throw error;
  }
}

/**
 * Get RAG system configuration and stats
 * @returns {Promise<Object>}
 */
export async function getRAGSystemInfo() {
  const { getEmbeddingStats } = await import('./embeddings.js');
  const { getStorageStats } = await import('./storage.js');
  const { getImprovementRecommendations } = await import('./learning.js');

  try {
    const [embeddingStats, storageStats, recommendations] = await Promise.all([
      getEmbeddingStats(),
      getStorageStats(),
      getImprovementRecommendations()
    ]);

    return {
      embeddings: embeddingStats,
      storage: storageStats,
      recommendations,
      availableMethods: Object.values(RAG_METHODS),
      version: '1.0.0'
    };
  } catch (error) {
    console.error('Error getting RAG system info:', error);
    throw error;
  }
}
