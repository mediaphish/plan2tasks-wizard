// api/inbox/index.js
import { supabaseAdmin } from '../../lib/supabase-admin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
    const plannerEmail = req.query.plannerEmail || req.query.planner_email;
    if (!plannerEmail) return res.status(400).json({ error: 'plannerEmail required' });

    const { data: bundles, error: berr } = await supabaseAdmin
      .from('inbox_bundles')
      .select('id, source, title, start_date, timezone, suggested_user, assigned_user_email, assigned_at, created_at')
      .eq('planner_email', plannerEmail)
      .order('created_at', { ascending: false });

    if (berr) return res.status(500).json({ error: berr.message });

    const ids = (bundles || []).map(b => b.id);
    let countsMap = {};
    if (ids.length) {
      const { data: counts, error: cerr } = await supabaseAdmin
        .from('inbox_tasks')
        .select('bundle_id, count:id')
        .in('bundle_id', ids)
        .group('bundle_id');

      if (!cerr && counts) {
        for (const row of counts) countsMap[row.bundle_id] = Number(row.count || 0);
      }
    }
    const out = (bundles || []).map(b => ({ ...b, count: countsMap[b.id] || 0 }));
    return res.status(200).json({ bundles: out });
  } catch (e) {
    console.error('inbox/list error', e);
    return res.status(500).json({ error: 'Server error' });
  }
}
