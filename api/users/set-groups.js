// api/users/set-groups.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, userEmail, groupIds } = req.body || {};
  if (!plannerEmail || !userEmail || !Array.isArray(groupIds)) {
    return res.status(400).json({ error: "Missing plannerEmail, userEmail, or groupIds[]" });
  }

  const sb = supabaseAdmin();

  // existing memberships
  const { data: existing, error: e1 } = await sb
    .from("user_group_members")
    .select("group_id")
    .eq("planner_email", plannerEmail)
    .eq("user_email", userEmail);

  if (e1) return res.status(500).json({ error: e1.message });

  const have = new Set((existing || []).map(r => r.group_id));
  const want = new Set(groupIds);

  const toAdd = [...want].filter(id => !have.has(id));
  const toRemove = [...have].filter(id => !want.has(id));

  if (toAdd.length) {
    const rows = toAdd.map(id => ({ planner_email: plannerEmail, user_email: userEmail, group_id: id }));
    const { error: e2 } = await sb.from("user_group_members").insert(rows);
    if (e2) return res.status(500).json({ error: e2.message });
  }

  if (toRemove.length) {
    const { error: e3 } = await sb
      .from("user_group_members")
      .delete()
      .eq("planner_email", plannerEmail)
      .eq("user_email", userEmail)
      .in("group_id", toRemove);
    if (e3) return res.status(500).json({ error: e3.message });
  }

  return res.status(200).json({ ok: true });
}
