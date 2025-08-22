// api/groups.js
export const config = { runtime: "nodejs" };

import { supabaseAdmin } from "../lib/supabase.js";

export default async function handler(req, res) {
  try {
    const op = (req.query.op || (req.body && req.body.op) || "").toString();

    if (req.method === "GET" && op === "list") {
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

    if (req.method === "POST" && op === "create") {
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

    if (req.method === "POST" && op === "delete") {
      const { plannerEmail, groupId } = req.body || {};
      if (!plannerEmail || !groupId) return res.status(400).json({ error: "Missing plannerEmail or groupId" });
      const sb = supabaseAdmin();
      const { error } = await sb
        .from("user_groups")
        .delete()
        .eq("planner_email", plannerEmail)
        .eq("id", groupId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Use ?op=list (GET) or ?op=create/delete (POST)" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
