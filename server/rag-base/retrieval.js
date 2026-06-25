import { all, get } from '../db.js';
import { cosineSimilarity } from './embeddings.js';

/**
 * BM25 scoring algorithm for keyword-based retrieval
 * Uses TF-IDF with BM25 parameters
 */
class BM25 {
  constructor(k1 = 1.5, b = 0.75) {
    this.k1 = k1; // term frequency saturation point
    this.b = b;   // length normalization factor
  }

  /**
   * Calculate BM25 score
   * @param {number} freq - Term frequency in document
   * @param {number} docLen - Document length (word count)
   * @param {number} avgDocLen - Average document length
   * @param {number} idf - Inverse document frequency
   */
  score(freq, docLen, avgDocLen, idf) {
    const numerator = freq * (this.k1 + 1);
    const denominator = freq + this.k1 * (1 - this.b + this.b * (docLen / avgDocLen));
    return idf * (numerator / denominator);
  }
}

const bm25 = new BM25();

/**
 * Tokenize text into words
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  return text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Calculate term frequency (TF)
 * @param {string[]} tokens
 * @returns {Object} - Map of term -> frequency
 */
function calculateTF(tokens) {
  const tf = {};
  tokens.forEach(token => {
    tf[token] = (tf[token] || 0) + 1;
  });
  return tf;
}

/**
 * DENSE RETRIEVAL: Semantic search using embeddings
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} limit - Number of results
 * @param {number} threshold - Similarity threshold
 * @returns {Promise<Array>}
 */
export async function denseRetrieval(queryEmbedding, limit = 10, threshold = 0.5) {
  try {
    const embeddings = await all(
      `SELECT id, document_id, text, embedding, metadata
       FROM rag_embeddings 
       WHERE is_deleted = 0
       LIMIT 1000`
    );

    const results = embeddings
      .map(row => {
        const embedding = JSON.parse(row.embedding);
        const similarity = cosineSimilarity(queryEmbedding, embedding);
        return {
          id: row.id,
          documentId: row.document_id,
          text: row.text,
          similarity,
          score: similarity,
          method: 'dense',
          metadata: JSON.parse(row.metadata || '{}')
        };
      })
      .filter(result => result.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return results;
  } catch (error) {
    console.error('Error in dense retrieval:', error);
    throw error;
  }
}

/**
 * SPARSE RETRIEVAL: BM25 keyword-based search
 * @param {string} query - Query text
 * @param {number} limit - Number of results
 * @returns {Promise<Array>}
 */
export async function sparseRetrieval(query, limit = 10) {
  try {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    // Get all documents
    const documents = await all(
      'SELECT id, document_id, text, metadata FROM rag_embeddings WHERE is_deleted = 0'
    );

    // Calculate statistics
    const totalDocs = documents.length;
    const docLengths = documents.map(doc => tokenize(doc.text).length);
    const avgDocLen = docLengths.reduce((a, b) => a + b, 0) / Math.max(totalDocs, 1);

    // Calculate document frequencies
    const docFreq = {};
    documents.forEach(doc => {
      const docTokens = new Set(tokenize(doc.text));
      docTokens.forEach(token => {
        docFreq[token] = (docFreq[token] || 0) + 1;
      });
    });

    // Score documents using BM25
    const scores = documents.map((doc, idx) => {
      const docTokens = tokenize(doc.text);
      const tf = calculateTF(docTokens);

      let score = 0;
      queryTokens.forEach(qToken => {
        if (tf[qToken]) {
          const idf = Math.log((totalDocs - (docFreq[qToken] || 0) + 0.5) / ((docFreq[qToken] || 0) + 0.5));
          score += bm25.score(tf[qToken], docLengths[idx], avgDocLen, idf);
        }
      });

      return {
        id: doc.id,
        documentId: doc.document_id,
        text: doc.text,
        score,
        similarity: Math.min(score / 100, 1), // normalize to 0-1
        method: 'sparse',
        metadata: JSON.parse(doc.metadata || '{}')
      };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return scores;
  } catch (error) {
    console.error('Error in sparse retrieval:', error);
    throw error;
  }
}

/**
 * HYBRID RETRIEVAL: Combine dense and sparse methods
 * @param {number[]} queryEmbedding - Query embedding
 * @param {string} query - Query text
 * @param {number} limit - Number of results
 * @param {number} alpha - Weight for dense results (0-1), sparse gets (1-alpha)
 * @returns {Promise<Array>}
 */
export async function hybridRetrieval(queryEmbedding, query, limit = 10, alpha = 0.6) {
  try {
    // Get results from both methods
    const denseResults = await denseRetrieval(queryEmbedding, limit * 2, 0.3);
    const sparseResults = await sparseRetrieval(query, limit * 2);

    // Combine and normalize scores
    const combinedMap = new Map();

    denseResults.forEach(result => {
      combinedMap.set(result.id, {
        ...result,
        denseScore: result.similarity,
        sparseScore: 0
      });
    });

    // Normalize sparse scores to 0-1 range
    const maxSparseScore = Math.max(...sparseResults.map(r => r.score), 1);
    sparseResults.forEach(result => {
      const existing = combinedMap.get(result.id) || {
        id: result.id,
        documentId: result.documentId,
        text: result.text,
        metadata: result.metadata,
        denseScore: 0,
        sparseScore: 0
      };
      existing.sparseScore = result.score / maxSparseScore;
      combinedMap.set(result.id, existing);
    });

    // Calculate hybrid score
    const hybridResults = Array.from(combinedMap.values())
      .map(result => ({
        ...result,
        hybridScore: alpha * result.denseScore + (1 - alpha) * result.sparseScore,
        method: 'hybrid'
      }))
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, limit);

    return hybridResults;
  } catch (error) {
    console.error('Error in hybrid retrieval:', error);
    throw error;
  }
}

/**
 * RE-RANKING: Rerank results using a semantic model or other criteria
 * @param {Array} results - Initial retrieval results
 * @param {string} query - Original query
 * @param {number} topK - Number of results to return
 * @returns {Array} - Reranked results
 */
export function rerankResults(results, query, topK = 10) {
  // Simple reranking: boost relevance by query term presence and result position
  const queryTerms = new Set(tokenize(query));

  const reranked = results.map((result, originalIndex) => {
    const textTokens = new Set(tokenize(result.text));
    const termOverlap = [...queryTerms].filter(term => textTokens.has(term)).length;
    const termOverlapScore = termOverlap / Math.max(queryTerms.size, 1);

    return {
      ...result,
      termOverlap,
      termOverlapScore,
      rerankedScore: result.hybridScore * 0.7 + termOverlapScore * 0.3,
      originalIndex
    };
  })
  .sort((a, b) => b.rerankedScore - a.rerankedScore)
  .slice(0, topK);

  return reranked;
}

/**
 * DIVERSITY-AWARE RETRIEVAL: Retrieve diverse results to reduce redundancy
 * @param {Array} results - Initial retrieval results
 * @param {number} topK - Number of diverse results
 * @param {number} diversityWeight - Weight for diversity (0-1)
 * @returns {Array}
 */
export function diverseRetrieval(results, topK = 10, diversityWeight = 0.3) {
  const selected = [];
  const remaining = [...results];

  while (remaining.length > 0 && selected.length < topK) {
    // Select best result
    const best = remaining.shift();
    selected.push(best);

    // Penalize similar results
    remaining.forEach(result => {
      const similarity = cosineSimilarity(
        JSON.parse(result.embedding || '[]'),
        JSON.parse(best.embedding || '[]')
      );
      result.diversityPenalty = Math.max(result.diversityPenalty || 0, similarity);
      result.diverseScore = result.score * (1 - diversityWeight * result.diversityPenalty);
    });

    remaining.sort((a, b) => (b.diverseScore || b.score) - (a.diverseScore || a.score));
  }

  return selected;
}
