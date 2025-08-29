// /api/users.js
import { supabaseAdmin } from "../lib/supabase-admin.js";

function normEmail(e) {
  return String(e || "").trim().toLowerCase();
}
function deriveStatus(row) {
  const explicit = String(row.status || "").toLowerCase();
  if (explicit === "archived") return "archived";
  if (explicit === "deleted") return "deleted";
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

      // 1) Pull ALL connections for the planner (we filter after)
      const { data: allConn, error: ucErr } = await supabaseAdmin
        .from("user_connections")
        .select("user_email, groups, status, google_refresh_token, updated_at")
        .ilike("planner_email", plannerEmail);
      if (ucErr) throw ucErr;

      // Map by normalized email
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
          __source: "connection",
        });
      }

      // 2) Merge invites only for active/all (never for archived or deleted)
      const merged = new Map(connMap);
      if (status !== "archived" && status !== "deleted") {
        const { data: invRows, error: invErr } = await supabaseAdmin
          .from("invites")
          .select("user_email, used_at")
          .ilike("planner_email", plannerEmail);
        if (invErr) throw invErr;

        // Deduplicate invites by normalized email and prefer "used" if mixed
        const inviteByEmail = new Map();
        for (const r of invRows || []) {
          const emailRaw = r.user_email || "";
          const key = normEmail(emailRaw);
          if (!key) continue;
          const used = !!r.used_at;
          const prev = inviteByEmail.get(key);
          if (!prev || (used && !prev.used)) {
            inviteByEmail.set(key, { email: emailRaw.trim(), used });
          }
        }

        for (const [key, row] of inviteByEmail) {
          if (merged.has(key)) continue; // connection beats invite
          merged.set(key, {
            email: row.email,
            groups: [],
            status: row.used ? "connected" : "pending",
            updated_at: null,
            __source: "invite",
          });
        }
      }

      // 3) Final array + **final dedupe** (belt & suspenders), then status filter
      const finalMap = new Map();
      for (const v of merged.values()) {
        const k = normEmail(v.email);
        if (!finalMap.has(k)) finalMap.set(k, v);
      }
      let users = Array.from(finalMap.values());

      if (status === "archived") {
        users = users.filter(u => u.status === "archived");
      } else if (status === "deleted") {
        users = users.filter(u => u.status === "deleted");
      } else if (status === "active") {
        users = users.filter(u => u.status !== "archived" && u.status !== "deleted");
      }

      users.sort((a, b) => a.email.localeCompare(b.email));
      return res.json({ ok: true, users });
    }

    if (req.method === "POST") {
      // Upsert groups on user_connections
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
