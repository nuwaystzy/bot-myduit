import { supabase } from './db.js';
import { getCryptoPrice } from './prices.js';

/**
 * Get summary of cashflow (income/expense)
 */
export async function getCashflowSummary(userId, period = 'today') {
  let query = supabase
    .from('transactions')
    .select('amount_rp, type, category')
    .eq('user_id', userId);

  const now = new Date();
  if (period === 'today') {
    const start = new Date(now.setHours(0,0,0,0)).toISOString();
    query = query.gte('created_at', start).in('type', ['income', 'expense']);
  } else if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    query = query.gte('created_at', start).in('type', ['income', 'expense']);
  } else if (period === 'all') {
    // For net balance (Dashboard) we need ALL history
    // But we might still filter by type if we only want income - expense
  }

  const { data, error } = await query;
  if (!data) return { income: 0, expense: 0, net: 0, transactions: [] };
  
  // Robust reduction with Number conversion
  const income = data.filter(t => t.type === 'income').reduce((acc, t) => acc + (Number(t.amount_rp) || 0), 0);
  const expense = data.filter(t => t.type === 'expense').reduce((acc, t) => acc + (Number(t.amount_rp) || 0), 0);

  return { income, expense, net: income - expense, transactions: data };
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
    const amt = Number(t.amount_rp) || 0;
    stats[cat] = (stats[cat] || 0) + amt;
  });

  return Object.entries(stats)
    .map(([category, amount]) => ({ category, NumberAmount: Number(amount) }))
    .sort((a, b) => b.NumberAmount - a.NumberAmount)
    .map(s => ({ category: s.category, amount: s.NumberAmount }));
}

/**
 * Get portfolio summary with enhanced robustness
 */
export async function getPortfolioSummary(userId) {
  const { data: holdings, error } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .gt('quantity', 0); 

  if (!holdings || holdings.length === 0) {
    return { totalCostBasis: 0, totalCurrentValue: 0, totalPnL: 0, totalPnLPercent: 0, count: 0, items: [] };
  }

  const items = await Promise.all(holdings.map(async (h) => {
    const qty = Number(h.quantity) || 0;
    const cost = Number(h.cost_basis_rp) || 0;
    
    // Fetch price
    const result = await getCryptoPrice(h.asset);
    const livePrice = Number(result?.price) || 0;
    
    const currentValue = qty * livePrice;
    const pnl = currentValue - cost;
    const pnlPercent = cost > 0 ? (pnl / cost) * 100 : 0;

    return {
      ...h,
      livePrice,
      currentValue,
      pnl,
      pnlPercent
    };
  }));

  let totalCostBasis = 0;
  let totalCurrentValue = 0;
  
  items.forEach(item => {
    totalCostBasis += (Number(item.cost_basis_rp) || 0);
    totalCurrentValue += (Number(item.currentValue) || 0);
  });
  
  return { 
    totalCostBasis, 
    totalCurrentValue, 
    totalPnL: totalCurrentValue - totalCostBasis,
    totalPnLPercent: totalCostBasis > 0 ? ((totalCurrentValue - totalCostBasis) / totalCostBasis) * 100 : 0,
    count: items.length,
    items 
  };
}
