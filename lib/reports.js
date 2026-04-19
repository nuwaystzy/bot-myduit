import { supabase } from './db.js';
import { getCryptoPrice } from './prices.js';

/**
 * Get summary of cashflow (income/expense)
 */
export async function getCashflowSummary(userId, period = 'today') {
  let query = supabase
    .from('transactions')
    .select('amount_rp, type, category')
    .eq('user_id', userId)
    .in('type', ['income', 'expense']);

  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.setHours(0,0,0,0)).toISOString();
    query = query.gte('created_at', start);
  } else if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    query = query.gte('created_at', start);
  }

  const { data, error } = await query;
  
  const income = data?.filter(t => t.type === 'income').reduce((acc, t) => acc + Number(t.amount_rp), 0) || 0;
  const expense = data?.filter(t => t.type === 'expense').reduce((acc, t) => acc + Number(t.amount_rp), 0) || 0;

  return { income, expense, net: income - expense, transactions: data || [] };
}

/**
 * Get spending breakdown by category
 */
export async function getCategoryStats(userId, period = 'month') {
  let query = supabase
    .from('transactions')
    .select('category, amount_rp')
    .eq('user_id', userId)
    .eq('type', 'expense');

  const now = new Date();
  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    query = query.gte('created_at', start);
  }

  const { data, error } = await query;
  if (!data) return [];

  const stats = {};
  data.forEach(t => {
    const cat = t.category || 'Lainnya';
    stats[cat] = (stats[cat] || 0) + Number(t.amount_rp);
  });

  return Object.entries(stats)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Get portfolio summary
 */
export async function getPortfolioSummary(userId) {
  const { data: holdings, error } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .gt('quantity', 0); // Only assets we still have

  if (!holdings) return { totalCostBasis: 0, totalCurrentValue: 0, totalPnL: 0, items: [] };

  const items = [];
  let totalCostBasis = 0;
  let totalCurrentValue = 0;

  for (const h of holdings) {
    const result = await getCryptoPrice(h.asset);
    const livePrice = result.price;
    const currentValue = Number(h.quantity) * livePrice;
    const pnl = currentValue - Number(h.cost_basis_rp);
    const pnlPercent = h.cost_basis_rp > 0 ? (pnl / Number(h.cost_basis_rp)) * 100 : 0;

    totalCostBasis += Number(h.cost_basis_rp);
    totalCurrentValue += currentValue;

    items.push({
      ...h,
      livePrice,
      currentValue,
      pnl,
      pnlPercent
    });
  }
  
  return { 
    totalCostBasis, 
    totalCurrentValue, 
    totalPnL: totalCurrentValue - totalCostBasis,
    totalPnLPercent: totalCostBasis > 0 ? ((totalCurrentValue - totalCostBasis) / totalCostBasis) * 100 : 0,
    count: items.length,
    items 
  };
}
