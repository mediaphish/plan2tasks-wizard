// api/push.js
export const config = { runtime: "nodejs" };

import { getAccessTokenForUser, ensureTaskList, insertTask } from "../lib/google-tasks.js";

/* --------- Parse the Plan2Tasks block from the UI --------- */
function parsePlanBlock(text) {
  const lines = String(text || "").split(/\r?\n/);
  let title = "";
  let startDate = "";
  let timezone = "America/Chicago";
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

/* --------- Clear a list (used by replace mode) --------- */
async function clearList(accessToken, listId) {
  let deleted = 0;
  let pageToken = "";
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

/* --------- Vercel handler --------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { userEmail, planBlock, mode } = req.body || {};
    if (!userEmail || !planBlock) return res.status(400).json({ error: "Missing userEmail or planBlock" });

    const plan = parsePlanBlock(planBlock);
    if (!plan.title || !plan.startDate) {
      return res.status(400).json({ error: "Invalid plan block (missing Title or Start)" });
    }

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

      const extraNotes = [];
      if (it.time) extraNotes.push(`Time: ${it.time} (${plan.timezone})`);
      if (it.durationMins) extraNotes.push(`Duration: ${it.durationMins}m`);
      if (it.notes) extraNotes.push(it.notes);
      const notes = extraNotes.join("\n");

      const payload = {
        title: displayTitle,
        notes,
        due: `${ymd}T00:00:00.000Z`, // Tasks uses date only; time is ignored by API
        status: "needsAction"
      };

      const resp = await insertTask(accessToken, list.id, payload);
      if (resp && resp.id) created++;
    }

    return res.status(200).json({ ok: true, mode: mode || "append", deleted, created, listId: list.id, listTitle: list.title });
  } catch (e) {
    console.error("push error:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
