import { sendMessage, editMessageText, answerCallbackQuery } from './telegram.js';
import { getOrCreateUser, getDefaultWallet, supabase } from './db.js';
import { parseTransaction } from './parser.js';
import { formatRp, formatQty } from './format.js';
import { updateHolding } from './portfolio.js';
import { getCashflowSummary, getPortfolioSummary } from './reports.js';

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
    return sendDashboard(chatId, `Halo <b>${user.name}</b>! Selamat datang di Bot Keuangan Personal.`);
  }

  // Handle parsing transaksi bebas
  const transaction = parseTransaction(text);
  if (transaction) {
    try {
      const wallet = await getDefaultWallet(user.id, ['buy', 'sell', 'trade'].includes(transaction.type) ? 'exchange' : 'cash');
      
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

      return sendMessage(chatId, `✅ <b>Berhasil mencatat!</b>\n\n📝 ${transaction.note}\n💰 Nominal: ${formatRp(transaction.amount_rp)}${holdingNote}`);
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
    const text = `🪙 <b>Ringkasan Portofolio</b>\n\nTotal Aset: ${summary.count}\nCost Basis: ${formatRp(summary.totalCostBasis)}`;
    return editDashboard(chatId, messageId, text);
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
        [{ text: '🔙 Kembali', callback_data: 'dash_main' }]
      ]
    }
  });
}
