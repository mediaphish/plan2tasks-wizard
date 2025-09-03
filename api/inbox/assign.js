// api/inbox/assign.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const pe = (req.body?.plannerEmail || "").toLowerCase();
    const inboxId = req.body?.inboxId;
    const ue = (req.body?.userEmail || "").toLowerCase();

    if (!pe || !inboxId || !ue) {
      return res.status(400).json({ error: "Missing plannerEmail, inboxId, or userEmail" });
    }

    // Fetch bundle
    const { data: bundle, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select("id, planner_email, title, start_date, timezone, archived_at")
      .eq("id", inboxId)
      .ilike("planner_email", pe)
      .single();

    if (bErr || !bundle) return res.status(404).json({ error: "Bundle not found" });
    if (bundle.archived_at) return res.status(400).json({ error: "Bundle is archived" });

    const now = new Date().toISOString();

    // Ensure connection exists (so /api/users lists this user)
    const { error: connErr } = await supabaseAdmin
      .from("user_connections")
      .upsert(
        { planner_email: pe, user_email: ue, status: "connected", groups: [], updated_at: now },
        { onConflict: "planner_email,user_email" }
      );
    if (connErr) return res.status(500).json({ error: "Database error (connection)" });

    // Mark bundle assigned
    const { error: updErr } = await supabaseAdmin
      .from("inbox_bundles")
      .update({ assigned_user_email: ue, assigned_at: now })
      .eq("id", inboxId);
    if (updErr) return res.status(500).json({ error: "Database error (assign)" });

    // Load tasks
    const { data: rows, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("title, day_offset, time, duration_mins, notes")
      .eq("inbox_id", inboxId)
      .order("idx", { ascending: true });

    if (tErr) return res.status(500).json({ error: "Database error (tasks)" });

    const plan = { title: bundle.title, startDate: bundle.start_date, timezone: bundle.timezone };
    const tasks = (rows || []).map(r => ({
      title: r.title,
      dayOffset: r.day_offset || 0,
      time: r.time || null,
      durationMins: r.duration_mins || 60,
      notes: r.notes || ""
    }));

    res.json({ ok: true, userEmail: ue, bundleId: inboxId, plan, tasks });
  } catch (e) {
    console.error("POST /api/inbox/assign error", e);
    res.status(500).json({ error: "Server error" });
  }
}
