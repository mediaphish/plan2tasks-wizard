// api/inbox/ingest.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

function bad(res, code, msg) { res.status(code).json({ ok: false, error: msg }); }
function isStr(x){ return typeof x === "string" && x.trim().length > 0; }

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
      title,                // required: bundle title (usually the list title)
      startDate,            // required: YYYY-MM-DD (start of plan)
      timezone,             // required: e.g. "America/Chicago"
      tasks                 // required: array of { title, dayOffset, time?, durationMins?, notes? }
    } = body;

    if (!isStr(plannerEmail)) return bad(res, 400, "Missing plannerEmail");
    if (!isStr(title)) return bad(res, 400, "Missing title");
    if (!isStr(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return bad(res, 400, "startDate must be YYYY-MM-DD");
    if (!isStr(timezone)) return bad(res, 400, "Missing timezone");
    if (!Array.isArray(tasks) || tasks.length === 0) return bad(res, 400, "tasks must be a non-empty array");
    if (tasks.length > 500) return bad(res, 400, "Too many tasks (max 500)");

    // sanitize tasks
    const safeTasks = [];
    for (const [i, t] of tasks.entries()) {
      if (!t || !isStr(t.title)) return bad(res, 400, `tasks[${i}].title is required`);
      const off = Number(t.dayOffset);
      if (!Number.isFinite(off) || off < 0 || off > 3650) return bad(res, 400, `tasks[${i}].dayOffset must be 0..3650`);
      let time = t.time ?? null;
      if (time != null && !/^\d{2}:\d{2}$/.test(String(time))) return bad(res, 400, `tasks[${i}].time must be "HH:MM" or null`);
      const duration = Number(t.durationMins ?? 60);
      if (!Number.isFinite(duration) || duration <= 0 || duration > 24*60) return bad(res, 400, `tasks[${i}].durationMins invalid`);

      safeTasks.push({
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
    const rows = safeTasks.map(t => ({ bundle_id: bundleId, ...t }));
    const { error: tErr } = await supabaseAdmin.from("inbox_tasks").insert(rows);
    if (tErr) throw tErr;

    res.json({ ok: true, bundleId, tasksCreated: rows.length });
  } catch (e) {
    console.error("POST /api/inbox/ingest error", e);
    bad(res, 500, "Server error");
  }
}
