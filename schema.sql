-- Hapus tabel jika ada (Opsional, hati-hati jika ada data)
-- DROP TABLE IF EXISTS transactions, holdings, wallets, users, budgets, trade_journal, reminders, price_cache;

-- 1. Table users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_user_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    name TEXT,
    timezone TEXT DEFAULT 'Asia/Jakarta',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table wallets
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('cash', 'exchange', 'onchain')),
    name TEXT NOT NULL,
    currency TEXT DEFAULT 'IDR',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Table transactions
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'buy', 'sell', 'transfer', 'fee', 'deposit', 'withdraw', 'trade')),
    asset TEXT, -- misal BTC, SOL, atau 'CASH'
    category TEXT,
    amount_rp DECIMAL(20, 2) DEFAULT 0,
    quantity DECIMAL(20, 8) DEFAULT 0,
    price_per_unit DECIMAL(20, 8) DEFAULT 0,
    fee_rp DECIMAL(20, 2) DEFAULT 0,
    note TEXT,
    source TEXT, -- internal log
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Table holdings
CREATE TABLE IF NOT EXISTS holdings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    quantity DECIMAL(20, 8) DEFAULT 0,
    avg_price_rp DECIMAL(20, 2) DEFAULT 0,
    cost_basis_rp DECIMAL(20, 2) DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Table budgets
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    limit_rp DECIMAL(20, 2) NOT NULL,
    period TEXT NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Table trade_journal
CREATE TABLE IF NOT EXISTS trade_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    asset TEXT NOT NULL,
    side TEXT CHECK (side IN ('long', 'short')),
    entry_price DECIMAL(20, 8),
    exit_price DECIMAL(20, 8),
    quantity DECIMAL(20, 8),
    rr TEXT, -- Risk Reward ratio
    result TEXT CHECK (result IN ('win', 'loss', 'breakeven')),
    reason TEXT,
    timeframe TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Table reminders
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    schedule TEXT, -- Format crontab atau deskriptif
    message TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Table price_cache
CREATE TABLE IF NOT EXISTS price_cache (
    asset TEXT PRIMARY KEY,
    price_rp DECIMAL(20, 2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexing untuk performa
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_holdings_user ON holdings(user_id);
CREATE INDEX idx_wallets_user ON wallets(user_id);
