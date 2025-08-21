// api/users/list.js
import { supabaseAdmin } from "../../lib/supabase.js";

function absoluteBase(req) {
  const env = process.env.APP_BASE_URL;
  if (env) return env.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const plannerEmail = req.query.plannerEmail;
  const status = req.query.status;    // "connected" | "invited" | undefined
  const groupId = req.query.groupId;  // uuid | "null" | ""
  const q = req.query.q || "";        // search by email (ilike)

  if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

  const sb = supabaseAdmin();

  // 1) Base users
  let usersQuery = sb.from("user_connections")
    .select("user_email,status,invite_code,updated_at")
    .eq("planner_email", plannerEmail);

  if (status) usersQuery = usersQuery.eq("status", status);
  if (q) usersQuery = usersQuery.ilike("user_email", `%${q}%`);

  const { data: usersRaw, error: e1 } = await usersQuery.order("updated_at", { ascending: false });
  if (e1) return res.status(500).json({ error: e1.message });

  const emails = (usersRaw || []).map(r => r.user_email);
  const base = absoluteBase(req);

  // Early return if no users
  if (emails.length === 0) return res.status(200).json({ users: [] });

  // 2) Memberships for these users
  let memQuery = sb.from("user_group_members")
    .select("user_email, group_id")
    .eq("planner_email", plannerEmail)
    .in("user_email", emails);

  if (groupId && groupId !== "null") memQuery = memQuery.eq("group_id", groupId);

  const { data: members, error: e2 } = await memQuery;
  if (e2) return res.status(500).json({ error: e2.message });

  // If filtering for "no group"
  let emailsWithGroup = new Set((members || []).map(m => m.user_email));
  let filteredUsers = usersRaw;
  if (groupId === "null") {
    filteredUsers = usersRaw.filter(u => !emailsWithGroup.has(u.user_email));
  } else if (groupId) {
    filteredUsers = usersRaw.filter(u => emailsWithGroup.has(u.user_email));
  }

  // 3) Load group names for the groups we saw
  const groupIds = [...new Set((members || []).map(m => m.group_id).filter(Boolean))];
  let groupMap = new Map();
  if (groupIds.length > 0) {
    const { data: groups, error: e3 } = await sb.from("user_groups")
      .select("id,name")
      .eq("planner_email", plannerEmail)
      .in("id", groupIds);
    if (e3) return res.status(500).json({ error: e3.message });
    groupMap = new Map((groups || []).map(g => [g.id, g.name]));
  }

  // 4) Build response
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
