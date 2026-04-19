import { supabase } from './db.js';

/**
 * Get summary of cashflow (income/expense)
 */
export async function getCashflowSummary(userId, period = 'today') {
  let query = supabase
    .from('transactions')
    .select('amount_rp, type')
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

  return { income, expense, net: income - expense };
}

/**
 * Get portfolio summary
 */
export async function getPortfolioSummary(userId) {
  const { data: holdings, error } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId);

  const totalCostBasis = holdings?.reduce((acc, h) => acc + Number(h.cost_basis_rp), 0) || 0;
  
  return { totalCostBasis, count: holdings?.length || 0 };
}
