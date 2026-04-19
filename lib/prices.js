import { supabase } from './db.js';

/**
 * Fetch current USD to IDR rate
 * Uses a free public API and caches in Supabase for 24 hours
 */
export async function getUsdIdrRate() {
  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_rp, updated_at')
      .eq('asset', 'USDIDR')
      .single();

    const isCacheValid = cached && (new Date() - new Date(cached.updated_at)) < 24 * 60 * 60 * 1000;
    if (isCacheValid) return parseFloat(cached.price_rp);

    // Fetch new rate
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Bot Keuangan)' }
    });
    const data = await res.json();
    const rate = data.usd?.idr;

    if (rate) {
      await supabase.from('price_cache').upsert({
        asset: 'USDIDR',
        price_rp: rate,
        updated_at: new Date().toISOString()
      });
      return rate;
    } else {
      console.warn('Currency API did not return rate, structure might have changed:', data);
    }
  } catch (error) {
    console.error('Error fetching USDIDR rate:', error);
  }
  return 15600;
}

/**
 * Fetch current crypto price from Indodax (Local IDR Exchange)
 * Format asset: BTC, ETH, SOL, etc.
 */
export async function getCryptoPrice(asset) {
  try {
    const symbol = `${asset.toLowerCase()}idr`;
    // Indodax public ticker API (No underscore between asset and idr)
    const res = await fetch(`https://indodax.com/api/ticker/${symbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (!res.ok) throw new Error(`Indodax HTTP Error: ${res.status}`);
    
    const data = await res.json();
    
    if (data.ticker && data.ticker.last) {
      const priceIdr = parseFloat(data.ticker.last);
      
      // Cache the price
      await supabase.from('price_cache').upsert({
        asset: asset.toUpperCase(),
        price_rp: priceIdr,
        updated_at: new Date().toISOString()
      }).catch(err => console.error('Cache save error:', err));

      return priceIdr;
    }
  } catch (error) {
    console.error(`Error fetching price for ${asset} from Indodax:`, error.message);
    
    // Backup: Try Binance as secondary if Indodax fails
    try {
      const symbol = `${asset.toUpperCase()}USDT`;
      const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(5000)
      });
      const data = await res.json();
      if (data.price) {
        const usdPrice = parseFloat(data.price);
        const usdIdr = await getUsdIdrRate();
        return usdPrice * usdIdr;
      }
    } catch (binanceErr) {
      console.error(`Binance fallback also failed for ${asset}`);
    }
  }

  // Final Fallback: Last known price from DB
  const { data: cached } = await supabase
    .from('price_cache')
    .select('price_rp')
    .eq('asset', asset.toUpperCase())
    .single();
  
  return cached ? parseFloat(cached.price_rp) : 0;
}

/**
 * Bulk fetch prices if needed
 */
export async function getBulkPrices(assets) {
  const prices = {};
  for (const asset of assets) {
    prices[asset] = await getCryptoPrice(asset);
  }
  return prices;
}
