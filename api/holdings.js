import { getPortfolioSummary } from '../lib/reports.js';
import { supabase } from '../lib/db.js';

export default async function handler(req, res) {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const { data: user } = await supabase.from('users').select('id').eq('telegram_user_id', user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const portfolio = await getPortfolioSummary(user.id);
    return res.status(200).json(portfolio.items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
