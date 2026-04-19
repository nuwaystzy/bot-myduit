const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// State
let userId = tg.initDataUnsafe?.user?.id || 123456;
let userName = tg.initDataUnsafe?.user?.first_name || 'Guest';
let userPhoto = tg.initDataUnsafe?.user?.photo_url || null;
let allTransactions = []; 
let allCash = 0; 

const coinNames = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'SOL': 'Solana',
    'BNB': 'Binance Coin',
    'USDT': 'Tether',
    'USDC': 'USD Coin',
    'TON': 'Toncoin',
    'SUI': 'Sui',
    'IDR': 'Rupiah'
};

// UI Elements
const totalWealthEl = document.getElementById('total-wealth');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const recentTxEl = document.getElementById('recent-transactions');
const holdingsListEl = document.getElementById('holdings-list');
const fullHistoryEl = document.getElementById('full-history');
const cryptoWealthEl = document.getElementById('crypto-wealth');
const cryptoPnLEl = document.getElementById('crypto-pnl');
const categoryReportEl = document.getElementById('category-report');

// Main Initialization
function init() {
    tg.ready();
    tg.expand();
    
    tg.setHeaderColor('bg_color');
    tg.setBackgroundColor('bg_color');

    const user = tg.initDataUnsafe?.user;
    if (user && user.id) {
        userId = user.id;
        userName = user.first_name || 'User';
        if (user.photo_url) userPhoto = user.photo_url;
    }
    
    document.getElementById('user-name').innerText = userName;
    if (userPhoto) document.getElementById('user-photo').src = userPhoto;
    
    showLoading(true);
    refreshData().finally(() => showLoading(false));
    
    document.getElementById('refresh-btn').onclick = () => {
        showLoading(true);
        refreshData().finally(() => showLoading(false));
    };
}

async function refreshData() {
    await fetchSummary();
    await Promise.all([
        fetchHistory(),
        fetchHoldings()
    ]);
}

async function fetchSummary() {
    try {
        const res = await fetch(`/api/summary?user_id=${userId}`);
        const data = await res.json();
        
        allCash = data.income - data.expense;
        totalWealthEl.innerText = formatIDR(data.total);
        totalIncomeEl.innerText = formatIDR(data.income);
        totalExpenseEl.innerText = formatIDR(data.expense);
        cryptoWealthEl.innerText = formatIDR(data.crypto_value);
        
        const pnl = data.crypto_pnl || 0;
        const pnlPct = data.crypto_pnl_percent || 0;
        const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
        cryptoPnLEl.className = `text-sm font-medium mt-1 ${pnlColor}`;
        cryptoPnLEl.innerText = `PnL: ${formatIDR(pnl)} (${pnlPct.toFixed(2)}%)`;

        renderCategoryReport(data.categories || [], data.expense);
    } catch (err) {
        console.error('Fetch Summary Error:', err);
    }
}

async function fetchHistory() {
    try {
        const res = await fetch(`/api/transactions?user_id=${userId}`);
        allTransactions = await res.json();
        renderRecent(allTransactions.slice(0, 5));
        renderHistory(allTransactions);
    } catch (err) {
        console.error('Fetch History Error:', err);
    }
}

async function fetchHoldings() {
    try {
        const res = await fetch(`/api/holdings?user_id=${userId}`);
        const data = await res.json();
        renderHoldings(data);
    } catch (err) {
        console.error('Fetch Holdings Error:', err);
    }
}

function renderCategoryReport(categories, totalExpense) {
    if (!categories.length) {
        categoryReportEl.innerHTML = '<p class="text-xs text-slate-500 italic">Belum ada pengeluaran bulan ini.</p>';
        return;
    }

    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500'];
    
    categoryReportEl.innerHTML = categories.map((cat, i) => {
        const pct = totalExpense > 0 ? (cat.amount / totalExpense) * 100 : 0;
        const color = colors[i % colors.length];
        return `
            <div class="space-y-1">
                <div class="flex items-center justify-between text-xs">
                    <span class="font-medium text-slate-300 capitalize">${cat.category}</span>
                    <span class="font-bold text-slate-100">${pct.toFixed(0)}%</span>
                </div>
                <div class="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div class="${color} h-full rounded-full" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

function filterHistory(category, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => {
        b.classList.remove('bg-blue-500/10', 'border-blue-500/50', 'text-white');
        b.classList.add('text-slate-400', 'border-transparent');
    });
    btn.classList.add('bg-blue-500/10', 'border-blue-500/50', 'text-white');
    btn.classList.remove('text-slate-400', 'border-transparent');

    let filtered = allTransactions;
    if (category === 'income') filtered = allTransactions.filter(t => t.type === 'income');
    if (category === 'expense') filtered = allTransactions.filter(t => t.type === 'expense');
    if (category === 'crypto') filtered = allTransactions.filter(t => ['buy', 'sell'].includes(t.type));
    
    renderHistory(filtered);
}

// Global functions for icon fallbacks
window.onIconError = function(el) {
    el.style.display = 'none';
    const fallback = el.nextElementSibling;
    if (fallback) fallback.style.display = 'flex';
}

function renderHoldings(items) {
    const list = document.getElementById('holdings-list');
    
    let html = `
        <div class="glass-card p-4 rounded-2xl flex items-center justify-between border-blue-500/10 mb-3">
            <div class="flex items-center gap-3">
                <div class="asset-icon bg-red-500/20 text-red-500 overflow-hidden">
                    <span class="flex items-center justify-center w-full h-full font-bold">Rp</span>
                </div>
                <div>
                    <h4 class="font-bold text-sm text-white">IDR</h4>
                    <p class="text-[10px] text-slate-400">Rupiah</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-sm text-white">${formatIDR(allCash)}</p>
                <p class="text-[10px] text-slate-400">CASH</p>
            </div>
        </div>
    `;

    html += items.map(h => {
        const name = coinNames[h.asset] || h.asset;
        const symbol = h.asset.toLowerCase();
        return `
            <div class="glass-card p-4 rounded-2xl flex items-center justify-between mb-3 last:mb-0">
                <div class="flex items-center gap-3">
                    <div class="asset-icon bg-blue-500/20 text-blue-400 overflow-hidden relative">
                        <img src="https://assets.coincap.io/assets/icons/${symbol}@2x.png" 
                             onerror="onIconError(this)"
                             class="w-8 h-8 object-contain">
                        <span style="display:none" class="absolute inset-0 flex items-center justify-center font-bold text-xs">${h.asset.substring(0, 1)}</span>
                    </div>
                    <div>
                        <h4 class="font-bold text-sm text-white">${h.asset}</h4>
                        <p class="text-[10px] text-slate-400">${name}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-sm text-white">${Number(h.quantity).toLocaleString()} ${h.asset}</p>
                    <p class="text-[10px] text-slate-400">${formatIDR(h.currentValue)}</p>
                    <p class="text-[9px] ${h.pnl >= 0 ? 'text-green-400' : 'text-red-400'} font-medium">
                        ${h.pnl >= 0 ? '+' : ''}${h.pnlPercent.toFixed(2)}%
                    </p>
                </div>
            </div>
        `;
    }).join('');

    list.innerHTML = html;
}

function createTxRow(t) {
    const isPositive = t.type === 'income' || t.type === 'buy'; 
    const isCrypto = t.type === 'buy' || t.type === 'sell';
    const color = isPositive ? 'text-green-400' : 'text-red-400';
    const sign = isPositive ? '+' : '-';
    
    let iconHtml = `<div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-lg">${getTransactionIcon(t.category, t.type)}</div>`;
    
    if (isCrypto) {
        const symbol = (t.asset || t.category).toLowerCase();
        iconHtml = `
            <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 overflow-hidden border border-white/5 relative">
                <img src="https://assets.coincap.io/assets/icons/${symbol}@2x.png" 
                     onerror="onIconError(this)"
                     class="w-6 h-6 object-contain">
                <span style="display:none" class="absolute inset-0 flex items-center justify-center text-xs font-bold">${symbol.substring(0, 1).toUpperCase()}</span>
            </div>
        `;
    }

    return `
        <div class="glass-card p-4 rounded-2xl flex items-center justify-between active:bg-white/5 transition-all mb-3 last:mb-0" onclick="openDetailModal('${t.id}')">
            <div class="flex items-center gap-3">
                ${iconHtml}
                <div>
                    <h4 class="font-bold text-sm capitalize text-white">${t.category || t.asset || 'N/A'}</h4>
                    <p class="text-[10px] text-slate-400">${new Date(t.created_at).toLocaleDateString()}</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-sm ${color}">${sign} ${formatIDR(t.amount_rp)}</p>
                <p class="text-[10px] text-slate-400">${t.type.toUpperCase()}</p>
            </div>
        </div>
    `;
}

function getTransactionIcon(cat, type) {
    if (type === 'income' || type === 'sell') return '💰';
    
    cat = (cat || '').toLowerCase();
    if (cat.includes('makan')) return '🍲';
    if (cat.includes('kopi') || cat.includes('minum')) return '☕';
    if (cat.includes('gaji') || cat.includes('masuk')) return '💰';
    if (cat.includes('transport') || cat.includes('gojek')) return '🚗';
    if (cat.includes('tagihan') || cat.includes('listrik')) return '📄';
    return '📝';
}

function showLoading(isLoading) {
    const main = document.querySelector('main');
    if (isLoading) {
        main.classList.add('status-loading');
    } else {
        main.classList.remove('status-loading');
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('text-blue-500');
        btn.classList.add('text-slate-400');
        if (btn.dataset.tab === tabId) {
            btn.classList.add('text-blue-500');
            btn.classList.remove('text-slate-400');
        }
    });

    if (tabId === 'history' || tabId === 'portfolio') refreshData();
}

function openAddModal(type) {
    const isIncome = type === 'income';
    const title = isIncome ? 'Tambah Pemasukan' : 'Catat Pengeluaran';
    
    const content = `
        <div class="flex items-center justify-between mb-6">
            <h3 class="text-xl font-bold text-white">${title}</h3>
            <button onclick="closeModal()" class="text-slate-400">Tutup</button>
        </div>
        <form id="add-form" class="space-y-4">
            <input type="hidden" name="type" value="${type}">
            <div>
                <label class="text-xs text-slate-400 mb-1 block uppercase font-bold tracking-wider">Nominal (Rp)</label>
                <input type="number" name="amount_rp" autofocus required class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl font-bold text-lg focus:border-blue-500 outline-none text-white" placeholder="0">
            </div>
            <div>
                <label class="text-xs text-slate-400 mb-1 block uppercase font-bold tracking-wider">Kategori / Aset</label>
                <input type="text" name="category" required class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:border-blue-500 outline-none text-white" placeholder="Misal: Makan, Gaji, BTC">
            </div>
            <div>
                <label class="text-xs text-slate-400 mb-1 block uppercase font-bold tracking-wider">Catatan (Opsional)</label>
                <textarea name="note" class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:border-blue-500 outline-none h-20 text-white" placeholder="Ketik catatan..."></textarea>
            </div>
            <button type="submit" class="w-full py-4 bg-blue-600 rounded-2xl font-bold text-lg active:scale-95 transition-transform mt-4 text-white">Simpan Transaksi</button>
        </form>
    `;
    
    showModal(content);
    
    document.getElementById('add-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const body = Object.fromEntries(formData.entries());
        body.user_id = userId;
        
        if (['BTC', 'ETH', 'SOL', 'BNB'].includes(body.category.toUpperCase())) {
            body.asset = body.category.toUpperCase();
            body.type = isIncome ? 'sell' : 'buy';
        }

        try {
            const res = await fetch('/api/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const result = await res.json();
            if (result.success) {
                showToast('Transaksi disimpan!', '✅');
                closeModal();
                refreshData();
            } else {
                showToast(result.error || 'Gagal menyimpan', '❌');
            }
        } catch (err) {
            showToast('Network Error', '❌');
        }
    }
}

function confirmReset() {
    const content = `
        <div class="text-center space-y-6">
            <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-3xl">⚠️</div>
            <h3 class="text-xl font-bold text-white">Hapus Semua Data?</h3>
            <p class="text-sm text-slate-400">Tindakan ini tidak bisa dibatalkan secara manual. Seluruh riwayat transaksi akan hilang.</p>
            <div class="flex gap-4">
                <button onclick="closeModal()" class="flex-1 py-4 glass-card rounded-2xl font-bold text-white">Batal</button>
                <button id="reset-final-btn" class="flex-1 py-4 bg-red-600 rounded-2xl font-bold text-white">Ya, Hapus</button>
            </div>
        </div>
    `;
    showModal(content);
    document.getElementById('reset-final-btn').onclick = async () => {
        const res = await fetch('/api/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        if (res.ok) {
            showToast('Data direset!', '🧹');
            closeModal();
            refreshData();
        }
    };
}

function showModal(content) {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.innerHTML = content;
    overlay.classList.remove('hidden');
    setTimeout(() => overlay.classList.remove('opacity-0'), 10);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('opacity-0');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

function showToast(msg, icon = '✨') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    document.getElementById('toast-icon').innerText = icon;
    toast.classList.remove('-translate-y-20');
    setTimeout(() => toast.classList.add('-translate-y-20'), 2500);
}

function formatIDR(val) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);
}

function openDetailModal(id) {
    showToast('Detail transaksi ID: ' + id, 'ℹ️');
}

// Start
init();
