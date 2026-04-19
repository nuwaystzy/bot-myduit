import { parseNominal } from './format.js';

/**
 * Main parser for free-text transactions
 */
export function parseTransaction(text) {
  if (text.startsWith('/')) return null;

  const words = text.toLowerCase().split(/\s+/);
  
  // Pattern 1: gaji/masuk <nominal> (e.g., "gaji 2jt", "masuk 500k")
  if (['gaji', 'masuk', 'income', 'pemasukan'].includes(words[0]) && words.length >= 2) {
    const amount = parseNominal(words[1]) || parseNominal(words[words.length - 1]);
    return {
      type: 'income',
      category: words[0],
      amount_rp: amount,
      note: words.slice(1).join(' ') || words[0]
    };
  }

  // Pattern 2: <category/note> <nominal> (e.g., "makan 15k", "kopi 10rb")
  if (words.length === 2 && !isNaN(parseNominal(words[1]))) {
    return {
      type: 'expense',
      category: words[0],
      amount_rp: parseNominal(words[1]),
      note: words[0]
    };
  }

  // Pattern 3: <action> <asset> <val1> [val2]
  // e.g., "buy btc 0.0005" (buy by qty)
  // e.g., "buy btc 1jt" (buy by amount)
  // e.g., "buy btc 1jt 0.0005" (manual buy)
  if (['buy', 'sell', 'trade'].includes(words[0])) {
    const action = words[0] === 'trade' ? 'buy' : words[0];
    const asset = words[1].toUpperCase();
    
    let total_rp = 0;
    let qty = 0;

    if (words.length === 4) {
      // Format: action asset amount_rp qty
      total_rp = parseNominal(words[2]);
      qty = parseFloat(words[3]) || 0;
    } else if (words.length === 3) {
      const val = words[2];
      const isNominal = val.includes('k') || val.includes('rb') || val.includes('jt') || val.includes('m') || parseInt(val) >= 1000;
      
      if (isNominal) {
        // Format: action asset amount_rp (buy 1jt worth of asset)
        total_rp = parseNominal(val);
        qty = 0; // Will be calculated live in handler
      } else {
        // Format: action asset qty (buy 0.1 btc)
        qty = parseFloat(val) || 0;
        total_rp = 0; // Will be calculated live in handler
      }
    }

    return {
      type: action,
      asset,
      amount_rp: total_rp,
      quantity: qty,
      price_per_unit: (qty > 0 && total_rp > 0) ? total_rp / qty : 0,
      note: `${action.toUpperCase()} ${asset}`
    };
  }

  // Pattern 4: transfer <target> <nominal> (e.g., "transfer bank 100k")
  if (words[0] === 'transfer') {
    return {
      type: 'transfer',
      category: words[1],
      amount_rp: parseNominal(words[2]),
      note: `Transfer ke ${words[1]}`
    };
  }

  // Fallback: If starts with number, assume expense (e.g., "15000 makan")
  const firstWordNominal = parseNominal(words[0]);
  if (firstWordNominal > 0) {
    return {
      type: 'expense',
      category: words.slice(1).join(' ') || 'Lain-lain',
      amount_rp: firstWordNominal,
      note: words.slice(1).join(' ')
    };
  }

  return null;
}
