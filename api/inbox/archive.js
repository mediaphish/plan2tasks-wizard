// api/inbox/archive.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, bundleIds } = req.body || {};
    if (!plannerEmail || !Array.isArray(bundleIds) || bundleIds.length === 0) {
      return res.status(400).json({ error: "Missing plannerEmail or bundleIds" });
    }
    const { error } = await supabaseAdmin
      .from("inbox_bundles")
      .update({ archived_at: new Date().toISOString() })
      .in("id", bundleIds)
      .eq("planner_email", plannerEmail.toLowerCase())
      .is("deleted_at", null);
    if (error) throw error;
    res.json({ ok: true, archived: bundleIds.length });
  } catch (e) {
    console.error("POST /api/inbox/archive", e);
    res.status(500).json({ error: "Server error" });
  }
}
