// api/groups/delete.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, groupId } = req.body || {};
  if (!plannerEmail || !groupId) return res.status(400).json({ error: "Missing plannerEmail or groupId" });

  const sb = supabaseAdmin();
  // Unassign users from this group first
  const { error: e1 } = await sb
    .from("user_connections")
    .update({ group_id: null })
    .eq("planner_email", plannerEmail)
    .eq("group_id", groupId);
  if (e1) return res.status(500).json({ error: e1.message });

  const { error } = await sb
    .from("user_groups")
    .delete()
    .eq("planner_email", plannerEmail)
    .eq("id", groupId);

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
