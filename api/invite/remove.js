export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

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
      return sendJson(res, 400, {
        ok: false,
        error: 'Invalid plannerEmail or userEmail'
      });
    }

    const supabase = getSupabaseAdmin();

    // Find matching invites (case-insensitive)
    const { data: rows, error: findErr } = await supabase
      .from('invites')
      .select('id, used_at')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail);

    if (findErr) {
      return sendJson(res, 500, { ok: false, error: 'Database error (select)' });
    }

    const pendingIds = (rows || [])
      .filter(r => !r.used_at)
      .map(r => r.id);

    let removed = 0;
    if (pendingIds.length > 0) {
      const { data: delRows, error: delErr } = await supabase
        .from('invites')
        .delete()
        .in('id', pendingIds)
        .select('id');

      if (delErr) {
        return sendJson(res, 500, { ok: false, error: 'Database error (delete)' });
      }
      removed = Array.isArray(delRows) ? delRows.length : pendingIds.length;
    }

    return sendJson(res, 200, {
      ok: true,
      removed,
      alreadyUsed: (rows || []).length - pendingIds.length,
      totalMatched: (rows || []).length
    });
  } catch {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error' });
  }
}
