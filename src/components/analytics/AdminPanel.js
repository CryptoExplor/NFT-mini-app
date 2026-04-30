import { escapeHtml } from '../../utils/html.js';
import {
    hasAdminSession,
    clearAdminSession,
    fetchAdminOverviewData,
    fetchAdminDateData,
    exportAdminCsv,
    isUnauthorizedAdminResponse,
    requestAdminAuth
} from '../../lib/analytics/adminService.js';
import { state } from '../../state.js';
import { router } from '../../lib/router.js';
import { getAuthToken } from '../../lib/api.js';

export function renderAdminPanel(wallet, slug, adminWallets = []) {
    if (!wallet?.isConnected) return '';

    const walletAddress = wallet.address?.toLowerCase();
    const adminHintAllowed = adminWallets.length === 0 || adminWallets.includes(walletAddress);
    if (!adminHintAllowed) return '';

    const hasToken = hasAdminSession();
    const scopeHint = slug ? `<span class="text-[10px] opacity-50">Scoped to ${escapeHtml(slug)}</span>` : '';

    return `
        <div class="glass-card p-5 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/5 to-orange-500/5 mt-6">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <h3 class="text-lg font-bold flex items-center gap-2">
                    <span class="text-red-400">Admin</span> Admin Panel
                    <span class="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded-full uppercase">Admin Only</span>
                </h3>
                <div class="flex items-center gap-2">
                    ${scopeHint}
                    ${hasToken
            ? '<button id="admin-signout-btn" class="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition">Sign Out</button>'
            : '<button id="admin-signin-btn" class="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg transition">Sign In as Admin</button>'}
                    <button id="load-admin-data" class="text-xs bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg transition ${hasToken ? '' : 'hidden'}">
                        Load System Data
                    </button>
                </div>
            </div>

            <div id="admin-auth-state" class="text-xs opacity-50 mb-3 ${hasToken ? 'text-green-300' : ''}">
                ${hasToken ? 'Authenticated with admin token.' : 'Sign in with your wallet to unlock admin analytics.'}
            </div>

            <div id="admin-panel-content" class="text-sm opacity-50 text-center py-4">
                ${hasToken ? 'Click "Load System Data" to fetch admin analytics' : 'Admin analytics is locked until you authenticate'}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-3 ${hasToken ? '' : 'opacity-40 pointer-events-none'}" id="admin-actions-group">
                <div>
                    <label class="text-[10px] opacity-40 uppercase block mb-1">Lookup Date</label>
                    <input id="admin-date-input" type="date" value="${new Date().toISOString().split('T')[0]}"
                           class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white">
                </div>
                <button id="admin-daily-btn" class="self-end text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg transition">Daily Stats</button>
                <button id="admin-cohort-btn" class="self-end text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg transition">Cohort</button>
                <button id="admin-retention-btn" class="self-end text-xs bg-white/10 hover:bg-white/15 px-3 py-1.5 rounded-lg transition">Retention</button>
            </div>
            
            <div class="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5 ${hasToken ? '' : 'opacity-40 pointer-events-none'}" id="admin-export-group">
                <span class="text-[10px] opacity-40 uppercase py-1.5">Export CSV:</span>
                <button data-export-type="users" class="text-xs bg-green-500/10 hover:bg-green-500/20 text-green-300 px-3 py-1.5 rounded-lg transition">Users</button>
                <button data-export-type="collections" class="text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 px-3 py-1.5 rounded-lg transition">Collections</button>
                <button data-export-type="mints" class="text-xs bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 px-3 py-1.5 rounded-lg transition">Mints</button>
            </div>

            <div id="admin-extra-content" class="mt-4"></div>
        </div>
    `;
}

export function setupAdminListeners(onReRender) {
    const hasToken = hasAdminSession();
    setAdminLockedState(!hasToken);

    const signInBtn = document.getElementById('admin-signin-btn');
    if (signInBtn) {
        signInBtn.addEventListener('click', async () => {
            signInBtn.disabled = true;
            setAdminAuthState('Signing admin message...');
            const authResult = await requestAdminAuth({
                walletAddress: state.wallet?.address,
                chainId: state.wallet?.chainId || 8453,
            });
            signInBtn.disabled = false;

            if (!authResult.success) {
                setAdminAuthState(authResult.error || 'Admin sign in failed', true);
                return;
            }

            setAdminAuthState('Authenticated with admin token.');
            setAdminLockedState(false);
            if (onReRender) onReRender();
        });
    }

    const signOutBtn = document.getElementById('admin-signout-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            clearAdminSession();
            setAdminAuthState('Signed out.');
            setAdminLockedState(true);
            if (onReRender) onReRender();
        });
    }

    const loadBtn = document.getElementById('load-admin-data');
    if (loadBtn) {
        loadBtn.addEventListener('click', async () => {
            await loadAdminOverview();
        });
    }

    const dailyBtn = document.getElementById('admin-daily-btn');
    if (dailyBtn) {
        dailyBtn.addEventListener('click', async () => {
            await handleAdminDateAction('daily', 'Daily stats');
        });
    }

    const cohortBtn = document.getElementById('admin-cohort-btn');
    if (cohortBtn) {
        cohortBtn.addEventListener('click', async () => {
            await handleAdminDateAction('cohort', 'Cohort');
        });
    }

    const retentionBtn = document.getElementById('admin-retention-btn');
    if (retentionBtn) {
        retentionBtn.addEventListener('click', async () => {
            await handleAdminDateAction('retention', 'Retention');
        });
    }

    document.querySelectorAll('[data-export-type]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const type = btn.getAttribute('data-export-type');
            if (type) await handleCsvExport(type);
        });
    });
}

// Internal Admin Helpers (Private to module)

function setAdminLockedState(locked) {
    const loadBtn = document.getElementById('load-admin-data');
    const actions = document.getElementById('admin-actions-group');
    const exports = document.getElementById('admin-export-group');

    if (loadBtn) loadBtn.classList.toggle('hidden', locked);
    if (actions) actions.classList.toggle('pointer-events-none', locked);
    if (actions) actions.classList.toggle('opacity-40', locked);
    if (exports) exports.classList.toggle('pointer-events-none', locked);
    if (exports) exports.classList.toggle('opacity-40', locked);
}

function setAdminAuthState(text, isError = false) {
    const stateEl = document.getElementById('admin-auth-state');
    if (!stateEl) return;

    stateEl.textContent = text;
    stateEl.classList.toggle('text-red-400', isError);
    stateEl.classList.toggle('text-green-300', !isError);
}

async function loadAdminOverview() {
    const content = document.getElementById('admin-panel-content');
    if (!content) return;

    content.innerHTML = '<div class="text-center py-4 opacity-30">Loading...</div>';
    const data = await fetchAdminOverviewData();

    if (isUnauthorizedAdminResponse(data)) {
        clearAdminSession();
        setAdminLockedState(true);
        setAdminAuthState('Admin session expired. Sign in again.', true);
        content.innerHTML = '<div class="text-center py-4 text-red-400">Unauthorized</div>';
        return;
    }

    if (data?.error) {
        content.innerHTML = `<div class="text-center py-4 text-red-400">${data.error}</div>`;
        return;
    }

    const stats = data.stats || {};
    const funnel = data.funnel || {};
    const lb = data.leaderboard || [];

    content.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div class="bg-white/5 rounded-xl p-3">
                <div class="text-[10px] opacity-40 uppercase">Total Events</div>
                <div class="text-xl font-bold">${parseInt(stats.total_events, 10) || 0}</div>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
                <div class="text-[10px] opacity-40 uppercase">Total Mints</div>
                <div class="text-xl font-bold text-green-400">${parseInt(stats.total_mints, 10) || 0}</div>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
                <div class="text-[10px] opacity-40 uppercase">Total Volume</div>
                <div class="text-xl font-bold text-purple-400">${parseFloat(stats.total_volume || 0).toFixed(4)} ETH</div>
            </div>
            <div class="bg-white/5 rounded-xl p-3">
                <div class="text-[10px] opacity-40 uppercase">Tracked Wallets</div>
                <div class="text-xl font-bold text-blue-400">${data.totalTrackedWallets || 0}</div>
            </div>
        </div>
        <div class="bg-white/5 rounded-xl p-3 mb-3">
            <div class="text-xs font-bold opacity-60 mb-2">Raw Funnel Counts</div>
            <div class="flex flex-wrap gap-3 text-xs font-mono">
                ${Object.entries(funnel).map(([k, v]) => `<span>${k}: <strong>${v}</strong></span>`).join(' | ')}
            </div>
        </div>
        <div class="bg-white/5 rounded-xl p-3">
            <div class="text-xs font-bold opacity-60 mb-2">Top 20 Minters</div>
            <div class="space-y-1 text-xs font-mono max-h-48 overflow-y-auto">
                ${lb.map(u => `<div class="flex justify-between"><span>${u.displayName || u.shortAddress || (u.wallet ? u.wallet.slice(0, 6) + '...' + u.wallet.slice(-4) : 'User')}</span><span class="font-bold">${u.score}</span></div>`).join('')}
            </div>
        </div>
    `;
}

async function handleAdminDateAction(action, title) {
    const date = document.getElementById('admin-date-input')?.value;
    if (!date) return;

    const content = document.getElementById('admin-extra-content');
    if (!content) return;

    content.innerHTML = '<div class="text-center py-2 opacity-30">Loading...</div>';
    const data = await fetchAdminDateData(action, date);

    if (isUnauthorizedAdminResponse(data)) {
        clearAdminSession();
        setAdminLockedState(true);
        setAdminAuthState('Admin session expired. Sign in again.', true);
        content.innerHTML = '<div class="text-red-400 text-sm">Unauthorized</div>';
        return;
    }

    if (data?.error) {
        content.innerHTML = `<div class="text-red-400 text-sm">${data.error}</div>`;
        return;
    }

    if (action === 'daily') {
        if (data?.stats) {
            content.innerHTML = `
                <div class="bg-white/5 rounded-xl p-3">
                    <div class="text-xs font-bold opacity-60 mb-2">${title} for ${date}</div>
                    <div class="flex flex-wrap gap-4 text-sm font-mono">
                        ${Object.entries(data.stats).map(([k, v]) => `<span>${k}: <strong>${v}</strong></span>`).join('')}
                    </div>
                </div>
            `;
        } else {
            content.innerHTML = '<div class="text-sm opacity-40">No data for this date</div>';
        }
        return;
    }

    if (action === 'cohort') {
        content.innerHTML = `
            <div class="bg-white/5 rounded-xl p-3">
                <div class="text-xs font-bold opacity-60 mb-2">${title} for ${date}</div>
                <div class="text-sm mb-2">New wallets: <strong>${data.count || 0}</strong></div>
            </div>
        `;
        return;
    }

    if (action === 'retention' && data?.retention) {
        content.innerHTML = `
            <div class="bg-white/5 rounded-xl p-3">
                <div class="text-xs font-bold opacity-60 mb-2">${title} for ${date} (Cohort: ${data.cohortSize})</div>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-white/5 rounded p-2">
                        <div class="text-[10px] opacity-40 uppercase">Day 1</div>
                        <div class="text-lg font-bold">${data.retention.day1.rate}%</div>
                    </div>
                    <div class="bg-white/5 rounded p-2">
                        <div class="text-[10px] opacity-40 uppercase">Day 7</div>
                        <div class="text-lg font-bold">${data.retention.day7.rate}%</div>
                    </div>
                    <div class="bg-white/5 rounded p-2">
                        <div class="text-[10px] opacity-40 uppercase">Day 30</div>
                        <div class="text-lg font-bold">${data.retention.day30.rate}%</div>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    content.innerHTML = '<div class="text-sm opacity-40">No data available</div>';
}

async function handleCsvExport(type) {
    const result = await exportAdminCsv(type);
    if (result?.success) return;

    if (result?.status === 401 || result?.status === 403) {
        clearAdminSession();
        setAdminLockedState(true);
        setAdminAuthState('Admin session expired. Sign in again.', true);
        return;
    }

    setAdminAuthState(result?.error || 'CSV export failed', true);
}
