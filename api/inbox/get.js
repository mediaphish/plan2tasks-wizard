// api/inbox/get.js
// GET /api/inbox/get?inboxId=... [&plannerEmail=...]
// Returns { ok, bundle:{...}, tasks:[{title,date,time,durationMins,notes}] }

import { supabaseAdmin } from "../../lib/supabase-admin.js";

// --- helpers ---
function addDays(ymd, n) {
  if (!ymd || typeof ymd !== "string") return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd);
  if (!m) return null;
  const [y, M, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (M || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + (Number(n) || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function coalesce(obj, keys, fallback = null) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
  }
  return fallback;
}

async function fetchTasksFlexible(bundleId) {
  // Try multiple foreign keys AND multiple order-by columns.
  const fkCandidates = ["bundle_id", "inbox_id"];
  const orderCandidates = ["created_at", "inserted_at", "id", null];

  for (const fk of fkCandidates) {
    for (const orderCol of orderCandidates) {
      let q = supabaseAdmin.from("inbox_tasks").select("*").eq(fk, bundleId);
      if (orderCol) q = q.order(orderCol, { ascending: true });
      const { data, error } = await q;
      if (!error && Array.isArray(data)) return data; // success (even if empty)
    }
  }
  // If the table exists but all attempts error, last resort: try without filters (shouldn't be needed, but won't 500)
  const { data } = await supabaseAdmin.from("inbox_tasks").select("*").limit(0);
  if (Array.isArray(data)) return []; // table exists but no matching rows
  return null; // table likely missing; caller will handle
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase(); // optional

    if (!inboxId) return res.status(400).json({ ok: false, error: "Missing inboxId" });

    // ---- bundle (id only; no status filter) ----
    const { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select("id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_at, archived_at, created_at")
      .eq("id", inboxId)
      .maybeSingle();

    if (bErr || !b) return res.status(404).json({ ok: false, error: "Bundle not found" });
    if (plannerEmail && b.planner_email?.toLowerCase() !== plannerEmail) {
      // soft hint only; not blocking
    }

    // ---- tasks (resilient to missing columns) ----
    let tasksRaw = await fetchTasksFlexible(inboxId);
    if (tasksRaw === null) {
      // tasks table missing entirely → still return the bundle so /review.html doesn't hard-fail
      tasksRaw = [];
    }

    // ---- normalize tasks (dates only; compute from offset if needed) ----
    const startDate = b.start_date || null;
    const tasks = tasksRaw.map((row) => {
      const title = String(coalesce(row, ["title"], "")) || "";
      const rawDate = coalesce(row, ["date", "task_date"], null);
      const time = coalesce(row, ["time", "task_time"], null);
      const durationMins = coalesce(row, ["duration_mins", "duration", "durationMinutes"], null);
      const notes = coalesce(row, ["notes", "note"], "") || "";
      const offset = coalesce(row, ["day_offset", "offset"], null);
      let date = rawDate;
      if (!date && startDate != null && typeof offset === "number") {
        date = addDays(startDate, offset);
      }
      return {
        title,
        date: date || null,
        time: time || null,
        durationMins: durationMins != null ? Number(durationMins) : null,
        notes,
      };
    });

    const bundle = {
      id: b.id,
      title: b.title,
      start_date: startDate,
      startDate: startDate,
      timezone: b.timezone || null,
      source: b.source || null,
      suggested_user: b.suggested_user || null,
      assigned_user: b.assigned_user_email || null,
      assigned_at: b.assigned_at || null,
      archived_at: b.archived_at || null,
      created_at: b.created_at || null,
      tasks,
      count: tasks.length,
    };

    return res.status(200).json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
