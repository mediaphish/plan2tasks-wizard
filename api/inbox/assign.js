// api/inbox/assign.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { plannerEmail, inboxId, userEmail } = req.body || {};
    if (!plannerEmail || !inboxId || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail, inboxId, or userEmail" });
    }

    // Fetch bundle
    const { data: bundle, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select("id, planner_email, title, start_date, timezone")
      .eq("id", inboxId)
      .single();
    if (bErr) throw bErr;
    if (!bundle || String(bundle.planner_email).toLowerCase() !== String(plannerEmail).toLowerCase()) {
      return res.status(404).json({ error: "Bundle not found for this planner" });
    }

    // Fetch tasks
    const { data: rows, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("title, day_offset, time, duration_mins, notes")
      .eq("bundle_id", inboxId)
      .order("id", { ascending: true });
    if (tErr) throw tErr;

    // Stamp assigned metadata
    const { error: uErr } = await supabaseAdmin
      .from("inbox_bundles")
      .update({
        assigned_user_email: userEmail.toLowerCase(),
        assigned_at: new Date().toISOString()
      })
      .eq("id", inboxId)
      .eq("planner_email", plannerEmail.toLowerCase());
    if (uErr) throw uErr;

    const plan = {
      title: bundle.title,
      startDate: bundle.start_date,
      timezone: bundle.timezone || "America/Chicago",
    };
    const tasks = (rows || []).map(r => ({
      title: r.title,
      dayOffset: r.day_offset || 0,
      time: r.time || null,
      durationMins: r.duration_mins || 60,
      notes: r.notes || ""
    }));

    res.json({ ok: true, userEmail, bundleId: inboxId, plan, tasks });
  } catch (e) {
    console.error("POST /api/inbox/assign error", e);
    res.status(500).json({ error: "Server error" });
  }
}
