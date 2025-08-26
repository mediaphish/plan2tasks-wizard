// api/history_debug_create.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const plannerEmail = "bartpaden@gmail.com";
    const userEmail = "bart@midwesternbuilt.com";
    const title = "Debug Sample Plan";
    const start_date = "2025-08-24";
    const timezone = "America/Chicago";
    const mode = "append";

    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("history_plans")
      .insert({ planner_email: plannerEmail, user_email: userEmail, title, start_date, timezone, mode, items_count: 2 })
      .select()
      .single();
    if (planErr) throw planErr;

    const items = [
      { plan_id: planRow.id, title: "DEBUG – Task A", day_offset: 0, time: "10:00", duration_mins: 45, notes: "sample" },
      { plan_id: planRow.id, title: "DEBUG – Task B", day_offset: 1, time: "14:00", duration_mins: 30, notes: "sample" },
    ];
    const { error: itemsErr } = await supabaseAdmin.from("history_items").insert(items);
    if (itemsErr) throw itemsErr;

    res.json({ ok: true, inserted: { planId: planRow.id, items: items.length } });
  } catch (e) {
    console.error("history_debug_create error", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
