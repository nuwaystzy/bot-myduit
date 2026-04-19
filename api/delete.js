import { supabase } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });
  const { user_id, id } = req.query; // id is transaction id

  try {
    const { data: user } = await supabase.from('users').select('id').eq('telegram_user_id', user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Note: This simple delete doesn't reverse crypto holding logic for now
    // In full app, deleting a 'buy' tx should decrease holding qty
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) throw error;
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
