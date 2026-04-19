const tg = window.Telegram.WebApp;
tg.expand();
tg.ready();

// State
let userId = tg.initDataUnsafe?.user?.id || 123456; // Fallback for testing
let userName = tg.initDataUnsafe?.user?.first_name || 'Guest';
let userPhoto = tg.initDataUnsafe?.user?.photo_url || null;

// UI Elements
const totalWealthEl = document.getElementById('total-wealth');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const recentTxEl = document.getElementById('recent-transactions');
const holdingsListEl = document.getElementById('holdings-list');
const fullHistoryEl = document.getElementById('full-history');
const cryptoWealthEl = document.getElementById('crypto-wealth');
const cryptoPnLEl = document.getElementById('crypto-pnl');

// Main Initialization
function init() {
    document.getElementById('user-name').innerText = userName;
    if (userPhoto) document.getElementById('user-photo').src = userPhoto;
    
    refreshData();
    
    // Refresh button
    document.getElementById('refresh-btn').onclick = () => {
        showToast('Refreshing data...', '🔄');
        refreshData();
    };
}

async function refreshData() {
    await Promise.all([
        fetchSummary(),
        fetchTransactions(),
        fetchHoldings()
    ]);
}

// API Calls
async function fetchSummary() {
    try {
        const res = await fetch(`/api/summary?user_id=${userId}`);
        const data = await res.json();
        
        totalWealthEl.innerText = formatIDR(data.total);
        totalIncomeEl.innerText = formatIDR(data.income);
        totalExpenseEl.innerText = formatIDR(data.expense);
        cryptoWealthEl.innerText = formatIDR(data.crypto_value);
        
        const pnl = data.crypto_pnl || 0;
        const pnlPct = data.crypto_pnl_percent || 0;
        const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
        cryptoPnLEl.className = `text-sm font-medium mt-1 ${pnlColor}`;
        cryptoPnLEl.innerText = `PnL: ${formatIDR(pnl)} (${pnlPct.toFixed(2)}%)`;
        
    } catch (err) {
        console.error('Fetch Summary Error:', err);
    }
}

async function fetchTransactions() {
    try {
        const res = await fetch(`/api/transactions?user_id=${userId}`);
        const data = await res.json();
        
        renderRecent(data.slice(0, 5));
        renderHistory(data);
    } catch (err) {
        console.error('Fetch Transactions Error:', err);
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

// Rendering Logic
function renderRecent(txs) {
    recentTxEl.innerHTML = txs.map(t => createTxRow(t)).join('');
}

function renderHistory(txs) {
    fullHistoryEl.innerHTML = txs.map(t => createTxRow(t)).join('');
}

function renderHoldings(items) {
    if (!items.length) {
        holdingsListEl.innerHTML = '<p class="text-center text-slate-500 py-10">Belum ada aset koin.</p>';
        return;
    }
    holdingsListEl.innerHTML = items.map(h => `
        <div class="glass-card p-4 rounded-2xl flex items-center justify-between">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center font-bold text-blue-400">
                    ${h.asset.substring(0, 1)}
                </div>
                <div>
                    <h4 class="font-bold text-sm">${h.asset}</h4>
                    <p class="text-[10px] text-slate-400">${h.quantity} UNIT</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-bold text-sm">${formatIDR(h.currentValue)}</p>
                <p class="text-[10px] ${h.pnl >= 0 ? 'text-green-400' : 'text-red-400'}">
                    ${h.pnl >= 0 ? '+' : ''}${h.pnlPercent.toFixed(2)}%
                </p>
            </div>
        </div>
    `).join('');
}

function createTxRow(t) {
    const isIncome = t.type === 'income' || t.type === 'sell';
    const color = isIncome ? 'text-green-400' : 'text-red-400';
    const sign = isIncome ? '+' : '-';
    
    return `
        <div class="glass-card p-4 rounded-2xl flex items-center justify-between active:bg-white/5 transition-all" onclick="openDetailModal('${t.id}')">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5 text-lg">
                    ${getTransactionIcon(t.category)}
                </div>
                <div>
                    <h4 class="font-bold text-sm capitalize">${t.category || t.asset || 'N/A'}</h4>
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

// Navigation
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

    // If history or portfolio, make sure it's fresh
    if (tabId === 'history' || tabId === 'portfolio') refreshData();
}

// Modals
function openAddModal(type) {
    const isIncome = type === 'income';
    const title = isIncome ? 'Tambah Pemasukan' : 'Catat Pengeluaran';
    
    const content = `
        <div class="flex items-center justify-between mb-6">
            <h3 class="text-xl font-bold">${title}</h3>
            <button onclick="closeModal()" class="text-slate-400">Tutup</button>
        </div>
        <form id="add-form" class="space-y-4">
            <input type="hidden" name="type" value="${type}">
            <div>
                <label class="text-xs text-slate-400 mb-1 block uppercase font-bold tracking-wider">Nominal (Rp)</label>
                <input type="number" name="amount_rp" autofocus required class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl font-bold text-lg focus:border-blue-500 outline-none" placeholder="0">
            </div>
            <div>
                <label class="text-xs text-slate-400 mb-1 block uppercase font-bold tracking-wider">Kategori / Aset</label>
                <input type="text" name="category" required class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:border-blue-500 outline-none" placeholder="Misal: Makan, Gaji, BTC">
            </div>
            <div>
                <label class="text-xs text-slate-400 mb-1 block uppercase font-bold tracking-wider">Catatan (Opsional)</label>
                <textarea name="note" class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:border-blue-500 outline-none h-20" placeholder="Ketik catatan..."></textarea>
            </div>
            <button type="submit" class="w-full py-4 bg-blue-600 rounded-2xl font-bold text-lg active:scale-95 transition-transform mt-4">Simpan Transaksi</button>
        </form>
    `;
    
    showModal(content);
    
    document.getElementById('add-form').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const body = Object.fromEntries(formData.entries());
        body.user_id = userId;
        
        // Basic detection if it's crypto (optional)
        if (['BTC', 'ETH', 'SOL', 'BNB'].includes(body.category.toUpperCase())) {
            body.asset = body.category.toUpperCase();
            body.type = isIncome ? 'sell' : 'buy';
            // Note: simple version assumes quantity is calculated later or input is pure cash spent
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
            <h3 class="text-xl font-bold">Hapus Semua Data?</h3>
            <p class="text-sm text-slate-400">Tindakan ini tidak bisa dibatalkan secara manual. Seluruh riwayat transaksi akan hilang.</p>
            <div class="flex gap-4">
                <button onclick="closeModal()" class="flex-1 py-4 glass-card rounded-2xl font-bold">Batal</button>
                <button id="reset-final-btn" class="flex-1 py-4 bg-red-600 rounded-2xl font-bold">Ya, Hapus</button>
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

// Helpers
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

function getTransactionIcon(cat) {
    cat = (cat || '').toLowerCase();
    if (cat.includes('makan')) return '🍲';
    if (cat.includes('kopi') || cat.includes('minum')) return '☕';
    if (cat.includes('gaji') || cat.includes('masuk')) return '💰';
    if (cat.includes('transport') || cat.includes('gojek')) return '🚗';
    if (cat.includes('tagihan') || cat.includes('listrik')) return '📄';
    return '📝';
}

// Start
init();
