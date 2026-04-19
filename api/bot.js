import { handleUpdate } from '../lib/handlers.js';

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
      const update = req.body;
      
      // Keamanan dasar: pastikan body ada
      if (!update) {
        return res.status(400).send('No payload');
      }

      // Jalankan logika bot secara async
      // Kita tidak perlu menunggu (await) sampai selesai jika ingin respons cepat ke Telegram (3000ms limit)
      // Namun di serverless, jika kita tidak await, execution bisa terhenti.
      await handleUpdate(update);

      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook Error:', error);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(200).send('Bot is running...');
  }
}
