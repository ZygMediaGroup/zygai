/**
 * RAG Client for ZygAI
 * Communicates with standalone RAG server
 */

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://100.114.102.61:3001';
const RAG_API_KEY = process.env.RAG_API_KEY;

class RAGClient {
  constructor(baseUrl = RAG_SERVER_URL, apiKey = RAG_API_KEY) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;
  }

  /**
   * Make request to RAG server
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint (without /api/rag)
   * @param {Object} data - Request body
   * @returns {Promise<Object>}
   */
  async request(method, endpoint, data = null) {
    const url = `${this.baseUrl}/api/rag${endpoint}`;
    
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    // Add API key if configured
    if (this.apiKey) {
      options.headers['x-rag-api-key'] = this.apiKey;
    }

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `RAG server error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`RAG Client Error [${method} ${endpoint}]:`, error.message);
      throw error;
    }
  }

  /**
   * Health check
   */
  async health() {
    try {
      return await fetch(`${this.baseUrl}/health`).then(r => r.json());
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  /**
   * Get version
   */
  async version() {
    return await fetch(`${this.baseUrl}/version`).then(r => r.json());
  }

  // ==================== DOCUMENTS ====================

  /**
   * Create document
   */
  async createDocument(doc) {
    // Route creation to the training port of the new standalone server
    const uiPort = process.env.RAG_UI_PORT || 3002;
    try {
      const response = await fetch(`http://100.114.102.61:${uiPort}/api/train`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: doc.content, source: doc.source || doc.title, userId: doc.userId || null })
      });
      return await response.json();
    } catch(e) {
      throw e;
    }
  }

  /**
   * Get document
   */
  async getDocument(documentId, userId = null) {
    const query = userId ? `?userId=${userId}` : '';
    return this.request('GET', `/documents/${documentId}${query}`);
  }

  /**
   * List documents
   */
  async listDocuments(filter = {}) {
    const query = new URLSearchParams(filter).toString();
    return this.request('GET', `/documents${query ? '?' + query : ''}`);
  }

  /**
   * Delete document
   */
  async deleteDocument(documentId, userId = null) {
    const query = userId ? `?userId=${userId}` : '';
    return this.request('DELETE', `/documents/${documentId}${query}`);
  }

  // ==================== RETRIEVAL ====================

  /**
   * Execute RAG query
   */
  async query(queryText, method = 'hybrid', topK = 10, options = {}) {
    return this.request('POST', '/query', {
      query: queryText,
      method,
      topK,
      options
    });
  }

  /**
   * Dense retrieval only
   */
  async denseRetrieval(query, topK = 10, threshold = 0.5) {
    return this.query(query, 'dense', topK, { threshold });
  }

  /**
   * Sparse retrieval only
   */
  async sparseRetrieval(query, topK = 10) {
    return this.query(query, 'sparse', topK);
  }

  /**
   * Hybrid retrieval
   */
  async hybridRetrieval(query, topK = 10, alpha = 0.6) {
    return this.query(query, 'hybrid', topK, { alpha });
  }

  // ==================== LEARNING ====================

  /**
   * Store interaction
   */
  async storeInteraction(interaction) {
    return this.request('POST', '/interactions', interaction);
  }

  /**
   * Record feedback
   */
  async recordFeedback(interactionId, relevance, feedback = '') {
    return this.request('POST', `/interactions/${interactionId}/feedback`, {
      relevance,
      feedback
    });
  }

  /**
   * Get interactions
   */
  async getInteractions(filter = {}) {
    const query = new URLSearchParams(filter).toString();
    return this.request('GET', `/interactions${query ? '?' + query : ''}`);
  }

  /**
   * Get insights
   */
  async getInsights(userId = null, days = 30) {
    const query = new URLSearchParams({ userId, days }).toString();
    return this.request('GET', `/insights${query ? '?' + query : ''}`);
  }

  /**
   * Get failed retrievals
   */
  async getFailedRetrievals(filter = {}) {
    const query = new URLSearchParams(filter).toString();
    return this.request('GET', `/failed-retrievals${query ? '?' + query : ''}`);
  }

  /**
   * Get method performance
   */
  async getMethodPerformance(method) {
    return this.request('GET', `/method-performance/${method}`);
  }

  // ==================== ADMIN ====================

  /**
   * Get system stats
   */
  async getStats() {
    return this.request('GET', '/stats');
  }

  /**
   * Process text
   */
  async processText(text) {
    return this.request('POST', '/process-text', { text });
  }
}

export default RAGClient;
