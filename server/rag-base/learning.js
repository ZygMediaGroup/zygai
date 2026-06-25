import { run, get, all } from '../db.js';

/**
 * Store a query-answer pair for learning
 * @param {Object} interaction
 * @param {string} interaction.query - User query
 * @param {string} interaction.answer - Generated answer
 * @param {Array} interaction.sourceChunks - Retrieved chunks used
 * @param {string} interaction.method - Retrieval method (dense, sparse, hybrid)
 * @param {string} interaction.userId - User ID
 * @param {number} interaction.relevance - Relevance feedback (1-5)
 * @param {Object} interaction.metadata - Additional metadata
 * @returns {Promise<string>} - Interaction ID
 */
export async function storeInteraction(interaction) {
  const {
    query = '',
    answer = '',
    sourceChunks = [],
    method = 'hybrid',
    userId = null,
    relevance = null,
    metadata = {}
  } = interaction;

  try {
    const result = await run(
      `INSERT INTO rag_interactions (
        query, answer, source_chunks, method, user_id, relevance, metadata, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        query,
        answer,
        JSON.stringify(sourceChunks),
        method,
        userId,
        relevance,
        JSON.stringify(metadata)
      ]
    );

    return result.insertId;
  } catch (error) {
    console.error('Error storing interaction:', error);
    throw error;
  }
}

/**
 * Record user feedback on a query-answer pair
 * @param {number} interactionId - Interaction ID
 * @param {number} relevance - Relevance score (1-5)
 * @param {string} feedback - User feedback text
 */
export async function recordFeedback(interactionId, relevance, feedback = '') {
  try {
    await run(
      `UPDATE rag_interactions 
       SET relevance = ?, feedback = ?, feedback_at = NOW()
       WHERE id = ?`,
      [relevance, feedback, interactionId]
    );

    return { recorded: true };
  } catch (error) {
    console.error('Error recording feedback:', error);
    throw error;
  }
}

/**
 * Get interaction history
 * @param {Object} filter
 * @param {string} filter.userId - Filter by user
 * @param {string} filter.method - Filter by retrieval method
 * @param {number} filter.minRelevance - Minimum relevance score
 * @param {number} filter.limit - Result limit
 * @returns {Promise<Array>}
 */
export async function getInteractionHistory(filter = {}) {
  const {
    userId = null,
    method = null,
    minRelevance = null,
    limit = 50
  } = filter;

  try {
    let query = 'SELECT * FROM rag_interactions WHERE 1=1';
    const params = [];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    if (method) {
      query += ' AND method = ?';
      params.push(method);
    }

    if (minRelevance !== null) {
      query += ' AND relevance >= ?';
      params.push(minRelevance);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const interactions = await all(query, params);
    return interactions.map(interaction => ({
      ...interaction,
      sourceChunks: JSON.parse(interaction.source_chunks || '[]'),
      metadata: JSON.parse(interaction.metadata || '{}')
    }));
  } catch (error) {
    console.error('Error getting interaction history:', error);
    throw error;
  }
}

/**
 * Get learning insights from interactions
 * @param {Object} filter
 * @returns {Promise<Object>}
 */
export async function getLearningInsights(filter = {}) {
  const { userId = null, days = 30 } = filter;

  try {
    let whereClause = `WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
    const params = [];

    if (userId) {
      whereClause += ' AND user_id = ?';
      params.push(userId);
    }

    // Method effectiveness
    const methodStats = await all(
      `SELECT method, 
              COUNT(*) as count,
              AVG(relevance) as avg_relevance,
              COUNT(CASE WHEN relevance >= 4 THEN 1 END) as high_quality
       FROM rag_interactions
       ${whereClause}
       GROUP BY method`,
      params
    );

    // Query patterns (most common queries)
    const commonQueries = await all(
      `SELECT query, COUNT(*) as frequency, AVG(relevance) as avg_relevance
       FROM rag_interactions
       ${whereClause}
       GROUP BY query
       ORDER BY frequency DESC
       LIMIT 10`,
      params
    );

    // Retrieval effectiveness
    const retrievalStats = await get(
      `SELECT 
        COUNT(*) as total_interactions,
        AVG(relevance) as avg_relevance,
        COUNT(CASE WHEN relevance >= 4 THEN 1 END) as successful_retrievals,
        COUNT(CASE WHEN relevance IS NULL THEN 1 END) as unrated
       FROM rag_interactions
       ${whereClause}`,
      params
    );

    return {
      period: { days, from: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      methodEffectiveness: methodStats,
      commonQueries,
      overallStats: retrievalStats
    };
  } catch (error) {
    console.error('Error getting learning insights:', error);
    throw error;
  }
}

/**
 * Get failed retrievals for improvement
 * @param {Object} filter
 * @returns {Promise<Array>}
 */
export async function getFailedRetrievals(filter = {}) {
  const { userId = null, limit = 20, minRelevance = 2 } = filter;

  try {
    let query = `SELECT id, query, answer, method, relevance, feedback, created_at
                 FROM rag_interactions
                 WHERE relevance IS NOT NULL AND relevance < ?`;
    const params = [minRelevance];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return await all(query, params);
  } catch (error) {
    console.error('Error getting failed retrievals:', error);
    throw error;
  }
}

/**
 * Track method performance over time
 * @param {string} method - Retrieval method
 * @returns {Promise<Array>}
 */
export async function getMethodPerformance(method) {
  try {
    const performance = await all(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as queries,
        AVG(relevance) as avg_relevance,
        COUNT(CASE WHEN relevance >= 4 THEN 1 END) as successful
       FROM rag_interactions
       WHERE method = ?
       GROUP BY DATE(created_at)
       ORDER BY date DESC
       LIMIT 30`,
      [method]
    );

    return performance;
  } catch (error) {
    console.error('Error getting method performance:', error);
    throw error;
  }
}

/**
 * Get improvement recommendations
 * @returns {Promise<Array>}
 */
export async function getImprovementRecommendations() {
  try {
    const recommendations = [];

    // Check for underperforming methods
    const methodStats = await all(
      `SELECT method, AVG(relevance) as avg_relevance, COUNT(*) as count
       FROM rag_interactions
       WHERE relevance IS NOT NULL
       GROUP BY method`
    );

    const avgRelevance = methodStats.reduce((sum, m) => sum + (m.avg_relevance || 0), 0) / methodStats.length;

    methodStats.forEach(method => {
      if ((method.avg_relevance || 0) < avgRelevance * 0.8) {
        recommendations.push({
          type: 'underperforming_method',
          method: method.method,
          message: `${method.method} method has lower performance than average. Consider adjusting parameters.`,
          severity: 'medium'
        });
      }
    });

    // Check for missing feedback
    const unratedCount = await get(
      'SELECT COUNT(*) as count FROM rag_interactions WHERE relevance IS NULL LIMIT 1000'
    );

    if (unratedCount.count > 100) {
      recommendations.push({
        type: 'missing_feedback',
        message: `${unratedCount.count} interactions without feedback. Collecting feedback improves learning.`,
        severity: 'low'
      });
    }

    return recommendations;
  } catch (error) {
    console.error('Error getting recommendations:', error);
    throw error;
  }
}
