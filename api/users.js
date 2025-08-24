// api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

/*
Usage (GET):
/api/users?op=list&plannerEmail=PLANNER@mail.com&status=all|invited|connected&q=foo&page=1&pageSize=50

Returns:
{ users: [{ email, status: "invited"|"connected", invitedAt?, lastAuthorized? }], total }
*/
export default async function handler(req, res) {
  try {
    const full = `https://${req.headers.host}${req.url || ""}`;
    const url = new URL(full);
    const op = (url.searchParams.get("op") || "list").toLowerCase();
    const plannerEmail = (url.searchParams.get("plannerEmail") || "").toLowerCase();

    if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

    if (op !== "list") {
      return res.status(400).json({ error: "Unsupported op" });
    }

    const status = (url.searchParams.get("status") || "all").toLowerCase(); // all|invited|connected
    const q = (url.searchParams.get("q") || "").trim();
    const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
    const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") || "50")));

    // 1) Connected users from user_connections
    let connected = [];
    {
      const { data, error } = await supabaseAdmin
        .from("user_connections")
        .select("user_email, updated_at")
        .eq("planner_email", plannerEmail)
        .is("deleted_at", null);

      if (!error && data) {
        connected = data.map(r => ({
          email: (r.user_email || "").toLowerCase(),
          status: "connected",
          lastAuthorized: r.updated_at || null
        }));
      }
    }

    // 2) Invited users from invites (if table exists)
    let invited = [];
    try {
      const { data, error } = await supabaseAdmin
        .from("invites")
        .select("user_email, created_at, accepted_at, planner_email")
        .eq("planner_email", plannerEmail)
        .is("deleted_at", null);

      if (!error && data) {
        invited = data
          .filter(r => !r.accepted_at) // show only pending invites as "invited"
          .map(r => ({
            email: (r.user_email || "").toLowerCase(),
            status: "invited",
            invitedAt: r.created_at || null
          }));
      }
    } catch {
      // If you don't have an invites table, ignore gracefully.
      invited = [];
    }

    // 3) Merge, preferring "connected" if duplicates
    const byEmail = new Map();
    for (const row of invited) byEmail.set(row.email, row);
    for (const row of connected) byEmail.set(row.email, row); // overwrite to "connected"
    let users = Array.from(byEmail.values());

    // 4) Search filter
    if (q) {
      const qq = q.toLowerCase();
      users = users.filter(u => u.email.includes(qq) || (u.status || "").includes(qq));
    }

    // 5) Status filter
    if (status === "invited") users = users.filter(u => u.status === "invited");
    if (status === "connected") users = users.filter(u => u.status === "connected");

    // 6) Sort: connected first, then alpha
    users.sort((a, b) => {
      if (a.status !== b.status) return a.status === "connected" ? -1 : 1;
      return a.email.localeCompare(b.email);
    });

    const total = users.length;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageUsers = users.slice(start, end);

    res.json({ users: pageUsers, total, page, pageSize });
  } catch (e) {
    console.error("GET /api/users failed", e);
    res.status(500).json({ error: "Server error" });
  }
}
