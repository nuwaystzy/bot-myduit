import { sendMessage, editMessageText, answerCallbackQuery, setMyCommands, sendDocument } from './telegram.js';
import { getOrCreateUser, getDefaultWallet, supabase } from './db.js';
import { parseTransaction } from './parser.js';
import { formatRp, formatQty, drawProgressBar } from './format.js';
import { updateHolding } from './portfolio.js';
import { getCashflowSummary, getPortfolioSummary, getCategoryStats } from './reports.js';
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
      { command: 'help', description: 'Cara Pakai Bot' },
      { command: 'today', description: 'Lihat Ringkasan Hari Ini' },
      { command: 'portfolio', description: 'Lihat Aset Crypto Anda' },
      { command: 'export', description: 'Download Data Transaksi (.csv)' }
    ]).catch(console.error);

    return sendDashboard(chatId, `Halo <b>${user.name}</b>! Selamat datang di Bot Keuangan Personal.`);
  }

  if (text.startsWith('/help')) {
    const helpText = `📖 <b>Panduan Cara Pakai Bot</b>\n\n` +
      `<b>1. Catat Pengeluaran:</b>\n<i>"makan 15k"</i> atau <i>"kopi 10rb"</i>\n\n` +
      `<b>2. Catat Pemasukan:</b>\n<i>"gaji 2jt"</i> atau <i>"masuk 500k"</i>\n\n` +
      `<b>3. Transaksi Crypto (Auto Price):</b>\n<i>"buy btc 0.001"</i> atau <i>"sell eth 0.5"</i>\n\n` +
      `<b>4. Transaksi Crypto (Manual Price):</b>\n<i>"buy btc 1jt 0.001"</i>\n\n` +
      `<b>5. Tombol Menu:</b>\nGunakan tombol di bawah untuk navigasi cepat.`;
    return sendMessage(chatId, helpText);
  }

  if (text.startsWith('/today')) {
    const summary = await getCashflowSummary(user.id, 'today');
    let report = `💵 <b>Ringkasan Kas (Hari Ini)</b>\n\n`;
    report += `📥 Masuk: ${formatRp(summary.income)}\n`;
    report += `📤 Keluar: ${formatRp(summary.expense)}\n`;
    report += `⚖️ Net: ${formatRp(summary.net)}\n\n`;

    if (summary.transactions.length > 0) {
      report += `📝 <b>Rincian:</b>\n`;
      summary.transactions.forEach(t => {
        const icon = t.type === 'income' ? '📥' : '📤';
        report += `${icon} ${t.category || 'N/A'}: ${formatRp(t.amount_rp)}\n`;
      });
    }

    return sendMessage(chatId, report, {
      reply_markup: {
        inline_keyboard: [
          ...getCashKeyboard(),
          ...getDefaultKeyboard()
        ]
      }
    });
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
          const result = await getCryptoPrice(transaction.asset);
          const livePrice = result.price;
          
          if (livePrice > 0) {
            transaction.price_per_unit = livePrice;
            if (transaction.amount_rp === 0 && transaction.quantity > 0) {
              transaction.amount_rp = transaction.quantity * livePrice;
            } else if (transaction.quantity === 0 && transaction.amount_rp > 0) {
              transaction.quantity = transaction.amount_rp / livePrice;
            }
            livePriceNote = ` (Harga: ${formatRp(livePrice)} via ${result.source})`;
          } else {
            throw new Error(`Gagal mendapatkan harga live (${result.error || 'Unknown Error'}). Silakan masukkan nominal secara manual.`);
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
  } else if (data.startsWith('cash_')) {
    const period = data.split('_')[1];
    const summary = await getCashflowSummary(user.id, period);
    const label = period === 'today' ? 'Hari Ini' : (period === 'yesterday' ? 'Kemarin' : 'Bulan Ini');
    
    let text = `💵 <b>Ringkasan Kas (${label})</b>\n\n`;
    text += `📥 Masuk: ${formatRp(summary.income)}\n`;
    text += `📤 Keluar: ${formatRp(summary.expense)}\n`;
    text += `⚖️ Net: ${formatRp(summary.net)}\n\n`;

    if (summary.transactions.length > 0) {
      text += `📝 <b>Rincian:</b>\n`;
      summary.transactions.forEach(t => {
        const icon = t.type === 'income' ? '📥' : '📤';
        text += `${icon} ${t.category || 'N/A'}: ${formatRp(t.amount_rp)}\n`;
      });
    }
    
    return editMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [...getCashKeyboard(), ...getDefaultKeyboard()]
      }
    });
  } else if (data === 'dash_cash') {
    // Default to today
    const summary = await getCashflowSummary(user.id, 'today');
    let text = `💵 <b>Ringkasan Kas (Hari Ini)</b>\n\n`;
    text += `📥 Masuk: ${formatRp(summary.income)}\n`;
    text += `📤 Keluar: ${formatRp(summary.expense)}\n`;
    text += `⚖️ Net: ${formatRp(summary.net)}\n\n`;

    if (summary.transactions.length > 0) {
      text += `📝 <b>Rincian:</b>\n`;
      summary.transactions.forEach(t => {
        const icon = t.type === 'income' ? '📥' : '📤';
        text += `${icon} ${t.category || 'N/A'}: ${formatRp(t.amount_rp)}\n`;
      });
    }
    return editMessageText(chatId, messageId, text, {
      reply_markup: {
        inline_keyboard: [...getCashKeyboard(), ...getDefaultKeyboard()]
      }
    });
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
    const cashflow = await getCashflowSummary(user.id, 'month');
    const portfolio = await getPortfolioSummary(user.id);
    const categories = await getCategoryStats(user.id, 'month');

    const totalWealth = cashflow.net + portfolio.totalCurrentValue;
    const cashPercent = totalWealth > 0 ? (cashflow.net / totalWealth) * 100 : 0;
    const cryptoPercent = totalWealth > 0 ? (portfolio.totalCurrentValue / totalWealth) * 100 : 0;

    let text = `📊 <b>Status Keuangan (Bulan Ini)</b>\n\n`;
    text += `🏦 <b>Net Worth: ${formatRp(totalWealth)}</b>\n`;
    text += `──────────────\n`;
    text += `📥 Income: ${formatRp(cashflow.income)}\n`;
    text += `📤 Expense: ${formatRp(cashflow.expense)}\n\n`;

    text += `🍕 <b>Alokasi Aset:</b>\n`;
    text += `💰 Cash: ${cashPercent.toFixed(1)}%\n`;
    text += `${drawProgressBar(cashPercent)}\n`;
    text += `🪙 Crypto: ${cryptoPercent.toFixed(1)}%\n`;
    text += `${drawProgressBar(cryptoPercent)}\n\n`;

    text += `🏷️ <b>Top Pengeluaran:</b>\n`;
    if (categories.length === 0) {
      text += "Belum ada catatan pengeluaran.\n";
    } else {
      categories.slice(0, 3).forEach(cat => {
        const percent = (cat.amount / cashflow.expense) * 100;
        text += `• ${cat.category}: ${formatRp(cat.amount)} (${percent.toFixed(0)}%)\n`;
      });
    }

    return editDashboard(chatId, messageId, text);
  } else if (data === 'dash_budget') {
    return editDashboard(chatId, messageId, '🎯 <b>Manajemen Budget</b>\n\nAnda belum mengatur budget kategori apapun.');
  } else if (data === 'dash_export') {
    try {
      const { data: txs } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!txs || txs.length === 0) {
        return editDashboard(chatId, messageId, '❌ Belum ada data transaksi untuk diekspor.');
      }

      const csvHeader = 'Tanggal,Tipe,Aset,Nominal_Rp,Kuantitas,Kategori,Catatan\n';
      const csvRows = txs.map(t => {
        const date = new Date(t.created_at).toLocaleDateString('id-ID');
        return `${date},${t.type},${t.asset || ''},${t.amount_rp},${t.quantity || ''},${t.category || ''},"${t.note || ''}"`;
      }).join('\n');

      const csvContent = csvHeader + csvRows;
      const blob = new Blob([csvContent], { type: 'text/csv' });
      
      await sendDocument(chatId, blob, `transaksi_${user.id}.csv`, 'Ini adalah file ekspor riwayat transaksi Anda (.csv)');
      return editDashboard(chatId, messageId, '✅ File ekspor telah berhasil dikirim!');
    } catch (err) {
      console.error('Export Error:', err);
      return sendMessage(chatId, `❌ Gagal ekspor data: ${err.message}`);
    }
  } else if (data === 'dash_settings') {
    return editDashboard(chatId, messageId, '⚙️ <b>Pengaturan</b>\n\nZona Waktu: Asia/Jakarta\nCurrency: IDR', [
      [{ text: '🔴 Reset Semua Data', callback_data: 'reset_confirm' }]
    ]);
  } else if (data === 'reset_confirm') {
    return editMessageText(chatId, messageId, '⚠️ <b>PERINGATAN!</b>\n\nApakah Anda yakin ingin menghapus <b>SEMUA</b> data transaksi dan portofolio? Tindakan ini permanen dan tidak bisa dikembalikan.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya, Hapus Semua', callback_data: 'reset_execute' }],
          [{ text: '❌ Batal', callback_data: 'dash_settings' }]
        ]
      }
    });
  } else if (data === 'reset_execute') {
    try {
      // Hapus data transaksi, holding, dan budget milik user
      await supabase.from('transactions').delete().eq('user_id', user.id);
      await supabase.from('holdings').delete().eq('user_id', user.id);
      await supabase.from('budgets').delete().eq('user_id', user.id);
      
      return editMessageText(chatId, messageId, '✅ <b>Data Berhasil Direset!</b>\n\nSeluruh catatan Anda telah dihapus. Ketik /start untuk mulai baru.', {
        reply_markup: {
          inline_keyboard: [[{ text: '🏠 Menu Utama', callback_data: 'dash_main' }]]
        }
      });
    } catch (err) {
      return sendMessage(chatId, `❌ Gagal reset data: ${err.message}`);
    }
  }
}

function sendDashboard(chatId, text) {
  return sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: getDefaultKeyboard()
    }
  });
}

function editDashboard(chatId, messageId, text, extraButtons = []) {
  const keyboard = [...getDefaultKeyboard(), ...extraButtons];
  return editMessageText(chatId, messageId, text, {
    reply_markup: {
      inline_keyboard: keyboard
    }
  }).catch(err => {
    // Abaikan error jika pesan tidak berubah
    if (!err.message.includes('message is not modified')) {
      throw err;
    }
  });
}

function getDefaultKeyboard() {
  const webAppUrl = 'https://bot-myduit.vercel.app/webapp?v=1.2'; // Cache buster v1.2
  return [
    [{ text: '🚀 OPEN MINI APP', web_app: { url: webAppUrl } }],
    [{ text: '💵 Cash', callback_data: 'dash_cash' }, { text: '🪙 Crypto', callback_data: 'dash_portfolio' }],
    [{ text: '📊 Ringkasan Chat', callback_data: 'dash_summary' }],
    [{ text: '📤 Export', callback_data: 'dash_export' }, { text: '⚙️ Settings', callback_data: 'dash_settings' }]
  ];
}

function getCashKeyboard() {
  return [
    [
      { text: 'Hari Ini', callback_data: 'cash_today' },
      { text: 'Kemarin', callback_data: 'cash_yesterday' },
      { text: 'Bulan Ini', callback_data: 'cash_month' }
    ]
  ];
}
