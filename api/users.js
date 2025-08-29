// /api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function deriveStatus(row) {
  const explicit = String(row.status || "").toLowerCase();
  if (explicit === "archived") return "archived";
  if (row.google_refresh_token) return "connected";
  return explicit || "pending";
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { plannerEmail, status = "active" } = req.query || {};
      if (!plannerEmail) {
        return res.status(400).json({ ok: false, error: "Missing plannerEmail" });
      }

      // 1) Always pull ALL connections for this planner (no status filter here)
      const { data: allConn, error: ucErr } = await supabaseAdmin
        .from("user_connections")
        .select("user_email, groups, status, google_refresh_token, updated_at")
        .ilike("planner_email", plannerEmail);
      if (ucErr) throw ucErr;

      // Map of ANY connection by normalized email
      const connMap = new Map();
      for (const r of allConn || []) {
        const emailRaw = r.user_email || "";
        const key = normEmail(emailRaw);
        if (!key) continue;
        connMap.set(key, {
          email: emailRaw.trim(),
          groups: Array.isArray(r.groups) ? r.groups : [],
          status: deriveStatus(r),
          updated_at: r.updated_at || null,
          __hasConnection: true,
        });
      }

      // 2) Merge invites ONLY if viewing active/all, and NEVER if a connection exists (even archived)
      const usersMap = new Map(connMap);
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

          // Skip if *any* connection row exists for this email (even archived)
          if (connMap.has(key)) continue;

          const used = !!r.used_at;
          usersMap.set(key, {
            email: emailRaw.trim(),
            groups: [],
            status: used ? "connected" : "pending",
            updated_at: null,
          });
        }
      }

      // 3) Final filter by requested status
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
      // Upsert groups to user_connections
      const { plannerEmail, userEmail, groups } = req.body || {};
      if (!plannerEmail || !userEmail) {
        return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
      }
      const list = Array.isArray(groups) ? groups : [];

      // Check existence
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
          .insert([{ planner_email: plannerEmail, user_email: userEmail, groups: list, status: "pending" }]);
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
