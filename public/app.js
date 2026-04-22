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

// ... (Restored UI Elements & Main logic)
const totalWealthEl = document.getElementById('total-wealth');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const recentTxEl = document.getElementById('recent-transactions');
const holdingsListEl = document.getElementById('holdings-list');
const fullHistoryEl = document.getElementById('full-history');
const cryptoWealthEl = document.getElementById('crypto-wealth');
const cryptoPnLEl = document.getElementById('crypto-pnl');
const categoryReportEl = document.getElementById('category-report');

async function init() {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('bg_color');
    tg.setBackgroundColor('bg_color');

    const user = tg.initDataUnsafe?.user;
    if (user && user.id) {
        userId = user.id;
        userName = user.first_name || 'User';
        if (user.photo_url) userPhoto = user.photo_url;
        
        // Fetch toggle state
        try {
            const res = await fetch(`/api/settings?tg_id=${userId}&get_status=1`);
            const data = await res.json();
            const toggle = document.getElementById('toggle-reminder');
            if (toggle) toggle.checked = data.active !== false;
        } catch (e) {
            console.error('Failed fetching settings:', e);
        }
    }
    
    document.getElementById('user-name').innerText = userName;
    if (userPhoto) document.getElementById('user-photo').src = userPhoto;
    
    showLoading(true);
    refreshData().finally(() => showLoading(false));
    
    document.getElementById('refresh-btn').onclick = () => {
        showLoading(true);
        refreshData().finally(() => showLoading(false));
    };

    // Deep link: Handle #edit=UUID from Bot inline button
    refreshData().then(() => {
        const hash = window.location.hash;
        if (hash && hash.startsWith('#edit=')) {
            const txId = hash.split('=')[1];
            if (txId) {
                setTimeout(() => openDetailModal(txId), 500);
            }
        }
    });
}

async function refreshData() {
    await Promise.all([
        fetchSummary(),
        fetchHistory(),
        fetchHoldings()
    ]);
}

async function fetchSummary() {
    try {
        const res = await fetch(`/api/summary?user_id=${userId}`);
        const data = await res.json();
        
        // Robust calculation
        allCash = Number(data.income || 0) - Number(data.expense || 0);
        totalWealthEl.innerText = formatIDR(data.total);
        totalIncomeEl.innerText = formatIDR(data.income);
        totalExpenseEl.innerText = formatIDR(data.expense);
        cryptoWealthEl.innerText = formatIDR(data.crypto_value);
        
        const pnl = Number(data.crypto_pnl || 0);
        const pnlPct = Number(data.crypto_pnl_percent || 0);
        const pnlColor = pnl >= 0 ? 'text-green-400' : 'text-red-400';
        cryptoPnLEl.className = `text-sm font-medium mt-1 ${pnlColor}`;
        cryptoPnLEl.innerText = `PnL: ${formatIDR(pnl)} (${pnlPct.toFixed(2)}%)`;
        
        const monthName = new Date().toLocaleDateString('id-ID', { month: 'short' }).toUpperCase();
        document.getElementById('income-month-badge').innerText = `• ${monthName}`;
        document.getElementById('expense-month-badge').innerText = `• ${monthName}`;
        
        // Removed static renderCategoryReport here, as it's now handled by dynamic toggle
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
        changeReportTimeframe(currentReportTimeframe);
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
        categoryReportEl.innerHTML = '<p class="text-[10px] text-slate-500 italic text-center py-4">Belum ada pengeluaran yang tercatat.</p>';
        return;
    }

    const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500'];
    
    categoryReportEl.innerHTML = categories.map((cat, i) => {
        const pct = totalExpense > 0 ? (Number(cat.amount) / totalExpense) * 100 : 0;
        const color = colors[i % colors.length];
        return `
            <div class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px]">
                    <span class="font-bold text-slate-300 capitalize flex items-center gap-2">
                         <div class="w-2 h-2 rounded-full ${color}"></div>
                         ${cat.category}
                    </span>
                    <span class="font-black text-slate-100">${pct.toFixed(0)}%</span>
                </div>
                <div class="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div class="${color} h-full rounded-full transition-all duration-1000" style="width: ${pct}%"></div>
                </div>
                <p class="text-[9px] text-slate-500 text-right">${formatIDR(cat.amount)}</p>
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

const customIcons = {
    'sol': 'https://upload.wikimedia.org/wikipedia/en/b/b9/Solana_logo.png',
    'ton': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cb/The_Open_Network_logo.svg/512px-The_Open_Network_logo.svg.png',
    'sui': 'https://cryptologos.cc/logos/sui-sui-logo.png',
    'btc': 'https://assets.coincap.io/assets/icons/btc@2x.png',
    'eth': 'https://assets.coincap.io/assets/icons/eth@2x.png',
};

function getCoinIconUrl(symbol) {
    symbol = (symbol || '').toLowerCase();
    if (customIcons[symbol]) return customIcons[symbol];
    return `https://assets.coincap.io/assets/icons/${symbol}@2x.png`;
}

function renderHoldings(items) {
    const list = document.getElementById('holdings-list');
    
    let html = `
        <div class="glass-card p-4 rounded-2xl flex items-center justify-between border-blue-500/10 mb-3 shadow-lg">
            <div class="flex items-center gap-3">
                <div class="asset-icon bg-red-500/20 text-red-500 flex items-center justify-center font-black">Rp</div>
                <div>
                    <h4 class="font-black text-sm text-white">IDR</h4>
                    <p class="text-[10px] text-slate-400 font-bold">Rupiah</p>
                </div>
            </div>
            <div class="text-right">
                <p class="font-black text-sm text-white">${formatIDR(allCash)}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase">Cash</p>
            </div>
        </div>
    `;

    html += items.map(h => {
        const name = coinNames[h.asset] || h.asset;
        const symbol = h.asset.toLowerCase();
        return `
            <div class="glass-card py-3.5 px-4 rounded-[20px] flex items-center justify-between shadow-lg border-white/5">
                <div class="flex items-center gap-3">
                    <div class="asset-icon bg-white/5 text-blue-400 overflow-hidden relative flex items-center justify-center rounded-full">
                        <img src="${getCoinIconUrl(symbol)}" 
                             onerror="onIconError(this)"
                             class="w-10 h-10 object-cover scale-110">
                        <span style="display:none" class="absolute inset-0 flex items-center justify-center font-black text-xs">${h.asset.substring(0, 1)}</span>
                    </div>
                    <div>
                        <h4 class="font-black text-sm text-white">${h.asset}</h4>
                        <p class="text-[10px] text-slate-400 font-bold">${name}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-black text-sm text-white">${Number(h.quantity).toLocaleString()} ${h.asset}</p>
                    <p class="text-[10px] text-slate-400 font-bold">${formatIDR(h.currentValue)}</p>
                    <p class="text-[9px] ${h.pnl >= 0 ? 'text-green-400' : 'text-red-400'} font-black">
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
    const color = isPositive ? 'text-green-500' : 'text-red-500';
    const sign = isPositive ? '+' : '-';
    
    const rawDate = new Date(t.created_at);
    const today = new Date();
    const isToday = rawDate.getDate() === today.getDate() && rawDate.getMonth() === today.getMonth();
    const dateStr = isToday ? 'Hari Ini' : rawDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const timeStr = rawDate.toLocaleTimeString(['id-ID', 'en-US'], {hour: '2-digit', minute:'2-digit'});
    const noteStr = t.note ? `${t.note} • ` : '';

    let iconHtml = '';
    
    if (isCrypto) {
        // Tipe beli (Buy) menghasilkan warna Hijau, Jual (Sell) merah - Sesuai request user.
        const cryptoColor = t.type === 'buy' ? 'bg-green-500' : 'bg-red-500';
        
        iconHtml = `
            <div class="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#1c1c1e] border border-white/5 relative shadow-inner shrink-0 group">
                <!-- Flaticon Crypto Buy/Sell Mask -->
                <div class="w-8 h-8 ${cryptoColor}" style="-webkit-mask: url('/crypto-icon-mask.png') no-repeat center / 135%; mask: url('/crypto-icon-mask.png') no-repeat center / 135%;"></div>
                
                <!-- Tiny coin overlay -->
                <img src="${getCoinIconUrl((t.asset || t.category || '').toLowerCase())}" class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-[#171717] opacity-90" onerror="this.style.display='none'">
            </div>
        `;
    } else {
        const iconColor = isPositive ? 'text-green-500' : 'text-red-500';
        // Income = bag svg, Expense = money svg
        const iconSvg = isPositive 
            ? `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>` 
            : `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>`;
            
        iconHtml = `
            <div class="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#1c1c1e] border border-white/5 shadow-inner shrink-0">
                <svg class="w-5 h-5 ${iconColor}" fill="none" stroke="currentColor" viewBox="0 0 24 24">${iconSvg}</svg>
            </div>
        `;
    }

    return `
        <div class="bg-white/[0.03] py-3.5 px-4 rounded-[20px] flex items-center justify-between active:scale-[0.98] transition-all border border-white/5 gap-2 w-full" onclick="openDetailModal('${t.id}')">
            <div class="flex items-center gap-3 flex-1 min-w-0">
                ${iconHtml}
                <div class="flex-1 min-w-0 text-left">
                    <h4 class="font-bold text-[14px] capitalize text-white tracking-wide truncate w-full">${t.category || t.asset || 'N/A'}</h4>
                    <p class="text-[10px] text-white/40 mt-1 uppercase tracking-wider truncate w-full">${noteStr}${dateStr}, ${timeStr.replace('.', ':')}</p>
                </div>
            </div>
            <div class="text-right shrink-0">
                <p class="font-black text-[13px] sm:text-[14px] tracking-wide ${color}">${sign}${formatIDR(t.amount_rp)}</p>
            </div>
        </div>
    `;
}

function renderRecent(txs) {
    if (!recentTxEl) return;
    if (!txs || txs.length === 0) {
        recentTxEl.innerHTML = '<p class="text-xs text-slate-500 italic text-center py-4">Belum ada aktivitas terbaru.</p>';
        return;
    }
    recentTxEl.innerHTML = txs.map(t => createTxRow(t)).join('');
}

function renderHistory(txs) {
    if (!fullHistoryEl) return;
    if (!txs || txs.length === 0) {
        fullHistoryEl.innerHTML = '<p class="text-xs text-slate-500 italic text-center py-4">Belum ada riwayat transaksi.</p>';
        return;
    }
    fullHistoryEl.innerHTML = txs.map(t => createTxRow(t)).join('');
}

let currentReportTimeframe = 'month';
let reportMonthOffset = 0;

function prevReportMonth() {
    reportMonthOffset--;
    renderDynamicReport(allTransactions);
}

function nextReportMonth() {
    if (reportMonthOffset < 0) {
        reportMonthOffset++;
        renderDynamicReport(allTransactions);
    }
}

function changeReportTimeframe(timeframe) {
    currentReportTimeframe = timeframe;
    reportMonthOffset = 0; // reset
    
    // Update Toggle UI
    document.querySelectorAll('.rep-toggle').forEach(b => {
        b.classList.remove('bg-blue-500/10', 'border-blue-500/50', 'text-white');
        b.classList.add('text-slate-400', 'border-transparent');
    });
    const activeBtn = document.getElementById(`btn-rep-${timeframe}`);
    if (activeBtn) {
        activeBtn.classList.add('bg-blue-500/10', 'border-blue-500/50', 'text-white');
        activeBtn.classList.remove('text-slate-400', 'border-transparent');
    }

    renderDynamicReport(allTransactions);
}

function renderDynamicReport(txs) {
    const now = new Date();
    let startDate;
    let endDate = null;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const monthNavEl = document.getElementById('month-nav');
    if (monthNavEl) monthNavEl.style.display = (currentReportTimeframe === 'month') ? 'flex' : 'none';

    if (currentReportTimeframe === 'day') {
        startDate = today;
        document.getElementById('rep-active-title').innerText = 'Hari Ini';
    } else if (currentReportTimeframe === 'week') {
        const dayOfWeek = now.getDay() || 7; 
        startDate = new Date(today);
        startDate.setDate(today.getDate() - dayOfWeek + 1);
        document.getElementById('rep-active-title').innerText = 'Minggu Ini';
    } else {
        const targetDate = new Date(now.getFullYear(), now.getMonth() + reportMonthOffset, 1);
        startDate = targetDate;
        endDate = new Date(now.getFullYear(), now.getMonth() + reportMonthOffset + 1, 1);
        
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
        const monthTitle = `${monthNames[targetDate.getMonth()]} ${targetDate.getFullYear()}`;
        document.getElementById('rep-active-title').innerText = reportMonthOffset === 0 ? 'Bulan Ini' : monthTitle;
        
        const monthLabel = document.getElementById('month-nav-label');
        if (monthLabel) monthLabel.innerText = monthTitle;
        
        const nextBtn = document.getElementById('month-nav-next');
        if (nextBtn) {
            nextBtn.disabled = (reportMonthOffset >= 0);
            if (reportMonthOffset >= 0) {
                nextBtn.classList.add('opacity-30', 'cursor-not-allowed');
            } else {
                nextBtn.classList.remove('opacity-30', 'cursor-not-allowed');
            }
        }
    }

    let income = 0;
    let expense = 0;
    const categoryStats = {};

    txs.forEach(t => {
        const d = new Date(t.created_at);
        if (d >= startDate && (!endDate || d < endDate)) {
            const amount = Number(t.amount_rp) || 0;
            if (t.type === 'income') {
                income += amount;
            } else if (t.type === 'expense') {
                expense += amount;
                const cat = t.category || 'Lainnya';
                categoryStats[cat] = (categoryStats[cat] || 0) + amount;
            }
        }
    });

    document.getElementById('rep-active-in').innerText = formatIDR(income);
    document.getElementById('rep-active-out').innerText = formatIDR(expense);

    // Build Categories Array
    const categoriesArray = Object.entries(categoryStats)
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount);

    renderCategoryReport(categoriesArray, expense);
}

function showLoading(isLoading) {
    const main = document.querySelector('main');
    if (isLoading) main.classList.add('status-loading');
    else main.classList.remove('status-loading');
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

    if (tabId === 'history' || tabId === 'portfolio' || tabId === 'reports') refreshData();
}

function openAddModal(type) {
    const isIncome = type === 'income';
    const title = isIncome ? 'Tambah Pemasukan' : 'Catat Pengeluaran';
    
    const content = `
        <div class="flex items-center justify-between mb-6">
            <h3 class="text-xl font-black text-white">${title}</h3>
            <button onclick="closeModal()" class="text-slate-400">Tutup</button>
        </div>
        <form id="add-form" class="space-y-4">
            <input type="hidden" name="type" value="${type}">
            <div>
                <label class="text-[10px] text-slate-400 mb-1 block uppercase font-black tracking-widest">Nominal (Rp)</label>
                <input type="number" name="amount_rp" autofocus required class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl font-black text-xl focus:border-blue-500 outline-none text-white shadow-inner" placeholder="0">
            </div>
            <div>
                <label class="text-[10px] text-slate-400 mb-1 block uppercase font-black tracking-widest">Kategori / Aset</label>
                <input type="text" name="category" required class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:border-blue-500 outline-none text-white font-black" placeholder="Misal: Makan, Gaji, BTC">
            </div>
            <div>
                <label class="text-[10px] text-slate-400 mb-1 block uppercase font-black tracking-widest">Catatan</label>
                <textarea name="note" class="w-full bg-white/5 border border-white/10 p-4 rounded-2xl focus:border-blue-500 outline-none h-20 text-white font-bold" placeholder="Ketik catatan..."></textarea>
            </div>
            <button type="submit" id="btn-submit-tx" class="w-full py-5 bg-blue-600 rounded-3xl font-black text-lg active:scale-95 transition-all mt-4 text-white shadow-2xl disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed">Simpan Transaksi</button>
        </form>
    `;
    
    showModal(content);
    
    document.getElementById('add-form').onsubmit = async (e) => {
        e.preventDefault();
        
        const submitBtn = document.getElementById('btn-submit-tx');
        submitBtn.disabled = true;
        const originalText = submitBtn.innerText;
        submitBtn.innerText = 'Menyimpan...';
        
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
                showToast('Berhasil disimpan!', '✅');
                closeModal();
                refreshData();
            } else {
                showToast(result.error || 'Gagal menyimpan', '❌');
                submitBtn.disabled = false;
                submitBtn.innerText = originalText;
            }
        } catch (err) {
            showToast('Network Error', '❌');
            submitBtn.disabled = false;
            submitBtn.innerText = originalText;
        }
    }
}

function confirmReset() {
    const content = `
        <div class="text-center space-y-6">
            <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto text-3xl">⚠️</div>
            <h3 class="text-xl font-black text-white">Hapus Semua Data?</h3>
            <p class="text-sm text-slate-400 font-bold px-4">Tindakan ini tidak bisa dibatalkan. Seluruh riwayat transaksi & aset akan hilang.</p>
            <div class="flex gap-4">
                <button onclick="closeModal()" class="flex-1 py-4 glass-card rounded-2xl font-black text-white">Batal</button>
                <button id="reset-final-btn" class="flex-1 py-4 bg-red-600 rounded-2xl font-black text-white">Ya, Hapus</button>
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

async function toggleReminder(isActive) {
    try {
        const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tg_id: userId, active: isActive })
        });
        const data = await res.json();
        if (data.success) {
            showToast(isActive ? 'Pengingat Aktif' : 'Pengingat Dimatikan', isActive ? '🔔' : '🔕');
        } else {
            showToast('Gagal mengubah pengaturan', '❌');
            document.getElementById('toggle-reminder').checked = !isActive;
        }
    } catch(err) {
        showToast('Error koneksi.', '❌');
        document.getElementById('toggle-reminder').checked = !isActive;
    }
}

function showModal(content) {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.innerHTML = content;
    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        container.classList.remove('translate-y-full');
    }, 10);
}

function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    overlay.classList.add('opacity-0');
    container.classList.add('translate-y-full');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

function showToast(msg, icon = '✨') {
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').innerText = msg;
    document.getElementById('toast-icon').innerText = icon;
    toast.classList.remove('-translate-y-40');
    setTimeout(() => toast.classList.add('-translate-y-40'), 2500);
}

function formatIDR(val) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val || 0);
}

function openDetailModal(id) {
    const t = allTransactions.find(tx => tx.id === id);
    if (!t) return;

    const isCrypto = t.type === 'buy' || t.type === 'sell';
    if (isCrypto) {
        showToast('Transaksi Crypto tidak bisa diedit di sini.', 'ℹ️');
        return;
    }

    const html = `
        <div class="space-y-6">
            <div class="flex items-center justify-between">
                <h3 class="text-xl font-bold text-white">Edit Transaksi</h3>
                <button onclick="closeModal()" class="text-slate-400">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <div class="space-y-4">
                <div class="space-y-2">
                    <label class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Catatan / Nama</label>
                    <input type="text" id="edit-note" value="${t.note || ''}" 
                           class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-all font-bold">
                </div>

                <div class="space-y-2">
                    <label class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Nominal (Rp)</label>
                    <input type="number" id="edit-amount" value="${t.amount_rp || 0}" 
                           class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-4 text-white focus:outline-none focus:border-blue-500 transition-all font-bold">
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3 pt-4">
                <button onclick="deleteTx('${t.id}')" 
                        class="bg-red-500/10 border border-red-500/20 text-red-500 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-all">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                    Hapus
                </button>
                <button onclick="saveEditTx('${t.id}')" 
                        class="bg-blue-500 text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all">
                    Simpan Perubahan
                </button>
            </div>
        </div>
    `;
    showModal(html);
}

async function saveEditTx(id) {
    const note = document.getElementById('edit-note').value;
    const amount = document.getElementById('edit-amount').value;

    try {
        const res = await fetch('/api/edit', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                id: id,
                amount_rp: amount,
                note: note
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast('Berhasil diupdate!', '✅');
            closeModal();
            refreshData();
        } else {
            showToast(data.error || 'Gagal update.', '❌');
        }
    } catch (err) {
        showToast('Gagal koneksi.', '❌');
    }
}

async function deleteTx(id) {
    if (!confirm('Yakin ingin menghapus transaksi ini?')) return;

    try {
        const res = await fetch(`/api/delete?user_id=${userId}&id=${id}`, {
            method: 'DELETE'
        });

        const data = await res.json();
        if (data.success) {
            showToast('Transaksi dihapus.', '🗑️');
            closeModal();
            refreshData();
        } else {
            showToast(data.error || 'Gagal hapus.', '❌');
        }
    } catch (err) {
        showToast('Gagal koneksi.', '❌');
    }
}

init();
