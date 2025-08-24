// api/connections/list.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    const url = new URL(`https://${req.headers.host}${req.url}`);
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase().trim();
    if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

    const { data, error } = await supabaseAdmin
      .from("user_connections")
      .select("*")
      .eq("planner_email", plannerEmail)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    res.json({ ok: true, rows: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error" });
  }
}
