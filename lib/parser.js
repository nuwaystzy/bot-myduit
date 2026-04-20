import { parseNominal } from './format.js';

/**
 * Main parser for free-text transactions
 */
export function parseTransaction(text) {
  if (text.startsWith('/') && !text.startsWith('/buy') && !text.startsWith('/sell') && !text.startsWith('/editlast')) return null;

  let rawText = text.trim();
  const lowerText = rawText.toLowerCase();
  const words = lowerText.split(/\s+/);
  
  // 1. Check Crypto Command
  if (['buy', 'sell', 'trade', '/buy', '/sell'].includes(words[0])) {
    let rawAction = words[0];
    if (rawAction.startsWith('/')) rawAction = rawAction.substring(1);
    const action = rawAction === 'trade' ? 'buy' : rawAction;
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
      category: 'Crypto',
      note: `${action.toUpperCase()} ${asset}`
    };
  }
  // 2. Resolve Income/Expense direction from Prefix
  let isIncome = null;
  if (rawText.startsWith('+')) {
      isIncome = true;
      rawText = rawText.substring(1).trim();
  } else if (rawText.startsWith('-')) {
      isIncome = false;
      rawText = rawText.substring(1).trim();
  } else {
      // Fallback keyword detection if no sign is present
      const firstWord = rawText.split(/\s+/)[0].toLowerCase();
      if (['gaji', 'masuk', 'income', 'pemasukan', 'gajian', 'dikasih'].includes(firstWord)) {
          isIncome = true;
      } else {
          isIncome = false; // Default to Expense
      }
  }

  // 3. Extract Nominal and Note
  const remainingWords = rawText.split(/\s+/);
  let nominalAmount = 0;
  let nominalIndex = -1;

  for (let i = 0; i < remainingWords.length; i++) {
      const val = parseNominal(remainingWords[i]);
      if (val > 0) {
          // It's a nominal if it has a currency suffix OR is >= 1000 (to avoid capturing like "2" portions)
          const hasSuffix = /[kqrbjtm]/i.test(remainingWords[i]);
          if (hasSuffix || val >= 1000) {
              nominalAmount = val;
              nominalIndex = i;
              break; 
          }
      }
  }

  if (nominalIndex === -1) return null; // No valid amount found

  // Remove the nominal text from the note
  remainingWords.splice(nominalIndex, 1);
  let note = remainingWords.join(' ').trim();
  
  if (!note) {
      note = isIncome ? 'Pemasukan' : 'Pengeluaran';
  }

  const categoryStr = isIncome ? 'Pemasukan' : note.split(' ')[0].substring(0, 15);

  return {
      type: isIncome ? 'income' : 'expense',
      category: categoryStr,
      amount_rp: nominalAmount,
      note: note
  };
}
