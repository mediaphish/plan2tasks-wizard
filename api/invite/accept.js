export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';

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

function htmlResponse(res, status, html) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(html);
}

function page({ title, heading, bodyHtml, ctaHref, ctaText, subText }) {
  // Minimal, mobile-friendly landing page. No app shell, no login.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>${title}</title>
  <style>
    :root { color-scheme: light; }
    body{ margin:0; font-family: system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:#fafafa; color:#111; }
    .wrap{ max-width:560px; margin:32px auto; padding:16px; }
    .card{ background:#fff; border:1px solid #e5e7eb; border-radius:16px; padding:20px; box-shadow:0 1px 2px rgba(0,0,0,0.03); }
    .h{ font-weight:700; font-size:18px; margin:0 0 10px; }
    .p{ margin:8px 0; font-size:14px; color:#374151; }
    .k{ background:#f3f4f6; border:1px solid #e5e7eb; padding:2px 6px; border-radius:6px; font-family: ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
    .cta{ display:inline-block; padding:10px 14px; border-radius:10px; border:1px solid #e5e7eb; background:#f9fafb; text-decoration:none; color:#111; font-size:14px; }
    .cta:hover{ background:#f3f4f6; }
    .row{ margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    .muted{ color:#6b7280; font-size:12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="h">${heading}</div>
      ${bodyHtml}
      <div class="row">
        <a class="cta" href="${ctaHref}">${ctaText}</a>
        <a class="cta" href="about:blank" onclick="window.close();return false;">Close this tab</a>
      </div>
      <p class="muted" style="margin-top:12px">${subText}</p>
    </div>
  </div>
</body>
</html>`;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return htmlResponse(res, 405, page({
        title: 'Plan2Tasks',
        heading: 'Unsupported request',
        bodyHtml: `<p class="p">Please open the invite link from your email.</p>`,
        ctaHref: '/',
        ctaText: 'Go to site',
        subText: 'Method not allowed',
      }));
    }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const inviteId = url.searchParams.get('i') || url.searchParams.get('token') || '';
    const supabase = getSupabaseAdmin();

    if (!inviteId) {
      return htmlResponse(res, 200, page({
        title: 'Plan2Tasks',
        heading: 'Invite link is missing',
        bodyHtml: `<p class="p">This page is for accepting invites sent by a planner. Please use the invite link from your email.</p>`,
        ctaHref: '/',
        ctaText: 'Go to site',
        subText: 'No token provided',
      }));
    }

    // Look up the invite
    const { data: invRows, error: invErr } = await supabase
      .from('invites')
      .select('id, used_at, planner_email, user_email')
      .eq('id', inviteId)
      .limit(1);

    if (invErr || !invRows || !invRows[0]) {
      return htmlResponse(res, 200, page({
        title: 'Plan2Tasks',
        heading: 'This invite link is invalid or expired',
        bodyHtml: `<p class="p">Ask your planner to send a fresh invite, then open it from your email again.</p>`,
        ctaHref: '/',
        ctaText: 'Go to site',
        subText: 'Invalid or expired token',
      }));
    }

    const inv = invRows[0];
    const plannerN = normalizeEmail(inv.planner_email);
    const userN = normalizeEmail(inv.user_email);

    // Upsert/activate the connection
    const { data: connRows } = await supabase
      .from('user_connections')
      .select('planner_email, user_email, status')
      .ilike('planner_email', plannerN)
      .ilike('user_email', userN)
      .limit(1);

    if (connRows && connRows[0]) {
      await supabase
        .from('user_connections')
        .update({ status: 'connected', updated_at: new Date().toISOString() })
        .eq('planner_email', connRows[0].planner_email)
        .eq('user_email', connRows[0].user_email);
    } else {
      await supabase.from('user_connections').insert({
        planner_email: plannerN,
        user_email: userN,
        groups: [],
        status: 'connected',
        updated_at: new Date().toISOString(),
      });
    }

    // Mark invite as used (idempotent)
    if (!inv.used_at) {
      await supabase
        .from('invites')
        .update({ used_at: new Date().toISOString() })
        .eq('id', inviteId);
    }

    // Landing page (do NOT route into the app). Offer to become a planner, or close tab.
    const site = process.env.SITE_URL || 'https://www.plan2tasks.com';
    const becomePlannerHref = `${site}/?becomePlanner=1`;

    const already = !!inv.used_at;
    return htmlResponse(res, 200, page({
      title: 'Plan2Tasks',
      heading: already ? 'Connection verified' : 'You’re connected',
      bodyHtml: `
        <p class="p">You’re connected to <span class="k">${plannerN}</span> as <span class="k">${userN}</span>.</p>
        <p class="p">Your planner can now push organized tasks and schedules to you. You don’t need to sign in here.</p>
        <p class="p">If you’d like to organize plans for <em>your</em> clients or partners, become a Planner.</p>
      `,
      ctaHref: becomePlannerHref,
      ctaText: 'Become a Planner',
      subText: 'No account required to receive plans. You can close this tab now.',
    }));
  } catch (e) {
    return htmlResponse(res, 200, page({
      title: 'Plan2Tasks',
      heading: 'Something went wrong',
      bodyHtml: `<p class="p">Please reopen your invite link from the email. If the issue persists, ask your planner to resend the invite.</p>`,
      ctaHref: '/',
      ctaText: 'Go to site',
      subText: 'Unexpected error',
    }));
  }
}
