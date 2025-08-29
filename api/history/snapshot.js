// /api/history/snapshot.js
// Purpose: Save a pushed plan into history_plans + history_items using Supabase.
// Improvements:
//  - Batch insert items to avoid payload/limits.
//  - Clean values and only use known columns.
//  - Return precise errors for easier debugging.
// No DB schema changes.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

const BATCH_SIZE = 200; // safe batch size for recurring inserts

function norm(v) { return (v ?? "").toString().trim(); }
function toLowerEmail(v){ return norm(v).toLowerCase(); }
function isFiniteNum(n){ return Number.isFinite(n); }

/** Accepts "HH:MM" or empty; anything else -> null */
function sanitizeTime(v){
  if (!v) return null;
  const s = String(v).trim();
  // Accept 24h "HH:MM" only (we already generate that on the client).
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? s : null;
}

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
      mode,            // "append" | "replace"
      items = [],      // [{ title, dayOffset, time, durationMins, notes }]
    } = req.body || {};

    const planner = toLowerEmail(plannerEmail);
    const user = toLowerEmail(userEmail);
    const title = norm(listTitle);
    const sDate = norm(startDate);
    const pushMode = norm(mode) || "append";

    if (!planner || !user || !title || !sDate) {
      return res.status(400).json({ ok:false, error: "Missing plannerEmail, userEmail, listTitle, or startDate" });
    }

    const pushedAt = new Date().toISOString();

    // 1) Insert plan row
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
        // archived_at left NULL => active
      })
      .select("id")
      .single();

    if (planErr) {
      console.error("history/snapshot plan insert error:", planErr);
      return res.status(500).json({ ok:false, error: planErr.message || "Plan insert failed" });
    }

    const planId = planRow?.id;
    if (!planId) {
      return res.status(500).json({ ok:false, error: "Plan inserted without ID" });
    }

    // 2) Insert item rows in batches
    const source = Array.isArray(items) ? items : [];
    let insertedCount = 0;

    if (source.length > 0) {
      // Prepare rows (limit to the columns we know exist)
      // history_items columns: plan_id, title, day_offset, time, duration_mins, notes
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
          time,               // stored as text/varchar or time, depending on schema
          duration_mins: duration, // null OK if column exists
          notes,              // null OK if column exists
        };
      });

      // Batch insert
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);

        // First attempt: full set of columns (duration_mins and notes included)
        let ins = await supabaseAdmin.from("history_items").insert(chunk);

        // If the insert fails due to a column mismatch, try a narrower set
        if (ins.error && /column .* does not exist/i.test(ins.error.message || "")) {
          console.warn("history/snapshot items insert: column-mismatch, retrying with safe subset", ins.error.message);

          // Remove potentially problematic keys and retry
          const safeChunk = chunk.map(({ plan_id, title, day_offset, time, notes, duration_mins }) => {
            const base = { plan_id, title, day_offset, time };
            // Try with notes only
            return notes !== undefined ? { ...base, notes } : base;
          });

          ins = await supabaseAdmin.from("history_items").insert(safeChunk);

          // If still failing, try the minimal guaranteed keys only
          if (ins.error) {
            console.warn("history/snapshot items insert: retry without notes", ins.error.message);
            const minimalChunk = chunk.map(({ plan_id, title, day_offset, time }) => ({
              plan_id, title, day_offset, time
            }));
            ins = await supabaseAdmin.from("history_items").insert(minimalChunk);
          }
        }

        if (ins.error) {
          console.error("history/snapshot items insert error:", ins.error);
          // At least return how many we saved before the failure
          return res.status(500).json({
            ok:false,
            error: ins.error.message || "Items insert failed",
            planId,
            inserted: insertedCount
          });
        }

        insertedCount += chunk.length;
      }
    }

    return res.status(200).json({ ok:true, planId, items: insertedCount });
  } catch (e) {
    console.error("history/snapshot top-level:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
