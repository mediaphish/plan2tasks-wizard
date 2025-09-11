// /api/debug/unassign-first-assigned.js
// Dev helper: move the most recently ASSIGNED (non-archived) bundle back to NEW
// by clearing assigned_user_email/assigned_at. No UI changes anywhere.

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
    // Find one assigned, non-archived bundle
    const { data: rows, error: selErr } = await supabase
      .from('inbox_bundles')
      .select('id, title, assigned_user_email, assigned_at, archived_at, start_date, timezone')
      .is('archived_at', null)
      .not('assigned_user_email', 'is', null)
      .order('assigned_at', { ascending: false })
      .limit(1);

    if (selErr) {
      res.status(200).json({ ok: false, error: `select_failed: ${selErr.message}` });
      return;
    }
    if (!rows || rows.length === 0) {
      res.status(200).json({ ok: false, error: 'no_assigned_bundles' });
      return;
    }

    const first = rows[0];

    // Clear assignment to move it back to NEW (do not touch columns that may not exist)
    const { data: updated, error: updErr } = await supabase
      .from('inbox_bundles')
      .update({
        assigned_user_email: null,
        assigned_at: null
      })
      .eq('id', first.id)
      .select('id, title, assigned_user_email, assigned_at, archived_at, start_date, timezone')
      .single();

    if (updErr) {
      res.status(200).json({ ok: false, error: `unassign_failed: ${updErr.message}` });
      return;
    }

    res.status(200).json({
      ok: true,
      inboxId: updated.id,
      title: updated.title,
      status: 'now_new',
      assigned_user_email: updated.assigned_user_email,
      assigned_at: updated.assigned_at
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: `internal_error: ${e.message}` });
  }
}
