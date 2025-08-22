// api/users.js
export const config = { runtime: "nodejs" };

import { supabaseAdmin } from "../lib/supabase.js";

function absoluteBase(req) {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  try {
    const op = (req.query.op || (req.body && req.body.op) || "").toString();
    const sb = supabaseAdmin();

    // -------- LIST (GET) --------
    if (req.method === "GET" && op === "list") {
      const plannerEmail = req.query.plannerEmail;
      const status = req.query.status;    // "connected" | "invited" | undefined
      const groupId = req.query.groupId;  // uuid | "null" | ""
      const q = req.query.q || "";

      if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

      let usersQuery = sb
        .from("user_connections")
        .select("user_email,status,invite_code,updated_at")
        .eq("planner_email", plannerEmail);

      if (status) usersQuery = usersQuery.eq("status", status);
      if (q) usersQuery = usersQuery.ilike("user_email", `%${q}%`);

      const { data: usersRaw, error: e1 } = await usersQuery.order("updated_at", { ascending: false });
      if (e1) return res.status(500).json({ error: e1.message });

      const emails = (usersRaw || []).map(r => r.user_email);
      const base = absoluteBase(req);
      if (emails.length === 0) return res.status(200).json({ users: [] });

      let memQuery = sb
        .from("user_group_members")
        .select("user_email, group_id")
        .eq("planner_email", plannerEmail)
        .in("user_email", emails);

      if (groupId && groupId !== "null") memQuery = memQuery.eq("group_id", groupId);

      const { data: members, error: e2 } = await memQuery;
      if (e2) return res.status(500).json({ error: e2.message });

      let filteredUsers = usersRaw;
      if (groupId === "null") {
        const withGroup = new Set((members || []).map(m => m.user_email));
        filteredUsers = usersRaw.filter(u => !withGroup.has(u.user_email));
      } else if (groupId) {
        const withGroup = new Set((members || []).map(m => m.user_email));
        filteredUsers = usersRaw.filter(u => withGroup.has(u.user_email));
      }

      const groupIds = [...new Set((members || []).map(m => m.group_id).filter(Boolean))];
      let groupMap = new Map();
      if (groupIds.length > 0) {
        const { data: groups, error: e3 } = await sb
          .from("user_groups")
          .select("id,name")
          .eq("planner_email", plannerEmail)
          .in("id", groupIds);
        if (e3) return res.status(500).json({ error: e3.message });
        groupMap = new Map((groups || []).map(g => [g.id, g.name]));
      }

      const groupsByEmail = new Map();
      for (const m of (members || [])) {
        if (!groupsByEmail.has(m.user_email)) groupsByEmail.set(m.user_email, []);
        const name = groupMap.get(m.group_id) || null;
        groupsByEmail.get(m.user_email).push({ id: m.group_id, name });
      }

      const users = filteredUsers.map(r => ({
        email: r.user_email,
        status: r.status,
        updatedAt: r.updated_at,
        inviteLink: r.invite_code ? `${base}/api/google/start?invite=${r.invite_code}` : null,
        groups: groupsByEmail.get(r.user_email) || []
      }));

      return res.status(200).json({ users });
    }

    // -------- UPDATE EMAIL (POST) --------
    if (req.method === "POST" && op === "update") {
      const { plannerEmail, userEmail, newEmail } = req.body || {};
      if (!plannerEmail || !userEmail || !newEmail) {
        return res.status(400).json({ error: "Missing plannerEmail, userEmail, or newEmail" });
      }

      // Update connection
      const { error: e1 } = await sb
        .from("user_connections")
        .update({ user_email: newEmail })
        .eq("planner_email", plannerEmail)
        .eq("user_email", userEmail);
      if (e1) return res.status(500).json({ error: e1.message });

      // Cascade to memberships
      const { error: e2 } = await sb
        .from("user_group_members")
        .update({ user_email: newEmail })
        .eq("planner_email", plannerEmail)
        .eq("user_email", userEmail);
      if (e2) return res.status(500).json({ error: e2.message });

      return res.status(200).json({ ok: true });
    }

    // -------- DELETE USER (POST) --------
    if (req.method === "POST" && op === "delete") {
      const { plannerEmail, userEmail } = req.body || {};
      if (!plannerEmail || !userEmail) return res.status(400).json({ error: "Missing plannerEmail or userEmail" });

      // Delete memberships first
      const { error: e1 } = await sb
        .from("user_group_members")
        .delete()
        .eq("planner_email", plannerEmail)
        .eq("user_email", userEmail);
      if (e1) return res.status(500).json({ error: e1.message });

      // Delete connection
      const { error: e2 } = await sb
        .from("user_connections")
        .delete()
        .eq("planner_email", plannerEmail)
        .eq("user_email", userEmail);
      if (e2) return res.status(500).json({ error: e2.message });

      return res.status(200).json({ ok: true });
    }

    // -------- SET GROUPS (POST) --------
    if (req.method === "POST" && op === "set-groups") {
      const { plannerEmail, userEmail, groupIds } = req.body || {};
      if (!plannerEmail || !userEmail || !Array.isArray(groupIds)) {
        return res.status(400).json({ error: "Missing plannerEmail, userEmail, or groupIds[]" });
      }

      const { data: existing, error: e1 } = await sb
        .from("user_group_members")
        .select("group_id")
        .eq("planner_email", plannerEmail)
        .eq("user_email", userEmail);
      if (e1) return res.status(500).json({ error: e1.message });

      const have = new Set((existing || []).map(r => r.group_id));
      const want = new Set(groupIds);
      const toAdd = [...want].filter(id => !have.has(id));
      const toRemove = [...have].filter(id => !want.has(id));

      if (toAdd.length) {
        const rows = toAdd.map(id => ({ planner_email: plannerEmail, user_email: userEmail, group_id: id }));
        const { error: e2 } = await sb.from("user_group_members").insert(rows);
        if (e2) return res.status(500).json({ error: e2.message });
      }
      if (toRemove.length) {
        const { error: e3 } = await sb
          .from("user_group_members")
          .delete()
          .eq("planner_email", plannerEmail)
          .eq("user_email", userEmail)
          .in("group_id", toRemove);
        if (e3) return res.status(500).json({ error: e3.message });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Use ?op=list (GET) or ?op=update/delete/set-groups (POST)" });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
