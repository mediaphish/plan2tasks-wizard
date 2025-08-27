// /api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { plannerEmail } = req.query;
      if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

      // List users for this planner from user_connections
      const { data, error } = await supabaseAdmin
        .from("user_connections")
        .select("user_email, groups, google_refresh_token, status")
        .eq("planner_email", plannerEmail);
      if (error) return res.status(500).json({ error: error.message });

      const users = (data || []).map((r) => ({
        email: r.user_email,
        groups: r.groups || [],
        status: r.status || (r.google_refresh_token ? "connected" : "not_connected"),
      }));
      return res.json({ users });
    }

    if (req.method === "POST") {
      // Update categories/groups
      const { plannerEmail, userEmail, groups = [] } = req.body || {};
      if (!plannerEmail || !userEmail)
        return res.status(400).json({ error: "Missing plannerEmail or userEmail" });

      // Ensure row exists: upsert by composite key
      const now = new Date().toISOString();
      const { error: upErr } = await supabaseAdmin
        .from("user_connections")
        .upsert(
          {
            planner_email: plannerEmail,
            user_email: userEmail,
            groups,
            updated_at: now,
          },
          { onConflict: "planner_email,user_email" }
        );
      if (upErr) return res.status(500).json({ error: upErr.message });

      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
