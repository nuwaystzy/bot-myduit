import { supabase } from '../lib/db.js';
import { sendMessage } from '../lib/telegram.js';

export default async function handler(req, res) {
    // Cron trigger dari Vercel atau manual trigger
    
    const { data: users, error } = await supabase.from('users').select('telegram_user_id');
    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const msg = `Jangan lupa catat transaksi hari ini 📒\n\nHari ini udah keluar duit berapa?\nYuk catat dulu 👀`;
    
    let sent = 0;
    for (const u of (users || [])) {
        if (u.telegram_user_id) {
            try {
                await sendMessage(u.telegram_user_id, msg);
                sent++;
            } catch (err) {
                console.error("Gagal mengirim ke", u.telegram_user_id, err);
            }
        }
    }
    
    res.status(200).json({ success: true, sent_count: sent });
}
