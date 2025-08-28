// /api/users.js — Edge Runtime with graceful fallback when `groups` column is missing
// GET  /api/users?plannerEmail=PLANNER
// POST /api/users { plannerEmail, userEmail, groups: [...] }

export const config = { runtime: 'edge' };

function corsHeaders(req) {
  const origin = req.headers.get('origin') || '*';
  return {
    'access-control-allow-origin': origin,
    'vary': 'Origin',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization, x-requested-with, accept',
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600'
  };
}
function jsonHeaders(req) {
  return { 'content-type': 'application/json', ...corsHeaders(req) };
}

const toLower = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');
const nowISO = () => new Date().toISOString();

function normalizeGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups.map((g) => {
    if (typeof g === 'string') return g;
    if (g == null) return '';
    if (typeof g === 'object' && typeof g.name === 'string') return g.name;
    try { return JSON.stringify(g); } catch { return String(g); }
  }).filter(Boolean);
}

function deriveStatus(connectionRow, inviteRow) {
  const hasTokens = !!connectionRow?.google_refresh_token;
  if (hasTokens) return 'connected';
  if (inviteRow && !inviteRow.used_at) return 'invited';
  return 'pending';
}

async function supabaseRest(path, init = {}) {
  const urlBase = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!urlBase || !key) {
    return { error: { message: 'Missing Supabase env vars' }, data: null };
  }
  const url = `${urlBase.replace(/\/+$/, '')}/rest/v1/${path.replace(/^\/+/, '')}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...(init.headers || {}),
  };
  const res = await fetch(url, { ...init, headers });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (!res.ok) {
    const message = json?.message || json?.error || text || `HTTP ${res.status}`;
    return { error: { status: res.status, message }, data: null };
  }
  return { error: null, data: json };
}

export default async function handler(req) {
  const method = req.method || 'GET';
  const url = new URL(req.url);

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (method === 'GET') {
    const plannerEmail = url.searchParams.get('plannerEmail') || '';
    const plannerEmailNorm = toLower(plannerEmail);
    if (!plannerEmailNorm) {
      return new Response(JSON.stringify({ ok: false, error: 'plannerEmail is required' }), {
        status: 400, headers: jsonHeaders(req)
      });
    }

    const fieldsBase = 'planner_email,user_email,google_refresh_token,google_expires_at,updated_at';
    let triedGroups = true;

    // Try including groups; if column missing, fall back without crashing
    let { data: connRows, error: connErr } = await supabaseRest(
      `user_connections?select=${encodeURIComponent(fieldsBase + ',groups')}&planner_email=ilike.${encodeURIComponent(plannerEmailNorm)}`
    );
    if (connErr && /column .*groups.* does not exist/i.test(connErr.message || '')) {
      triedGroups = false;
      ({ data: connRows, error: connErr } = await supabaseRest(
        `user_connections?select=${encodeURIComponent(fieldsBase)}&planner_email=ilike.${encodeURIComponent(plannerEmailNorm)}`
      ));
    }
    if (connErr) {
      return new Response(JSON.stringify({ ok: false, error: connErr.message }), {
        status: 500, headers: jsonHeaders(req)
      });
    }

    const fieldsInv = 'id,planner_email,user_email,used_at';
    const { data: inviteRows, error: invErr } = await supabaseRest(
      `invites?select=${encodeURIComponent(fieldsInv)}&planner_email=ilike.${encodeURIComponent(plannerEmailNorm)}`
    );
    if (invErr) {
      return new Response(JSON.stringify({ ok: false, error: invErr.message }), {
        status: 500, headers: jsonHeaders(req)
      });
    }

    const connByUser = new Map();
    for (const r of connRows || []) connByUser.set(toLower(r.user_email), r);
    const invByUser = new Map();
    for (const i of inviteRows || []) {
      const key = toLower(i.user_email);
      if (!invByUser.has(key)) invByUser.set(key, i);
    }

    const users = Array.from(new Set([...connByUser.keys(), ...invByUser.keys()]))
      .map((uLower) => {
        const conn = connByUser.get(uLower);
        const inv = invByUser.get(uLower);
        return {
          userEmail: conn?.user_email || inv?.user_email || uLower,
          groups: triedGroups ? normalizeGroups(conn?.groups || []) : [],
          status: deriveStatus(conn, inv),
          hasInvite: !!inv,
          updatedAt: conn?.updated_at || null,
        };
      })
      .sort((a, b) => a.userEmail.localeCompare(b.userEmail));

    return new Response(JSON.stringify({
      ok: true,
      plannerEmail: plannerEmailNorm,
      count: users.length,
      users
    }), { status: 200, headers: jsonHeaders(req) });
  }

  if (method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch {}
    const plannerEmailNorm = toLower(body?.plannerEmail);
    const userEmailNorm   = toLower(body?.userEmail);
    let groups = body?.groups;

    if (!plannerEmailNorm || !userEmailNorm) {
      return new Response(JSON.stringify({ ok: false, error: 'plannerEmail and userEmail are required' }), {
        status: 400, headers: jsonHeaders(req)
      });
    }

    if (!Array.isArray(groups)) groups = groups == null ? [] : [groups];
    const cleanGroups = normalizeGroups(groups);

    const payload = [{
      planner_email: plannerEmailNorm,
      user_email: userEmailNorm,
      groups: cleanGroups,
      updated_at: nowISO()
    }];

    const { error: upsertErr } = await supabaseRest(
      'user_connections?on_conflict=planner_email,user_email',
      { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify(payload) }
    );

    if (upsertErr) {
      // Give a friendly, actionable message if the column is still missing
      if (/column .*groups.* does not exist/i.test(upsertErr.message || '')) {
        return new Response(JSON.stringify({
          ok: false,
          error: "The 'groups' column does not exist yet. Please run the one-time SQL in Supabase to add it.",
          howToFix: {
            open: "Supabase → SQL → New query",
            paste: "ALTER TABLE public.user_connections ADD COLUMN IF NOT EXISTS groups jsonb NOT NULL DEFAULT '[]'::jsonb; ALTER TABLE public.user_connections ADD COLUMN IF NOT EXISTS updated_at timestamptz;",
            run: "Click Run, then refresh the Table Editor"
          }
        }), { status: 400, headers: jsonHeaders(req) });
      }
      return new Response(JSON.stringify({ ok: false, error: upsertErr.message }), {
        status: 500, headers: jsonHeaders(req)
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: jsonHeaders(req)
    });
  }

  return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
    status: 405, headers: jsonHeaders(req)
  });
}
