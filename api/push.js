// api/push.js
export const config = { runtime: "nodejs" };

import { getAccessTokenForUser, ensureTaskList, insertTask } from "../lib/google-tasks.js";
import { supabaseAdmin } from "../lib/supabase-admin.js";

/* --------- Parse Plan2Tasks block --------- */
function parsePlanBlock(text) {
  const lines = String(text || "").split(/\r?\n/);
  let title = "", startDate = "", timezone = "America/Chicago";
  let section = "";
  const tasks = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("Title:")) { title = line.slice(6).trim(); continue; }
    if (line.startsWith("Start:")) { startDate = line.slice(6).trim(); continue; }
    if (line.startsWith("Timezone:")) { timezone = line.slice(9).trim(); continue; }
    if (line.startsWith("--- Tasks ---")) { section = "tasks"; continue; }
    if (line.startsWith("- ") && section === "tasks") {
      const parts = line.slice(2).split("|").map(s => s.trim());
      const obj = { title: parts[0], dayOffset: 0, time: "", durationMins: 60, notes: "" };
      for (let i = 1; i < parts.length; i++) {
        const [k, vRaw] = parts[i].split("=").map(s => s.trim());
        const v = vRaw ?? "";
        if (k === "day") obj.dayOffset = parseInt(v || "0", 10);
        if (k === "time") obj.time = v || "";
        if (k === "dur") obj.durationMins = parseInt(v || "60", 10);
        if (k === "notes") obj.notes = v || "";
      }
      tasks.push(obj);
    }
  }
  return { title, startDate, timezone, tasks };
}

/* --------- Date helpers (no external libs) --------- */
function addDaysYMD(startYMD, addDays) {
  const [y, m, d] = startYMD.split("-").map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (Number.isFinite(addDays) ? addDays : 0));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* --------- Clear a list (replace mode) --------- */
async function clearList(accessToken, listId) {
  let deleted = 0, pageToken = "";
  do {
    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?maxResults=100` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
    const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "List fetch failed");
    const items = j.items || [];
    for (const t of items) {
      const del = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(t.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (del.status === 204) deleted++;
    }
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return deleted;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { userEmail, planBlock, mode, plannerEmail } = req.body || {};
    if (!userEmail || !planBlock) return res.status(400).json({ error: "Missing userEmail or planBlock" });

    const plan = parsePlanBlock(planBlock);
    if (!plan.title || !plan.startDate) {
      return res.status(400).json({ error: "Invalid plan block (missing Title or Start)" });
    }

    // 1) Push to Google Tasks
    const accessToken = await getAccessTokenForUser(userEmail);
    const list = await ensureTaskList(accessToken, plan.title);

    let deleted = 0;
    if (mode === "replace") {
      deleted = await clearList(accessToken, list.id);
    }

    let created = 0;
    for (const it of plan.tasks) {
      const ymd = addDaysYMD(plan.startDate, it.dayOffset || 0);
      const titlePrefix = it.time ? `${it.time} — ` : "";
      const displayTitle = `${titlePrefix}${it.title}`;
      const notesParts = [];
      if (it.time) notesParts.push(`Time: ${it.time} (${plan.timezone})`);
      if (it.durationMins) notesParts.push(`Duration: ${it.durationMins}m`);
      if (it.notes) notesParts.push(it.notes);
      const payload = {
        title: displayTitle,
        notes: notesParts.join("\n"),
        due: `${ymd}T00:00:00.000Z`,
        status: "needsAction"
      };
      const resp = await insertTask(accessToken, list.id, payload);
      if (resp && resp.id) created++;
    }

    // 2) Save to history (so planners can view/reuse/delete later)
    if (plannerEmail) {
      const { data: listRow, error: e1 } = await supabaseAdmin
        .from("task_lists")
        .insert({
          planner_email: plannerEmail,
          user_email: userEmail,
          title: plan.title,
          start_date: plan.startDate,
          timezone: plan.timezone
        })
        .select()
        .single();
      if (e1) console.error("history insert list error:", e1);

      if (listRow) {
        const items = (plan.tasks || []).map(t => ({
          list_id: listRow.id,
          title: t.title,
          day_offset: t.dayOffset || 0,
          time: t.time || null,
          duration_mins: t.durationMins || 60,
          notes: t.notes || null
        }));
        if (items.length) {
          const { error: e2 } = await supabaseAdmin.from("task_items").insert(items);
          if (e2) console.error("history insert items error:", e2);
        }
      }
    }

    return res.status(200).json({ ok: true, mode: mode || "append", deleted, created, listId: list.id, listTitle: list.title });
  } catch (e) {
    console.error("push error:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
