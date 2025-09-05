// api/inbox/get.js
// GET /api/inbox/get?inboxId=... [&plannerEmail=...]
// Returns { ok, bundle:{...}, tasks:[{title,date,time,durationMins,notes}] }
// No offsets are exposed.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

// helper: add n days to YYYY-MM-DD, returns YYYY-MM-DD
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
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase(); // optional

    if (!inboxId) return res.status(400).json({ ok: false, error: "Missing inboxId" });

    // 1) Load bundle by id (do NOT filter by status; assigned & new are both valid)
    const { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select(
        // IMPORTANT: use assigned_user_email (not assigned_user)
        "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_at, archived_at, created_at"
      )
      .eq("id", inboxId)
      .maybeSingle();

    if (bErr || !b) {
      return res.status(404).json({ ok: false, error: "Bundle not found" });
    }
    if (plannerEmail && b.planner_email?.toLowerCase() !== plannerEmail) {
      // Soft guard only; not blocking
    }

    // 2) Load tasks for this bundle (tasks are keyed by bundle_id)
    const { data: t, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("*") // tolerate schema drift (date vs task_date, etc.)
      .eq("bundle_id", inboxId)
      .order("created_at", { ascending: true });

    if (tErr) {
      return res.status(500).json({ ok: false, error: "Database error (tasks)" });
    }

    // 3) Normalize tasks to dates only (compute from start_date + day_offset if needed)
    const startDate = b.start_date || null;
    const tasks = (t || []).map((row) => {
      const date = row.date || (startDate != null && typeof row.day_offset === "number"
        ? addDays(startDate, row.day_offset)
        : null);
      return {
        title: row.title || "",
        date: date || null,
        time: row.time || null,
        durationMins: row.duration_mins ?? 60,
        notes: row.notes || ""
      };
    });

    // 4) Response shape (include both start_date and startDate for compatibility)
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
      count: tasks.length
    };

    return res.status(200).json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
