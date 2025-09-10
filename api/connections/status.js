// /api/connections/status.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function fetchTasklists(accessToken) {
  const r = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
  return { status: r.status, json };
}

async function refreshAccessToken(refreshToken) {
  // Google OAuth2 token endpoint
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID || '',
    client_secret: GOOGLE_CLIENT_SECRET || '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  });

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await r.json();
  if (!r.ok || !data.access_token) {
    const err = data && (data.error_description || data.error) ? `${data.error}: ${data.error_description || ''}`.trim() : `HTTP ${r.status}`;
    throw new Error(err);
  }

  // expires_in is seconds from now
  const now = Math.floor(Date.now() / 1000);
  const google_token_expiry = now + (data.expires_in || 3600);
  const google_expires_at = new Date(google_token_expiry * 1000).toISOString();

  return {
    google_access_token: data.access_token,
    google_token_type: data.token_type || 'Bearer',
    google_scope: data.scope || undefined, // Google may omit; keep previous if missing
    google_token_expiry,
    google_expires_at
  };
}

export default async function handler(req, res) {
  try {
    const userEmail = (req.query.userEmail || '').toString().trim();
    if (!userEmail) {
      res.status(400).json({ ok: false, error: 'Missing userEmail' });
      return;
    }

    const { data: row, error } = await supabase
      .from('user_connections')
      .select('provider, user_email, google_access_token, google_refresh_token, google_scope, google_token_type, google_token_expiry, google_expires_at, google_tasklist_id')
      .eq('user_email', userEmail)
      .single();

    if (error || !row) {
      res.status(200).json({
        ok: true,
        userEmail,
        tableUsed: 'user_connections',
        hasAccessToken: false,
        hasRefreshToken: false,
        provider: row?.provider || 'google',
        google_scope: row?.google_scope || null,
        google_token_type: row?.google_token_type || null,
        google_token_expiry: row?.google_token_expiry || null,
        google_expires_at: row?.google_expires_at || null,
        google_tasklist_id: row?.google_tasklist_id || null,
        canCallTasks: false,
        googleError: 'not_connected'
      });
      return;
    }

    const hasAccessToken = !!row.google_access_token;
    const hasRefreshToken = !!row.google_refresh_token;

    // Try current token first
    let canCallTasks = false;
    let googleError = null;
    let currentAccessToken = row.google_access_token;

    if (hasAccessToken) {
      const firstTry = await fetchTasklists(currentAccessToken);
      if (firstTry.status >= 200 && firstTry.status < 300) {
        canCallTasks = true;
      } else if (firstTry.status === 401 || firstTry.status === 403) {
        // Attempt silent refresh if we can
        if (hasRefreshToken) {
          try {
            const refreshed = await refreshAccessToken(row.google_refresh_token);

            // Persist refreshed token (and scope/type if present)
            const updatePayload = {
              google_access_token: refreshed.google_access_token,
              google_token_type: refreshed.google_token_type,
              google_token_expiry: refreshed.google_token_expiry,
              google_expires_at: refreshed.google_expires_at
            };
            if (refreshed.google_scope) {
              updatePayload.google_scope = refreshed.google_scope;
            }

            const { error: upErr } = await supabase
              .from('user_connections')
              .update(updatePayload)
              .eq('user_email', userEmail);

            if (upErr) {
              googleError = `refresh_persist_failed: ${upErr.message}`;
            } else {
              currentAccessToken = refreshed.google_access_token;
              // Retry with new token
              const secondTry = await fetchTasklists(currentAccessToken);
              if (secondTry.status >= 200 && secondTry.status < 300) {
                canCallTasks = true;
              } else {
                googleError = (secondTry.json && (secondTry.json.error?.message || secondTry.json.error)) || `HTTP ${secondTry.status}`;
              }
            }
          } catch (e) {
            googleError = `refresh_failed: ${e.message}`;
          }
        } else {
          googleError = (firstTry.json && (firstTry.json.error?.message || firstTry.json.error)) || 'auth_error_no_refresh_token';
        }
      } else {
        googleError = (firstTry.json && (firstTry.json.error?.message || firstTry.json.error)) || `HTTP ${firstTry.status}`;
      }
    } else {
      googleError = 'no_access_token';
    }

    res.status(200).json({
      ok: true,
      userEmail,
      tableUsed: 'user_connections',
      hasAccessToken: !!currentAccessToken,
      hasRefreshToken,
      provider: row.provider || 'google',
      google_scope: row.google_scope || null,
      google_token_type: row.google_token_type || 'Bearer',
      google_token_expiry: row.google_token_expiry || null,
      google_expires_at: row.google_expires_at || null,
      google_tasklist_id: row.google_tasklist_id || null,
      canCallTasks,
      googleError
    });
  } catch (err) {
    res.status(200).json({
      ok: true,
      userEmail: (req.query.userEmail || '').toString().trim(),
      tableUsed: 'user_connections',
      hasAccessToken: false,
      hasRefreshToken: false,
      provider: 'google',
      google_scope: null,
      google_token_type: null,
      google_token_expiry: null,
      google_expires_at: null,
      google_tasklist_id: null,
      canCallTasks: false,
      googleError: `internal_error: ${err.message}`
    });
  }
}
