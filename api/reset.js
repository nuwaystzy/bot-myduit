import { supabase } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { user_id } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const { data: user } = await supabase.from('users').select('id').eq('telegram_user_id', user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Hapus data transaksi, holding, dan budget
    await Promise.all([
      supabase.from('transactions').delete().eq('user_id', user.id),
      supabase.from('holdings').delete().eq('user_id', user.id),
      supabase.from('budgets').delete().eq('user_id', user.id)
    ]);

    return res.status(200).json({ success: true, message: 'Semua data telah dihapus.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
