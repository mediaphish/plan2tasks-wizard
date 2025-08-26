// api/history/restore.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, planId } = req.body || {};
    if (!plannerEmail || !planId) return res.status(400).json({ error: "Missing plannerEmail or planId" });

    const { data: plan, error: pErr } = await supabaseAdmin
      .from("history_plans")
      .select("*")
      .eq("planner_email", plannerEmail)
      .eq("id", planId)
      .single();
    if (pErr) throw pErr;

    const { data: items, error: iErr } = await supabaseAdmin
      .from("history_items")
      .select("title,day_offset,time,duration_mins,notes")
      .eq("plan_id", planId)
      .order("day_offset", { ascending: true });
    if (iErr) throw iErr;

    const planOut = {
      title: plan.title,
      startDate: plan.start_date,
      timezone: plan.timezone,
    };
    const tasksOut = (items || []).map((r) => ({
      title: r.title,
      dayOffset: r.day_offset,
      time: r.time || undefined,
      durationMins: r.duration_mins || undefined,
      notes: r.notes || undefined,
    }));

    return res.json({ ok: true, plan: planOut, tasks: tasksOut, mode: plan.mode });
  } catch (e) {
    console.error("history/restore error", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
