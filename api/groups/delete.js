// api/groups/delete.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, groupId } = req.body || {};
  if (!plannerEmail || !groupId) return res.status(400).json({ error: "Missing plannerEmail or groupId" });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from("user_groups")
    .delete()
    .eq("planner_email", plannerEmail)
    .eq("id", groupId);

  if (error) return res.status(500).json({ error: error.message });
  // memberships auto-delete via ON DELETE CASCADE
  return res.status(200).json({ ok: true });
}
