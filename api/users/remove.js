// /api/users/remove.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  try {
    const { plannerEmail, userEmail } = req.body || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
    }

    // Require archived before soft delete (safety)
    const { data: row, error: selErr } = await supabaseAdmin
      .from("user_connections")
      .select("status")
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail)
      .maybeSingle();
    if (selErr && selErr.code !== "PGRST116") throw selErr;

    if (!row) return res.json({ ok: true, deleted: false, reason: "not_found" });

    if ((row.status || "").toLowerCase() !== "archived") {
      return res.status(400).json({ ok: false, error: "Can only delete (soft) archived users" });
    }

    const { error: updErr } = await supabaseAdmin
      .from("user_connections")
      .update({ status: "deleted" })
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail);
    if (updErr) throw updErr;

    return res.json({ ok: true, deleted: true, status: "deleted" });
  } catch (e) {
    console.error("users/remove error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
