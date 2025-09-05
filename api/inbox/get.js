// api/inbox/get.js
// GET /api/inbox/get?inboxId=... [&plannerEmail=...]
// Returns { ok, bundle:{...}, tasks:[...]} ; bundle.tasks is the canonical list

import { supabaseAdmin } from "../../lib/supabase-admin.js";

// --- helpers ---
function addDays(ymd, n) {
  if (!ymd || typeof ymd !== "string") return null;
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(ymd);
  if (!m) return null;
  const [y, M, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (M || 1) - 1, d || 1));
  dt.setUTCDate(dt.getUTCDate() + (Number(n) || 0));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function coalesce(obj, keys, fallback = null) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
  }
  return fallback;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }
  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const inboxId = String(url.searchParams.get("inboxId") || "").trim();
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase(); // optional

    if (!inboxId) {
      return res.status(400).json({ ok: false, error: "Missing inboxId" });
    }

    // --- bundle: select specific, but only columns we know exist; tolerate assigned_user_email vs assigned_user
    let { data: b, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select(
        "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_user, assigned_at, archived_at, created_at"
      )
      .eq("id", inboxId)
      .maybeSingle();

    if (bErr) {
      // Optional planner filter fallback if RLS or data partitioning is ever used
      if (plannerEmail) {
        const { data: b2 } = await supabaseAdmin
          .from("inbox_bundles")
          .select(
            "id, planner_email, title, start_date, timezone, source, suggested_user, assigned_user_email, assigned_user, assigned_at, archived_at, created_at"
          )
          .eq("id", inboxId)
          .eq("planner_email", plannerEmail)
          .maybeSingle();
        b = b2 || null;
      }
    }

    if (!b) {
      return res.status(404).json({ ok: false, error: "Bundle not found" });
    }

    // --- tasks: select all to tolerate schema drift (e.g., date vs task_date, duration_mins vs duration)
    const { data: t, error: tErr } = await supabaseAdmin
      .from("inbox_tasks")
      .select("*")
      .eq("bundle_id", inboxId)
      .order("created_at", { ascending: true });

    if (tErr) {
      // Keep external contract lean but fix the error:
      return res.status(500).json({ ok: false, error: "Database error (tasks)" });
    }

    const startDate = b.start_date || null;

    // Normalize each task:
    // Field aliases we’ll accept:
    // - title: "title"
    // - date: "date" or "task_date"
    // - time: "time" or "task_time"
    // - duration: "duration_mins" or "duration" or "durationMinutes"
    // - notes: "notes" or "note"
    // - offset: "day_offset" or "offset"
    const tasks = (t || []).map((row) => {
      const title = String(coalesce(row, ["title"], "")) || "";
      const rawDate = coalesce(row, ["date", "task_date"], null);
      const time = coalesce(row, ["time", "task_time"], null);
      const durationMins = coalesce(row, ["duration_mins", "duration", "durationMinutes"], null);
      const notes = coalesce(row, ["notes", "note"], "") || "";
      const offset = coalesce(row, ["day_offset", "offset"], null);

      let date = rawDate;
      if (!date && startDate != null && typeof offset === "number") {
        date = addDays(startDate, offset);
      }

      return {
        title,
        date: date || null,
        time: time || null,
        durationMins: durationMins != null ? Number(durationMins) : null,
        notes,
      };
    });

    const assignedUser =
      coalesce(b, ["assigned_user_email", "assigned_user"], null) || null;

    const bundle = {
      id: b.id,
      title: b.title,
      start_date: startDate,
      startDate: startDate,
      timezone: b.timezone || null,
      source: b.source || null,
      suggested_user: b.suggested_user || null,
      assigned_user: assignedUser,
      assigned_at: b.assigned_at || null,
      archived_at: b.archived_at || null,
      created_at: b.created_at || null,
      tasks,
      count: tasks.length,
    };

    // Back-compat: include top-level tasks (clients should prefer bundle.tasks)
    return res.status(200).json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
