import { supabase, getDefaultWallet } from '../lib/db.js';
import { updateHolding } from '../lib/portfolio.js';
import { getCryptoPrice } from '../lib/prices.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const { user_id, type, asset, amount_rp, quantity, category, note } = req.body;
  if (!user_id || !type || !amount_rp) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const { data: user } = await supabase.from('users').select('id').eq('telegram_user_id', user_id).single();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const walletType = (type === 'buy' || type === 'sell') ? 'exchange' : 'cash';
    const wallet = await getDefaultWallet(user.id, walletType);

    let finalQuantity = parseFloat(quantity) || 0;
    
    if ((type === 'buy' || type === 'sell') && finalQuantity === 0 && asset) {
       const cryptoData = await getCryptoPrice(asset.toUpperCase());
       if (cryptoData && cryptoData.price > 0) {
           finalQuantity = parseFloat(amount_rp) / cryptoData.price;
       }
    }

    // 1. Insert Transaction
    const { data: tx, error: txError } = await supabase
      .from('transactions')
      .insert([{
        user_id: user.id,
        wallet_id: wallet.id,
        type,
        asset: asset || (walletType === 'cash' ? 'CASH' : null),
        amount_rp: parseFloat(amount_rp),
        quantity: finalQuantity,
        category: category || 'Lainnya',
        note: note || '',
        source: 'webapp'
      }])
      .select()
      .single();

    if (txError) throw txError;

    // 2. Update Holding if Crypto
    if (type === 'buy' || type === 'sell') {
      await updateHolding(user.id, wallet.id, asset.toUpperCase(), type, finalQuantity, amount_rp);
    }

    return res.status(200).json({ success: true, data: tx });
  } catch (err) {
    console.error('Add API Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
