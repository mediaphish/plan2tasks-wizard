// api/inbox/get.js
// GET /api/inbox/get?inboxId=... [&plannerEmail=...]
// Returns { ok, bundle:{...} }  (bundle includes tasks: [{title,date,time,durationMins,notes}])

import { supabaseAdmin } from "../../lib/supabase-admin.js";

function addDays(ymd, n){
  // ymd = 'YYYY-MM-DD'; add n days (UTC)
  if (!ymd || typeof ymd !== "string") return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd);
  if (!m) return null;
  const [y, M, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (M||1)-1, d||1));
  dt.setUTCDate(dt.getUTCDate() + (Number(n)||0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase(); // optional

    if (!inboxId) return res.status(400).json({ ok: false, error: "Missing inboxId" });

    // --- Load bundle by ID only (do not restrict by status) ---
    const { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select(
        "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_at, archived_at, created_at"
      )
      .eq("id", inboxId)
      .single();

    let bundleRow = b;
    if (bErr || !b) {
      if (plannerEmail) {
        const { data: b2 } = await supabaseAdmin
          .from("inbox_bundles")
          .select(
            "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_at, archived_at, created_at"
          )
          .eq("id", inboxId)
          .eq("planner_email", plannerEmail)
          .maybeSingle();
        if (!b2) return res.status(404).json({ ok: false, error: "Bundle not found" });
        bundleRow = b2;
      } else {
        return res.status(404).json({ ok: false, error: "Bundle not found" });
      }
    }

    // --- Load tasks for this bundle (dates only in response) ---
    const { data: t, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("title, date, day_offset, time, duration_mins, notes, created_at")
      .eq("bundle_id", inboxId)
      .order("created_at", { ascending: true });

    if (tErr) return res.status(500).json({ ok: false, error: "Database error (tasks)" });

    // Normalize tasks: compute date from day_offset if needed; never expose offsets
    const startDate = bundleRow.start_date || null;
    const tasks = (t || []).map((r) => {
      let date = r.date || null;
      if (!date && startDate != null && typeof r.day_offset === "number") {
        date = addDays(startDate, r.day_offset);
      }
      return {
        title: r.title || "",
        date,
        time: r.time || null,
        durationMins: r.duration_mins ?? null,
        notes: r.notes || ""
      };
    });

    // Response bundle (keep both start_date and startDate keys for compatibility)
    const bundle = {
      id: bundleRow.id,
      title: bundleRow.title,
      start_date: bundleRow.start_date || null,
      startDate: bundleRow.start_date || null,
      timezone: bundleRow.timezone || null,
      source: bundleRow.source || null,
      suggested_user: bundleRow.suggested_user || null,
      assigned_user: bundleRow.assigned_user_email || null,
      assigned_at: bundleRow.assigned_at || null,
      archived_at: bundleRow.archived_at || null,
      created_at: bundleRow.created_at || null,
      tasks,
      count: tasks.length
    };

    // Back-compat: also include top-level tasks, though clients should use bundle.tasks
    return res.json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
