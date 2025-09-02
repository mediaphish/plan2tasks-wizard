export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location || '/');
  res.end('');
}

function normalizeEmail(v) {
  if (typeof v !== 'string') return '';
  return v.trim().toLowerCase();
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'Method not allowed' });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const inviteId = url.searchParams.get('i') || url.searchParams.get('token') || '';
    if (!inviteId) return redirect(res, '/');

    const supabase = getSupabaseAdmin();

    // Find invite
    const { data: invRows, error: invErr } = await supabase
      .from('invites')
      .select('id, used_at, planner_email, user_email')
      .eq('id', inviteId)
      .limit(1);

    if (invErr || !invRows || !invRows[0]) return redirect(res, '/');

    const inv = invRows[0];
    const plannerN = normalizeEmail(inv.planner_email);
    const userN = normalizeEmail(inv.user_email);

    // Find existing connection (case-insensitive), then update by exact stored values to avoid ILIKE in UPDATE
    let pe = null, ue = null;
    const { data: connRows } = await supabase
      .from('user_connections')
      .select('planner_email, user_email, status')
      .ilike('planner_email', plannerN)
      .ilike('user_email', userN)
      .limit(1);

    if (connRows && connRows[0]) {
      pe = connRows[0].planner_email;
      ue = connRows[0].user_email;
      await supabase
        .from('user_connections')
        .update({ status: 'connected', updated_at: new Date().toISOString() })
        .eq('planner_email', pe)
        .eq('user_email', ue);
    } else {
      await supabase.from('user_connections').insert({
        planner_email: plannerN,
        user_email: userN,
        groups: [],
        status: 'connected',
        updated_at: new Date().toISOString()
      });
    }

    // Mark invite used if not already
    if (!inv.used_at) {
      await supabase
        .from('invites')
        .update({ used_at: new Date().toISOString() })
        .eq('id', inviteId);
    }

    return redirect(res, '/');
  } catch {
    return redirect(res, '/');
  }
}
