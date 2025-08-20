// api/invite.js
import { supabaseAdmin } from "../lib/supabase.js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { plannerEmail, userEmail } = req.body || {};
  if (!plannerEmail || !userEmail) return res.status(400).json({ error: "Missing emails" });

  const invite_code = crypto.randomBytes(16).toString("hex");
  const supabase = supabaseAdmin();

  const { error } = await supabase
    .from("user_connections")
    .upsert(
      { planner_email: plannerEmail, user_email: userEmail, invite_code, status: "invited" },
      { onConflict: "user_email" }
    );

  if (error) return res.status(500).json({ error: error.message });

  const base = process.env.APP_BASE_URL; // e.g., https://plan2tasks-wizard.vercel.app
  const inviteLink = `${base}/api/google/start?invite=${invite_code}`;

  return res.status(200).json({ inviteLink });
}
