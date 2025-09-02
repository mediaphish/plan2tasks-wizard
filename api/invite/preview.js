// /api/invite/preview.js
// Vercel Serverless Function (ESM)
// Change 1b: ESM export + input hardening + env-driven invite URL

import { createClient } from '@supabase/supabase-js';

/** Helpers **/
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isLikelyEmail(value) {
  return typeof value === 'string' && value.includes('@') && value.includes('.');
}

function sendJson(res, status, body) {
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
  const path = normalizePath(process.env.INVITE_PATH || '/join'); // e.g. '/invite'
  const key = process.env.INVITE_QUERY_KEY || 'i';                // e.g. 'token'
  return `${site}${path}?${encodeURIComponent(key)}=${encodeURIComponent(id)}`;
}

/** Main handler (ESM default export) **/
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const rawPlanner = url.searchParams.get('plannerEmail') || '';
    const rawUser = url.searchParams.get('userEmail') || '';

    // Normalize & validate
    const plannerEmail = normalizeEmail(rawPlanner);
    const userEmail = normalizeEmail(rawUser);
    if (!plannerEmail || !userEmail || !isLikelyEmail(plannerEmail) || !isLikelyEmail(userEmail)) {
      return sendJson(res, 400, {
        ok: false,
        error: 'Invalid plannerEmail or userEmail',
        details: 'Both emails are required. They are trimmed + lowercased server-side.',
      });
    }

    const supabase = getSupabaseAdmin();

    // Find existing (case-insensitive exact match)
    const { data: existingRows, error: findErr } = await supabase
      .from('invites')
      .select('id, used_at, planner_email, user_email')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail)
      .limit(1);

    if (findErr) {
      return sendJson(res, 500, { ok: false, error: 'Database error (select)', details: findErr.message });
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
        // Unique index race: fetch instead
        const { data: afterRace, error: raceFindErr } = await supabase
          .from('invites')
          .select('id, used_at')
          .ilike('planner_email', plannerEmail)
          .ilike('user_email', userEmail)
          .limit(1);

        if (raceFindErr || !afterRace || !afterRace[0]) {
          return sendJson(res, 500, {
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
      return sendJson(res, 500, { ok: false, error: 'Invite not available' });
    }

    const inviteUrl = buildInviteUrl(inviteRow.id);

    return sendJson(res, 200, {
      ok: true,
      inviteUrl,
      reused,
      used: !!inviteRow.used_at,
    });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error', details: String(err?.message || err) });
  }
}
