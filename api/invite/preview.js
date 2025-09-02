// /api/invite/preview.js
// Node serverless function for Vercel
// Change #1: Harden inputs (trim + lowercase) and guard against blanks.
// No UX changes. Response still returns an invite URL that reuses an existing row if present.

const { createClient } = require('@supabase/supabase-js');

/** Helpers **/
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isLikelyEmail(value) {
  // Very light validation—keeps existing behavior flexible while preventing empties / obvious junk.
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

function buildInviteUrl(id) {
  const site = process.env.SITE_URL || 'http://localhost:3000';
  // Keep deterministic, id-based invite. This preserves “reuse if exists” semantics.
  // NOTE: Path must match your existing join/accept flow. If your app already expects a different path,
  // this still works as long as your front-end (or router) handles /invite?i=<id>.
  return `${site}/invite?i=${encodeURIComponent(id)}`;
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

    // NEW: normalize
    const plannerEmail = normalizeEmail(rawPlanner);
    const userEmail = normalizeEmail(rawUser);

    // NEW: guard against blanks / obviously invalid
    if (!plannerEmail || !userEmail || !isLikelyEmail(plannerEmail) || !isLikelyEmail(userEmail)) {
      return json(res, 400, {
        ok: false,
        error: 'Invalid plannerEmail or userEmail',
        details: 'Both emails are required. They are trimmed + lowercased server-side.',
      });
    }

    const supabase = getSupabaseAdmin();

    // Try to find an existing invite (case-insensitive). We use ILIKE for equality-insensitive match.
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

    // If none, create a new invite using the normalized (canonical) emails
    if (!inviteRow) {
      const { data: inserted, error: insertErr } = await supabase
        .from('invites')
        .insert({ planner_email: plannerEmail, user_email: userEmail })
        .select('id, used_at')
        .limit(1);

      if (insertErr) {
        // If a race-condition hit the unique index, fetch instead of failing.
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
        reused = true; // We ended up reusing the just-created-by-others row
      } else {
        inviteRow = inserted && inserted[0];
      }
    }

    if (!inviteRow || !inviteRow.id) {
      return json(res, 500, { ok: false, error: 'Invite not available' });
    }

    const inviteUrl = buildInviteUrl(inviteRow.id);

    // Keep response minimal and compatible: ok + URL (plus harmless extras for diagnostics)
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
