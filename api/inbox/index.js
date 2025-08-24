// api/inbox/index.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);

    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase();
    const status = (url.searchParams.get("status") || "new").toLowerCase(); // new|assigned|archived
    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || "25")));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

    let sel = supabaseAdmin
      .from("inbox_bundles")
      .select(
        "id, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_at, archived_at, deleted_at, created_at",
        { count: "exact" }
      )
      .eq("planner_email", plannerEmail)
      .is("deleted_at", null);

    if (status === "archived") sel = sel.not("archived_at", "is", null);
    else if (status === "assigned") sel = sel.not("assigned_at", "is", null).is("archived_at", null);
    else sel = sel.is("assigned_at", null).is("archived_at", null);

    if (q) sel = sel.ilike("title", `%${q}%`);

    sel = sel.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await sel;
    if (error) throw error;

    const ids = (data || []).map(b => b.id);
    let counts = {};
    if (ids.length) {
      const { data: rows, error: cErr } = await supabaseAdmin
        .from("inbox_tasks")
        .select("bundle_id")
        .in("bundle_id", ids);
      if (!cErr && rows) rows.forEach(r => { counts[r.bundle_id] = (counts[r.bundle_id] || 0) + 1; });
    }

    const bundles = (data || []).map(b => ({
      id: b.id,
      title: b.title,
      start_date: b.start_date,
      timezone: b.timezone,
      source: b.source,
      suggested_user: b.suggested_user,
      assigned_user: b.assigned_user_email || null,
      assigned_at: b.assigned_at || null,
      archived_at: b.archived_at || null,
      count: counts[b.id] || 0,
      created_at: b.created_at
    }));

    res.json({ bundles, total: count || 0, page, pageSize });
  } catch (e) {
    console.error("GET /api/inbox error", e);
    res.status(500).json({ error: "Server error" });
  }
}
