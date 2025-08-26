// api/push.js
// Accepts direct items from the composer and pushes to Google Tasks.
// Body:
// {
//   plannerEmail: "bartpaden@gmail.com",
//   userEmail: "someone@example.com",
//   listTitle: "Weekly Plan",
//   timezone: "America/Chicago",
//   startDate: "2025-08-25",      // YYYY-MM-DD
//   mode: "append" | "replace",
//   items: [{ title, dayOffset, time?, durationMins?, notes? }, ...]
// }

import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const {
      plannerEmail,
      userEmail,
      listTitle,
      timezone = "America/Chicago",
      startDate,
      mode = "append",
      items,
    } = req.body || {};

    if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Missing items (array)" });
    }
    if (!listTitle || !startDate) {
      return res.status(400).json({ error: "Missing listTitle or startDate" });
    }

    // 1) Look up the user's Google tokens
    const { data: conn, error: connErr } = await supabaseAdmin
      .from("user_connections")
      .select("google_access_token, google_refresh_token, google_expires_at, user_email")
      .eq("user_email", userEmail)
      .single();

    if (connErr || !conn) {
      return res.status(400).json({ error: "User not connected to Google Tasks." });
    }

    // 2) Ensure fresh access token (refresh if needed)
    let accessToken = conn.google_access_token || "";
    const now = Date.now();
    const expMs = conn.google_expires_at ? new Date(conn.google_expires_at).getTime() : 0;
    if (!accessToken || !expMs || expMs - 60_000 < now) {
      const refreshed = await refreshGoogleToken(conn.google_refresh_token);
      if (!refreshed.ok) {
        return res.status(401).json({ error: "Google token refresh failed", details: refreshed.error });
      }
      accessToken = refreshed.access_token;
      const newExpiresAt = new Date(now + (refreshed.expires_in || 3600) * 1000).toISOString();
      await supabaseAdmin
        .from("user_connections")
        .update({ google_access_token: accessToken, google_expires_at: newExpiresAt })
        .eq("user_email", userEmail);
    }

    // 3) Ensure the target Task List exists (create if missing)
    const listId = await ensureTaskList(accessToken, listTitle);

    // 4) If replace, clear existing tasks on that list
    if (mode === "replace") {
      await deleteAllTasks(accessToken, listId);
    }

    // 5) Create tasks
    const created = await createTasksBatch(accessToken, listId, startDate, timezone, items);

    return res.json({ ok: true, created });
  } catch (e) {
    console.error("push error", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}

/* ----------------- Helpers ----------------- */

async function refreshGoogleToken(refresh_token) {
  try {
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token,
      grant_type: "refresh_token",
    });
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = await r.json();
    if (!r.ok || j.error) return { ok: false, error: j.error || j };
    return { ok: true, ...j };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

async function gfetch(accessToken, url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (r.status === 204) return {};
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg =
      j?.error?.message ||
      j?.error?.errors?.[0]?.message ||
      j?.error ||
      JSON.stringify(j) ||
      `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j;
}

async function ensureTaskList(accessToken, title) {
  const base = "https://www.googleapis.com/tasks/v1";
  const lists = await gfetch(accessToken, `${base}/users/@me/lists?maxResults=100`);
  const found = (lists.items || []).find((x) => x.title === title);
  if (found) return found.id;
  const created = await gfetch(accessToken, `${base}/users/@me/lists`, {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return created.id;
}

async function deleteAllTasks(accessToken, listId) {
  const base = "https://www.googleapis.com/tasks/v1";
  let pageToken = undefined;
  do {
    const q = new URLSearchParams({ maxResults: "100" });
    if (pageToken) q.set("pageToken", pageToken);
    const tasks = await gfetch(accessToken, `${base}/lists/${encodeURIComponent(listId)}/tasks?${q.toString()}`);
    const items = tasks.items || [];
    for (const t of items) {
      await gfetch(accessToken, `${base}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });
    }
    pageToken = tasks.nextPageToken;
  } while (pageToken);
}

function addDaysUTC(ymd, days) {
  // ymd: "YYYY-MM-DD" in UTC
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + (Number(days) || 0));
  const s = d.toISOString(); // "YYYY-MM-DDTHH:mm:ss.sssZ"
  return s.slice(0, 10); // back to YYYY-MM-DD
}

// Convert YYYY-MM-DD + "HH:mm" in given IANA tz to a proper UTC ISO string
function toUTCISO(ymd, timeHHMM, tz) {
  if (!timeHHMM) return ymd + "T00:00:00.000Z";
  const [y, m, d] = ymd.split("-").map(Number);
  const [hh, mm] = timeHHMM.split(":").map(Number);

  // Start from the UTC timestamp that formats to some wall time in tz,
  // then shift by the difference to get the requested wall time.
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(utcGuess).map((p) => [p.type, p.value]));
  const tzH = Number(parts.hour), tzM = Number(parts.minute);
  const diffMinutes = (hh * 60 + mm) - (tzH * 60 + tzM);
  const corrected = new Date(utcGuess.getTime() + diffMinutes * 60000);
  return corrected.toISOString();
}

async function createTasksBatch(accessToken, listId, startDate, timezone, items) {
  const base = "https://www.googleapis.com/tasks/v1";
  let created = 0;
  for (const it of items) {
    const offset = Number(it.dayOffset) || 0;
    const ymd = addDaysUTC(startDate, offset);
    const dueISO = toUTCISO(ymd, it.time || null, timezone);

    const body = {
      title: it.title || "Untitled",
      notes: it.notes || undefined,
      due: dueISO, // RFC3339 UTC; Google Tasks shows time if present
      status: "needsAction",
    };

    await gfetch(accessToken, `${base}/lists/${encodeURIComponent(listId)}/tasks`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    created++;
  }
  return created;
}
