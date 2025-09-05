// api/inbox/get.js
// GET /api/inbox/get?inboxId=...
// Returns: { ok:true, title, bundle:{ ...title aliases..., tasks:[{title,date,time,durationMins,notes}] }, tasks:[...] }

import { supabaseAdmin } from "../../lib/supabase-admin.js";

// Add n days to YYYY-MM-DD (UTC) -> YYYY-MM-DD
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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();

    if (!inboxId) {
      return res.status(400).json({ ok: false, error: "Missing inboxId" });
    }

    // 1) Bundle by id (ASSIGNED or NEW — no status filter)
    const { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select("id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_at, archived_at, deleted_at, created_at")
      .eq("id", inboxId)
      .maybeSingle();

    if (bErr) {
      return res.status(500).json({ ok: false, error: "Database error (bundle)" });
    }
    if (!b) {
      return res.status(404).json({ ok: false, error: "Bundle not found" });
    }

    // 2) Tasks by bundle_id — order by day_offset then id
    let taskRows = [];
    let tErr = null;
    {
      const { data, error } = await supabaseAdmin
        .from("inbox_tasks")
        .select("id, bundle_id, title, day_offset, time, duration_mins, notes")
        .eq("bundle_id", inboxId)
        .order("day_offset", { ascending: true })
        .order("id", { ascending: true });
      taskRows = data || [];
      tErr = error || null;
    }
    if (tErr) {
      const { data, error } = await supabaseAdmin
        .from("inbox_tasks")
        .select("id, bundle_id, title, day_offset, time, duration_mins, notes")
        .eq("bundle_id", inboxId);
      if (error) {
        return res.status(500).json({ ok: false, error: "Database error (tasks)" });
      }
      taskRows = data || [];
    }

    // 3) Normalize to dates only (compute from start_date + day_offset)
    const startDate = b.start_date || null;
    const tasks = taskRows.map((r) => ({
      title: r.title || "",
      date: startDate != null ? addDays(startDate, r.day_offset || 0) : null,
      time: r.time ?? null,
      durationMins: r.duration_mins ?? null,
      notes: r.notes ?? ""
    }));

    // 4) Response (include aliases so review.html finds the title no matter what key it expects)
    const bundle = {
      id: b.id,
      title: b.title,                 // primary
      plan_title: b.title,            // alias for older clients
      list_title: b.title,            // alias for older clients
      start_date: startDate,
      startDate: startDate,
      timezone: b.timezone || null,
      source: b.source || null,
      suggested_user: b.suggested_user || null,
      assigned_user: b.assigned_user_email || null,
      assigned_at: b.assigned_at || null,
      archived_at: b.archived_at || null,
      deleted_at: b.deleted_at || null,
      created_at: b.created_at || null,
      tasks,
      count: tasks.length
    };

    // top-level title for ultra-legacy consumers
    return res.status(200).json({ ok: true, title: b.title, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
