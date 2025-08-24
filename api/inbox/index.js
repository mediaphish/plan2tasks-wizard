// api/inbox/index.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function statusWhere(qs, plannerEmail) {
  const status = (qs.get("status") || "new").toLowerCase(); // new | assigned | archived
  const base = supabaseAdmin.from("inbox_bundles").select(`
    id, title, start_date, timezone, source, suggested_user,
    assigned_user_email, assigned_at, archived_at, deleted_at,
    created_at
  `).eq("planner_email", plannerEmail.toLowerCase()).is("deleted_at", null);

  if (status === "archived") return base.not("archived_at", "is", null);
  if (status === "assigned") return base.not("assigned_at", "is", null).is("archived_at", null);
  return base.is("assigned_at", null).is("archived_at", null); // new
}

export default async function handler(req, res) {
  try {
    const fullUrl = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(fullUrl);
    const plannerEmail = url.searchParams.get("plannerEmail") || "";
    if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

    // list with status
    const q = statusWhere(url.searchParams, plannerEmail).order("created_at", { ascending: false });
    const { data, error } = await q;
    if (error) throw error;

    // items count per bundle
    const ids = (data || []).map(b => b.id);
    let counts = {};
    if (ids.length) {
      const { data: rows, error: cErr } = await supabaseAdmin
        .from("inbox_tasks")
        .select("bundle_id, count:id", { count: "exact" })
        .in("bundle_id", ids);
      if (!cErr && rows) {
        rows.forEach(r => {
          counts[r.bundle_id] = (counts[r.bundle_id] || 0) + 1;
        });
      }
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
    res.json({ bundles });
  } catch (e) {
    console.error("GET /api/inbox error", e);
    res.status(500).json({ error: "Server error" });
  }
}
