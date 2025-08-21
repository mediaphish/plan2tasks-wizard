// api/users/assign-group.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, userEmail, groupId } = req.body || {};
  if (!plannerEmail || !userEmail) return res.status(400).json({ error: "Missing fields" });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("user_connections")
    .update({ group_id: groupId || null })
    .eq("planner_email", plannerEmail)
    .eq("user_email", userEmail);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
