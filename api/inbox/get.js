// api/inbox/get.js
// GET /api/inbox/get?inboxId=... [&plannerEmail=...]
// Returns { ok, bundle:{...}, tasks:[{title,date,time,durationMins,notes,dayOffset?}] }

import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase();

    if (!inboxId) return res.status(400).json({ ok: false, error: "Missing inboxId" });

    // Load bundle by ID only (planner is optional for convenience)
    const { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select(
        "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user, assigned_at, archived_at, created_at"
      )
      .eq("id", inboxId)
      .single();

    if (bErr || !b) return res.status(404).json({ ok: false, error: "Bundle not found" });
    if (plannerEmail && b.planner_email?.toLowerCase() !== plannerEmail) {
      // Soft guard; still allow to proceed for now.
    }

    // Load tasks (no fragile ordering)
    const { data: t, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("title, date, day_offset, time, duration_mins, notes")
      .eq("inbox_id", inboxId)
      .order("created_at", { ascending: true });

    if (tErr) return res.status(500).json({ ok: false, error: "Database error (tasks)" });

    const tasks = (t || []).map((r) => ({
      title: r.title,
      // keep both for machines; UIs should use 'date' only
      date: r.date || null,
      dayOffset: typeof r.day_offset === "number" ? r.day_offset : null,
      time: r.time || null,
      durationMins: r.duration_mins || 60,
      notes: r.notes || ""
    }));

    const bundle = {
      id: b.id,
      title: b.title,
      startDate: b.start_date,
      timezone: b.timezone,
      source: b.source,
      suggested_user: b.suggested_user,
      assigned_user: b.assigned_user,
      assigned_at: b.assigned_at,
      archived_at: b.archived_at,
      created_at: b.created_at,
      count: tasks.length
    };

    return res.json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
