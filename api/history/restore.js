// api/history/restore.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, planId } = req.body || {};
    if (!plannerEmail || !planId) return res.status(400).json({ error: "Missing plannerEmail or planId" });

    const { data: planRow, error: pErr } = await supabaseAdmin
      .from("plans")
      .select("id, planner_email, user_email, title, start_date, timezone")
      .eq("id", planId)
      .eq("planner_email", plannerEmail.toLowerCase())
      .single();
    if (pErr) throw pErr;

    const { data: taskRows, error: tErr } = await supabaseAdmin
      .from("plan_tasks")
      .select("title, day_offset, time, duration_mins, notes")
      .eq("plan_id", planId)
      .order("id", { ascending: true });
    if (tErr) throw tErr;

    const plan = {
      title: planRow.title,
      startDate: planRow.start_date,
      timezone: planRow.timezone
    };
    const tasks = (taskRows || []).map(t => ({
      title: t.title, dayOffset: t.day_offset, time: t.time, durationMins: t.duration_mins, notes: t.notes || ""
    }));

    res.json({ ok: true, plan, tasks, userEmail: planRow.user_email });
  } catch (e) {
    console.error("POST /api/history/restore", e);
    res.status(500).json({ error: "Server error" });
  }
}
