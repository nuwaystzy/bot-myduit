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
    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
    const data = await res.json();
    const rate = data.usd.idr;

    if (rate) {
      await supabase.from('price_cache').upsert({
        asset: 'USDIDR',
        price_rp: rate,
        updated_at: new Date().toISOString()
      });
      return rate;
    }
  } catch (error) {
    console.error('Error fetching USDIDR rate:', error);
  }
  return 15600;
}

/**
 * Fetch current crypto price from Binance
 * Format asset: BTC, ETH, SOL, etc.
 */
export async function getCryptoPrice(asset) {
  try {
    const symbol = `${asset.toUpperCase()}USDT`;
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const data = await res.json();
    
    if (data.price) {
      const usdPrice = parseFloat(data.price);
      const usdIdr = await getUsdIdrRate();
      const priceIdr = usdPrice * usdIdr;
      
      // Cache this crypto price too
      await supabase.from('price_cache').upsert({
        asset: asset.toUpperCase(),
        price_rp: priceIdr,
        updated_at: new Date().toISOString()
      });

      return priceIdr;
    }
  } catch (error) {
    console.error(`Error fetching price for ${asset}:`, error);
  }
  return 0;
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
