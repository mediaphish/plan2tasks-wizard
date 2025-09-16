// /api/inbox/create.js
// Purpose: Create an Inbox bundle + tasks in Supabase so GPT-generated plans
//          appear in the app's Inbox (NEW), ready for Review → Push → Archive.
// Stack constraints respected: Vercel serverless route, plain JS (no TS/Next).

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Service Role: writes allowed
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const body = await readJson(req);

    // Inputs used by the app + tables (keep to known columns only)
    const plannerEmail = (body.plannerEmail || "").trim(); // used only for access patterns/logging (not stored)
    const userEmail    = (body.userEmail || "").trim();    // stored on bundle as suggested_user (NEW)
    const title        = (body.title || "").trim();
    const startDate    = (body.startDate || "").trim();    // YYYY-MM-DD
    const timezone     = (body.timezone || "").trim();     // e.g., "America/Chicago"
    const items        = Array.isArray(body.items) ? body.items : [];
    const source       = (body.source || "gpt").trim();    // attribution only

    // Basic validation (clear errors for GPT logs)
    if (!plannerEmail) return bad(res, "plannerEmail required");
    if (!userEmail)    return bad(res, "userEmail required");
    if (!title)        return bad(res, "title required");
    if (!startDate)    return bad(res, "startDate required (YYYY-MM-DD)");
    if (!timezone)     return bad(res, "timezone required");

    // 1) Insert bundle in NEW state (unassigned)
    // Columns allowed (per your schema): id, title, start_date, timezone,
    // suggested_user, assigned_user_email, assigned_at, archived_at, source, created_at
    const bundleRow = {
      title,
      start_date: startDate,
      timezone,
      suggested_user: userEmail,
      assigned_user_email: null,
      archived_at: null,
      source
    };

    const { data: bundle, error: insErr } = await supabase
      .from("inbox_bundles")
      .insert([bundleRow])
      .select("id, title, start_date, timezone, suggested_user, assigned_user_email, archived_at, source, created_at")
      .single();

    if (insErr) return bad(res, `bundle insert failed: ${insErr.message}`);

    // 2) Insert tasks for this bundle into inbox_tasks
    // Columns allowed: id, bundle_id, title, day_offset, time, duration_mins, notes
    const tasks = items.map((t) => ({
      bundle_id: bundle.id,
      title: String(t.title || "").slice(0, 500) || "(untitled)",
      day_offset: Number.isFinite(t.dayOffset) ? t.dayOffset : 0,
      time: t.time || null,
      duration_mins: Number.isFinite(t.durationMins) ? t.durationMins : null,
      notes: t.notes || null
    }));

    let tasksCreated = 0;
    if (tasks.length > 0) {
      const { error: taskErr, count } = await supabase
        .from("inbox_tasks")
        .insert(tasks, { count: "exact" });
      if (taskErr) return bad(res, `tasks insert failed: ${taskErr.message}`);
      tasksCreated = count ?? tasks.length;
    }

    // 3) Response (GPT can capture bundle.id to pass to /review.html?inboxId=… later)
    return res.status(200).json({
      ok: true,
      bundle,
      tasks_created: tasksCreated
    });
  } catch (e) {
    return bad(res, e.message || "Unknown error");
  }
}

/* ───────── helpers ───────── */
function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

async function readJson(req) {
  const text = await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body || "{}"));
    req.on("error", reject);
  });
  try { return JSON.parse(text); } catch { return {}; }
}
