// api/history/snapshot.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, userEmail, plan, tasks, mode, listTitle } = req.body || {};
    if (!plannerEmail || !userEmail || !plan || !Array.isArray(tasks)) {
      return res.status(400).json({ error: "Missing plannerEmail, userEmail, plan, tasks" });
    }
    const title = listTitle || plan.title || "Untitled";
    const start_date = plan.startDate;
    const timezone = plan.timezone || "America/Chicago";
    const items_count = tasks.length;
    const modeSafe = mode === "replace" ? "replace" : "append";

    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("history_plans")
      .insert({
        planner_email: plannerEmail,
        user_email: userEmail,
        title,
        start_date,
        timezone,
        mode: modeSafe,
        items_count,
      })
      .select()
      .single();
    if (planErr) throw planErr;

    if (items_count) {
      const rows = tasks.map((t) => ({
        plan_id: planRow.id,
        title: t.title,
        day_offset: Number(t.dayOffset || 0),
        time: t.time || null,
        duration_mins: t.durationMins || null,
        notes: t.notes || null,
      }));
      const { error: itemsErr } = await supabaseAdmin.from("history_items").insert(rows);
      if (itemsErr) throw itemsErr;
    }

    return res.json({ ok: true, planId: planRow.id });
  } catch (e) {
    console.error("history/snapshot error", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
