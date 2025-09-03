// api/inbox/get.js
// GET /api/inbox/get?plannerEmail=...&inboxId=...
// Returns { ok, bundle:{...}, tasks:[...] } for Review → Push.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const plannerEmail = String(url.searchParams.get("plannerEmail") || "").toLowerCase().trim();
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();

    if (!plannerEmail || !plannerEmail.includes("@")) {
      return res.status(400).json({ ok: false, error: "Invalid plannerEmail" });
    }
    if (!inboxId) {
      return res.status(400).json({ ok: false, error: "Missing inboxId" });
    }

    // Load bundle
    const { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select(
        "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user, assigned_at, archived_at, created_at"
      )
      .eq("id", inboxId)
      .ilike("planner_email", plannerEmail)
      .single();

    if (bErr || !b) return res.status(404).json({ ok: false, error: "Bundle not found" });

    // Load tasks
    const { data: t, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("title, day_offset, time, duration_mins, notes, idx")
      .eq("inbox_id", inboxId)
      .order("idx", { ascending: true });

    if (tErr) return res.status(500).json({ ok: false, error: "Database error (tasks)" });

    const tasks = (t || []).map((r) => ({
      title: r.title,
      dayOffset: r.day_offset ?? 0,
      time: r.time || null,
      durationMins: r.duration_mins || 60,
      notes: r.notes || "",
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
      count: tasks.length,
    };

    return res.json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
