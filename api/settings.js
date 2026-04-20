import { supabase } from '../lib/db.js';

export default async function handler(req, res) {
  const tg_id = req.body?.tg_id || req.query?.tg_id;
  const get_status = req.body?.get_status || req.query?.get_status;
  const active = req.body?.active;

  if (!tg_id) return res.status(400).json({ error: 'Missing tg_id' });

  try {
      const { data: user } = await supabase.from('users').select('id').eq('telegram_user_id', tg_id).single();
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (get_status) {
          const { data: rem } = await supabase.from('reminders').select('active').eq('user_id', user.id).eq('type', 'daily').single();
          // If no row exists, we treat it as default ON (true)
          return res.json({ active: rem ? rem.active : true });
      }

      // Upsert
      const { data: existing } = await supabase.from('reminders').select('id').eq('user_id', user.id).eq('type', 'daily').single();
      if (existing) {
          await supabase.from('reminders').update({ active }).eq('id', existing.id);
      } else {
          await supabase.from('reminders').insert({ user_id: user.id, type: 'daily', active });
      }

      return res.json({ success: true, active });
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
}
