const TOKEN = process.env.TELEGRAM_TOKEN;
const API_URL = `https://api.telegram.org/bot${TOKEN}`;

/**
 * Send message to Telegram
 */
export async function sendMessage(chatId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    ...options
  };

  const res = await fetch(`${API_URL}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Telegram Error: ${data.description}`);
  }
  return data;
}

/**
 * Answer callback query (for inline buttons)
 */
export async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
  const payload = {
    callback_query_id: callbackQueryId,
    text: text,
    show_alert: showAlert
  };

  const res = await fetch(`${API_URL}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Telegram Error: ${data.description}`);
  }
  return data;
}

/**
 * Edit existing message
 */
export async function editMessageText(chatId, messageId, text, options = {}) {
  const payload = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: 'HTML',
    ...options
  };

  const res = await fetch(`${API_URL}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Telegram Error: ${data.description}`);
  }
  return data;
}
