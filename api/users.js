// /api/users.js
// Vercel serverless function
// GET  /api/users?plannerEmail=PLANNER
// POST /api/users { plannerEmail, userEmail, groups: [...] }

const { createClient } = require('@supabase/supabase-js');

// ---- Supabase admin client (service role) ----
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    '[users] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Check /api/debug/config.'
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// --------- Helpers ---------
const toLower = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const nowISO = () => new Date().toISOString();

/** Normalize groups into an array of strings, even if stored as jsonb[] */
function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .map((g) => {
      if (typeof g === 'string') return g;
      if (g == null) return '';
      if (typeof g === 'object' && typeof g.name === 'string') return g.name;
      try {
        return JSON.stringify(g);
      } catch {
        return String(g);
      }
    })
    .filter(Boolean);
}

/** Derive status from connection + invite */
function deriveStatus(connectionRow, inviteRow) {
  const hasTokens = !!connectionRow?.google_refresh_token;
  if (hasTokens) return 'connected';
  if (inviteRow && !inviteRow.used_at) return 'invited';
  return 'pending';
}

/** Pick latest invite per user (by created_at) */
function latestInvite(invitesForPlanner) {
  const map = new Map();
  for (const inv of invitesForPlanner || []) {
    const key = toLower(inv.user_email);
    const prev = map.get(key);
    if (!prev || new Date(inv.created_at) > new Date(prev.created_at)) {
      map.set(key, inv);
    }
  }
  return map;
}

/** Standard JSON response */
function send(res, code, payload) {
  res.status(code).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

/** CORS (expanded to satisfy strict preflights from tools/browsers) */
function setCors(req, res) {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');

  // Allow common methods, including preflight
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  // Allow typical headers sent by browsers & API clients
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Accept'
  );

  // Let credentials flow if you ever need them (safe since we echo specific origin above)
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Cache preflight briefly
  res.setHeader('Access-Control-Max-Age', '600');
}

/** Safe body reader: Vercel usually parses JSON for us, but we guard fallbacks. */
async function getJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (req.body && typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      // fall through
    }
  }

  // If body wasn't parsed, read the stream
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

// --------- Handler ---------
module.exports = async (req, res) => {
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    // Important: send a quick OK for preflight with the CORS headers above
    return res.status(204).end();
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return send(res, 500, {
      ok: false,
      error: 'Missing Supabase env vars. See /api/debug/config.',
    });
  }

  try {
    if (req.method === 'GET') {
      const { plannerEmail } = req.query || {};
      const plannerEmailNorm = toLower(plannerEmail);
      if (!plannerEmailNorm) {
        return send(res, 400, { ok: false, error: 'plannerEmail is required' });
      }

      // Case-insensitive equality using ILIKE without wildcards
      const { data: connRows, error: connErr } = await supabase
        .from('user_connections')
        .select(
          'planner_email,user_email,groups,google_refresh_token,google_expires_at,updated_at,status'
        )
        .ilike('planner_email', plannerEmail);

      if (connErr) {
        return send(res, 500, { ok: false, error: connErr.message });
      }

      const { data: inviteRows, error: invErr } = await supabase
        .from('invites')
        .select('id,planner_email,user_email,used_at,created_at')
        .ilike('planner_email', plannerEmail);

      if (invErr) {
        return send(res, 500, { ok: false, error: invErr.message });
      }

      const connByUser = new Map();
      for (const r of connRows || []) {
        connByUser.set(toLower(r.user_email), r);
      }
      const latestInvByUser = latestInvite(inviteRows);

      const allUserEmails = new Set([
        ...Array.from(connByUser.keys()),
        ...Array.from(latestInvByUser.keys()),
      ]);

      const users = Array.from(allUserEmails)
        .map((uLower) => {
          const conn = connByUser.get(uLower);
          const inv = latestInvByUser.get(uLower);
          return {
            userEmail: conn?.user_email || inv?.user_email || uLower,
            groups: normalizeGroups(conn?.groups || []),
            status: deriveStatus(conn, inv),
            hasInvite: !!inv,
            updatedAt: conn?.updated_at || null,
          };
        })
        .sort((a, b) => a.userEmail.localeCompare(b.userEmail));

      return send(res, 200, {
        ok: true,
        plannerEmail: plannerEmailNorm,
        count: users.length,
        users,
      });
    }

    if (req.method === 'POST') {
      let body;
      try {
        body = await getJsonBody(req);
      } catch (e) {
        return send(res, 400, { ok: false, error: e.message || 'Invalid JSON' });
      }

      const plannerEmail = body.plannerEmail;
      const userEmail = body.userEmail;
      let groups = body.groups;

      const plannerEmailNorm = toLower(plannerEmail);
      const userEmailNorm = toLower(userEmail);

      if (!plannerEmailNorm || !userEmailNorm) {
        return send(res, 400, {
          ok: false,
          error: 'plannerEmail and userEmail are required',
        });
      }

      if (!Array.isArray(groups)) {
        groups = groups == null ? [] : [groups];
      }
      const cleanGroups = normalizeGroups(groups);

      const payload = {
        planner_email: plannerEmailNorm,
        user_email: userEmailNorm,
        groups: cleanGroups,
        updated_at: nowISO(),
      };

      const { error: upsertErr } = await supabase
        .from('user_connections')
        .upsert(payload, { onConflict: 'planner_email,user_email' });

      if (upsertErr) {
        return send(res, 500, { ok: false, error: upsertErr.message });
      }

      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET,POST,OPTIONS');
    return send(res, 405, { ok: false, error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[users] Uncaught error:', err);
    return send(res, 500, { ok: false, error: 'Internal Server Error' });
  }
};
