import { createPublicResearchMcp } from '../lib/public-research-mcp.mjs';
const dispatch = createPublicResearchMcp(), rates = new Map();
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(405, { error: 'Use MCP Streamable HTTP POST.', documentation: 'https://os.charitology.org/mcp.html' });
  }
  const origin = req.headers.origin;
  if (origin && origin !== 'https://os.charitology.org' && origin !== 'https://' + req.headers.host) return send(403, { error: 'Origin not allowed.' });
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'Send application/json.' });
  const key = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].slice(0,100), now = Date.now();
  const previous = rates.get(key), rate = previous && now - previous.at < 60000 ? previous : { at: now, count: 0 };
  if (rates.size >= 4096 && !rates.has(key)) rates.delete(rates.keys().next().value);
  rates.set(key, rate);
  if (++rate.count > 120) { res.setHeader('Retry-After', '60'); return send(429, { error: 'Too many requests.' }); }
  if (Number(req.headers['content-length']) > 65536) return send(413, { error: 'Request too large.' });
  let message;
  try {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      if (Buffer.byteLength(JSON.stringify(req.body)) > 65536) return send(413, { error: 'Request too large.' });
      message = req.body;
    } else {
      let raw = req.body ? Buffer.from(req.body) : Buffer.alloc(0);
      if (!req.body) for await (const chunk of req) {
        if (raw.length + chunk.length > 65536) return send(413, { error: 'Request too large.' });
        raw = Buffer.concat([raw, chunk]);
      }
      if (raw.length > 65536) return send(413, { error: 'Request too large.' });
      message = JSON.parse(raw.toString('utf8'));
    }
  } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid JSON body.' } }); }
  const result = await dispatch(message);
  if (result === null) { res.statusCode = 202; return res.end(); }
  return send(200, result);
}
