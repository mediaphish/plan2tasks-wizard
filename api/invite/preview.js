// /api/invite/preview.js
// GET-only. Creates (or reuses) an invite row and returns an OAuth start URL as JSON.
// Tables used: public.invites(id uuid default gen_random_uuid(), planner_email text, user_email text, used_at timestamptz)

import { supabaseAdmin } from "../../lib/supabase-admin.js";

function norm(v) { return (v ?? "").toString().trim(); }
function lowerEmail(v) { return norm(v).toLowerCase(); }
function siteBase(req) {
  const envSite = norm(process.env.SITE_URL);
  if (envSite) return envSite.replace(/\/+$/,"");
  // Fallback to host header if SITE_URL not set
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  return host ? `${proto}://${host}` : "https://www.plan2tasks.com";
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ ok:false, error: "Method Not Allowed" });
    }

    const plannerEmail = lowerEmail(req.query.plannerEmail);
    const userEmail = lowerEmail(req.query.userEmail);

    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok:false, error: "Missing plannerEmail or userEmail" });
    }

    // Create a fresh invite each time (simpler + guarantees a valid id)
    const ins = await supabaseAdmin
      .from("invites")
      .insert({ planner_email: plannerEmail, user_email: userEmail })
      .select("id")
      .single();

    if (ins.error) {
      return res.status(500).json({
        ok:false,
        error: ins.error.message || "Failed to create invite",
        detail: ins.error.details || null,
        hint: ins.error.hint || null
      });
    }

    const id = ins.data?.id;
    if (!id) return res.status(500).json({ ok:false, error: "Invite created without id" });

    const base = siteBase(req);
    const url = `${base}/api/google/start?invite=${encodeURIComponent(id)}`;

    return res.status(200).json({
      ok: true,
      inviteId: id,
      url
    });
  } catch (e) {
    console.error("invite/preview error:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
