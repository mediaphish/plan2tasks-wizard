// /api/users.js
// GET  /api/users?plannerEmail=PLANNER[&debug=1]
// POST /api/users { plannerEmail, userEmail, groups: [...] }

const toLower = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const nowISO = () => new Date().toISOString();

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => {
      if (typeof g === 'string') return g;
      if (g == null) return '';
      if (typeof g === 'object' && typeof g.name === 'string') return g.name;
      try { return JSON.stringify(g); } catch { return String(g); }
    })
    .filter(Boolean);
}

function deriveStatus(connectionRow, inviteRow) {
  const hasTokens = !!connectionRow?.google_refresh_token;
  if (hasTokens) return 'connected';
  if (inviteRow && !inviteRow.used_at) return 'invited';
  return 'pending';
}

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
  if (req.body && typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { /* fall through */ }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error('Invalid JSON body'); }
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Debug flag for richer error messages (no secrets).
  const debug =
    (req.query && (req.query.debug === '1' || req.query.debug === 'true')) || false;

  let phase = 'import-supabase';
  try {
    // Dynamic import prevents top-level crashes if the module system differs.
    const { createClient } = await import('@supabase/supabase-js');

    phase = 'create-client';
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return send(res, 500, {
        ok: false,
        error: 'Missing Supabase env vars. See /api/debug/config.',
        ...(debug ? { diag: { phase } } : {}),
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    if (req.method === 'GET') {
      const { plannerEmail } = req.query || {};
      const plannerEmailNorm = toLower(plannerEmail);
      if (!plannerEmailNorm) {
        return send(res, 400, { ok: false, error: 'plannerEmail is requir
