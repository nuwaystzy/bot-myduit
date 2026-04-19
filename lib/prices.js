import { supabase } from './db.js';

// Mapping symbols to CoinGecko IDs
const GECKO_IDS = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'SOL': 'solana',
  'BNB': 'binancecoin',
  'DOGE': 'dogecoin',
  'XRP': 'ripple',
  'ADA': 'cardano',
  'DOT': 'polkadot',
  'MATIC': 'polygon-hermez', // or polygon
  'LINK': 'chainlink'
};

/**
 * Fetch current USD to IDR rate
 */
export async function getUsdIdrRate() {
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_rp, updated_at')
      .eq('asset', 'USDIDR')
      .single();

    const isCacheValid = cached && (new Date() - new Date(cached.updated_at)) < 24 * 60 * 60 * 1000;
    if (isCacheValid) return parseFloat(cached.price_rp);

    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
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
    }
  } catch (error) {
    console.warn('API Kurs (fawazahmed0) gagal, fallback ke 15800');
  }
  return 15800; // Default fallback
}

/**
 * Robust Price Fetcher with multiple fallback sources
 * 1. CoinGecko (Primary)
 * 2. Indodax (Secondary)
 * 3. Binance (Tertiary)
 * 4. DB Cache (Final Fallback)
 */
export async function getCryptoPrice(asset) {
  const symbol = asset.toUpperCase();
  
  // 1. Try CoinGecko (Best for Serverless/Cloud)
  try {
    const geckoId = GECKO_IDS[symbol] || symbol.toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=idr`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    if (data[geckoId]?.idr) {
      const price = data[geckoId].idr;
      await updateCache(symbol, price);
      return price;
    }
  } catch (err) {
    console.warn(`CoinGecko failed for ${symbol}: ${err.message}`);
  }

  // 2. Try Indodax (Local IDR Exchange)
  try {
    const indodaxSymbol = `${symbol.toLowerCase()}idr`;
    const res = await fetch(`https://indodax.com/api/ticker/${indodaxSymbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    if (data.ticker?.last) {
      const price = parseFloat(data.ticker.last);
      await updateCache(symbol, price);
      return price;
    }
  } catch (err) {
    console.warn(`Indodax failed for ${symbol}: ${err.message}`);
  }

  // 3. Try Binance (USD + Conversion)
  try {
    const binanceSymbol = `${symbol}USDT`;
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${binanceSymbol}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(5000)
    });
    const data = await res.json();
    if (data.price) {
      const usdPrice = parseFloat(data.price);
      const usdIdr = await getUsdIdrRate();
      const price = usdPrice * usdIdr;
      await updateCache(symbol, price);
      return price;
    }
  } catch (err) {
    console.warn(`Binance failed for ${symbol}: ${err.message}`);
  }

  // 4. Final Fallback: Database Cache
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_rp')
      .eq('asset', symbol)
      .single();
    if (cached) return parseFloat(cached.price_rp);
  } catch (err) {
    console.error(`Final cache fallback failed for ${symbol}`);
  }

  return 0;
}

/**
 * Helper to update Supabase price cache
 */
async function updateCache(asset, price) {
  return supabase.from('price_cache').upsert({
    asset,
    price_rp: price,
    updated_at: new Date().toISOString()
  }).catch(err => console.error('Error updating cache:', err));
}

/**
 * Bulk fetch prices
 */
export async function getBulkPrices(assets) {
  const prices = {};
  for (const asset of assets) {
    prices[asset] = await getCryptoPrice(asset);
  }
  return prices;
}
