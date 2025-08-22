// lib/google-tasks.js
import { supabaseAdmin } from "./supabase.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Heuristic: try a few common column names
function pickTokenFields(row) {
  const access =
    row.google_access_token ||
    row.access_token ||
    row.token ||
    row.google_token ||
    null;

  const refresh =
    row.google_refresh_token ||
    row.refresh_token ||
    row.rt ||
    null;

  // epoch seconds commonly stored as number
  const expiresAt =
    row.google_token_expiry ||
    row.token_expiry ||
    row.expires_at ||
    null;

  return { access, refresh, expiresAt };
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const json = await resp.json();
  if (!resp.ok) {
    throw new Error(json.error_description || json.error || "Google refresh failed");
  }
  return {
    accessToken: json.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + (json.expires_in || 3600)
  };
}

export async function getAccessTokenForUser(userEmail) {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_connections")
    .select("*")
    .eq("user_email", userEmail)
    .eq("status", "connected")
    .single();

  if (error || !data) throw new Error("User is not connected to Google Tasks");

  let { access, refresh, expiresAt } = pickTokenFields(data);
  const now = Math.floor(Date.now() / 1000);

  if (!access || !expiresAt || expiresAt < now + 60) {
    if (!refresh) throw new Error("Missing refresh token for user");
    const { accessToken, expiresAt: newExp } = await refreshAccessToken(refresh);
    access = accessToken;
    expiresAt = newExp;
    // best-effort persist
    await sb
      .from("user_connections")
      .update({ google_access_token: access, google_token_expiry: expiresAt })
      .eq("user_email", userEmail);
  }

  return access;
}

export async function listTaskLists(accessToken) {
  const resp = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=100", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || "List tasklists failed");
  return json.items || [];
}

export async function ensureTaskList(accessToken, title) {
  const lists = await listTaskLists(accessToken);
  const found = lists.find(l => (l.title || "").trim() === title.trim());
  if (found) return found;

  const resp = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title })
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || "Create list failed");
  return json;
}

export async function insertTask(accessToken, listId, task) {
  const resp = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(task)
  });
  const json = await resp.json();
  if (!resp.ok) throw new Error(json.error?.message || "Insert task failed");
  return json;
}
