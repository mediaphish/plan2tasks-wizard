// /api/inbox/create.js
// Minimal endpoint to create an inbox bundle + tasks in Supabase
// Stack: Vercel serverless (Node), Supabase JS client.
// Env needed: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const {
      // required for clarity in your flows (but only userEmail is stored on bundle)
      plannerEmail,
      userEmail,

      // bundle fields
      title,
      startDate,
      timezone,

      // tasks: [{ title, dayOffset, time|null, durationMins|null, notes }]
      items = [],
      source = "manual"
    } = await parseJSON(req);

    if (!userEmail) return bad(res, "userEmail required");
    if (!title) return bad(res, "title required");
    if (!startDate) return bad(res, "startDate required");
    if (!timezone) return bad(res, "timezone required");

    // 1) Insert bundle (use only columns we know are safe)
    const bundle = {
      title,
      start_date: startDate,
      timezone,
      suggested_user: userEmail,          // NEW bundles start as "New"
      assigned_user_email: null,          // not assigned yet
      archived_at: null,
      source
      // created_at: default from DB
    };

    const { data: bundleIns, error: bundleErr } = await supabase
      .from("inbox_bundles")
      .insert([bundle])
      .select("id, title, start_date, timezone, suggested_user, assigned_user_email, archived_at, source, created_at")
      .single();

    if (bundleErr) return bad(res, `bundle insert failed: ${bundleErr.message}`);

    const bundleId = bundleIns.id;

    // 2) Insert tasks (map to known columns only)
    const tasks = (items || []).map((t) => ({
      bundle_id: bundleId,
      title: String(t.title || "").slice(0, 500) || "(untitled)",
      day_offset: Number.isFinite(t.dayOffset) ? t.dayOffset : 0,
      time: t.time || null,
      duration_mins: Number.isFinite(t.durationMins) ? t.durationMins : null,
      notes: t.notes || null
    }));

    let inserted = 0;
    if (tasks.length > 0) {
      const { error: tasksErr, count } = await supabase
        .from("inbox_tasks")
        .insert(tasks, { count: "exact" });
      if (tasksErr) return bad(res, `tasks insert failed: ${tasksErr.message}`);
      inserted = count ?? tasks.length;
    }

    return res.status(200).json({
      ok: true,
      bundle: bundleIns,
      tasks_created: inserted
    });
  } catch (e) {
    return bad(res, e.message || "Unknown error");
  }
}

function bad(res, msg, code = 400) {
  return res.status(code).json({ ok: false, error: msg });
}

async function parseJSON(req) {
  const text = await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve(body || "{}"));
    req.on("error", reject);
  });
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
