// api/prefs/get.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase();
    if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

    const { data, error } = await supabaseAdmin
      .from("planner_prefs")
      .select("*")
      .eq("planner_email", plannerEmail)
      .single();

    if (error && error.code !== "PGRST116") throw error; // not found is ok

    const prefs = data || {
      planner_email: plannerEmail,
      default_view: "users",
      auto_archive_after_assign: true,
      default_timezone: "America/Chicago",
      default_push_mode: "append",
      show_inbox_badge: true,
      open_drawer_on_import: false,
    };

    res.json({ prefs });
  } catch (e) {
    console.error("GET /api/prefs/get", e);
    res.status(500).json({ error: "Server error" });
  }
}
