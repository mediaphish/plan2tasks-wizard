// api/prefs/set.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { plannerEmail, prefs } = req.body || {};
    if (!plannerEmail || !prefs) return res.status(400).json({ error: "Missing plannerEmail or prefs" });

    const row = {
      planner_email: String(plannerEmail).toLowerCase(),
      default_view: prefs.default_view === "plan" ? "plan" : "users",
      auto_archive_after_assign: !!prefs.auto_archive_after_assign,
      default_timezone: prefs.default_timezone || "America/Chicago",
      default_push_mode: prefs.default_push_mode === "replace" ? "replace" : "append",
      show_inbox_badge: prefs.show_inbox_badge !== false,
      open_drawer_on_import: !!prefs.open_drawer_on_import,
    };

    const { data, error } = await supabaseAdmin
      .from("planner_prefs")
      .upsert(row, { onConflict: "planner_email" })
      .select("*")
      .single();

    if (error) throw error;
    res.json({ ok: true, prefs: data });
  } catch (e) {
    console.error("POST /api/prefs/set", e);
    res.status(500).json({ error: "Server error" });
  }
}
