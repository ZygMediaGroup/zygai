import { run, get, all } from '../db.js';
import { generateEmbedding, storeEmbedding } from './embeddings.js';
import { chunkText, generateDocumentId } from './utils.js';

/**
 * Create a new document in the RAG system
 * @param {Object} doc - Document object
 * @param {string} doc.title - Document title
 * @param {string} doc.content - Document content
 * @param {string} doc.source - Source/collection name
 * @param {Object} doc.metadata - Optional metadata
 * @param {string} doc.userId - User ID for privacy
 * @returns {Promise<Object>} - Created document with chunks
 */
export async function createDocument(doc) {
  const {
    title = '',
    content = '',
    source = 'default',
    metadata = {},
    userId = null
  } = doc;

  if (!content || content.trim().length === 0) {
    throw new Error('Document content cannot be empty');
  }

  try {
    // Generate document ID
    const documentId = generateDocumentId(title);

    // Insert document
    await run(
      `INSERT INTO rag_documents (document_id, title, source, metadata, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [documentId, title, source, JSON.stringify(metadata), userId]
    );

    // Chunk content and create embeddings
    const chunks = chunkText(content);
    const chunkIds = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkId = `${documentId}_chunk_${i}`;

      // Generate embedding for chunk
      const embedding = await generateEmbedding(chunk);

      // Store chunk
      await run(
        `INSERT INTO rag_chunks (chunk_id, document_id, chunk_index, content, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [chunkId, documentId, i, chunk, userId]
      );

      // Store embedding
      await storeEmbedding(chunkId, chunk, embedding, {
        documentId,
        chunkIndex: i,
        source
      });

      chunkIds.push(chunkId);
    }

    return {
      documentId,
      title,
      source,
      chunkCount: chunks.length,
      chunkIds,
      stored: true
    };
  } catch (error) {
    console.error('Error creating document:', error);
    throw error;
  }
}

/**
 * Get document by ID
 * @param {string} documentId
 * @param {string} userId - Optional user filter
 * @returns {Promise<Object>}
 */
export async function getDocument(documentId, userId = null) {
  try {
    let query = 'SELECT * FROM rag_documents WHERE document_id = ? AND is_deleted = 0';
    const params = [documentId];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    const doc = await get(query, params);
    if (!doc) return null;

    // Get chunks
    const chunks = await all(
      'SELECT chunk_id, chunk_index, content FROM rag_chunks WHERE document_id = ? ORDER BY chunk_index',
      [documentId]
    );

    return {
      ...doc,
      metadata: JSON.parse(doc.metadata || '{}'),
      chunks
    };
  } catch (error) {
    console.error('Error getting document:', error);
    throw error;
  }
}

/**
 * List documents with filtering
 * @param {Object} filter
 * @param {string} filter.source - Filter by source
 * @param {string} filter.userId - Filter by user
 * @param {number} filter.limit - Result limit
 * @param {number} filter.offset - Pagination offset
 * @returns {Promise<Array>}
 */
export async function listDocuments(filter = {}) {
  const { source = null, userId = null, limit = 20, offset = 0 } = filter;

  try {
    let query = 'SELECT document_id, title, source, metadata, created_at FROM rag_documents WHERE is_deleted = 0';
    const params = [];

    if (source) {
      query += ' AND source = ?';
      params.push(source);
    }

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const documents = await all(query, params);
    return documents.map(doc => ({
      ...doc,
      metadata: JSON.parse(doc.metadata || '{}')
    }));
  } catch (error) {
    console.error('Error listing documents:', error);
    throw error;
  }
}

/**
 * Delete document
 * @param {string} documentId
 * @param {string} userId - Optional user verification
 */
export async function deleteDocument(documentId, userId = null) {
  try {
    let query = 'UPDATE rag_documents SET is_deleted = 1 WHERE document_id = ?';
    const params = [documentId];

    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }

    await run(query, params);

    // Mark chunks as deleted
    await run(
      'UPDATE rag_chunks SET is_deleted = 1 WHERE document_id = ?',
      [documentId]
    );

    // Mark embeddings as deleted
    await run(
      'UPDATE rag_embeddings SET is_deleted = 1 WHERE document_id LIKE ?',
      [`${documentId}_%`]
    );

    return { deleted: true };
  } catch (error) {
    console.error('Error deleting document:', error);
    throw error;
  }
}

/**
 * Get chunks by document ID
 * @param {string} documentId
 * @returns {Promise<Array>}
 */
export async function getChunks(documentId) {
  try {
    return await all(
      'SELECT chunk_id, content, created_at FROM rag_chunks WHERE document_id = ? AND is_deleted = 0 ORDER BY chunk_index',
      [documentId]
    );
  } catch (error) {
    console.error('Error getting chunks:', error);
    throw error;
  }
}

/**
 * Get storage statistics
 * @returns {Promise<Object>}
 */
export async function getStorageStats() {
  try {
    const docCount = await get('SELECT COUNT(*) as total FROM rag_documents WHERE is_deleted = 0');
    const chunkCount = await get('SELECT COUNT(*) as total FROM rag_chunks WHERE is_deleted = 0');
    const totalSize = await get(
      'SELECT SUM(CHAR_LENGTH(content)) as bytes FROM rag_chunks WHERE is_deleted = 0'
    );

    return {
      documents: docCount.total || 0,
      chunks: chunkCount.total || 0,
      totalSizeBytes: totalSize.bytes || 0
    };
  } catch (error) {
    console.error('Error getting storage stats:', error);
    throw error;
  }
}

/**
 * Update document metadata
 * @param {string} documentId
 * @param {Object} metadata - New metadata to merge
 */
export async function updateDocumentMetadata(documentId, metadata) {
  try {
    const existing = await get(
      'SELECT metadata FROM rag_documents WHERE document_id = ?',
      [documentId]
    );

    const merged = {
      ...JSON.parse(existing?.metadata || '{}'),
      ...metadata
    };

    await run(
      'UPDATE rag_documents SET metadata = ?, updated_at = NOW() WHERE document_id = ?',
      [JSON.stringify(merged), documentId]
    );

    return { updated: true };
  } catch (error) {
    console.error('Error updating metadata:', error);
    throw error;
  }
}
