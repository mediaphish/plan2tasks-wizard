// /api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { plannerEmail, status = "active" } = req.query || {};
      if (!plannerEmail) {
        return res.status(400).json({ ok: false, error: "Missing plannerEmail" });
      }

      // 1) Fetch user_connections for this planner
      let q = supabaseAdmin
        .from("user_connections")
        .select("user_email, groups, status, google_refresh_token, google_access_token, google_expires_at, updated_at")
        .ilike("planner_email", plannerEmail);

      if (status === "archived") {
        q = q.eq("status", "archived");
      } else if (status === "active") {
        q = q.neq("status", "archived");
      }

      const { data: ucRows, error: ucErr } = await q;
      if (ucErr) throw ucErr;

      // Normalize rows and derive status (unless explicitly archived)
      const usersMap = new Map();
      for (const r of ucRows || []) {
        const email = (r.user_email || "").trim();
        const explicitStatus = (r.status || "").toLowerCase();
        let effStatus = explicitStatus === "archived"
          ? "archived"
          : (r.google_refresh_token ? "connected" : (explicitStatus || "pending"));

        usersMap.set(email, {
          email,
          groups: Array.isArray(r.groups) ? r.groups : [],
          status: effStatus,
          updated_at: r.updated_at || null
        });
      }

      // 2) Merge invites (only for active/all); do not show invites on archived view
      if (status !== "archived") {
        const { data: invRows, error: invErr } = await supabaseAdmin
          .from("invites")
          .select("user_email, used_at")
          .ilike("planner_email", plannerEmail);
        if (invErr) throw invErr;

        for (const r of invRows || []) {
          const email = (r.user_email || "").trim();
          if (!email) continue;
          if (usersMap.has(email)) continue; // already have a connection row
          const used = !!r.used_at;
          // If invite used and there's *no* user_connections row, treat as connected; else pending
          usersMap.set(email, {
            email,
            groups: [],
            status: used ? "connected" : "pending",
            updated_at: null
          });
        }
      }

      // 3) Filter by requested status *after* merge (safety net)
      let users = Array.from(usersMap.values());
      if (status === "archived") {
        users = users.filter(u => u.status === "archived");
      } else if (status === "active") {
        users = users.filter(u => u.status !== "archived");
      }

      users.sort((a, b) => a.email.localeCompare(b.email));
      return res.json({ ok: true, users });
    }

    if (req.method === "POST") {
      // Upsert groups to user_connections for (planner_email, user_email)
      const { plannerEmail, userEmail, groups } = req.body || {};
      if (!plannerEmail || !userEmail) {
        return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
      }
      const list = Array.isArray(groups) ? groups : [];

      // Make sure a row exists, then update groups
      // If no row, insert with status 'pending' by default
      const { data: existing, error: selErr } = await supabaseAdmin
        .from("user_connections")
        .select("planner_email, user_email")
        .ilike("planner_email", plannerEmail)
        .ilike("user_email", userEmail)
        .maybeSingle();
      if (selErr && selErr.code !== "PGRST116") throw selErr;

      if (!existing) {
        const { error: insErr } = await supabaseAdmin
          .from("user_connections")
          .insert([{
            planner_email: plannerEmail,
            user_email: userEmail,
            groups: list,
            status: "pending"
          }]);
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabaseAdmin
          .from("user_connections")
          .update({ groups: list })
          .ilike("planner_email", plannerEmail)
          .ilike("user_email", userEmail);
        if (updErr) throw updErr;
      }

      return res.json({ ok: true });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (e) {
    console.error("users endpoint error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
