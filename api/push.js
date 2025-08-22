// api/push.js
export const config = { runtime: "nodejs20.x" };

import { format, addDays as fnsAddDays } from "date-fns";
import { zonedTimeToUtc } from "date-fns-tz";
import { getAccessTokenForUser, ensureTaskList, insertTask } from "../lib/google-tasks.js";

/* --------- Parse the Plan2Tasks block sent by the client --------- */
function parsePlanBlock(text) {
  const lines = String(text || "").split(/\r?\n/);
  let title = "";
  let startDate = "";
  let timezone = "America/Chicago";
  let section = "";
  const blocks = [];
  const tasks = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("Title:")) { title = line.slice(6).trim(); continue; }
    if (line.startsWith("Start:")) { startDate = line.slice(6).trim(); continue; }
    if (line.startsWith("Timezone:")) { timezone = line.slice(9).trim(); continue; }
    if (line.startsWith("--- Blocks ---")) { section = "blocks"; continue; }
    if (line.startsWith("--- Tasks ---")) { section = "tasks"; continue; }

    if (line.startsWith("- ")) {
      const parts = line.slice(2).split("|").map(s => s.trim());
      if (section === "blocks") {
        const obj = { label: parts[0], days: [], time: "", durationMins: 60 };
        for (let i = 1; i < parts.length; i++) {
          const [k, vRaw] = parts[i].split("=").map(s => s.trim());
          const v = vRaw ?? "";
          if (k === "days") obj.days = v ? v.split(",").map(n => parseInt(n, 10)) : [];
          if (k === "time") obj.time = v || "";
          if (k === "dur") obj.durationMins = parseInt(v || "60", 10);
        }
        blocks.push(obj);
      } else if (section === "tasks") {
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
  }

  return { title, startDate, timezone, blocks, tasks };
}

/* --------- Materialize a 7-day preview of recurring blocks --------- */
function buildItems({ startDate, blocks, tasks }) {
  const items = [...tasks.map(t => ({ ...t }))];
  for (let d = 0; d < 7; d++) {
    const temp = new Date(startDate);
    temp.setDate(temp.getDate() + d);
    const dow = temp.getDay(); // 0..6
    for (const b of blocks) {
      if (b.days.includes(dow)) {
        items.push({
          title: b.label,
          dayOffset: d,
          time: b.time,
          durationMins: b.durationMins,
          notes: "Recurring block"
        });
      }
    }
  }
  return items;
}

/* --------- Compute RFC3339 'due' in UTC from local tz (defaults 09:00) --------- */
function dueISOFor(item, startDate, tz) {
  const localDay = fnsAddDays(new Date(startDate + "T00:00:00"), item.dayOffset || 0);
  const hhmm = (item.time && /^\d{1,2}:\d{2}$/.test(item.time)) ? item.time : "09:00";
  const localStr = `${format(localDay, "yyyy-MM-dd")}T${hhmm}:00`;
  const utc = zonedTimeToUtc(localStr, tz);
  return utc.toISOString();
}

/* --------- Vercel serverless handler --------- */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const { userEmail, planBlock } = req.body || {};
    if (!userEmail || !planBlock) return res.status(400).json({ error: "Missing userEmail or planBlock" });

    const plan = parsePlanBlock(planBlock);
    if (!plan.title || !plan.startDate) return res.status(400).json({ error: "Invalid plan block (missing Title/Start)" });

    // 1) OAuth access token for the connected user
    const accessToken = await getAccessTokenForUser(userEmail);

    // 2) Ensure the Google Tasks list (named by plan.title)
    const list = await ensureTaskList(accessToken, plan.title);

    // 3) Build concrete items and insert with proper 'due'
    const items = buildItems(plan);
    let created = 0;

    for (const it of items) {
      const dueISO = dueISOFor(it, plan.startDate, plan.timezone);
      const payload = {
        title: it.title,
        notes: it.notes || "",
        due: dueISO,           // RFC3339 UTC — required for Calendar to display
        status: "needsAction"
      };
      await insertTask(accessToken, list.id, payload);
      created++;
    }

    return res.status(200).json({ ok: true, created, listId: list.id, listTitle: list.title });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
