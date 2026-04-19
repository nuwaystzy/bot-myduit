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
  'MATIC': 'polygon-hermez',
  'LINK': 'chainlink',
  'TON': 'the-open-network',
  'SUI': 'sui',
  'ARB': 'arbitrum'
};

/**
 * Fetch current USD to IDR rate with aggressive caching
 */
export async function getUsdIdrRate() {
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_rp, updated_at')
      .eq('asset', 'USDIDR')
      .single();

    // Cache valid for 24 hours
    const isCacheValid = cached && (new Date() - new Date(cached.updated_at)) < 24 * 60 * 60 * 1000;
    if (isCacheValid) return parseFloat(cached.price_rp);

    const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(3000)
    });
    const data = await res.json();
    const rate = data.usd?.idr;

    if (rate) {
      await updateCache('USDIDR', rate);
      return rate;
    }
  } catch (error) {
    console.warn('API Kurs gagal, menggunakan fallback/cache lama');
  }
  
  // Final fallback to DB even if stale, or hardcoded
  return 15800; 
}

/**
 * CACHE-FIRST Crypto Price Fetcher
 * This is the core optimization to make the app feel instant.
 */
export async function getCryptoPrice(asset) {
  const symbol = asset.toUpperCase();
  
  // 1. Check DB Cache First (Valid for 5 minutes)
  try {
    const { data: cached } = await supabase
      .from('price_cache')
      .select('price_rp, updated_at')
      .eq('asset', symbol)
      .single();

    if (cached) {
      const ageMinutes = (new Date() - new Date(cached.updated_at)) / (1000 * 60);
      if (ageMinutes < 5) {
        return { price: parseFloat(cached.price_rp), source: 'Cache-Direct' };
      }
    }
  } catch (err) {
    // No cache found or error, continue to fetch
  }

  // 2. Cache expired or missing, fetch from Network
  let lastError = null;
  
  // CoinGecko (Primary)
  try {
    const geckoId = GECKO_IDS[symbol] || symbol.toLowerCase();
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${geckoId}&vs_currencies=idr`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4000)
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data[geckoId]?.idr) {
        const price = data[geckoId].idr;
        await updateCache(symbol, price);
        return { price, source: 'CoinGecko' };
      }
    }
  } catch (err) {
    lastError = `Gecko: ${err.message}`;
  }

  // Indodax (Secondary)
  try {
    const indodaxSymbol = `${symbol.toLowerCase()}idr`;
    const res = await fetch(`https://indodax.com/api/ticker/${indodaxSymbol}`, {
      signal: AbortSignal.timeout(3000)
    });
    const data = await res.json();
    if (data.ticker?.last) {
      const price = parseFloat(data.ticker.last);
      await updateCache(symbol, price);
      return { price, source: 'Indodax' };
    }
  } catch (err) {}

  // Final Fallback: Return old Cache even if expired
  try {
    const { data: stale } = await supabase
      .from('price_cache')
      .select('price_rp')
      .eq('asset', symbol)
      .single();
    if (stale) return { price: parseFloat(stale.price_rp), source: 'Stale-Cache' };
  } catch (err) {}

  return { price: 0, error: 'All sources failed' };
}

/**
 * Bulk fetch updated for performance
 */
export async function getBulkPrices(assets) {
  // Try to batch Gecko if many assets are missing cache
  // For now, getCryptoPrice with cache-first is already very fast
  const results = await Promise.all(assets.map(a => getCryptoPrice(a)));
  const prices = {};
  assets.forEach((a, i) => {
    prices[a] = results[i];
  });
  return prices;
}

/**
 * Helper to update Supabase price cache
 */
async function updateCache(asset, price) {
  try {
    await supabase.from('price_cache').upsert({
      asset,
      price_rp: price,
      updated_at: new Date().toISOString()
    });
  } catch (err) {}
}
