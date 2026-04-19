import { sendMessage, editMessageText, answerCallbackQuery, setMyCommands } from './telegram.js';
import { getOrCreateUser, getDefaultWallet, supabase } from './db.js';
import { parseTransaction } from './parser.js';
import { formatRp, formatQty } from './format.js';
import { updateHolding } from './portfolio.js';
import { getCashflowSummary, getPortfolioSummary } from './reports.js';
import { getCryptoPrice } from './prices.js';

export async function handleUpdate(update) {
  if (update.message) {
    await handleMessage(update.message);
  } else if (update.callback_query) {
    await handleCallback(update.callback_query);
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = message.text;
  if (!text) return;

  const user = await getOrCreateUser(message.from);

  if (text.startsWith('/start')) {
    // Daftarkan saran perintah ke Telegram saat /start
    await setMyCommands([
      { command: 'start', description: 'Buka Dashboard Utama' },
      { command: 'help', description: 'Panduan Cara Pakai Bot' },
      { command: 'today', description: 'Laporan Cashflow Hari Ini' },
      { command: 'portfolio', description: 'Lihat Aset Crypto Anda' },
      { command: 'budget', description: 'Status Anggaran / Budget' },
      { command: 'journal', description: 'Review Jurnal Trading' },
      { command: 'export', description: 'Download Data Transaksi' }
    ]).catch(console.error);

    return sendDashboard(chatId, `Halo <b>${user.name}</b>! Selamat datang di Bot Keuangan Personal.`);
  }

  if (text.startsWith('/help')) {
    const helpText = `📖 <b>Panduan Cara Pakai Bot</b>\n\n` +
      `<b>1. Catat Pengeluaran:</b>\n<i>"makan 15k"</i> atau <i>"kopi 10rb"</i>\n\n` +
      `<b>2. Catat Pemasukan:</b>\n<i>"gaji 2jt"</i> atau <i>"masuk 500k"</i>\n\n` +
      `<b>3. Transaksi Crypto:</b>\n<i>"buy btc 1jt 0.001"</i> atau <i>"sell eth 500k 0.1"</i>\n\n` +
      `<b>4. Tombol Menu:</b>\nGunakan tombol di bawah untuk melihat laporan ringkas.`;
    return sendMessage(chatId, helpText);
  }

  if (text.startsWith('/today')) {
    const summary = await getCashflowSummary(user.id, 'today');
    const text = `💵 <b>Ringkasan Kas (Hari Ini)</b>\n\n📥 Masuk: ${formatRp(summary.income)}\n📤 Keluar: ${formatRp(summary.expense)}\n⚖️ Net: ${formatRp(summary.net)}`;
    return sendDashboard(chatId, text);
  }

  if (text.startsWith('/portfolio')) {
    const summary = await getPortfolioSummary(user.id);
    const text = `🪙 <b>Ringkasan Portofolio</b>\n\nTotal Aset: ${summary.count}\nCost Basis: ${formatRp(summary.totalCostBasis)}`;
    return sendDashboard(chatId, text);
  }

  // Handle parsing transaksi bebas
  const transaction = parseTransaction(text);
  if (transaction) {
    try {
      const wallet = await getDefaultWallet(user.id, ['buy', 'sell', 'trade'].includes(transaction.type) ? 'exchange' : 'cash');
      
      // Auto-fetch price if crypto and partial info
      let livePriceNote = '';
      if (['buy', 'sell', 'trade'].includes(transaction.type)) {
        if (transaction.amount_rp === 0 || transaction.quantity === 0) {
          const livePrice = await getCryptoPrice(transaction.asset);
          if (livePrice > 0) {
            transaction.price_per_unit = livePrice;
            if (transaction.amount_rp === 0 && transaction.quantity > 0) {
              // Format: buy btc 0.01 -> calculate cost
              transaction.amount_rp = transaction.quantity * livePrice;
            } else if (transaction.quantity === 0 && transaction.amount_rp > 0) {
              // Format: buy btc 1jt -> calculate qty
              transaction.quantity = transaction.amount_rp / livePrice;
            }
            livePriceNote = ` (Harga: ${formatRp(livePrice)})`;
          } else {
            throw new Error(`Gagal mendapatkan harga live untuk ${transaction.asset}. Silakan masukkan nominal & kuantitas secara manual.`);
          }
        }
      }
      
      const { data, error } = await supabase
        .from('transactions')
        .insert([{
          user_id: user.id,
          wallet_id: wallet.id,
          ...transaction
        }])
        .select()
        .single();

      if (error) throw error;

      // Update holding if crypto
      let holdingNote = '';
      if (['buy', 'sell'].includes(transaction.type)) {
        const { newQty, newAvgPrice } = await updateHolding(
          user.id, 
          wallet.id, 
          transaction.asset, 
          transaction.type, 
          transaction.quantity, 
          transaction.amount_rp
        );
        holdingNote = `\n📦 Holding: ${formatQty(newQty)} ${transaction.asset} (Avg: ${formatRp(newAvgPrice)})`;
      }

      let successMsg = '✅ <b>Berhasil mencatat!</b>';
      if (transaction.type === 'income') successMsg = '📥 <b>Pemasukan dicatat!</b>';
      if (transaction.type === 'expense') successMsg = '📤 <b>Pengeluaran dicatat!</b>';
      if (['buy', 'sell'].includes(transaction.type)) successMsg = '🪙 <b>Transaksi Crypto dicatat!</b>';

      return sendMessage(chatId, `${successMsg}\n\n📝 ${transaction.note}\n💰 Nominal: ${formatRp(transaction.amount_rp)}${holdingNote}`);
    } catch (err) {
      return sendMessage(chatId, `❌ <b>Gagal mencatat:</b> ${err.message}`);
    }
  }

  // Default response for unknown text
  return sendMessage(chatId, 'Maaf, saya tidak mengerti format tersebut. Ketik /start untuk menu utama.');
}

async function handleCallback(callback) {
  const chatId = callback.message.chat.id;
  const messageId = callback.message.message_id;
  const data = callback.data;
  const user = await getOrCreateUser(callback.from);

  await answerCallbackQuery(callback.id);

  if (data === 'dash_main') {
    return editDashboard(chatId, messageId, 'Menu Utama');
  } else if (data === 'dash_cash') {
    const summary = await getCashflowSummary(user.id, 'today');
    const text = `💵 <b>Ringkasan Kas (Hari Ini)</b>\n\n📥 Masuk: ${formatRp(summary.income)}\n📤 Keluar: ${formatRp(summary.expense)}\n⚖️ Net: ${formatRp(summary.net)}`;
    return editDashboard(chatId, messageId, text);
  } else if (data === 'dash_portfolio') {
    const summary = await getPortfolioSummary(user.id);
    let text = `🪙 <b>Ringkasan Portofolio (Harga Live)</b>\n\n`;
    
    if (summary.count === 0) {
      text += "Anda belum memiliki aset crypto.";
    } else {
      text += `Total Aset: ${summary.count}\n`;
      text += `Total Cost Basis: ${formatRp(summary.totalCostBasis)}\n`;
      text += `Total Market Value: ${formatRp(summary.totalCurrentValue)}\n`;
      
      const pnlIcon = summary.totalPnL >= 0 ? '📈' : '📉';
      text += `${pnlIcon} Total PnL: ${formatRp(summary.totalPnL)} (${summary.totalPnLPercent.toFixed(2)}%)\n\n`;
      
      text += `<b>Detail Aset:</b>\n`;
      summary.items.forEach(h => {
        const hIcon = h.pnl >= 0 ? '🟢' : '🔴';
        text += `${hIcon} ${h.asset}: ${formatQty(h.quantity)} (${h.pnlPercent.toFixed(1)}%)\n`;
      });
    }
    return editDashboard(chatId, messageId, text);
  } else if (data === 'dash_summary') {
    return editDashboard(chatId, messageId, '📊 <b>Laporan Ringkasan</b>\n\nFitur ini sedang dalam pengembangan untuk menampilkan grafik.');
  } else if (data === 'dash_budget') {
    return editDashboard(chatId, messageId, '🎯 <b>Manajemen Budget</b>\n\nAnda belum mengatur budget kategori apapun.');
  } else if (data === 'dash_export') {
    return editDashboard(chatId, messageId, '📤 <b>Export Data</b>\n\nSilakan hubungi admin untuk mendapatkan file CSV transaksi Anda.');
  } else if (data === 'dash_settings') {
    return editDashboard(chatId, messageId, '⚙️ <b>Pengaturan</b>\n\nZona Waktu: Asia/Jakarta\nCurrency: IDR');
  }
}

function sendDashboard(chatId, text) {
  return sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💵 Cash', callback_data: 'dash_cash' }, { text: '🪙 Crypto', callback_data: 'dash_portfolio' }],
        [{ text: '📊 Ringkasan', callback_data: 'dash_summary' }, { text: '🎯 Budget', callback_data: 'dash_budget' }],
        [{ text: '📤 Export', callback_data: 'dash_export' }, { text: '⚙️ Settings', callback_data: 'dash_settings' }]
      ]
    }
  });
}

function editDashboard(chatId, messageId, text) {
  return editMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💵 Cash', callback_data: 'dash_cash' }, { text: '🪙 Crypto', callback_data: 'dash_portfolio' }],
        [{ text: '📊 Ringkasan', callback_data: 'dash_summary' }, { text: '🎯 Budget', callback_data: 'dash_budget' }],
        [{ text: '📤 Export', callback_data: 'dash_export' }, { text: '⚙️ Settings', callback_data: 'dash_settings' }]
      ]
    }
  }).catch(err => {
    // Abaikan error jika pesan tidak berubah
    if (!err.message.includes('message is not modified')) {
      throw err;
    }
  });
}
