// api/inbox/get.js
// GET /api/inbox/get?inboxId=... [&plannerEmail=...]
// Returns: { ok, bundle:{...}, tasks:[...] }  (bundle.tasks is canonical)
// No UI changes. Pages Router. JS only.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

// ---------- helpers ----------
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

async function findFirstRowByAnyKey(table, keys, value, selectCols) {
  for (const key of keys) {
    const q = supabaseAdmin.from(table).select(selectCols).eq(key, value).maybeSingle();
    const { data, error } = await q;
    if (!error && data) return { data, key };
  }
  return { data: null, key: null };
}

// ---------- route ----------
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

    // 1) Locate bundle across possible tables/keys
    const idKeys = ["id", "inboxId", "bundle_id", "inbox_id"];
    const bundleSelect =
      "*, id, inboxId, bundle_id, inbox_id, title, start_date, startDate, timezone, source, suggested_user, assigned_user_email, assigned_user, assigned_at, archived_at, created_at, planner_email";

    let bundleRow = null;
    let whereKey = null;

    // Try unified table first
    ({ data: bundleRow, key: whereKey } =
      await findFirstRowByAnyKey("inbox_bundles", idKeys, inboxId, bundleSelect));

    // Then legacy NEW
    if (!bundleRow) {
      ({ data: bundleRow, key: whereKey } =
        await findFirstRowByAnyKey("inbox_new", idKeys, inboxId, bundleSelect));
    }

    // Then legacy ASSIGNED
    if (!bundleRow) {
      ({ data: bundleRow, key: whereKey } =
        await findFirstRowByAnyKey("inbox_assigned", idKeys, inboxId, bundleSelect));
    }

    // Optional partition by planner if present (don’t block if not)
    if (!bundleRow && plannerEmail) {
      // Retry unified but also by planner (best-effort)
      for (const key of idKeys) {
        const { data } = await supabaseAdmin
          .from("inbox_bundles")
          .select(bundleSelect)
          .eq(key, inboxId)
          .eq("planner_email", plannerEmail)
          .maybeSingle();
        if (data) {
          bundleRow = data;
          whereKey = key;
          break;
        }
      }
    }

    if (!bundleRow) {
      return res.status(404).json({ ok: false, error: "Bundle not found" });
    }

    // Normalize common bundle fields
    const startDate =
      coalesce(bundleRow, ["start_date", "startDate"], null) || null;

    const assignedUser =
      coalesce(bundleRow, ["assigned_user_email", "assigned_user"], null) || null;

    // 2) Load tasks from inbox_tasks by matching any plausible foreign key to inboxId
    // Try bundle_id → inbox_id → id
    const taskKeyOrder = ["bundle_id", "inbox_id", "id"];
    let tasksRaw = null;

    for (const k of taskKeyOrder) {
      const { data, error } = await supabaseAdmin
        .from("inbox_tasks")
        .select("*")
        .eq(k, inboxId)
        .order("created_at", { ascending: true });
      if (!error && data && data.length) {
        tasksRaw = data;
        break;
      }
    }

    // If still no tasks and we found the primary key used in bundle, try matching tasks to that field’s value instead of inboxId
    if (!tasksRaw && whereKey && bundleRow[whereKey]) {
      for (const k of taskKeyOrder) {
        const { data, error } = await supabaseAdmin
          .from("inbox_tasks")
          .select("*")
          .eq(k, bundleRow[whereKey])
          .order("created_at", { ascending: true });
        if (!error && data && data.length) {
          tasksRaw = data;
          break;
        }
      }
    }

    // 3) Normalize tasks to dates only (no offsets exposed)
    const tasks = (tasksRaw || []).map((row) => {
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

    const bundle = {
      id: coalesce(bundleRow, ["id", "inboxId", "bundle_id", "inbox_id"], null),
      title: bundleRow.title || null,
      start_date: startDate,
      startDate: startDate,
      timezone: bundleRow.timezone || null,
      source: bundleRow.source || null,
      suggested_user: bundleRow.suggested_user || null,
      assigned_user: assignedUser,
      assigned_at: bundleRow.assigned_at || null,
      archived_at: bundleRow.archived_at || null,
      created_at: bundleRow.created_at || null,
      tasks,
      count: tasks.length,
    };

    // Back-compat: also include top-level tasks (legacy consumers)
    return res.status(200).json({ ok: true, bundle, tasks });
  } catch (e) {
    console.error("GET /api/inbox/get error", e);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
}
