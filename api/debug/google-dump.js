// api/debug/google-dump.js
export const config = { runtime: "nodejs" };

import { getAccessTokenForUser, listTaskLists } from "../../lib/google-tasks.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const userEmail = req.query.userEmail;
  if (!userEmail) return res.status(400).json({ error: "Missing userEmail" });

  try {
    const at = await getAccessTokenForUser(userEmail);
    const lists = await listTaskLists(at);

    // If you pass ?listId=..., also return the tasks for that list.
    if (req.query.listId) {
      const listId = req.query.listId;
      const resp = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?maxResults=100`,
        { headers: { Authorization: `Bearer ${at}` } }
      );
      const json = await resp.json();
      if (!resp.ok) return res.status(500).json(json);
      return res.status(200).json({ lists, tasks: json.items || [] });
    }

    return res.status(200).json({ lists });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
