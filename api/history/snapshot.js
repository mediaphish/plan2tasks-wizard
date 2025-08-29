// /api/history/snapshot.js
// Snapshot pushed plans into history_plans + history_items via Supabase.
//
// What this version does:
// - FIX: writes `timezone` to history_plans (NOT NULL in your DB).
// - Accepts timezone from request; defaults to "America/Chicago" if absent.
// - Detects optional item columns (time, notes, duration_mins) and only inserts those.
// - Normalizes time to "HH:MM:SS".
// - Batch inserts items.
// - GET debug helpers you can click in a browser.
//
// GET debug (open these in your browser):
//  1) Check available item columns (no writes):
//     /api/history/snapshot?debug=columns
//  2) Dry run shape (no writes):
//     /api/history/snapshot?debug=1&plannerEmail=bartpaden@gmail.com&userEmail=bart@midwesternbuilt.com&listTitle=Test&startDate=2025-08-28
//  3) Single test insert (writes 1 plan + 1 item):
//     /api/history/snapshot?debug=1&insertOne=1&plannerEmail=bartpaden@gmail.com&userEmail=bart@midwesternbuilt.com&listTitle=Test&startDate=2025-08-28
//
// No schema changes. UI untouched.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

const BATCH_SIZE = 200;

function norm(v) { return (v ?? "").toString().trim(); }
function toLowerEmail(v){ return norm(v).toLowerCase(); }
function isFiniteNum(n){ return Number.isFinite(n); }

/** Accept "HH:MM" or "HH:MM:SS" → return "HH:MM:SS"; anything else → null */
function sanitizeTime(v){
  if (!v) return null;
  const s = String(v).trim();
  let m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  if (m) return `${m[1]}:${m[2]}:00`;
  m = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(s);
  if (m) return `${m[1]}:${m[2]}:${m[3]}`;
  return null;
}

async function columnExists(col){
  // Try selecting the column; if it errors with "does not exist", treat as missing.
  const { error } = await supabaseAdmin
    .from("history_items")
    .select(`id, ${col}`)
    .limit(1);
  if (!error) return true;
  const msg = String(error.message || "");
  return !/column .* does not exist/i.test(msg);
}

async function resolveItemColumns(){
  // Always present: plan_id, title, day_offset
  // Optional we detect: time, notes, duration_mins
  const [hasTime, hasNotes, hasDuration] = await Promise.all([
    columnExists("time"),
    columnExists("notes"),
    columnExists("duration_mins"),
  ]);
  return { hasTime, hasNotes, hasDuration };
}

async function insertPlan({ plannerEmail, userEmail, listTitle, startDate, timezone, mode, itemsLen }){
  const pushedAt = new Date().toISOString();
  return await supabaseAdmin
    .from("history_plans")
    .insert({
      planner_email: plannerEmail,
      user_email: userEmail,
      title: listTitle,
      start_date: startDate,
      timezone: timezone || "America/Chicago", // ✅ ensure NOT NULL
      items_count: itemsLen,
      mode: mode || "append",
      pushed_at: pushedAt,
      // archived_at null => active
    })
    .select("id")
    .single();
}

async function insertItems(planId, items, cols){
  // Build rows with only available columns.
  const rows = items.map((it) => {
    const base = {
      plan_id: planId,
      title: norm(it.title),
      day_offset: isFiniteNum(Number(it.dayOffset)) ? Number(it.dayOffset) : 0,
    };
    if (cols.hasTime) base.time = sanitizeTime(it.time);
    if (cols.hasDuration) {
      base.duration_mins =
        it.durationMins === null || it.durationMins === undefined
          ? null
          : (isFiniteNum(Number(it.durationMins)) ? Number(it.durationMins) : null);
    }
    if (cols.hasNotes) base.notes = it.notes != null ? String(it.notes) : null;
    return base;
  });

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const ins = await supabaseAdmin.from("history_items").insert(chunk);
    if (ins.error) {
      return {
        ok:false,
        error: ins.error.message || "Items insert failed",
        detail: ins.error.details || null,
        hint: ins.error.hint || null,
        inserted,
      };
    }
    inserted += chunk.length;
  }
  return { ok:true, inserted };
}

async function doSnapshot(body){
  const {
    plannerEmail,
    userEmail,
    listTitle,
    startDate,
    timezone,   // ✅ new
    mode,
    items = [],
  } = body || {};

  const planner = toLowerEmail(plannerEmail);
  const user = toLowerEmail(userEmail);
  const title = norm(listTitle);
  const sDate = norm(startDate);
  const tz = norm(timezone) || "America/Chicago"; // ✅ default if missing

  if (!planner || !user || !title || !sDate) {
    return { ok:false, status:400, error:"Missing plannerEmail, userEmail, listTitle, or startDate" };
  }

  // 0) Detect available item columns once
  const cols = await resolveItemColumns();

  // 1) Insert plan (now includes timezone)
  const planIns = await insertPlan({
    plannerEmail: planner,
    userEmail: user,
    listTitle: title,
    startDate: sDate,
    timezone: tz,           // ✅
    mode,
    itemsLen: Array.isArray(items) ? items.length : 0,
  });
  if (planIns.error) {
    return {
      ok:false,
      status:500,
      error: planIns.error.message || "Plan insert failed",
      detail: planIns.error.details || null,
      hint: planIns.error.hint || null,
      where: "plan_insert",
    };
  }
  const planId = planIns.data?.id;
  if (!planId) return { ok:false, status:500, error:"Plan inserted without ID", where:"plan_insert" };

  // 2) Insert items
  const src = Array.isArray(items) ? items : [];
  if (src.length === 0) return { ok:true, status:200, planId, items:0, colsUsed: cols };

  const ins = await insertItems(planId, src, cols);
  if (!ins.ok) {
    return {
      ok:false,
      status:500,
      error: ins.error,
      detail: ins.detail || null,
      hint: ins.hint || null,
      planId,
      inserted: ins.inserted,
      colsUsed: cols,
      where: "items_insert",
    };
  }

  return { ok:true, status:200, planId, items: ins.inserted, colsUsed: cols };
}

export default async function handler(req, res) {
  try {
    // -------- GET debug helpers --------
    if (req.method === "GET") {
      if (String(req.query?.debug || "") === "columns") {
        const cols = await resolveItemColumns();
        return res.status(200).json({ ok:true, columns: cols });
      }
      if (String(req.query?.debug || "") === "1") {
        const plannerEmail = req.query.plannerEmail || "";
        const userEmail = req.query.userEmail || "";
        const listTitle = req.query.listTitle || "DEBUG Plan";
        const startDate = req.query.startDate || new Date().toISOString().slice(0,10);
        const timezone = req.query.timezone || "America/Chicago"; // ✅ make debug insert pass NOT NULL
        const insertOne = String(req.query.insertOne || "") === "1";

        if (!insertOne) {
          const cols = await resolveItemColumns();
          return res.status(200).json({
            ok:true,
            dryRun:true,
            columns: cols,
            samplePlan: { plannerEmail, userEmail, listTitle, startDate, timezone },
            sampleItemShape: {
              title:"Debug item",
              dayOffset:0,
              time:"12:00:00",
              durationMins:30,
              notes:"dbg"
            }
          });
        }

        const out = await doSnapshot({
          plannerEmail, userEmail, listTitle, startDate, timezone, mode:"append",
          items: [{ title:"Debug item", dayOffset:0, time:"12:00", durationMins:30, notes:"dbg" }]
        });
        return res.status(out.status || (out.ok ? 200 : 500)).json(out);
      }

      res.setHeader("Allow", "GET, POST");
      return res.status(400).json({ ok:false, error:"Missing debug param. Use ?debug=columns or ?debug=1" });
    }

    // -------- POST from the app --------
    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ ok:false, error:"Method Not Allowed" });
    }

    const out = await doSnapshot(req.body || {});
    return res.status(out.status || (out.ok ? 200 : 500)).json(out);

  } catch (e) {
    console.error("history/snapshot top-level:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
