// api/push.js
import { supabaseAdmin } from "../lib/supabase.js";

// Parse your Plan2Tasks block into a plan + tasks
function parsePlanBlock(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const plan = { title: "", start: "", timezone: "" };
  const tasks = [];
  let mode = "";

  for (const line of lines) {
    if (line.startsWith("Title:")) plan.title = line.slice(6).trim();
    else if (line.startsWith("Start:")) plan.start = line.slice(6).trim();
    else if (line.startsWith("Timezone:")) plan.timezone = line.slice(9).trim();
    else if (line === "--- Blocks ---") mode = "blocks";
    else if (line === "--- Tasks ---") mode = "tasks";
    else if (line === "### PLAN2TASKS ###" || line === "### END ###" || line === "") continue;
    else if (mode === "blocks") {
      const m = line.match(/^- (.*?) \|.*time=([^|]+)?/);
      if (m) tasks.push({ title: m[1], day: 0, time: m[2] || "", notes: "[Block]" });
    } else if (mode === "tasks") {
      const m = line.match(/^- (.*?) \| day=(\d+) \| time=([^|]*) \| dur=([^|]*) \| notes=(.*)$/);
      if (m) {
        tasks.push({
          title: m[1],
          day: Number(m[2]),
          time: m[3],
          dur: m[4],
          notes: m[5],
        });
      }
    }
  }
  return { plan, tasks };
}

async function tokenFromRefresh(refreshToken) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const j = await resp.json();
  if (j.error) throw new Error(j.error_description || "refresh_token failed");
  return j.access_token;
}

// Find a task list by title (case-insensitive). Create it if not found.
async function findOrCreateTaskList(accessToken, desiredTitle) {
  if (!desiredTitle) return "@default";

  // 1) list existing task lists (paginate just in case)
  let pageToken = "";
  while (true) {
    const url = new URL("https://tasks.googleapis.com/tasks/v1/users/@me/lists");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await resp.json();
    if (data?.items?.length) {
      const match = data.items.find(
        (l) => (l.title || "").trim().toLowerCase() === desiredTitle.trim().toLowerCase()
      );
      if (match) return match.id;
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  // 2) create a new list
  const createResp = await fetch(
    "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: desiredTitle }),
    }
  );
  const created = await createResp.json();
  if (!createResp.ok) {
    throw new Error(created.error?.message || "Could not create task list");
  }
  return created.id;
}

function toDueDate(startStr, dayOffset) {
  const d = new Date(startStr);
  d.setDate(d.getDate() + (dayOffset || 0));
  // Google Tasks really only uses the date part; ISO is fine.
  return d.toISOString();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { userEmail, planBlock, taskListName } = req.body || {};
  if (!userEmail || !planBlock) return res.status(400).json({ error: "Missing userEmail or planBlock" });

  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("user_connections")
    .select("*")
    .eq("user_email", userEmail)
    .eq("status", "connected")
    .single();

  if (error || !data) return res.status(404).json({ error: "User not connected" });

  try {
    const accessToken = await tokenFromRefresh(data.google_refresh_token);
    const { plan, tasks } = parsePlanBlock(planBlock);

    // Prefer the task list name passed in; default to the plan title; otherwise @default.
    const desiredTitle = taskListName?.trim() || plan.title?.trim();
    let tasklistId = "@default";
    try {
      tasklistId = await findOrCreateTaskList(accessToken, desiredTitle);
    } catch {
      // If creation fails for any reason, fall back to default list
      tasklistId = "@default";
    }

    for (const t of tasks) {
      const body = {
        title: t.title,
        notes: [
          t.time ? `Time: ${t.time}` : "All-day",
          t.dur ? `Duration: ${t.dur}m` : "",
          t.notes ? `Notes: ${t.notes}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        due: toDueDate(plan.start, t.day),
      };

      await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(tasklistId)}/tasks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );
    }

    return res.status(200).json({ ok: true, created: tasks.length, tasklistId });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
