// api/history/delete.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, planIds } = req.body || {};
    if (!plannerEmail || !Array.isArray(planIds) || planIds.length === 0) {
      return res.status(400).json({ error: "Missing plannerEmail or planIds" });
    }
    const { error } = await supabaseAdmin
      .from("plans")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", planIds)
      .eq("planner_email", plannerEmail.toLowerCase());
    if (error) throw error;
    res.json({ ok: true, deleted: planIds.length });
  } catch (e) {
    console.error("POST /api/history/delete", e);
    res.status(500).json({ error: "Server error" });
  }
}
