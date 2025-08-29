// /api/users/archive.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  try {
    const { plannerEmail, userEmail, archived } = req.body || {};
    if (!plannerEmail || !userEmail || typeof archived !== "boolean") {
      return res
        .status(400)
        .json({ ok: false, error: "Missing plannerEmail, userEmail, or archived" });
    }

    // Find existing connection
    const { data: row, error: selErr } = await supabaseAdmin
      .from("user_connections")
      .select("planner_email, user_email, status, google_refresh_token")
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail)
      .maybeSingle();
    if (selErr && selErr.code !== "PGRST116") throw selErr;

    if (!row) {
      // If no row: create one immediately in the desired state
      const status = archived ? "archived" : "pending";
      const { error: insErr } = await supabaseAdmin
        .from("user_connections")
        .insert([
          { planner_email: plannerEmail, user_email: userEmail, status, groups: [] },
        ]);
      if (insErr) throw insErr;
      return res.json({ ok: true, status });
    }

    // Decide new status on restore
    let newStatus = "pending";
    if (archived) newStatus = "archived";
    else newStatus = row.google_refresh_token ? "connected" : "pending";

    const { error: updErr } = await supabaseAdmin
      .from("user_connections")
      .update({ status: newStatus })
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail);
    if (updErr) throw updErr;

    return res.json({ ok: true, status: newStatus });
  } catch (e) {
    console.error("users/archive error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
