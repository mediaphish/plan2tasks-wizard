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

  const { plannerEmail } = req.query || {};
  const supabase = supabaseAdmin();

  let rows;

  // Try selecting with planner_email; if the column doesn't exist, fall back cleanly.
  let { data, error } = await supabase
    .from("user_connections")
    .select("planner_email,user_email,status,invite_code")
    .order("user_email", { ascending: true });

  if (error) {
    // Fallback: select without planner_email column
    const resp = await supabase
      .from("user_connections")
      .select("user_email,status,invite_code")
      .order("user_email", { ascending: true });

    if (resp.error) {
      return res.status(500).json({ error: resp.error.message });
    }
    rows = resp.data || [];
  } else {
    rows = data || [];
  }

  // Filter by plannerEmail only if the column exists in the result rows
  if (plannerEmail) {
    const hasPlanner = rows.length && Object.prototype.hasOwnProperty.call(rows[0], "planner_email");
    if (hasPlanner) {
      rows = rows.filter(
        (r) => (r.planner_email || "").toLowerCase() === plannerEmail.toLowerCase()
      );
    }
  }

  const base = absoluteBase(req);
  const users = rows.map((r) => ({
    email: r.user_email,
    status: r.status || "invited",
    inviteLink: r.invite_code ? `${base}/api/google/start?invite=${r.invite_code}` : null,
  }));

  return res.status(200).json({ users });
}
