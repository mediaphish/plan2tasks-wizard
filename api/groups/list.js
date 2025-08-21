// api/groups/list.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const plannerEmail = req.query.plannerEmail;
  if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_groups")
    .select("id,name,created_at")
    .eq("planner_email", plannerEmail)
    .order("name", { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ groups: data || [] });
}
