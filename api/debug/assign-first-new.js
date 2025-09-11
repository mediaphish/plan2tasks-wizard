// /api/debug/assign-first-new.js
// Purpose: One-click assignment for the first NEW bundle for a planner, via GET.
// Notes: Read-only safe except for the assignment update. Uses the same "new list"
//        selection logic by calling your existing /api/inbox endpoint.

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const plannerEmail = (req.query.plannerEmail || '').toString().trim();
    const userEmail = (req.query.userEmail || '').toString().trim();

    if (!plannerEmail || !userEmail) {
      res.status(200).json({ ok: false, error: 'Missing plannerEmail or userEmail' });
      return;
    }

    // Pull the current NEW bundles using your public API to match its logic.
    const inboxUrl = `https://www.plan2tasks.com/api/inbox?status=new&plannerEmail=${encodeURIComponent(plannerEmail)}`;
    const r = await fetch(inboxUrl, { method: 'GET' });
    if (!r.ok) {
      res.status(200).json({ ok: false, error: `inbox_fetch_failed: HTTP ${r.status}` });
      return;
    }
    const body = await r.json().catch(() => ({}));
    const bundles = Array.isArray(body?.bundles) ? body.bundles : [];

    if (!bundles.length) {
      res.status(200).json({ ok: false, error: 'no_new_bundles' });
      return;
    }

    const first = bundles[0];
    const inboxId = first.id || first.inboxId;
    if (!inboxId) {
      res.status(200).json({ ok: false, error: 'bundle_missing_id' });
      return;
    }

    // Assign (or reassign) this bundle to the user.
    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('inbox_bundles')
      .update({
        assigned_user_email: userEmail,
        assigned_at: nowIso,
        updated_at: nowIso
      })
      .eq('id', inboxId)
      .is('archived_at', null)
      .select('id, title, start_date, timezone, suggested_user, assigned_user_email, assigned_at, archived_at')
      .single();

    if (updErr) {
      res.status(200).json({ ok: false, error: `assign_failed: ${updErr.message}` });
      return;
    }

    res.status(200).json({
      ok: true,
      plannerEmail,
      userEmail,
      inboxId,
      assigned_at: updated.assigned_at,
      bundle: updated
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: `internal_error: ${e.message}` });
  }
}
