// api/history_ping.js
export default function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  res.json({ ok: true, route: "/api/history_ping" });
}
