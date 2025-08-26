// api/history_list.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  try {
    const { plannerEmail, userEmail, status = "active", q = "" } = req.query || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }

    let query = supabaseAdmin
      .from("history_plans")
      .select("id,title,start_date,items_count,mode,pushed_at,archived_at")
      .eq("planner_email", plannerEmail)
      .eq("user_email", userEmail);

    if (status === "archived") query = query.not("archived_at", "is", null);
    else query = query.is("archived_at", null);

    if (q) query = query.ilike("title", `%${q}%`);
    query = query.order(status === "archived" ? "archived_at" : "pushed_at", { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    res.json({
      items: (data || []).map((r) => ({
        id: r.id,
        title: r.title,
        start_date: r.start_date,
        items_count: r.items_count,
        mode: r.mode,
        pushed_at: r.pushed_at,
        archived: !!r.archived_at,
      })),
    });
  } catch (e) {
    console.error("history_list error", e);
    res.status(500).json({ error: e.message || "Server error" });
  }
}
