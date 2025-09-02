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
    req.on('data', (chunk) => {
      raw += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); }
      catch {
        try {
          const params = new URLSearchParams(raw);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
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
    if (req.method !== 'POST') {
      return sendJson(res, 405, { ok: false, error: 'Method not allowed' });
    }

    const body = await readJsonBody(req);
    const plannerEmail = normalizeEmail(body.plannerEmail || '');
    const userEmail = normalizeEmail(body.userEmail || '');

    if (!plannerEmail || !userEmail || !isLikelyEmail(plannerEmail) || !isLikelyEmail(userEmail)) {
      return sendJson(res, 400, { ok: false, error: 'Invalid plannerEmail or userEmail' });
    }

    const supabase = getSupabaseAdmin();

    const { data: rows, error: findErr } = await supabase
      .from('user_connections')
      .select('planner_email, user_email, status')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail)
      .limit(1);

    if (findErr) {
      return sendJson(res, 500, { ok: false, error: 'Database error (select)' });
    }

    if (!rows || !rows[0]) {
      return sendJson(res, 200, { ok: true, updated: false, found: false });
    }

    const pe = rows[0].planner_email;
    const ue = rows[0].user_email;

    const { error: updErr } = await supabase
      .from('user_connections')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('planner_email', pe)
      .eq('user_email', ue);

    if (updErr) {
      return sendJson(res, 500, { ok: false, error: 'Database error (update)' });
    }

    return sendJson(res, 200, { ok: true, updated: true, found: true });
  } catch {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error' });
  }
}
