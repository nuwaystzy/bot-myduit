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
      // Convert to IDR (estimated 15.500)
      // In production, you might want to fetch real USDIDR rate
      const usdIdr = 15500; 
      return parseFloat(data.price) * usdIdr;
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
