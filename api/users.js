export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function n(v) {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const plannerEmail = n(url.searchParams.get('plannerEmail') || '');
    const status = (url.searchParams.get('status') || 'active').toLowerCase();

    if (!plannerEmail || !plannerEmail.includes('@')) {
      return send(res, 400, { ok: false, error: 'Invalid plannerEmail' });
    }
    if (!['active','archived','deleted'].includes(status)) {
      return send(res, 400, { ok: false, error: 'Invalid status' });
    }

    const sb = admin();

    // Connections
    const wantedStatus =
      status === 'active' ? 'connected' :
      status === 'archived' ? 'archived' :
      'deleted';

    const { data: conns, error: connErr } = await sb
      .from('user_connections')
      .select('user_email, groups, status, updated_at')
      .ilike('planner_email', plannerEmail)
      .eq('status', wantedStatus);

    if (connErr) return send(res, 500, { ok: false, error: 'Database error (connections)' });

    const byEmail = new Map();
    for (const c of conns || []) {
      const email = n(c.user_email || '');
      if (!email) continue;
      byEmail.set(email, {
        email,
        groups: Array.isArray(c.groups) ? c.groups : [],
        status: c.status || wantedStatus,
        updated_at: c.updated_at || null,
        __source: 'connection',
      });
    }

    // Invites: include only for Active, and only pending (used_at IS NULL).
    if (status === 'active') {
      const { data: invs, error: invErr } = await sb
        .from('invites')
        .select('user_email, used_at')
        .ilike('planner_email', plannerEmail)
        .is('used_at', null);

      if (invErr) return send(res, 500, { ok: false, error: 'Database error (invites)' });

      for (const r of invs || []) {
        const email = n(r.user_email || '');
        if (!email) continue;
        if (byEmail.has(email)) continue; // dedupe: connection wins
        byEmail.set(email, {
          email,
          groups: [],
          status: 'invited',
          updated_at: null,
          __source: 'invite',
        });
      }
    }

    const users = Array.from(byEmail.values());
    return send(res, 200, { ok: true, users });
  } catch (e) {
    return send(res, 500, { ok: false, error: 'Unhandled error' });
  }
}
