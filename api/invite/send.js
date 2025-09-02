// /api/invite/send.js
// Vercel Serverless Function (ESM)
// Patch: Use supported runtime value ("nodejs") so builds pass
// Behavior unchanged: normalize emails, env-driven invite URL, email via Resend

export const config = {
  runtime: 'nodejs',
};

import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/** Helpers **/
function normalizeEmail(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
}

function isLikelyEmail(value) {
  return typeof value === 'string' && value.includes('@') && value.includes('.');
}

function sendJson(res, status, body) {
  try {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  } catch {
    // no-op
  }
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
  const path = normalizePath(process.env.INVITE_PATH || '/join');  // e.g. '/invite'
  const key = process.env.INVITE_QUERY_KEY || 'i';                 // e.g. 'token'
  return `${site}${path}?${encodeURIComponent(key)}=${encodeURIComponent(id)}`;
}

async function readJsonBody(req) {
  // Robust body parser for Node API routes
  return await new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        try {
          const params = new URLSearchParams(raw);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          resolve(obj);
        } catch {
          resolve({});
        }
      }
    });
    req.on('error', () => resolve({}));
  });
}

function buildEmailHtml({ plannerEmail, userEmail, inviteUrl }) {
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.4">
    <h2 style="margin:0 0 12px">You're invited to connect on Plan2Tasks</h2>
    <p style="margin:0 0 16px">
      <strong>${plannerEmail}</strong> invited <strong>${userEmail}</strong> to connect and receive task plans.
    </p>
    <p style="margin:0 0 16px">Click the secure link below to accept the invite:</p>
    <p style="margin:0 0 24px">
      <a href="${inviteUrl}" style="display:inline-block;padding:10px 16px;text-decoration:none;border-radius:8px;border:1px solid #e2e8f0">
        Accept Invite
      </a>
    </p>
    <p style="margin:0 0 8px">If the button doesn't work, paste this URL in your browser:</p>
    <p style="margin:0 0 16px;word-break:break-all"><a href="${inviteUrl}">${inviteUrl}</a></p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
    <p style="color:#6b7280;margin:0">Sent by Plan2Tasks</p>
  </div>`;
}

function buildEmailText({ inviteUrl, plannerEmail, userEmail }) {
  return [
    `You're invited to connect on Plan2Tasks`,
    ``,
    `Planner: ${plannerEmail}`,
    `User: ${userEmail}`,
    ``,
    `Accept the invite: ${inviteUrl}`,
  ].join('\n');
}

/** Main handler **/
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
        error: 'Invalid plannerEmail or userEmail',
        details: 'Both emails are required. They are trimmed + lowercased server-side.',
      });
    }

    const supabase = getSupabaseAdmin();

    // Find existing invite (case-insensitive exact match)
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

    // Send email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    const resendFrom = process.env.RESEND_FROM;
    if (!resendKey || !resendFrom) {
      return sendJson(res, 500, {
        ok: false,
        error: 'Email not configured',
        details: 'RESEND_API_KEY or RESEND_FROM missing',
      });
    }

    const resend = new Resend(resendKey);
    const subject = 'Your Plan2Tasks Invite';
    const html = buildEmailHtml({ plannerEmail, userEmail, inviteUrl });
    const text = buildEmailText({ plannerEmail, userEmail, inviteUrl });

    let emailResp;
    try {
      emailResp = await resend.emails.send({
        from: resendFrom,
        to: userEmail,
        subject,
        html,
        text,
      });
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'Email send failed', details: String(e?.message || e) });
    }

    if (emailResp?.error) {
      return sendJson(res, 500, { ok: false, error: 'Email send failed', details: String(emailResp.error) });
    }

    // Success
    return sendJson(res, 200, {
      ok: true,
      inviteUrl,
      reused,
      used: !!inviteRow.used_at,
      emailId: emailResp?.data?.id || null,
    });
  } catch (err) {
    return sendJson(res, 500, { ok: false, error: 'Unhandled error', details: String(err?.message || err) });
  }
}
