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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  return createClient(url, key, { auth: { persistSession: false } });
}

function normalizePath(p) {
  if (!p) return '/api/invite/accept';
  return p.startsWith('/') ? p : `/${p}`;
}

function siteUrl() {
  return process.env.SITE_URL || 'https://www.plan2tasks.com';
}

function buildInviteUrl(id) {
  const site = siteUrl();
  const path = normalizePath(process.env.INVITE_PATH || '/api/invite/accept');
  const key = process.env.INVITE_QUERY_KEY || 'i';
  return `${site}${path}?${encodeURIComponent(key)}=${encodeURIComponent(id)}`;
}

function buildAcceptByEmailUrl(plannerEmail, userEmail) {
  const site = siteUrl();
  const qs = new URLSearchParams({
    plannerEmail: plannerEmail,
    userEmail: userEmail,
  });
  return `${site}/api/invite/accept-by-email?${qs.toString()}`;
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

function buildEmailHtml({ plannerEmail, userEmail, primaryUrl, fallbackUrl }) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.45">
    <h2 style="margin:0 0 12px">You're invited to connect on Plan2Tasks</h2>
    <p style="margin:0 0 10px">
      <strong>${plannerEmail}</strong> invited <strong>${userEmail}</strong> to receive organized task plans.
    </p>
    <p style="margin:0 12px 18px 0">
      <a href="${primaryUrl}" style="display:inline-block;padding:10px 14px;text-decoration:none;border-radius:10px;border:1px solid #e5e7eb;background:#f9fafb;color:#111">
        Accept Invite
      </a>
    </p>
    <p style="margin:0 0 8px;color:#374151;font-size:14px">Having trouble with the button?</p>
    <p style="margin:0 0 18px">
      <a href="${fallbackUrl}" style="color:#111">Try this link instead</a>
    </p>
    <p style="margin:0 0 6px;color:#6b7280;font-size:12px">If neither link works, paste this URL in your browser:</p>
    <p style="margin:0 0 4px;word-break:break-all;font-size:12px">
      <a href="${primaryUrl}">${primaryUrl}</a>
    </p>
    <p style="margin:0;word-break:break-all;font-size:12px">
      <a href="${fallbackUrl}">${fallbackUrl}</a>
    </p>
  </div>`;
}

function buildEmailText({ plannerEmail, userEmail, primaryUrl, fallbackUrl }) {
  return [
    `You're invited to connect on Plan2Tasks`,
    ``,
    `Planner: ${plannerEmail}`,
    `User: ${userEmail}`,
    ``,
    `Accept the invite: ${primaryUrl}`,
    `Having trouble? Try this link: ${fallbackUrl}`,
  ].join('\n');
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

    const supabase = getSupabaseAdmin();

    const { data: existingRows, error: findErr } = await supabase
      .from('invites')
      .select('id, used_at, planner_email, user_email')
      .ilike('planner_email', plannerEmail)
      .ilike('user_email', userEmail)
      .limit(1);

    if (findErr) return sendJson(res, 500, { ok: false, error: 'Database error (select)' });

    let inviteRow = existingRows && existingRows[0];
    let reused = !!inviteRow;

    if (!inviteRow) {
      const { data: inserted, error: insertErr } = await supabase
        .from('invites')
        .insert({ planner_email: plannerEmail, user_email: userEmail })
        .select('id, used_at')
        .limit(1);

      if (insertErr) {
        const { data: afterRace } = await supabase
          .from('invites')
          .select('id, used_at')
          .ilike('planner_email', plannerEmail)
          .ilike('user_email', userEmail)
          .limit(1);

        if (!afterRace || !afterRace[0]) return sendJson(res, 500, { ok: false, error: 'Database error (insert)' });
        inviteRow = afterRace[0];
        reused = true;
      } else {
        inviteRow = inserted && inserted[0];
      }
    }

    if (!inviteRow || !inviteRow.id) return sendJson(res, 500, { ok: false, error: 'Invite not available' });

    const primaryUrl = buildInviteUrl(inviteRow.id);
    const fallbackUrl = buildAcceptByEmailUrl(plannerEmail, userEmail);

    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM;
    if (!resendKey || !resendFrom) {
      return sendJson(res, 500, { ok: false, error: 'Email not configured' });
    }

    const subject = 'Your Plan2Tasks Invite';
    const html = buildEmailHtml({ plannerEmail, userEmail, primaryUrl, fallbackUrl });
    const text = buildEmailText({ plannerEmail, userEmail, primaryUrl, fallbackUrl });

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: userEmail,
        subject,
        html,
        text,
      }),
    });

    const respText = await r.text();
    let respJson = null;
    try { respJson = JSON.parse(respText); } catch {}

    if (!r.ok) {
      const details = respJson?.message || respJson?.error || respText || `HTTP ${r.status}`;
      return sendJson(res, 500, { ok: false, error: 'Email send failed', details });
    }

    const emailId = respJson?.data?.id || respJson?.id || null;

    return sendJson(res, 200, {
      ok: true,
      inviteUrl: primaryUrl,
      fallbackUrl,
      reused,
      used: !!inviteRow.used_at,
      emailId,
    });
  } catch {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error' });
  }
}
