export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function normalizeEmail(v) {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, error: 'Method not allowed' });

    const u = new URL(req.url, `http://${req.headers.host}`);
    const token = u.searchParams.get('i') || u.searchParams.get('token') || '';
    const plannerEmailRaw = u.searchParams.get('plannerEmail') || '';
    const userEmailRaw = u.searchParams.get('userEmail') || '';

    const plannerEmail = normalizeEmail(plannerEmailRaw);
    const userEmail = normalizeEmail(userEmailRaw);

    const sb = admin();

    let inviteStatus = 'missing';
    let inviteId = null;
    let pe = plannerEmail || null;
    let ue = userEmail || null;

    if (token) {
      const { data: invRows, error: invErr } = await sb
        .from('invites')
        .select('id, used_at, planner_email, user_email')
        .eq('id', token)
        .limit(1);

      if (invErr) return sendJson(res, 500, { ok: false, error: 'Database error (invite by id)' });

      if (invRows && invRows[0]) {
        inviteId = invRows[0].id;
        pe = normalizeEmail(invRows[0].planner_email);
        ue = normalizeEmail(invRows[0].user_email);
        inviteStatus = invRows[0].used_at ? 'used' : 'pending';
      }
    } else if (plannerEmail && userEmail) {
      const { data: invRows, error: invErr } = await sb
        .from('invites')
        .select('id, used_at')
        .ilike('planner_email', plannerEmail)
        .ilike('user_email', userEmail);

      if (invErr) return sendJson(res, 500, { ok: false, error: 'Database error (invite by email)' });

      if (invRows && invRows.length) {
        const anyPending = invRows.some(r => !r.used_at);
        inviteId = (invRows.find(r => !r.used_at) || invRows[0]).id;
        inviteStatus = anyPending ? 'pending' : 'used';
      }
    } else {
      return sendJson(res, 400, { ok: false, error: 'Provide i=token or plannerEmail & userEmail' });
    }

    let connectionStatus = 'missing';
    if (pe && ue) {
      const { data: connRows, error: connErr } = await sb
        .from('user_connections')
        .select('status')
        .ilike('planner_email', pe)
        .ilike('user_email', ue)
        .limit(1);
      if (connErr) return sendJson(res, 500, { ok: false, error: 'Database error (connection)' });
      if (connRows && connRows[0]) connectionStatus = connRows[0].status || 'missing';
    }

    return sendJson(res, 200, {
      ok: true,
      plannerEmail: pe,
      userEmail: ue,
      invite: {
        id: inviteId,
        status: inviteStatus, // 'pending' | 'used' | 'missing'
      },
      connection: {
        status: connectionStatus, // 'connected' | 'archived' | 'deleted' | 'missing'
      },
    });
  } catch {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error' });
  }
}
