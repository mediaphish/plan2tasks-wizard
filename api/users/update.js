// api/users/update.js
// POST { plannerEmail, userEmail, groups: [] }
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "POST only" });
      return;
    }
    const { plannerEmail, userEmail, groups } = req.body || {};
    if (!plannerEmail || !userEmail || !Array.isArray(groups)) {
      res.status(400).json({ error: "Missing plannerEmail, userEmail, or groups[]" });
      return;
    }

    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) {
      res.status(500).json({ error: "Server misconfigured (missing Supabase envs)" });
      return;
    }

    const supabase = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // expects: table "users" with columns planner_email, email, groups (jsonb)
    const { data, error } = await supabase
      .from("users")
      .upsert(
        { planner_email: plannerEmail, email: userEmail, groups },
        { onConflict: "planner_email,email" }
      )
      .select("*")
      .single();

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ ok: true, user: data });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
