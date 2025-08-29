// /api/history/snapshot.js
// Save a pushed plan into history_plans + history_items using Supabase.
// Improvements:
//  - Normalize time to HH:MM:SS (add seconds) to satisfy strict Postgres "time" columns.
//  - Batch insert items to avoid payload limits.
//  - Verbose error details.
//  - GET debug mode: dry-run by default; optional one-item test insert.
//
// GET debug examples (CLICKABLE IN BROWSER):
//   Dry-run (no writes): /api/history/snapshot?debug=1&plannerEmail=...&userEmail=...&listTitle=Test&startDate=2025-08-28
//   One test insert (writes 1 plan + 1 item): add &insertOne=1
//
// Notes: No schema changes. Uses existing columns only.
//
// Expected tables/columns used:
//   history_plans: id (uuid), planner_email, user_email, title, start_date, items_count, mode, pushed_at, archived_at
//   history_items: plan_id (uuid), title, day_offset, time, duration_mins, notes

import { supabaseAdmin } from "../../lib/supabase-admin.js";

const BATCH_SIZE = 200;

function norm(v) { return (v ?? "").toString().trim(); }
function toLowerEmail(v){ return norm(v).toLowerCase(); }
function isFiniteNum(n){ return Number.isFinite(n); }

/** Accepts "HH:MM" or "HH:MM:SS" or empty; anything else -> null. Always returns "HH:MM:SS". */
function sanitizeTime(v){
  if (!v) return null;
  const s = String(v).trim();
  // Accept 24h "HH:MM" or "HH:MM:SS"
  let m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (m) return `${m[1]}:${m[2]}:00`;
  m = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(s);
  if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  return null;
}

async function insertPlanAndItems({ plannerEmail, userEmail, listTitle, startDate, mode, items }) {
  const planner = toLowerEmail(plannerEmail);
  const user = toLowerEmail(userEmail);
  const title = norm(listTitle);
  const sDate = norm(startDate);
  const pushMode = norm(mode) || "append";

  if (!planner || !user || !title || !sDate) {
    return { ok:false, status:400, error:"Missing plannerEmail, userEmail, listTitle, or startDate" };
  }

  const pushedAt = new Date().toISOString();

  // 1) Insert plan
  const planInsert = await supabaseAdmin
    .from("history_plans")
    .insert({
      planner_email: planner,
      user_email: user,
      title,
      start_date: sDate,
      items_count: Array.isArray(items) ? items.length : 0,
      mode: pushMode,
      pushed_at: pushedAt,
      // archived_at left NULL => active
    })
    .select("id")
    .single();

  if (planInsert.error) {
    return {
      ok:false,
      status:500,
      error: planInsert.error.message || "Plan insert failed",
      detail: planInsert.error.details || null,
      hint: planInsert.error.hint || null
    };
  }

  const planId = planInsert.data?.id;
  if (!planId) {
    return { ok:false, status:500, error:"Plan inserted without ID" };
  }

  // 2) Insert items in batches
  const source = Array.isArray(items) ? items : [];
  let insertedCount = 0;

  if (source.length > 0) {
    const rows = source.map((it) => {
      const title = norm(it.title);
      const dayOffset = isFiniteNum(Number(it.dayOffset)) ? Number(it.dayOffset) : 0;
      const time = sanitizeTime(it.time); // null if invalid
      const duration = (it.durationMins === null || it.durationMins === undefined)
        ? null
        : (isFiniteNum(Number(it.durationMins)) ? Number(it.durationMins) : null);
      const notes = it.notes != null ? String(it.notes) : null;

      return {
        plan_id: planId,
        title,
        day_offset: dayOffset,
        time,               // "HH:MM:SS" or null
        duration_mins: duration, // null OK if column exists
        notes,              // null OK if column exists
      };
    });

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      let ins = await supabaseAdmin.from("history_items").insert(chunk);

      // If the insert fails due to a column mismatch, try narrower sets
      if (ins.error && /column .* does not exist/i.test(ins.error.message || "")) {
        // Try without duration_mins first
        const noDur = chunk.map(({ plan_id, title, day_offset, time, notes }) => ({
          plan_id, title, day_offset, time, notes
        }));
        ins = await supabaseAdmin.from("history_items").insert(noDur);

        if (ins.error && /column .* does not exist/i.test(ins.error.message || "")) {
          // Try minimal guaranteed columns only
          const minimal = chunk.map(({ plan_id, title, day_offset, time }) => ({
            plan_id, title, day_offset, time
          }));
          ins = await supabaseAdmin.from("history_items").insert(minimal);
        }
      }

      if (ins.error) {
        return {
          ok:false,
          status:500,
          error: ins.error.message || "Items insert failed",
          detail: ins.error.details || null,
          hint: ins.error.hint || null,
          planId,
          inserted: insertedCount
        };
      }

      insertedCount += chunk.length;
    }
  }

  return { ok:true, status:200, planId, items: insertedCount };
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET" && String(req.query?.debug || "") === "1") {
      // Debug mode (dry-run by default)
      const plannerEmail = req.query.plannerEmail || "";
      const userEmail = req.query.userEmail || "";
      const listTitle = req.query.listTitle || "DEBUG Plan";
      const startDate = req.query.startDate || new Date().toISOString().slice(0,10);
      const insertOne = String(req.query.insertOne || "") === "1";

      const sampleItems = [
        { title:"Debug item", dayOffset:0, time:"12:00", durationMins:30, notes:"dbg" }
      ];

      if (!insertOne) {
        // Dry-run: just show what would be inserted and the normalized time
        return res.status(200).json({
          ok:true,
          dryRun:true,
          normalized: { time: sanitizeTime("12:00") }, // should be "12:00:00"
          wouldInsert: {
            plannerEmail, userEmail, listTitle, startDate,
            items: sampleItems
          }
        });
      }

      // Perform a single-item insert to expose the real error (if any)
      const out = await insertPlanAndItems({
        plannerEmail,
        userEmail,
        listTitle,
        startDate,
        mode: "append",
        items: sampleItems
      });
      return res.status(out.status || (out.ok ? 200 : 500)).json(out);
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, GET");
      return res.status(405).json({ ok:false, error: "Method Not Allowed" });
    }

    const {
      plannerEmail,
      userEmail,
      listTitle,
      startDate,
      mode,
      items = [],
    } = req.body || {};

    const out = await insertPlanAndItems({
      plannerEmail, userEmail, listTitle, startDate, mode, items
    });

    return res.status(out.status || (out.ok ? 200 : 500)).json(out);

  } catch (e) {
    console.error("history/snapshot top-level:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
