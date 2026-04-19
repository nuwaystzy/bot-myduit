import { parseNominal } from './format.js';

/**
 * Main parser for free-text transactions
 */
export function parseTransaction(text) {
  if (text.startsWith('/')) return null;

  const words = text.toLowerCase().split(/\s+/);
  
  // Pattern 1: <category/note> <nominal> (e.g., "makan 15k", "kopi 10rb")
  if (words.length === 2 && !isNaN(parseNominal(words[1]))) {
    return {
      type: 'expense',
      category: words[0],
      amount_rp: parseNominal(words[1]),
      note: words[0]
    };
  }

  // Pattern 2: gaji <nominal> (e.g., "gaji 2jt")
  if (words[0] === 'gaji' && words.length === 2) {
    return {
      type: 'income',
      category: 'Gaji',
      amount_rp: parseNominal(words[1]),
      note: 'Gaji Bulanan'
    };
  }

  // Pattern 3: <action> <asset> <total_rp> <qty> (e.g., "buy btc 500k 0.0005")
  if (['buy', 'sell', 'trade'].includes(words[0])) {
    const action = words[0] === 'trade' ? 'buy' : words[0];
    const asset = words[1].toUpperCase();
    const total_rp = parseNominal(words[2]);
    const qty = parseFloat(words[3]) || 0;

    return {
      type: action,
      asset,
      amount_rp: total_rp,
      quantity: qty,
      price_per_unit: qty > 0 ? total_rp / qty : 0,
      note: `${action} ${asset}`
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
