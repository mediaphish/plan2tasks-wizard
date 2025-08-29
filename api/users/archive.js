// /api/users/archive.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function deriveRestoreStatus(row) {
  // When restoring, show "connected" if token present; else "pending"
  return row?.google_refresh_token ? "connected" : "pending";
}

export default async function handler(req, res) {
  // Small debug GET so you can confirm JSON in a browser:
  if (req.method === "GET") {
    if (String(req.query?.debug) === "1") {
      return res.status(200).json({ ok: true, route: "/api/users/archive", method: "GET" });
    }
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const { plannerEmail, userEmail, archived } = req.body || {};
    if (!plannerEmail || !userEmail || typeof archived !== "boolean") {
      return res.status(400).json({ ok: false, error: "Missing plannerEmail, userEmail, or archived" });
    }

    // Fetch existing connection (if any)
    const { data: row, error: selErr } = await supabaseAdmin
      .from("user_connections")
      .select("planner_email, user_email, status, google_refresh_token")
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail)
      .maybeSingle();
    if (selErr && selErr.code !== "PGRST116") throw selErr;

    if (!row) {
      // Create row directly in desired state
      const newStatus = archived ? "archived" : "pending";
      const { error: insErr } = await supabaseAdmin
        .from("user_connections")
        .insert([{ planner_email: plannerEmail, user_email: userEmail, status: newStatus, groups: [] }]);
      if (insErr) throw insErr;
      return res.json({ ok: true, status: newStatus, created: true });
    }

    const newStatus = archived ? "archived" : deriveRestoreStatus(row);
    const { error: updErr } = await supabaseAdmin
      .from("user_connections")
      .update({ status: newStatus })
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail);
    if (updErr) throw updErr;

    return res.json({ ok: true, status: newStatus, created: false });
  } catch (e) {
    console.error("users/archive error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
