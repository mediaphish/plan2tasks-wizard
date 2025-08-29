// /api/history/snapshot.js
// Purpose: Save a pushed plan into history_plans + history_items using Supabase.
// No schema changes. Uses your existing columns: title, start_date, items_count, mode, pushed_at.
// Note: We DO NOT touch "timezone" here (keeps it safe even if that column doesn't exist).

import { supabaseAdmin } from "../../lib/supabase-admin.js";

function norm(v){ return (v ?? "").toString().trim(); }

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok:false, error: "POST only" });
  }

  try {
    const {
      plannerEmail,
      userEmail,
      listTitle,
      startDate,
      mode,           // "append" | "replace"
      items = [],     // [{ title, dayOffset, time, durationMins, notes }]
    } = req.body || {};

    const planner = norm(plannerEmail).toLowerCase();
    const user = norm(userEmail).toLowerCase();
    const title = norm(listTitle);
    const sDate = norm(startDate);
    const pushMode = norm(mode) || "append";

    if (!planner || !user || !title || !sDate) {
      return res.status(400).json({ ok:false, error: "Missing plannerEmail, userEmail, listTitle, or startDate" });
    }

    const pushedAt = new Date().toISOString();

    // Insert plan row
    const { data: planRow, error: planErr } = await supabaseAdmin
      .from("history_plans")
      .insert({
        planner_email: planner,
        user_email: user,
        title,
        start_date: sDate,
        items_count: Array.isArray(items) ? items.length : 0,
        mode: pushMode,
        pushed_at: pushedAt,
        // archived_at left null (active)
      })
      .select("id")
      .single();

    if (planErr) {
      console.error("history/snapshot plan insert error:", planErr);
      return res.status(500).json({ ok:false, error: planErr.message || "Plan insert failed" });
    }

    const planId = planRow?.id;

    // Insert item rows (no 'ord' column assumed)
    const rows = (Array.isArray(items) ? items : []).map((it) => ({
      plan_id: planId,
      title: (it.title ?? "").toString(),
      day_offset: Number.isFinite(it.dayOffset) ? it.dayOffset : 0,
      time: it.time ? String(it.time) : null,
      duration_mins:
        it.durationMins === null || it.durationMins === undefined
          ? null
          : Number(it.durationMins),
      notes: it.notes ? String(it.notes) : null,
    }));

    if (rows.length > 0) {
      const { error: itemsErr } = await supabaseAdmin
        .from("history_items")
        .insert(rows);
      if (itemsErr) {
        console.error("history/snapshot items insert error:", itemsErr);
        return res.status(500).json({ ok:false, error: itemsErr.message || "Items insert failed" });
      }
    }

    return res.status(200).json({ ok:true, planId, items: rows.length });
  } catch (e) {
    console.error("history/snapshot top-level:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
