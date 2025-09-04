// api/inbox/assign.js
import { supabaseAdmin } from "../../lib/supabase-admin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const plannerEmail = String(req.body?.plannerEmail || "").toLowerCase();
    const inboxId = String(req.body?.inboxId || "").trim();
    const userEmail = String(req.body?.userEmail || "").toLowerCase();

    if (!plannerEmail || !inboxId || !userEmail) {
      return res.status(400).json({ error: "Missing plannerEmail, inboxId, or userEmail" });
    }

    // Verify bundle exists (don’t fail on status)
    const { data: bundle, error: bErr } = await supabaseAdmin
      .from("inbox_bundles")
      .select("id, planner_email, archived_at")
      .eq("id", inboxId)
      .single();

    if (bErr || !bundle) return res.status(404).json({ error: "Bundle not found" });
    if (bundle.archived_at) return res.status(400).json({ error: "Bundle is archived" });

    const now = new Date().toISOString();

    // Ensure the user connection exists so dropdowns populate
    const { error: connErr } = await supabaseAdmin
      .from("user_connections")
      .upsert(
        { planner_email: plannerEmail, user_email: userEmail, status: "connected", groups: [], updated_at: now },
        { onConflict: "planner_email,user_email" }
      );
    if (connErr) return res.status(500).json({ error: "Database error (connection)" });

    // Mark bundle as assigned
    const { error: updErr } = await supabaseAdmin
      .from("inbox_bundles")
      .update({ assigned_user_email: userEmail, assigned_at: now })
      .eq("id", inboxId);

    if (updErr) return res.status(500).json({ error: "Database error (assign)" });

    // Done: do NOT load tasks here (that caused your error)
    return res.json({ ok: true, inboxId, userEmail, assigned_at: now });
  } catch (e) {
    console.error("POST /api/inbox/assign error", e);
    return res.status(500).json({ error: "Server error" });
  }
}
