import { supabase } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });
  
  const { user_id, id, amount_rp, note } = req.body;

  if (!user_id || !id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const { data: user } = await supabase.from('users').select('id').eq('telegram_user_id', user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Update the transaction
    const { data, error } = await supabase
      .from('transactions')
      .update({
        amount_rp: Number(amount_rp),
        note: note
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select();

    if (error) throw error;
    
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('Edit API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
