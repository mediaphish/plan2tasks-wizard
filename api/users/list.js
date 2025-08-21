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
  const status = req.query.status;     // "connected" | "invited" | undefined
  const groupId = req.query.groupId;   // uuid | undefined
  const q = req.query.q || "";         // search by email

  if (!plannerEmail) return res.status(400).json({ error: "Missing plannerEmail" });

  const sb = supabaseAdmin();
  let query = sb
    .from("user_connections")
    .select("user_email,status,invite_code,updated_at,group_id,user_groups(name)")
    .eq("planner_email", plannerEmail);

  if (status) query = query.eq("status", status);
  if (groupId === "null") query = query.is("group_id", null);
  else if (groupId) query = query.eq("group_id", groupId);
  if (q) query = query.ilike("user_email", `%${q}%`);

  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const base = absoluteBase(req);
  const users = (data || []).map((r) => ({
    email: r.user_email,
    status: r.status,
    inviteLink: r.invite_code ? `${base}/api/google/start?invite=${r.invite_code}` : null,
    updatedAt: r.updated_at,
    groupId: r.group_id || null,
    groupName: r.user_groups?.name || null,
  }));

  return res.status(200).json({ users });
}
