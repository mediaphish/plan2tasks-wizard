// /api/inbox/assign.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  try {
    const { plannerEmail, inboxId, userEmail } = req.body || {};
    if (!plannerEmail || !inboxId || !userEmail) {
      res.status(200).json({ ok: false, error: 'Missing plannerEmail, inboxId, or userEmail' });
      return;
    }

    // Ensure bundle exists and is not archived
    const { data: bundle, error: findErr } = await supabase
      .from('inbox_bundles')
      .select('id, title, start_date, timezone, suggested_user, assigned_user_email, assigned_at, archived_at')
      .eq('id', inboxId)
      .single();

    if (findErr || !bundle) {
      res.status(200).json({ ok: false, error: 'Bundle not found' });
      return;
    }
    if (bundle.archived_at) {
      res.status(200).json({ ok: false, error: 'Bundle is archived and cannot be assigned' });
      return;
    }

    // Assign (or reassign)
    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
      .from('inbox_bundles')
      .update({
        assigned_user_email: userEmail,
        assigned_at: nowIso
      })
      .eq('id', inboxId)
      .select('id, title, start_date, timezone, suggested_user, assigned_user_email, assigned_at, archived_at')
      .single();

    if (updErr) {
      res.status(200).json({ ok: false, error: `assign_failed: ${updErr.message}` });
      return;
    }

    res.status(200).json({
      ok: true,
      plannerEmail,
      inboxId,
      assigned_user: userEmail,
      assigned_at: updated.assigned_at,
      bundle: updated
    });
  } catch (e) {
    res.status(200).json({ ok: false, error: `internal_error: ${e.message}` });
  }
}
