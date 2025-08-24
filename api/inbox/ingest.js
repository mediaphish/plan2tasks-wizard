// api/inbox/ingest.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function bad(res, code, msg) { res.status(code).json({ ok: false, error: msg }); }
function isStr(x){ return typeof x === "string" && x.trim().length > 0; }
const DAY_MS = 24 * 60 * 60 * 1000;

function parseYMD(ymd) {
  // Treat as UTC midnight to avoid TZ drift
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd || "");
  if (!m) return null;
  const d = new Date(`${ymd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function daysDiffUTC(aYMD, bYMD) {
  const a = parseYMD(aYMD); const b = parseYMD(bYMD);
  if (!a || !b) return null;
  const aUTC = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
  const bUTC = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate());
  return Math.round((bUTC - aUTC) / DAY_MS);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return bad(res, 405, "POST only");

  try {
    // --- Auth: require Bearer P2T_GPT_API_KEY ---
    const auth = req.headers["authorization"] || req.headers["Authorization"];
    const expected = `Bearer ${process.env.P2T_GPT_API_KEY || ""}`;
    if (!auth || auth !== expected) return bad(res, 401, "Unauthorized");

    // --- Parse & validate ---
    const body = req.body || {};
    const {
      plannerEmail,         // required
      userEmail,            // optional hint; stored as suggested_user
      title,                // required
      startDate,            // required: YYYY-MM-DD (plan start)
      timezone,             // required: e.g. "America/Chicago"
      tasks                 // required: array of { title, date? or dayOffset?, time?, durationMins?, notes? }
    } = body;

    if (!isStr(plannerEmail)) return bad(res, 400, "Missing plannerEmail");
    if (!isStr(title)) return bad(res, 400, "Missing title");
    if (!isStr(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return bad(res, 400, "startDate must be YYYY-MM-DD");
    if (!isStr(timezone)) return bad(res, 400, "Missing timezone");
    if (!Array.isArray(tasks) || tasks.length === 0) return bad(res, 400, "tasks must be a non-empty array");
    if (tasks.length > 500) return bad(res, 400, "Too many tasks (max 500)");

    // sanitize tasks (accept either task.date or task.dayOffset)
    const safeTasks = [];
    for (const [i, t] of tasks.entries()) {
      if (!t || !isStr(t.title)) return bad(res, 400, `tasks[${i}].title is required`);

      let off = null;

      if (t.date) {
        const taskDate = String(t.date);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(taskDate)) {
          return bad(res, 400, `tasks[${i}].date must be YYYY-MM-DD`);
        }
        const diff = daysDiffUTC(startDate, taskDate);
        if (diff == null) return bad(res, 400, `tasks[${i}].date invalid`);
        if (diff < 0) return bad(res, 400, `tasks[${i}].date cannot be before startDate`);
        off = diff;
      } else if (t.dayOffset != null) {
        const tmp = Number(t.dayOffset);
        if (!Number.isFinite(tmp) || tmp < 0 || tmp > 3650) return bad(res, 400, `tasks[${i}].dayOffset must be 0..3650`);
        off = tmp;
      } else {
        return bad(res, 400, `tasks[${i}] must include either "date" (YYYY-MM-DD) or "dayOffset"`);
      }

      let time = t.time ?? null;
      if (time != null) {
        time = String(time);
        if (!/^\d{2}:\d{2}$/.test(time)) {
          return bad(res, 400, `tasks[${i}].time must be "HH:MM" 24h or null`);
        }
      }

      const duration = Number(t.durationMins ?? 60);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 24*60) {
        return bad(res, 400, `tasks[${i}].durationMins invalid`);
      }

      safeTasks.push({
        bundle_id: null, // fill later
        title: String(t.title).slice(0, 200),
        day_offset: off,
        time: time,
        duration_mins: duration,
        notes: (t.notes ? String(t.notes) : "").slice(0, 1000)
      });
    }

    // --- Insert bundle ---
    const { data: bundle, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .insert({
        planner_email: plannerEmail.toLowerCase(),
        title,
        start_date: startDate,
        timezone,
        source: "gpt",
        suggested_user: userEmail || null
      })
      .select("id")
      .single();

    if (bErr) throw bErr;
    const bundleId = bundle.id;

    // --- Insert tasks (bulk) ---
    const rows = safeTasks.map(t => ({ ...t, bundle_id: bundleId }));
    const { error: tErr } = await supabaseAdmin.from("inbox_tasks").insert(rows);
    if (tErr) throw tErr;

    res.json({ ok: true, bundleId, tasksCreated: rows.length });
  } catch (e) {
    console.error("POST /api/inbox/ingest error", e);
    bad(res, 500, "Server error");
  }
}
