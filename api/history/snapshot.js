// /api/history/snapshot.js
// Purpose: Write a plan snapshot to history_plans + history_items after a successful push.
// No DB schema changes. Assumes tables exist.
// Returns: { ok: true, planId, items: <count> } on success.

import { Pool } from "pg";

const CONN =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_CONNECTION_STRING ||
  "";

const pool = new Pool({
  connectionString: CONN,
  ssl: CONN ? { rejectUnauthorized: false } : undefined,
});

function norm(str) {
  return (str || "").toString().trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const {
      plannerEmail,
      userEmail,
      listTitle,
      startDate,
      timezone,
      mode, // "append" | "replace"
      items, // [{ title, dayOffset, time, durationMins, notes }]
    } = req.body || {};

    const planner = norm(plannerEmail).toLowerCase();
    const user = norm(userEmail).toLowerCase();
    const title = norm(listTitle);
    const tz = norm(timezone) || null;
    const sDate = norm(startDate);
    const pushMode = norm(mode) || "append";
    const rows = Array.isArray(items) ? items : [];

    if (!planner) return res.status(400).json({ ok: false, error: "Missing plannerEmail" });
    if (!user) return res.status(400).json({ ok: false, error: "Missing userEmail" });
    if (!title) return res.status(400).json({ ok: false, error: "Missing listTitle" });
    if (!sDate) return res.status(400).json({ ok: false, error: "Missing startDate" });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Insert plan row
      const planInsert = `
        INSERT INTO history_plans
          (planner_email, user_email, title, start_date, timezone, mode, status)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'active')
        RETURNING id
      `;
      const planVals = [planner, user, title, sDate, tz, pushMode];
      const planRes = await client.query(planInsert, planVals);
      const planId = planRes.rows[0]?.id;

      // Insert item rows
      const itemInsert = `
        INSERT INTO history_items
          (plan_id, ord, title, day_offset, time, duration_mins, notes)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
      `;

      let count = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i] || {};
        const vals = [
          planId,
          i,
          norm(r.title),
          Number.isFinite(r.dayOffset) ? r.dayOffset : 0,
          r.time ? String(r.time) : null,
          Number.isFinite(r.durationMins) ? r.durationMins : null,
          r.notes ? String(r.notes) : null,
        ];
        await client.query(itemInsert, vals);
        count++;
      }

      await client.query("COMMIT");
      return res.status(200).json({ ok: true, planId, items: count });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch (_e) {}
      console.error("snapshot error:", e);
      return res.status(500).json({ ok: false, error: String(e.message || e) });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("snapshot top-level:", e);
    return res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
}
