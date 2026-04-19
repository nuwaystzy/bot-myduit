import { getCashflowSummary, getPortfolioSummary, getCategoryStats } from '../lib/reports.js';
import { supabase } from '../lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    // 1. Get real user from Supabase (to ensure ID is valid)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name')
      .eq('telegram_user_id', user_id) // We use telegram_user_id in query for simplicity
      .single();

    if (!user) return res.status(404).json({ error: 'User not found' });

    const internalId = user.id;

    // 2. Fetch data in parallel
    const [cashflow, portfolio, categories] = await Promise.all([
      getCashflowSummary(internalId, 'month'),
      getPortfolioSummary(internalId),
      getCategoryStats(internalId, 'month')
    ]);

    const totalWealth = cashflow.net + portfolio.totalCurrentValue;

    return res.status(200).json({
      name: user.name,
      total: totalWealth,
      income: cashflow.income,
      expense: cashflow.expense,
      crypto_value: portfolio.totalCurrentValue,
      crypto_pnl: portfolio.totalPnL,
      crypto_pnl_percent: portfolio.totalPnLPercent,
      categories: categories
    });
  } catch (error) {
    console.error('Summary API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
