import { randomBytes } from 'crypto';

/**
 * Generate a unique document ID
 * @param {string} title - Document title
 * @returns {string}
 */
export function generateDocumentId(title = '') {
  const timestamp = Date.now().toString(36);
  const random = randomBytes(4).toString('hex');
  const sanitized = (title || 'doc')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .slice(0, 20);
  
  return `${sanitized}_${timestamp}_${random}`;
}

/**
 * Chunk text into overlapping segments
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Size of each chunk in characters
 * @param {number} overlap - Overlap between chunks
 * @returns {string[]}
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text || text.length === 0) return [];

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.substring(start, end);

    // Try to break at sentence boundary
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > chunkSize * 0.7) {
        chunk = chunk.substring(0, breakPoint + 1);
      }
    }

    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }

    start += chunk.length - overlap;
  }

  return chunks;
}

/**
 * Chunk text by semantic boundaries (sentences/paragraphs)
 * @param {string} text
 * @param {number} maxChunkSize - Maximum chunk size
 * @returns {string[]}
 */
export function semanticChunking(text, maxChunkSize = 1000) {
  if (!text || text.length === 0) return [];

  // Split by paragraphs first
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks = [];
  let currentChunk = '';

  paragraphs.forEach(para => {
    if ((currentChunk + para).length <= maxChunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + para;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = para;
    }
  });

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks;
}

/**
 * Normalize text for comparison
 * @param {string} text
 * @returns {string}
 */
export function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract keywords from text
 * @param {string} text
 * @param {number} limit - Number of keywords to extract
 * @returns {string[]}
 */
export function extractKeywords(text, limit = 10) {
  // Simple TF-IDF-like keyword extraction
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => word.length > 3);

  const freq = {};
  words.forEach(word => {
    freq[word] = (freq[word] || 0) + 1;
  });

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(entry => entry[0]);
}

/**
 * Truncate text to maximum length
 * @param {string} text
 * @param {number} maxLength
 * @param {string} suffix
 * @returns {string}
 */
export function truncateText(text, maxLength = 500, suffix = '...') {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * Calculate text similarity using Levenshtein distance
 * @param {string} a
 * @param {string} b
 * @returns {number} - Similarity score (0-1)
 */
export function textSimilarity(a, b) {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / len;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshteinDistance(a, b) {
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Format text for display
 * @param {string} text
 * @param {number} maxLines
 * @returns {string}
 */
export function formatForDisplay(text, maxLines = 5) {
  const lines = text.split('\n');
  if (lines.length > maxLines) {
    return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
  }
  return text;
}

/**
 * Parse citation information from retrieved chunks
 * @param {Array} chunks
 * @returns {Array}
 */
export function parseCitations(chunks) {
  return chunks.map((chunk, index) => ({
    id: `[${index + 1}]`,
    documentId: chunk.documentId,
    preview: truncateText(chunk.text, 150),
    relevance: chunk.similarity || chunk.score || 0
  }));
}

/**
 * Merge overlapping chunks
 * @param {Array} chunks
 * @returns {Array}
 */
export function mergeOverlappingChunks(chunks) {
  if (chunks.length === 0) return [];

  const sorted = [...chunks].sort((a, b) => 
    (a.index || 0) - (b.index || 0)
  );

  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];

    // Check if chunks overlap significantly
    const overlap = last.text.length > 100 && 
                   current.text.includes(last.text.slice(-200));

    if (overlap) {
      merged[merged.length - 1] = {
        ...last,
        text: last.text + '\n' + current.text.substring(200)
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Calculate document statistics
 * @param {string} content
 * @returns {Object}
 */
export function getDocumentStats(content) {
  const words = content.split(/\s+/).length;
  const sentences = content.split(/[.!?]+/).length;
  const paragraphs = content.split(/\n\n+/).length;
  const characters = content.length;

  return {
    characters,
    words,
    sentences,
    paragraphs,
    avgWordsPerSentence: Math.round(words / sentences),
    readingTimeMinutes: Math.ceil(words / 200)
  };
}
