import { supabase } from './db.js';

/**
 * Update holding after a transaction
 */
export async function updateHolding(userId, walletId, asset, type, quantity, amount_rp) {
  // Get current holding
  const { data: holding, error } = await supabase
    .from('holdings')
    .select('*')
    .eq('user_id', userId)
    .eq('wallet_id', walletId)
    .eq('asset', asset)
    .single();

  let newQty = 0;
  let newAvgPrice = 0;
  let newCostBasis = 0;

  if (type === 'buy') {
    if (holding) {
      newQty = parseFloat(holding.quantity) + parseFloat(quantity);
      newCostBasis = parseFloat(holding.cost_basis_rp) + parseFloat(amount_rp);
      newAvgPrice = newCostBasis / newQty;
    } else {
      newQty = parseFloat(quantity);
      newCostBasis = parseFloat(amount_rp);
      newAvgPrice = newCostBasis / newQty;
    }
  } else if (type === 'sell') {
    if (!holding || parseFloat(holding.quantity) < parseFloat(quantity)) {
      throw new Error(`Saldo ${asset} tidak mencukupi untuk dijual.`);
    }
    newQty = parseFloat(holding.quantity) - parseFloat(quantity);
    newAvgPrice = parseFloat(holding.avg_price_rp); // Avg price unchanged on sell
    newCostBasis = newQty * newAvgPrice;
  }

  if (holding) {
    await supabase
      .from('holdings')
      .update({
        quantity: newQty,
        avg_price_rp: newAvgPrice,
        cost_basis_rp: newCostBasis,
        updated_at: new Date()
      })
      .eq('id', holding.id);
  } else {
    await supabase
      .from('holdings')
      .insert([{
        user_id: userId,
        wallet_id: walletId,
        asset,
        quantity: newQty,
        avg_price_rp: newAvgPrice,
        cost_basis_rp: newCostBasis
      }]);
  }

  return { newQty, newAvgPrice };
}

/**
 * Get all holdings for a user
 */
export async function getHoldings(userId) {
  const { data, error } = await supabase
    .from('holdings')
    .select('*, wallets(name)')
    .eq('user_id', userId);
  
  return data || [];
}
