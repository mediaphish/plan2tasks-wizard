// api/history.js
export const config = { runtime: "nodejs" };

import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { plannerEmail, userEmail, op, listId } = req.query || {};

      if (!plannerEmail) return res.status(400).json({ error: "plannerEmail required" });

      if (op === "items") {
        if (!listId) return res.status(400).json({ error: "listId required" });
        const { data: items, error } = await supabaseAdmin
          .from("task_items")
          .select("id,title,day_offset,time,duration_mins,notes,created_at")
          .eq("list_id", listId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        return res.json({ items: items || [] });
      }

      // default: list lists (optionally by userEmail)
      let q = supabaseAdmin
        .from("task_lists")
        .select("id,title,start_date,timezone,user_email,created_at")
        .eq("planner_email", plannerEmail)
        .order("created_at", { ascending: false })
        .limit(50);
      if (userEmail) q = q.eq("user_email", userEmail);

      const { data: lists, error } = await q;
      if (error) throw error;

      // count items per list (cheap aggregate)
      const ids = (lists || []).map(l => l.id);
      let counts = {};
      if (ids.length) {
        const { data: agg, error: e2 } = await supabaseAdmin
          .from("task_items")
          .select("list_id, count:id")
          .in("list_id", ids)
          .group("list_id");
        if (e2) throw e2;
        agg?.forEach(r => { counts[r.list_id] = r.count; });
      }
      return res.json({
        lists: (lists || []).map(l => ({ ...l, count: counts[l.id] || 0 }))
      });
    }

    if (req.method === "POST") {
      const { op } = req.query || {};
      const body = req.body || {};

      if (op === "delete-items") {
        const { listId, itemIds = [] } = body;
        if (!listId || !Array.isArray(itemIds) || itemIds.length === 0)
          return res.status(400).json({ error: "listId and itemIds[] required" });

        const { error } = await supabaseAdmin.from("task_items").delete().in("id", itemIds);
        if (error) throw error;
        return res.json({ ok: true, deleted: itemIds.length });
      }

      if (op === "delete-lists") {
        const { listIds = [] } = body;
        if (!Array.isArray(listIds) || listIds.length === 0)
          return res.status(400).json({ error: "listIds[] required" });

        const { error } = await supabaseAdmin.from("task_lists").delete().in("id", listIds);
        if (error) throw error;
        return res.json({ ok: true, deleted: listIds.length });
      }

      return res.status(400).json({ error: "Unknown op" });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("history error:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
