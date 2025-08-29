// /api/invite/remove.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  // Simple JSON probe in a browser
  if (req.method === "GET") {
    if (String(req.query?.debug) === "1") {
      return res.status(200).json({ ok: true, route: "/api/invite/remove", method: "GET" });
    }
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }

  try {
    const { plannerEmail, userEmail } = req.body || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
    }

    // Delete invite row(s) case-insensitively for this planner + user
    const { data, error } = await supabaseAdmin
      .from("invites")
      .delete()
      .ilike("planner_email", plannerEmail)
      .ilike("user_email", userEmail)
      .select("id");

    if (error) throw error;

    return res.json({ ok: true, deleted: (data || []).length });
  } catch (e) {
    console.error("invite/remove error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
