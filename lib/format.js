/**
 * Parse nominal string like "10k", "2jt", "1.5m" into Number
 */
export function parseNominal(str) {
  if (!str) return 0;
  
  let cleanStr = str.toLowerCase().replace(/,/g, '').replace(/rp/g, '').trim();
  let multiplier = 1;

  if (cleanStr.endsWith('k') || cleanStr.endsWith('rb')) {
    multiplier = 1000;
    cleanStr = cleanStr.replace(/k|rb/g, '');
  } else if (cleanStr.endsWith('jt')) {
    multiplier = 1000000;
    cleanStr = cleanStr.replace(/jt/g, '');
  } else if (cleanStr.endsWith('m')) {
    multiplier = 1000000000;
    cleanStr = cleanStr.replace(/m/g, '');
  }

  const value = parseFloat(cleanStr);
  return isNaN(value) ? 0 : value * multiplier;
}

/**
 * Format number to Indonesian Rupiah (Rp)
 */
export function formatRp(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format quantity with flexible decimals
 */
export function formatQty(qty) {
  if (qty === 0) return '0';
  return qty.toString().includes('.') ? qty.toFixed(8).replace(/\.?0+$/, '') : qty.toLocaleString('id-ID');
}

/**
 * Format Date to readable string
 */
export function formatDate(date) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta'
  }).format(new Date(date));
}
