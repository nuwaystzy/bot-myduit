import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('SUPABASE_URL or SUPABASE_KEY is missing from environment variables.');
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

/**
 * Helper to get or create user
 */
export async function getOrCreateUser(tgUser) {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_user_id', tgUser.id)
    .single();

  if (user) return user;

  const { data: newUser, error: createError } = await supabase
    .from('users')
    .insert([{
      telegram_user_id: tgUser.id,
      username: tgUser.username,
      name: `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim()
    }])
    .select()
    .single();

  if (createError) throw createError;
  return newUser;
}

/**
 * Helper to get user's default wallet
 */
export async function getDefaultWallet(userId, type = 'cash') {
  const { data: wallet, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .limit(1)
    .single();

  if (wallet) return wallet;

  // Create default if not exists
  const { data: newWallet, error: createError } = await supabase
    .from('wallets')
    .insert([{
      user_id: userId,
      type: type,
      name: type === 'cash' ? 'Dompet Utama' : 'Exchange Utama',
    }])
    .select()
    .single();

  if (createError) throw createError;
  return newWallet;
}
