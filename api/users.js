// /api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { plannerEmail, status = "active" } = req.query || {};
      if (!plannerEmail) {
        return res.status(400).json({ ok: false, error: "Missing plannerEmail" });
      }

      // 1) Pull user_connections
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

      // Map by normalized email
      const usersMap = new Map();
      for (const r of ucRows || []) {
        const emailRaw = r.user_email || "";
        const key = normEmail(emailRaw);

        const explicit = String(r.status || "").toLowerCase();
        const effStatus =
          explicit === "archived"
            ? "archived"
            : r.google_refresh_token
            ? "connected"
            : explicit || "pending";

        usersMap.set(key, {
          email: emailRaw.trim(), // preserve original casing for display
          groups: Array.isArray(r.groups) ? r.groups : [],
          status: effStatus,
          updated_at: r.updated_at || null,
        });
      }

      // 2) Merge invites ONLY when not viewing archived
      if (status !== "archived") {
        const { data: invRows, error: invErr } = await supabaseAdmin
          .from("invites")
          .select("user_email, used_at")
          .ilike("planner_email", plannerEmail);
        if (invErr) throw invErr;

        for (const r of invRows || []) {
          const emailRaw = r.user_email || "";
          const key = normEmail(emailRaw);
          if (!key) continue;

          // If a connection exists (any status), do NOT add a second user from invites
          if (usersMap.has(key)) continue;

          const used = !!r.used_at;
          usersMap.set(key, {
            email: emailRaw.trim(),
            groups: [],
            status: used ? "connected" : "pending",
            updated_at: null,
          });
        }
      }

      // 3) Final filter (safety)
      let users = Array.from(usersMap.values());
      if (status === "archived") {
        users = users.filter((u) => u.status === "archived");
      } else if (status === "active") {
        users = users.filter((u) => u.status !== "archived");
      }

      users.sort((a, b) => a.email.localeCompare(b.email));
      return res.json({ ok: true, users });
    }

    if (req.method === "POST") {
      // Upsert groups
      const { plannerEmail, userEmail, groups } = req.body || {};
      if (!plannerEmail || !userEmail) {
        return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
      }
      const list = Array.isArray(groups) ? groups : [];

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
          .insert([
            {
              planner_email: plannerEmail,
              user_email: userEmail,
              groups: list,
              status: "pending",
            },
          ]);
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
