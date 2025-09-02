export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function normalizeEmail(v) {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}
function isLikelyEmail(v) {
  return typeof v === 'string' && v.includes('@') && v.includes('.');
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'); });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch {
        try {
          const params = new URLSearchParams(raw);
          const obj = {}; for (const [k, v] of params.entries()) obj[k] = v;
          resolve(obj);
        } catch { resolve({}); }
      }
    });
    req.on('error', () => resolve({}));
  });
}
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

    const body = await readJsonBody(req);
    const plannerEmail = normalizeEmail(body.plannerEmail || '');
    const userEmail = normalizeEmail(body.userEmail || '');

    if (!plannerEmail || !userEmail || !isLikelyEmail(plannerEmail) || !isLikelyEmail(userEmail)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid plannerEmail or userEmail' });
    }

    const sb = getSupabaseAdmin();

    // Locate the connection (case-insensitive), then delete by stored values.
    const { data: rows, error: findErr } = await sb
      .from('user_connections')
      .select('planner_email, user_email')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail)
      .limit(1);

    if (findErr) return sendJson(res, 500, { ok: false, error: 'Database error (select)' });

    let deleted = 0;
    if (rows && rows[0]) {
      const pe = rows[0].planner_email;
      const ue = rows[0].user_email;
      const { error: delErr } = await sb
        .from('user_connections')
        .delete()
        .eq('planner_email', pe)
        .eq('user_email', ue);
      if (delErr) return sendJson(res, 500, { ok: false, error: 'Database error (delete connection)' });
      deleted = 1;
    }

    // Also remove any pending invites (used_at IS NULL) for this pair so the user cannot reappear as "invited".
    const { data: invRows, error: invFindErr } = await sb
      .from('invites')
      .select('id, used_at')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail);

    if (invFindErr) return sendJson(res, 500, { ok: false, error: 'Database error (select invites)' });

    const pendingIds = (invRows || []).filter(r => !r.used_at).map(r => r.id);
    let pendingRemoved = 0;
    if (pendingIds.length > 0) {
      const { error: invDelErr } = await sb
        .from('invites')
        .delete()
        .in('id', pendingIds);
      if (invDelErr) return sendJson(res, 500, { ok: false, error: 'Database error (delete invites)' });
      pendingRemoved = pendingIds.length;
    }

    return sendJson(res, 200, { ok: true, deleted, pendingInvitesRemoved: pendingRemoved });
  } catch {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error' });
  }
}
