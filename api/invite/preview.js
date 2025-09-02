// /api/invite/preview.js
// Node serverless function for Vercel
// Change #1a: Configurable invite link path/query via env (INVITE_PATH, INVITE_QUERY_KEY)
// + previously shipped hardening (trim + lowercase) and blank guards.

const { createClient } = require('@supabase/supabase-js');

/** Helpers **/
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isLikelyEmail(value) {
  return typeof value === 'string' && value.includes('@') && value.includes('.');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase admin env vars missing. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizePath(p) {
  if (!p) return '/join';
  return p.startsWith('/') ? p : `/${p}`;
}

function buildInviteUrl(id) {
  const site = process.env.SITE_URL || 'http://localhost:3000';
  // NEW: allow overriding path and query key via env for zero-code alignment with your SPA route.
  const path = normalizePath(process.env.INVITE_PATH || '/join');     // e.g. '/invite', '/accept-invite'
  const key = process.env.INVITE_QUERY_KEY || 'i';                     // e.g. 'token'
  return `${site}${path}?${encodeURIComponent(key)}=${encodeURIComponent(id)}`;
}

/** Main handler **/
module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET') {
      return json(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const rawPlanner = url.searchParams.get('plannerEmail') || '';
    const rawUser = url.searchParams.get('userEmail') || '';

    // Normalize & validate
    const plannerEmail = normalizeEmail(rawPlanner);
    const userEmail = normalizeEmail(rawUser);
    if (!plannerEmail || !userEmail || !isLikelyEmail(plannerEmail) || !isLikelyEmail(userEmail)) {
      return json(res, 400, {
        ok: false,
        error: 'Invalid plannerEmail or userEmail',
        details: 'Both emails are required. They are trimmed + lowercased server-side.',
      });
    }

    const supabase = getSupabaseAdmin();

    // Find existing (case-insensitive)
    const { data: existingRows, error: findErr } = await supabase
      .from('invites')
      .select('id, used_at, planner_email, user_email')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail)
      .limit(1);

    if (findErr) {
      return json(res, 500, { ok: false, error: 'Database error (select)', details: findErr.message });
    }

    let inviteRow = existingRows && existingRows[0];
    let reused = !!inviteRow;

    // Create if none
    if (!inviteRow) {
      const { data: inserted, error: insertErr } = await supabase
        .from('invites')
        .insert({ planner_email: plannerEmail, user_email: userEmail })
        .select('id, used_at')
        .limit(1);

      if (insertErr) {
        // Handle race against unique index
        const { data: afterRace, error: raceFindErr } = await supabase
          .from('invites')
          .select('id, used_at')
          .ilike('planner_email', plannerEmail)
          .ilike('user_email', userEmail)
          .limit(1);

        if (raceFindErr || !afterRace || !afterRace[0]) {
          return json(res, 500, {
            ok: false,
            error: 'Database error (insert)',
            details: insertErr.message || raceFindErr?.message || 'Unknown error',
          });
        }
        inviteRow = afterRace[0];
        reused = true;
      } else {
        inviteRow = inserted && inserted[0];
      }
    }

    if (!inviteRow || !inviteRow.id) {
      return json(res, 500, { ok: false, error: 'Invite not available' });
    }

    const inviteUrl = buildInviteUrl(inviteRow.id);

    return json(res, 200, {
      ok: true,
      inviteUrl,
      reused,
      used: !!inviteRow.used_at,
    });
  } catch (err) {
    return json(res, 500, { ok: false, error: 'Unhandled error', details: String(err?.message || err) });
  }
};
