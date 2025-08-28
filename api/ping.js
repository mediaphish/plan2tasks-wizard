// /api/ping.js — Edge-safe minimal route (no DB)
// Works in Edge Runtime using Web Request/Response APIs.

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

export default async function handler(req) {
  const url = new URL(req.url);
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (method === 'GET') {
    const plannerEmail = (url.searchParams.get('plannerEmail') || '').trim().toLowerCase();
    if (!plannerEmail) {
      return new Response(JSON.stringify({ ok: false, error: 'plannerEmail is required', diag: { route: '/api/ping', runtime: 'edge' } }), {
        status: 400, headers: jsonHeaders(req)
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      route: '/api/ping',
      runtime: 'edge',
      method,
      plannerEmail
    }), { status: 200, headers: jsonHeaders(req) });
  }

  if (method === 'POST') {
    let body = {};
    try { body = await req.json(); } catch {}
    return new Response(JSON.stringify({
      ok: true,
      route: '/api/ping',
      runtime: 'edge',
      method,
      echo: body
    }), { status: 200, headers: jsonHeaders(req) });
  }

  return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
    status: 405, headers: jsonHeaders(req)
  });
}
