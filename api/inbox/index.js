// api/inbox/index.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "GET only" });
    return;
  }

  const plannerEmailRaw = (req.query.plannerEmail || "").trim();
  if (!plannerEmailRaw) {
    res.status(400).json({ error: "Missing plannerEmail" });
    return;
  }

  try {
    // Case-insensitive match so 'Bart@Example' and 'bart@example' are the same.
    const { data: bundles, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select("id, title, start_date, timezone, source, suggested_user, created_at, planner_email")
      .ilike("planner_email", plannerEmailRaw) // case-insensitive equality
      .order("created_at", { ascending: false });

    if (bErr) throw bErr;

    if (!bundles || bundles.length === 0) {
      res.json({ bundles: [] });
      return;
    }

    const bundleIds = bundles.map(b => b.id);

    const { data: tasks, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("id, bundle_id")
      .in("bundle_id", bundleIds);

    if (tErr) throw tErr;

    const counts = {};
    for (const t of tasks || []) {
      counts[t.bundle_id] = (counts[t.bundle_id] || 0) + 1;
    }

    const out = bundles.map(b => ({
      id: b.id,
      title: b.title,
      start_date: b.start_date,
      timezone: b.timezone,
      source: b.source,
      suggested_user: b.suggested_user,
      count: counts[b.id] || 0,
      created_at: b.created_at
    }));

    res.json({ bundles: out });
  } catch (e) {
    console.error("GET /api/inbox error", e);
    res.status(500).json({ error: "Server error" });
  }
}
