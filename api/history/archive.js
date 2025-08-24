// api/history/archive.js
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
      .update({ archived_at: new Date().toISOString() })
      .in("id", planIds)
      .eq("planner_email", plannerEmail.toLowerCase())
      .is("deleted_at", null);
    if (error) throw error;
    res.json({ ok: true, archived: planIds.length });
  } catch (e) {
    console.error("POST /api/history/archive", e);
    res.status(500).json({ error: "Server error" });
  }
}
