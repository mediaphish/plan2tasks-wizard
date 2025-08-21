// api/users/update.js
import { randomBytes } from "crypto";
import { supabaseAdmin } from "../../lib/supabase.js";

function absoluteBase(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, userEmail, newEmail } = req.body || {};
  if (!plannerEmail || !userEmail || !newEmail) return res.status(400).json({ error: "Missing fields" });

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("user_connections")
    .select("id,status")
    .eq("planner_email", plannerEmail)
    .eq("user_email", userEmail)
    .single();

  if (error || !data) return res.status(404).json({ error: "User not found" });
  if (data.status === "connected") return res.status(400).json({ error: "Cannot edit a connected user. Delete and re-invite." });

  const invite_code = randomBytes(16).toString("hex");
  const upd = await sb
    .from("user_connections")
    .update({ user_email: newEmail, status: "invited", invite_code })
    .eq("id", data.id)
    .select()
    .single();

  if (upd.error) return res.status(500).json({ error: upd.error.message });

  const inviteLink = `${absoluteBase(req)}/api/google/start?invite=${invite_code}`;
  return res.status(200).json({ inviteLink });
}
