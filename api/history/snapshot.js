// api/history/snapshot.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, userEmail, plan, tasks, mode, listTitle } = req.body || {};
    if (!plannerEmail || !userEmail || !plan || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    const row = {
      planner_email: plannerEmail.toLowerCase(),
      user_email: userEmail.toLowerCase(),
      title: plan.title,
      start_date: plan.startDate,
      timezone: plan.timezone,
      list_title: listTitle || plan.title,
      mode: mode === "replace" ? "replace" : "append",
      items_count: tasks.length
    };
    const { data: inserted, error: pErr } = await supabaseAdmin
      .from("plans")
      .insert(row)
      .select("id")
      .single();
    if (pErr) throw pErr;

    const planId = inserted.id;
    const rows = tasks.map(t => ({
      plan_id: planId,
      title: t.title,
      day_offset: t.dayOffset || 0,
      time: t.time || null,
      duration_mins: t.durationMins || 60,
      notes: t.notes || null
    }));
    const { error: tErr } = await supabaseAdmin.from("plan_tasks").insert(rows);
    if (tErr) throw tErr;

    res.json({ ok: true, planId });
  } catch (e) {
    console.error("POST /api/history/snapshot", e);
    res.status(500).json({ error: "Server error" });
  }
}
