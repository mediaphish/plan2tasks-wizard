// api/history/ping.js
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  return res.json({ ok: true, route: "/api/history/ping" });
}
