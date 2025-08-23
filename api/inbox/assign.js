// api/inbox/assign.js
import { supabaseAdmin } from '../../lib/supabase-admin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { plannerEmail, inboxId, userEmail } = req.body || {};
    if (!plannerEmail || !inboxId || !userEmail) return res.status(400).json({ error: 'plannerEmail, inboxId, userEmail required' });

    const { data: bundle, error: berr } = await supabaseAdmin
      .from('inbox_bundles')
      .select('*')
      .eq('id', inboxId)
      .eq('planner_email', plannerEmail)
      .single();

    if (berr || !bundle) return res.status(404).json({ error: 'Bundle not found' });

    const { data: tasks, error: terr } = await supabaseAdmin
      .from('inbox_tasks')
      .select('id, title, day_offset, time, duration_mins, notes')
      .eq('bundle_id', inboxId);

    if (terr) return res.status(500).json({ error: terr.message });

    await supabaseAdmin
      .from('inbox_bundles')
      .update({ assigned_user_email: userEmail, assigned_at: new Date().toISOString() })
      .eq('id', inboxId);

    return res.status(200).json({
      plan: { title: bundle.title, startDate: bundle.start_date, timezone: bundle.timezone },
      tasks: tasks.map(t => ({
        title: t.title,
        dayOffset: Number(t.day_offset || 0),
        time: t.time || undefined,
        durationMins: t.duration_mins || 60,
        notes: t.notes || ''
      }))
    });
  } catch (e) {
    console.error('inbox/assign error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
