// /api/invite/preview.js
// GET-only. Reuses existing invite for (planner_email,user_email) or creates one,
// and returns a stable OAuth start URL as JSON.

import { supabaseAdmin } from "../../lib/supabase-admin.js";

function norm(v) { return (v ?? "").toString().trim(); }
function lowerEmail(v) { return norm(v).toLowerCase(); }
function siteBase(req) {
  const envSite = norm(process.env.SITE_URL);
  if (envSite) return envSite.replace(/\/+$/,"");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  const proto = (req.headers["x-forwarded-proto"] || "https").toString();
  return host ? `${proto}://${host}` : "https://www.plan2tasks.com";
}

async function getExistingInvite(plannerEmail, userEmail) {
  return await supabaseAdmin
    .from("invites")
    .select("id, used_at")
    .eq("planner_email", plannerEmail)
    .eq("user_email", userEmail)
    .limit(1)
    .maybeSingle();
}

async function createInvite(plannerEmail, userEmail) {
  return await supabaseAdmin
    .from("invites")
    .insert({ planner_email: plannerEmail, user_email: userEmail })
    .select("id, used_at")
    .single();
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

    // 1) Try to reuse existing
    let { data: exist, error: existErr } = await getExistingInvite(plannerEmail, userEmail);
    if (existErr) {
      // Non-fatal: just log and continue to create
      console.error("invite/preview select error:", existErr);
    }

    let reused = false;
    let row = exist;

    // 2) If none, create
    if (!row) {
      const ins = await createInvite(plannerEmail, userEmail);
      if (ins.error) {
        // If unique violation raced, select again
        const msg = ins.error?.message || "";
        const detail = ins.error?.details || "";
        if (/duplicate key/i.test(msg) || /duplicate key/i.test(detail)) {
          const again = await getExistingInvite(plannerEmail, userEmail);
          if (again.error) {
            return res.status(500).json({ ok:false, error: again.error.message || "Failed to reuse invite" });
          }
          row = again.data;
          reused = true;
        } else {
          return res.status(500).json({
            ok:false,
            error: ins.error.message || "Failed to create invite",
            detail: ins.error.details || null,
            hint: ins.error.hint || null
          });
        }
      } else {
        row = ins.data;
      }
    } else {
      reused = true;
    }

    if (!row?.id) {
      return res.status(500).json({ ok:false, error: "Invite row missing id" });
    }

    const base = siteBase(req);
    const url = `${base}/api/google/start?invite=${encodeURIComponent(row.id)}`;

    return res.status(200).json({
      ok: true,
      inviteId: row.id,
      url,
      reused,
      used: !!row.used_at
    });
  } catch (e) {
    console.error("invite/preview error:", e);
    return res.status(500).json({ ok:false, error: e.message || "Server error" });
  }
}
