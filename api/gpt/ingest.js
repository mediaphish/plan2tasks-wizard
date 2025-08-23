// api/gpt/ingest.js
import { supabaseAdmin } from '../../lib/supabase-admin.js';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Missing API key (Authorization: Bearer ...)' });

    const body = req.body || {};
    const {
      planner_email,
      source = 'gpt',
      task_list_title,
      start_date,
      timezone = 'America/Chicago',
      tasks = [],
      suggest_user = null
    } = body;

    if (!planner_email || !task_list_title || !start_date || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ error: 'Missing planner_email, task_list_title, start_date, or tasks[]' });
    }

    // Validate API key for this planner
    const { data: keys, error: kerr } = await supabaseAdmin
      .from('planner_api_keys')
      .select('id, hashed_key, revoked')
      .eq('planner_email', planner_email)
      .eq('revoked', false);

    if (kerr) return res.status(500).json({ error: kerr.message });

    let ok = false;
    for (const k of (keys || [])) {
      if (await bcrypt.compare(token, k.hashed_key)) { ok = true; break; }
    }
    if (!ok) return res.status(401).json({ error: 'Invalid API key' });

    // Create bundle
    const { data: bundle, error: berr } = await supabaseAdmin
      .from('inbox_bundles')
      .insert({
        planner_email,
        source,
        title: task_list_title,
        start_date,
        timezone,
        suggested_user: suggest_user || null
      })
      .select()
      .single();

    if (berr) return res.status(500).json({ error: berr.message });

    // Insert tasks
    const cleaned = tasks.map(t => ({
      bundle_id: bundle.id,
      title: String(t.title || '').slice(0, 200),
      day_offset: Number(t.day_offset || 0),
      time: t.time || null,
      duration_mins: t.duration_mins ? Number(t.duration_mins) : null,
      notes: t.notes || null
    }));

    const { error: terr } = await supabaseAdmin.from('inbox_tasks').insert(cleaned);
    if (terr) return res.status(500).json({ error: terr.message });

    return res.status(200).json({ inbox_id: bundle.id, count: cleaned.length });
  } catch (e) {
    console.error('ingest error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
