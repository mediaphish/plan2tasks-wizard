// api/push.js
// Accepts items and pushes them to Google Tasks.
// Body:
// {
//   plannerEmail: "bartpaden@gmail.com",
//   userEmail: "someone@example.com",
//   listTitle: "Weekly Plan",
//   timezone: "America/Chicago",
//   startDate: "2025-09-10",      // YYYY-MM-DD
//   mode: "append" | "replace",
//   items: [
//     { title, date?, dayOffset?, time?, durationMins?, notes? },
//     ...
//   ]
// }
//
// Notes:
// - Supports EITHER absolute `date` OR relative `dayOffset`. If only `date` is provided,
//   the server computes dayOffset = date - startDate (days).
// - Google Tasks does not have a duration field; we preserve duration by appending
//   " (Duration: Xm)" to the notes when durationMins is present.

import { supabaseAdmin } from "../lib/supabase-admin.js";
import { getAccessTokenForUser, ensureTaskList, insertTask } from "../lib/google-tasks.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const body = req.body || {};
    const plannerEmail = String(body.plannerEmail || "").trim().toLowerCase();
    const userEmail = String(body.userEmail || "").trim().toLowerCase();
    const listTitle = String(body.listTitle || "").trim();
    const timezone = String(body.timezone || "America/Chicago").trim();
    const startDate = String(body.startDate || "").trim(); // YYYY-MM-DD
    const mode = (String(body.mode || "append").toLowerCase() === "replace") ? "replace" : "append";
    let items = Array.isArray(body.items) ? body.items : [];

    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }
    if (!listTitle || !startDate) {
      return res.status(400).json({ error: "Missing listTitle or startDate" });
    }
    if (!items.length) {
      return res.status(400).json({ error: "No items to push" });
    }

    // Normalize items: compute dayOffset from absolute date when provided
    items = items.map((it) => normalizeItem(it, startDate));

    // Ensure user is connected and retrieve fresh access token
    let accessToken;
    try {
      accessToken = await getAccessTokenForUser(userEmail);
    } catch (e) {
      return res.status(400).json({ error: "User not connected to Google Tasks." });
    }

    // Ensure list exists (or create)
    const list = await ensureTaskList(accessToken, listTitle);
    const listId = list.id || list;

    // If replace, clear existing tasks in this list
    if (mode === "replace") {
      await clearTaskList(accessToken, listId);
    }

    // Create tasks
    let created = 0;
    for (const it of items) {
      const ymd = addDaysUTC(startDate, it.dayOffset || 0);
      const due = toUTCISO(ymd, it.time || null, timezone);
      const notes = buildNotes(it);
      const task = {
        title: it.title || "Untitled",
        notes: notes || undefined,
        due,
        status: "needsAction",
      };
      await insertTask(accessToken, listId, task);
      created++;
    }

    res.status(200).json({ ok: true, created, mode, list: { id: listId, title: listTitle } });
  } catch (e) {
    console.error("POST /api/push error", e);
    res.status(500).json({ error: "Server error" });
  }
}

// --- helpers ---

function buildNotes(it) {
  const parts = [];
  if (it.notes) parts.push(String(it.notes));
  if (it.durationMins && Number(it.durationMins) > 0) {
    parts.push(`Duration: ${Number(it.durationMins)}m`);
  }
  return parts.join(" · ");
}

// Add days in UTC: input ymd "YYYY-MM-DD"
function addDaysUTC(ymd, days) {
  const [y, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + (Number(days) || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// Convert local time in a given IANA timezone to UTC ISO
function toUTCISO(ymd, timeHHMM, timeZone) {
  // Parse parts
  const [y, m, d] = String(ymd).split("-").map((n) => parseInt(n, 10));
  let hh = 9, mm = 0; // default 09:00 if time missing
  if (typeof timeHHMM === "string" && /^\d{2}:\d{2}$/.test(timeHHMM)) {
    const parts = timeHHMM.split(":");
    hh = parseInt(parts[0], 10);
    mm = parseInt(parts[1], 10);
  }

  // Guess UTC time then correct using timezone offset derived from Intl
  const utcGuess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh, mm, 0));

  // What local wall clock does utcGuess correspond to in the desired tz?
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(utcGuess).map(p => [p.type, p.value]));
  const localHour = parseInt(parts.hour || "0", 10);
  const localMin = parseInt(parts.minute || "0", 10);

  // Difference in minutes between desired local time and observed local time
  const diffMinutes = (hh - localHour) * 60 + (mm - localMin);
  const corrected = new Date(utcGuess.getTime() + diffMinutes * 60000);
  return corrected.toISOString();
}

// Convert absolute date to offset given a startDate
function daysBetweenUTC(startYMD, dateYMD) {
  const toUTCDate = (ymd) => {
    const [y, m, d] = String(ymd).split("-").map(n => parseInt(n, 10));
    return Date.UTC(y, (m || 1) - 1, d || 1) / 86400000; // days
  };
  const a = toUTCDate(startYMD);
  const b = toUTCDate(dateYMD);
  return Math.round(b - a);
}

function normalizeItem(it, startDate) {
  const out = {
    title: String(it.title || "").slice(0, 200),
    time: it.time || null,
    durationMins: it.durationMins != null ? Number(it.durationMins) : null,
    notes: it.notes || null,
  };
  if (it.dayOffset != null) {
    out.dayOffset = Number(it.dayOffset) || 0;
  } else if (it.date) {
    out.dayOffset = daysBetweenUTC(startDate, String(it.date));
  } else {
    out.dayOffset = 0;
  }
  return out;
}

// Clear all tasks in a list (best-effort)
async function clearTaskList(accessToken, listId) {
  // List tasks (paged) and delete one-by-one
  let pageToken = "";
  do {
    const qs = new URLSearchParams({ maxResults: "100", ...(pageToken ? { pageToken } : {}) });
    const r = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?${qs}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error?.message || "Failed to list tasks for replace");

    const items = Array.isArray(j.items) ? j.items : [];
    for (const t of items) {
      await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(t.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
}
