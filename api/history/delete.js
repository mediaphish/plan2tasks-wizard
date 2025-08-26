// api/history/delete.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, planIds = [] } = req.body || {};
    if (!plannerEmail || !planIds.length) return res.status(400).json({ error: "Missing plannerEmail or planIds" });

    const { error } = await supabaseAdmin
      .from("history_plans")
      .delete()
      .in("id", planIds)
      .eq("planner_email", plannerEmail);

    if (error) throw error;
    return res.json({ ok: true, deleted: planIds.length });
  } catch (e) {
    console.error("history/delete error", e);
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
