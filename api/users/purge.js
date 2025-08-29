// /api/users/purge.js
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

    // Must be currently deleted
    const { data: row, error: selErr } = await supabaseAdmin
      .from("user_connections")
      .select("status")
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail)
      .maybeSingle();
    if (selErr && selErr.code !== "PGRST116") throw selErr;

    if (!row) {
      // already gone (idempotent)
      return res.json({ ok: true, purged: false, reason: "not_found" });
    }
    if ((row.status || "").toLowerCase() !== "deleted") {
      return res.status(400).json({ ok: false, error: "Can only purge users in 'deleted' state" });
    }

    // Hard delete the connection row
    const { error: delErr } = await supabaseAdmin
      .from("user_connections")
      .delete()
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail);
    if (delErr) throw delErr;

    // NOTE: We do not delete invites or history_* to preserve history/audit.
    return res.json({ ok: true, purged: true });
  } catch (e) {
    console.error("users/purge error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
