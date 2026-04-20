import { supabase } from '../lib/db.js';
import { sendMessage } from '../lib/telegram.js';

export default async function handler(req, res) {
    // Cron trigger dari Vercel atau manual trigger
    
    const { data: users, error } = await supabase.from('users').select('telegram_user_id');
    if (error) {
        return res.status(500).json({ error: error.message });
    }

    const messages = [
        "Reminder: waktunya update catatan keuangan hari ini.",
        "Hari ini udah keluar duit berapa?\nYuk catat dulu 👀",
        "Jangan lupa catat transaksi hari ini 📒",
        "Duit keluar diam-diam itu bahaya 😏\nCatat sekarang sebelum lupa."
    ];
    
    // Pilih pesan berdasarkan hari (round-robin berulang tiap 4 hari)
    const dayIndex = Math.floor(Date.now() / 86400000);
    const msg = messages[dayIndex % messages.length];
    
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
