// /api/users/update.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  try {
    const { plannerEmail, userEmail, groups = [] } = req.body || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }

    // We store categories per (planner,user) pair on user_connections.groups
    // 1) Does a connection already exist?
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("user_connections")
      .select("planner_email,user_email")
      .eq("planner_email", plannerEmail)
      .eq("user_email", userEmail)
      .maybeSingle();

    if (selErr) return res.status(500).json({ error: selErr.message });

    if (existing) {
      const { error: upErr } = await supabaseAdmin
        .from("user_connections")
        .update({ groups, updated_at: new Date().toISOString() })
        .eq("planner_email", plannerEmail)
        .eq("user_email", userEmail);

      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ ok: true, mode: "updated" });
    }

    // If connection doesn’t exist, create a minimal row so categories can save
    const { error: insErr } = await supabaseAdmin.from("user_connections").insert([
      {
        planner_email: plannerEmail,
        user_email: userEmail,
        groups,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    if (insErr) return res.status(500).json({ error: insErr.message });

    return res.json({ ok: true, mode: "inserted" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
