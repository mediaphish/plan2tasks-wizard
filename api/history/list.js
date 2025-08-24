// api/history/list.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const plannerEmail = url.searchParams.get("plannerEmail") || "";
    const userEmail = url.searchParams.get("userEmail") || "";
    const q = (url.searchParams.get("q") || "").trim();
    const status = (url.searchParams.get("status") || "active").toLowerCase(); // active | archived
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = 50;
    const from = (page-1)*pageSize;
    const to = from + pageSize - 1;

    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
    }

    let sel = supabaseAdmin.from("plans")
      .select("id, title, start_date, timezone, list_title, mode, items_count, pushed_at, archived_at, deleted_at",
        { count: "exact" })
      .eq("planner_email", plannerEmail.toLowerCase())
      .eq("user_email", userEmail.toLowerCase())
      .is("deleted_at", null);

    if (status === "archived") sel = sel.not("archived_at", "is", null);
    else sel = sel.is("archived_at", null);

    if (q) sel = sel.ilike("title", `%${q}%`);

    sel = sel.order("pushed_at", { ascending: false }).range(from, to);

    const { data, error, count } = await sel;
    if (error) throw error;

    res.json({ items: data || [], total: count || 0, page, pageSize });
  } catch (e) {
    console.error("GET /api/history/list", e);
    res.status(500).json({ error: "Server error" });
  }
}
