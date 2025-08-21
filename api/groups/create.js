// api/groups/create.js
import { supabaseAdmin } from "../../lib/supabase.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, name } = req.body || {};
  if (!plannerEmail || !name) return res.status(400).json({ error: "Missing plannerEmail or name" });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_groups")
    .insert({ planner_email: plannerEmail, name: String(name).trim() })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ group: data });
}
