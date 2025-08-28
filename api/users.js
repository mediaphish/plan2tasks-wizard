// /api/users.js  —  DIAGNOSTIC "PING" VERSION (no imports, no DB)
// Purpose: prove the route executes without crashing.

'use strict';

// ---- tiny helpers ----
const toLower = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

function send(res, code, payload) {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function setCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '600');
}

async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch {}
  }
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.from(c));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const plannerEmail = req.query?.plannerEmail || '';
      const plannerEmailNorm = toLower(plannerEmail);

      if (!plannerEmailNorm) {
        return send(res, 400, { ok: false, error: 'plannerEmail is required', diag: { phase: 'ping-get' } });
      }

      // Return a fake but well-shaped response so the app doesn't choke.
      return send(res, 200, {
        ok: true,
        plannerEmail: plannerEmailNorm,
        count: 0,
        users: [],
        diag: { phase: 'ping-get', note: 'no DB, route is healthy' }
      });
    }

    if (req.method === 'POST') {
      const body = await getJsonBody(req);
      return send(res, 200, {
        ok: true,
        diag: { phase: 'ping-post', echo: body || null }
      });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return send(res, 405, { ok: false, error: 'Method Not Allowed', diag: { phase: 'ping' } });
  } catch (err) {
    return send(res, 500, { ok: false, error: 'Unhandled error', diag: { phase: 'ping-catch', message: err?.message || '' } });
  }
};
