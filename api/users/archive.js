// api/users/archive.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "POST only" });
  }
  try {
    const { plannerEmail, userEmail, archived = true } = req.body || {};
    if (!plannerEmail || !userEmail) {
      return res.status(400).json({ ok: false, error: "Missing plannerEmail or userEmail" });
    }

    const pe = String(plannerEmail).toLowerCase().trim();
    const ue = String(userEmail).toLowerCase().trim();

    // Fetch existing connection
    const { data: rows, error: selErr } = await supabaseAdmin
      .from("user_connections")
      .select("*")
      .eq("planner_email", pe)
      .eq("user_email", ue)
      .limit(1);

    if (selErr) throw selErr;

    if (!rows || rows.length === 0) {
      // Create if missing (edge case): default to archived/pending status with empty groups
      const nextStatus = archived ? "archived" : "pending";
      const { error: insErr } = await supabaseAdmin
        .from("user_connections")
        .upsert(
          {
            planner_email: pe,
            user_email: ue,
            status: nextStatus,
            groups: [],
            updated_at: new Date().toISOString(),
          },
          { onConflict: "planner_email,user_email" }
        );
      if (insErr) throw insErr;
      return res.json({ ok: true, status: nextStatus, created: true });
    }

    const row = rows[0];
    let nextStatus;
    if (archived) {
      nextStatus = "archived";
    } else {
      // If unarchiving, infer status from presence of Google tokens
      const hasTokens = !!(row.google_refresh_token || row.google_access_token);
      nextStatus = hasTokens ? "connected" : "pending";
    }

    const { error: updErr } = await supabaseAdmin
      .from("user_connections")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("planner_email", pe)
      .eq("user_email", ue);

    if (updErr) throw updErr;

    return res.json({ ok: true, status: nextStatus });
  } catch (e) {
    console.error("users/archive error", e);
    return res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
}
