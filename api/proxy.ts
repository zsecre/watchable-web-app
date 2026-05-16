import type { VercelRequest, VercelResponse } from '@vercel/node';

const cache = new Map<string, { data: any, contentType: string, timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  if (!url.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid URL protocol' });
  }

  // Check cache (memory-based, persistent only while function stays warm)
  const cached = cache.get(url);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    if (cached.contentType) res.setHeader('Content-Type', cached.contentType);
    res.setHeader('X-Vercel-Cache', 'HIT');
    return res.send(cached.data);
  }

  try {
    const isTmdb = url.includes('api.themoviedb.org');
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://api.themoviedb.org/',
    };

    if (isTmdb) {
      let token = process.env.TMDB_TOKEN;
      if (!token) {
        console.error('[Vercel Proxy] Error: TMDB_TOKEN is missing in environment variables.');
        return res.status(401).json({ error: 'TMDB_TOKEN environment variable is missing on Vercel.' });
      }
      
      // Clean up token in case user pasted "Bearer ..." or extra spaces
      token = token.trim();
      if (token.startsWith('Bearer ')) {
        token = token.slice(7).trim();
      }
      
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });
    const contentType = response.headers.get('content-type');
    const status = response.status;
    
    const buffer = await response.arrayBuffer();
    const responseData = Buffer.from(buffer);

    // Save success to cache
    if (status === 200) {
      cache.set(url, {
        data: responseData,
        contentType: contentType || 'application/json',
        timestamp: Date.now()
      });
    }

    res.status(status);
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('X-Vercel-Cache', 'MISS');
    return res.send(responseData);

  } catch (error: any) {
    console.error(`[Vercel Proxy] Error for ${url}:`, error.message);
    return res.status(502).json({ error: 'Bad Gateway', message: error.message });
  }
}
