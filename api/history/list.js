// /api/history/list.js
// Compatible History list for both the current UI and legacy checks.
// - POST (app): { plannerEmail, userEmail, status?, page?, pageSize?, q? }
// - GET  (browser): ?plannerEmail=...&userEmail=...&status=active&page=1&pageSize=10&q=...
//
// Response includes BOTH:
//   rows: [{ id, title, startDate, mode, status, itemsCount, tasks: [{ title, dayOffset, time, durationMins, notes }] }]
//   items: [{ id, title, start_date, items_count, mode, pushed_at, archived }]
//
// No schema changes. No reliance on a non-existent "ord" column.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

function norm(v){ return (v || "").toString().trim(); }
function intOr(v,d){ const n = parseInt(v,10); return Number.isFinite(n) && n>0 ? n : d; }

function toRowsShape(plan, itemsForPlan) {
  const tasks = (itemsForPlan || []).map(it => ({
    title: it.title || "",
    dayOffset: Number(it.day_offset ?? 0),
    time: it.time || null,
    durationMins: (it.duration_mins === null || it.duration_mins === undefined) ? null : Number(it.duration_mins),
    notes: it.notes || null,
  }));
  const itemsCount = Number(plan.items_count ?? tasks.length ?? 0);
  return {
    id: plan.id,
    title: plan.title || "",
    startDate: plan.start_date || "",
    // timezone intentionally omitted to avoid schema dependency
    mode: plan.mode || null,
    status: plan.archived_at ? "archived" : "active",
    itemsCount,
    tasks,
  };
}

function toLegacyItemShape(plan) {
  return {
    id: plan.id,
    title: plan.title,
    start_date: plan.start_date,
    items_count: plan.items_count,
    mode: plan.mode,
    pushed_at: plan.pushed_at,
    archived: !!plan.archived_at,
  };
}

export default async function handler(req, res) {
  try {
    const method = (req.method || "GET").toUpperCase();

    let plannerEmail, userEmail, status, q, page, pageSize;
    if (method === "POST") {
      const b = req.body || {};
      plannerEmail = norm(b.plannerEmail);
      userEmail = norm(b.userEmail);
      status = b.status ? norm(b.status).toLowerCase() : "active";
      q = b.q ? norm(b.q) : "";
      page = intOr(b.page, 1);
      pageSize = intOr(b.pageSize, 10);
    } else if (method === "GET") {
      const g = req.query || {};
      plannerEmail = norm(g.plannerEmail);
      userEmail = norm(g.userEmail);
      status = g.status ? norm(g.status).toLowerCase() : "active";
      q = g.q ? norm(g.q) : "";
      page = intOr(g.page, 1);
      pageSize = intOr(g.pageSize, 10);
    } else {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok:false, error: "Method Not Allowed" });
    }

    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok:false, error: "Missing plannerEmail or userEmail" });
    }

    // Build plans query
    let plansQuery = supabaseAdmin
      .from("history_plans")
      .select("id,title,start_date,items_count,mode,pushed_at,archived_at", { count: "exact" })
      .eq("planner_email", plannerEmail)
      .eq("user_email", userEmail);

    if (status === "archived") {
      plansQuery = plansQuery.not("archived_at", "is", null);
    } else if (status === "active") {
      plansQuery = plansQuery.is("archived_at", null);
    } // else: both

    if (q) plansQuery = plansQuery.ilike("title", `%${q}%`);

    // Order archived vs active; then start_date desc; then id desc
    if (status === "archived") {
      plansQuery = plansQuery.order("archived_at", { ascending: false, nullsFirst: false });
    } else {
      plansQuery = plansQuery.order("pushed_at", { ascending: false, nullsFirst: false });
    }
    plansQuery = plansQuery.order("start_date", { ascending: false }).order("id", { ascending: false });

    // Pagination
    const from = (page - 1) * pageSize;
    const to = from + (pageSize - 1);
    plansQuery = plansQuery.range(from, to);

    const { data: plans, error: plansErr, count: total } = await plansQuery;
    if (plansErr) throw plansErr;

    if (!plans || plans.length === 0) {
      return res.status(200).json({ ok:true, rows: [], items: [], total: total || 0, page, pageSize });
    }

    // Fetch items for these plans (order by id as stable insert order)
    const planIds = plans.map(p => p.id);
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from("history_items")
      .select("plan_id,id,title,day_offset,time,duration_mins,notes")
      .in("plan_id", planIds)
      .order("plan_id", { ascending: true })
      .order("id", { ascending: true });

    if (itemsErr) throw itemsErr;

    // Group items by plan_id
    const byPlan = new Map();
    for (const pid of planIds) byPlan.set(pid, []);
    for (const it of (items || [])) {
      if (!byPlan.has(it.plan_id)) byPlan.set(it.plan_id, []);
      byPlan.get(it.plan_id).push(it);
    }

    const rows = plans.map(p => toRowsShape(p, byPlan.get(p.id) || []));
    const legacyItems = plans.map(p => toLegacyItemShape(p));

    return res.status(200).json({ ok:true, rows, items: legacyItems, total: total || rows.length, page, pageSize });
  } catch (e) {
    console.error("history/list error:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
