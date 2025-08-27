// /api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

function normEmail(x) {
  return String(x || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const raw = req.query.plannerEmail;
      const plannerEmail = normEmail(raw);
      if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

      const pe = plannerEmail.toLowerCase();

      // 1) Pull connections for this planner (case-insensitive)
      const { data: conns, error: cErr } = await supabaseAdmin
        .from("user_connections")
        .select("planner_email, user_email, groups, status, google_refresh_token")
        .ilike("planner_email", pe); // case-insensitive match

      if (cErr) return res.status(500).json({ error: cErr.message });

      // 2) Pull invites for this planner (so invited-but-not-connected also show)
      const { data: invs, error: iErr } = await supabaseAdmin
        .from("invites")
        .select("planner_email, user_email, used_at")
        .ilike("planner_email", pe);

      if (iErr) return res.status(500).json({ error: iErr.message });

      // 3) Merge by user_email
      const map = new Map();

      // From connections
      for (const r of conns || []) {
        const email = normEmail(r.user_email);
        const groups = Array.isArray(r.groups) ? r.groups : [];
        const hasToken = !!r.google_refresh_token;
        const status =
          r.status === "connected" || hasToken ? "connected" :
          r.status === "pending" ? "pending" :
          "not_connected";

        map.set(email, {
          email,
          groups,
          status,
          source: "conn",
        });
      }

      // From invites
      for (const v of invs || []) {
        const email = normEmail(v.user_email);
        if (!email) continue;

        const existed = map.get(email);
        if (existed) {
          // If already connected via conn, keep connected
          // Otherwise, upgrade invited/pending appropriately
          if (existed.status !== "connected") {
            const via = v.used_at ? "pending" : "invited";
            existed.status = existed.status === "pending" ? "pending" : via;
          }
        } else {
          map.set(email, {
            email,
            groups: [],
            status: v.used_at ? "pending" : "invited",
            source: "invite",
          });
        }
      }

      // 4) To list (sorted: connected first, then pending, invited, not_connected)
      const order = { connected: 0, pending: 1, invited: 2, not_connected: 3 };
      const users = Array.from(map.values()).sort(
        (a, b) => (order[a.status] - order[b.status]) || a.email.localeCompare(b.email)
      );

      return res.json({ users });
    }

    if (req.method === "POST") {
      // Update categories (groups) for a specific user
      const plannerEmail = normEmail(req.body?.plannerEmail);
      const userEmail = normEmail(req.body?.userEmail);
      const groups = Array.isArray(req.body?.groups) ? req.body.groups : [];
      if (!plannerEmail || !userEmail) {
        return res.status(400).json({ error: "Missing plannerEmail or userEmail" });
      }

      const now = new Date().toISOString();
      const { error: upErr } = await supabaseAdmin
        .from("user_connections")
        .upsert(
          {
            planner_email: plannerEmail,
            user_email: userEmail,
            groups,
            updated_at: now,
          },
          { onConflict: "planner_email,user_email" }
        );

      if (upErr) return res.status(500).json({ error: upErr.message });
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
