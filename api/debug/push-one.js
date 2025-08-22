// api/debug/push-one.js
export const config = { runtime: "nodejs" };

import { getAccessTokenForUser, ensureTaskList, insertTask } from "../../lib/google-tasks.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
    const userEmail = (req.query.userEmail || "").toString().trim();
    if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

    const title = (req.query.title || "DIAG1").toString();
    const minutes = parseInt(req.query.minutes || "10", 10);
    const dueISO = new Date(Date.now() + minutes * 60000).toISOString();

    const at = await getAccessTokenForUser(userEmail);
    const list = await ensureTaskList(at, title);
    const task = await insertTask(at, list.id, {
      title: "DEBUG – ping",
      notes: "from /api/debug/push-one",
      due: dueISO,
      status: "needsAction"
    });

    return res.status(200).json({ ok: true, list: { id: list.id, title: list.title }, task: { id: task.id, due: task.due, title: task.title } });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
