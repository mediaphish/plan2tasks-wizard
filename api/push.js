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
// Returns YYYY-MM-DD by adding N days to start (interpreted as a calendar date).
function addDaysYMD(startYMD, addDays) {
  // Work in UTC so we don’t get local DST surprises
  const [y, m, d] = startYMD.split("-").map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + (Number.isFinite(addDays) ? addDays : 0));
  // Format back to YYYY-MM-DD
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/* --------- Vercel handler --------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { userEmail, planBlock } = req.body || {};
    if (!userEmail || !planBlock) return res.status(400).json({ error: "Missing userEmail or planBlock" });

    const plan = parsePlanBlock(planBlock);
    if (!plan.title || !plan.startDate) {
      return res.status(400).json({ error: "Invalid plan block (missing Title or Start)" });
    }

    // 1) Get OAuth token for the connected user
    const accessToken = await getAccessTokenForUser(userEmail);

    // 2) Ensure the Google Tasks list exists (named by plan.title)
    const list = await ensureTaskList(accessToken, plan.title);

    // 3) Insert each task
    let created = 0;
    for (const it of plan.tasks) {
      const ymd = addDaysYMD(plan.startDate, it.dayOffset || 0);
      // Google Tasks ignores time-of-day; we keep time visible by prefixing it in title and adding notes.
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
        // API drops the time portion; we send a clear ISO with midnight Z for the chosen date.
        due: `${ymd}T00:00:00.000Z`,
        status: "needsAction"
      };

      const resp = await insertTask(accessToken, list.id, payload);
      if (resp && resp.id) created++;
    }

    return res.status(200).json({ ok: true, created, listId: list.id, listTitle: list.title });
  } catch (e) {
    console.error("push error:", e);
    return res.status(500).json({ error: String(e.message || e) });
  }
}
