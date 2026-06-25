import dotenv from 'dotenv';
dotenv.config();

const EXA_API_KEY = process.env.EXA_API_KEY || '';

/**
 * Exa Search API - Web Search
 */
export const callExa = async (query) => {
  if (!EXA_API_KEY) {
    throw new Error('Exa API key not configured');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EXA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        query: query,
        type: 'neural',
        numResults: 10,
        contents: {
          text: true,
          highlights: true
        }
      })
    });
    if (!response.ok) {
      throw new Error(`Exa search failed: ${response.status}`);
    }
    const data = await response.json();
    return (data.results || []).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.text?.substring(0, 500) || item.highlights?.[0] || '',
      source: item.source || 'exa'
    }));
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Exa Search API - Image Search
 */
export const callExaImages = async (query) => {
  if (!EXA_API_KEY) {
    throw new Error('Exa API key not configured');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${EXA_API_KEY}`,
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        query: query,
        type: 'neural',
        numResults: 10,
        category: 'image'
      })
    });
    if (!response.ok) {
      throw new Error(`Exa images failed: ${response.status}`);
    }
    const data = await response.json();
    return (data.results || []).map((item) => ({
      title: item.title,
      url: item.url,
      thumbnail: item.url,
      source: item.source || 'exa'
    }));
  } finally {
    clearTimeout(timeout);
  }
};

export const isExaConfigured = () => !!EXA_API_KEY;
