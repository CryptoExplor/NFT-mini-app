import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import {
    getBattleHistory,
    getLeaderboard,
    getUserStats,
} from '../lib/api.js';
import { state, EVENTS } from '../state.js';
import { shortenAddress } from '../utils/dom.js';
import { escapeHtml, sanitizeUrl } from '../utils/html.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';
import { getMiniAppProfile, getMiniAppProfileLabel } from '../utils/profile.js';
import { renderIcon } from '../utils/icons.js';
import {
    clearAdminSession,
    exportAdminCsv,
    fetchAdminDateData,
    fetchAdminOverviewData,
    hasAdminSession,
    isUnauthorizedAdminResponse,
    requestAdminAuth,
} from '../lib/analytics/adminService.js';

const ADMIN_WALLETS = (import.meta.env.VITE_ADMIN_WALLETS || '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);

let renderVersion = 0;
let walletUpdateHandler = null;
let mintSuccessHandler = null;
let activityInterval = null;
let feedStatusTimeout = null;
let collectionCardClickHandler = null;

function getViewerIdentity(walletAddress) {
    const miniProfile = getMiniAppProfile();
    const profileLabel = getMiniAppProfileLabel(miniProfile);
    const walletLabel = walletAddress ? shortenAddress(walletAddress) : '';

    return {
        profileLabel: profileLabel || '',
        primaryLabel: profileLabel || walletLabel,
        walletLabel,
        avatarUrl: miniProfile?.avatarUrl || ''
    };
}

export async function renderAnalyticsPage(params) {
    const currentRender = ++renderVersion;
    const { slug } = params || {};
    const collections = loadCollections();
    const app = document.getElementById('app');
    if (!app) return;
    const defaultLeaderboardType = slug ? 'mints' : 'battle_wins';

    // Clean up previous listeners + intervals
    teardownAnalyticsPage();

    // Show loading state
    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 app-text p-6 pb-24">
            <div class="max-w-6xl mx-auto text-center py-20">
                <div class="text-indigo-400 inline-flex mb-4 animate-spin">${renderIcon('CHART', 'w-10 h-10')}</div>
                <p class="opacity-60">Loading analytics...</p>
            </div>
        </div>
    `;

    // Fetch data in parallel
    const [leaderboardData, userStats, syncedBattleHistory] = await Promise.all([
        getLeaderboard({ type: defaultLeaderboardType, collection: slug || undefined }).catch(() => null),
        state.wallet?.isConnected
            ? getUserStats(state.wallet.address).catch(() => null)
            : Promise.resolve(null),
        state.wallet?.isConnected && !slug
            ? getBattleHistory(state.wallet.address, 50).catch(() => [])
            : Promise.resolve([])
    ]);
    if (currentRender !== renderVersion) return;

    const stats = leaderboardData?.stats || {};
    const funnel = leaderboardData?.funnel || [];
    const overallConversion = leaderboardData?.overallConversion || '0.0';
    const leaderboard = leaderboardData?.leaderboard || [];
    const collectionStats = leaderboardData?.collections || [];
    const recentActivity = leaderboardData?.recentActivity || [];
    const socialProof = leaderboardData?.socialProof || [];
    const liveCount = collections.filter(c => c.status.toLowerCase() === 'live').length;
    const battleAnalytics = !slug ? buildBattleAnalytics(state.wallet?.address, syncedBattleHistory) : null;

    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 app-text p-4 md:p-6 pb-24">
            <header class="max-w-6xl mx-auto mb-8">
                <button id="back-home-btn" class="text-indigo-400 mb-3 hover:underline flex items-center gap-2 text-sm">
                    <span>${renderIcon('CHEVRON_LEFT', 'w-4 h-4')}</span> Back Home
                </button>
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h1 class="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                            ${slug ? `${escapeHtml(slug)} Analytics` : 'Arena Intelligence'}
                        </h1>
                        <p class="text-sm opacity-50 mt-1">${slug ? 'Collection funnel + mint telemetry' : 'Battle-first telemetry for web, Farcaster, and Base miniapps'}</p>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        ${renderThemeToggleButton('theme-toggle-analytics')}
                        <button class="analytics-tab ${defaultLeaderboardType === 'mints' ? 'analytics-tab-active' : ''} inline-flex items-center gap-2" data-type="mints">${renderIcon('TROPHY', 'w-4 h-4')} Mints</button>
                        <button class="analytics-tab ${defaultLeaderboardType === 'battle_wins' ? 'analytics-tab-active' : ''} inline-flex items-center gap-2" data-type="battle_wins">${renderIcon('SWORDS', 'w-4 h-4')} Wins</button>
                        <button class="analytics-tab ${defaultLeaderboardType === 'points' ? 'analytics-tab-active' : ''} inline-flex items-center gap-2" data-type="points">${renderIcon('COIN', 'w-4 h-4')} Points</button>
                        <button class="analytics-tab ${defaultLeaderboardType === 'volume' ? 'analytics-tab-active' : ''} inline-flex items-center gap-2" data-type="volume">${renderIcon('CHART', 'w-4 h-4')} Volume</button>
                    </div>
                </div>
            </header>

            <main class="max-w-6xl mx-auto space-y-6">

                ${renderSocialProof(socialProof)}

                ${renderWalletInsights(userStats, state.wallet)}

                ${!slug ? renderBattleOverview(battleAnalytics) : ''}

                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    ${summaryCard(renderAnalyticsIcon('EYE', 'text-indigo-300'), 'Total Views', stats.totalViews || 0, 'indigo')}
                    ${summaryCard(renderAnalyticsIcon('GEM', 'text-green-300'), 'Total Mints', stats.totalMints || 0, 'green')}
                    ${summaryCard(renderAnalyticsIcon('TARGET', 'text-yellow-300'), 'Success Rate', `${stats.successRate || 0}%`, 'yellow')}
                    ${summaryCard(renderAnalyticsIcon('CHART', 'text-purple-300'), 'Conversion', `${stats.conversionRate || 0}%`, 'purple')}
                </div>

                <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    ${summaryCard(renderAnalyticsIcon('SWORDS', 'text-cyan-300'), 'Total Battles', stats.battleTotal || 0, 'cyan')}
                    ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-emerald-300'), 'Arena Wins', stats.battleWins || 0, 'emerald')}
                    ${summaryCard(renderAnalyticsIcon('CHART', 'text-blue-300'), 'Arena Win Rate', `${stats.battleWinRate || 0}%`, 'blue')}
                    ${summaryCard(renderAnalyticsIcon('MAP', 'text-red-300'), 'Collections Live', liveCount, 'red')}
                </div>

                <div class="glass-card p-5 rounded-2xl border border-white/10">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-2">
                        <h3 class="text-lg font-bold flex items-center gap-2">
                            ${renderAnalyticsIcon('FLAME', 'text-orange-400')} Conversion Funnel
                        </h3>
                        <div class="text-sm">
                            <span class="opacity-50">Overall:</span>
                            <span class="font-bold ${parseFloat(overallConversion) > 50 ? 'text-green-400' : parseFloat(overallConversion) > 20 ? 'text-yellow-400' : 'text-red-400'}">${overallConversion}%</span>
                            <span class="opacity-40 text-xs ml-1">wallets → success</span>
                        </div>
                    </div>
                    ${renderEnhancedFunnel(funnel)}
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    <div class="lg:col-span-2 glass-card p-5 rounded-2xl border border-white/10">
                        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                            ${renderAnalyticsIcon('TROPHY', 'text-yellow-400')} Leaderboard
                            <span class="text-xs font-normal opacity-40 ml-auto">All Time</span>
                        </h3>
                        <div class="overflow-x-auto" id="leaderboard-container">
                            ${renderLeaderboard(leaderboard)}
                        </div>
                    </div>

                    <div class="glass-card p-5 rounded-2xl border border-green-500/20 relative" id="activity-feed-card">
                        <div class="flex items-center justify-between mb-4">
                            <h3 class="text-lg font-bold flex items-center gap-2">
                                <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                                Live Feed
                            </h3>
                            <span id="feed-status" class="text-[10px] opacity-40 font-mono">auto-refresh 10s</span>
                        </div>
                        <div class="space-y-2 max-h-[450px] overflow-y-auto custom-scrollbar pr-1" id="activity-feed">
                            ${renderActivityFeed(recentActivity)}
                        </div>
                    </div>
                </div>

                <div class="glass-card p-5 rounded-2xl border border-white/10">
                    <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                        ${renderAnalyticsIcon('CHART', 'text-blue-400')} Collection Performance
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        ${renderCollectionStats(collectionStats)}
                    </div>
                </div>

                ${!slug ? renderBattleHistorySection(battleAnalytics) : ''}

                ${renderMintHistory(userStats)}

                ${renderJourneyTimeline(userStats)}

                ${renderAdminPanel(state.wallet, slug)}

            </main>
            ${renderBottomNav('analytics')}
        </div>
    `;

    // Event listeners
    document.getElementById('back-home-btn').onclick = () => {
        teardownAnalyticsPage();
        router.navigate('/');
    };

    // Leaderboard tab switching
    document.querySelectorAll('.analytics-tab').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (currentRender !== renderVersion) return;
            document.querySelectorAll('.analytics-tab').forEach(b => b.classList.remove('analytics-tab-active'));
            btn.classList.add('analytics-tab-active');
            const type = btn.dataset.type;
            const container = document.getElementById('leaderboard-container');
            if (!container) return;
            container.innerHTML = '<div class="text-center py-8 opacity-30">Loading...</div>';
            try {
                const data = await getLeaderboard({ type, collection: slug || undefined });
                if (currentRender !== renderVersion) return;
                if (data?.leaderboard) {
                    container.innerHTML = renderLeaderboard(data.leaderboard);
                } else {
                    container.innerHTML = '<div class="text-center py-8 text-red-400">Failed to load leaderboard</div>';
                }
            } catch {
                container.innerHTML = '<div class="text-center py-8 text-red-400">Failed to load leaderboard</div>';
            }
        });
    });

    bindCollectionCardNavigation();

    // Wire up admin panel (if rendered)
    setupAdminListeners();
    bindBottomNavEvents();
    bindThemeToggleEvents();

    // ========== AUTO-REFRESH ACTIVITY FEED (every 10s) ==========
    let isPaused = false;
    const feedCard = document.getElementById('activity-feed-card');
    if (feedCard) {
        feedCard.addEventListener('mouseenter', () => { isPaused = true; updateFeedStatus('paused'); });
        feedCard.addEventListener('mouseleave', () => { isPaused = false; updateFeedStatus('auto-refresh 10s'); });
    }

    activityInterval = setInterval(async () => {
        if (isPaused) return;
        try {
            const freshData = await getLeaderboard({ collection: slug || undefined });
            if (currentRender !== renderVersion) return;
            if (freshData?.recentActivity) {
                const feedEl = document.getElementById('activity-feed');
                if (feedEl) {
                    feedEl.innerHTML = renderActivityFeed(freshData.recentActivity);
                    // Flash the feed status
                    updateFeedStatus('updated');
                    if (feedStatusTimeout) clearTimeout(feedStatusTimeout);
                    feedStatusTimeout = setTimeout(() => updateFeedStatus('auto-refresh 10s'), 2000);
                }
                // Update social proof too
                if (freshData.socialProof) {
                    const proofEl = document.getElementById('social-proof-ticker');
                    if (proofEl) {
                        proofEl.innerHTML = renderSocialProofItems(freshData.socialProof);
                    }
                }
            }
        } catch { /* silent fail */ }
    }, 10000);

    // Listen for wallet changes → re-render
    walletUpdateHandler = () => {
        setTimeout(() => renderAnalyticsPage(params), 300);
    };
    document.addEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);

    // Listen for new mints → re-render
    mintSuccessHandler = () => {
        setTimeout(() => renderAnalyticsPage(params), 300);
    };
    document.addEventListener(EVENTS.MINT_SUCCESS, mintSuccessHandler);

    // Expose refresh method for external triggers (e.g., mint.js)
    window.refreshAnalytics = () => renderAnalyticsPage(params);
}

export function teardownAnalyticsPage() {
    if (walletUpdateHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);
        walletUpdateHandler = null;
    }
    if (mintSuccessHandler) {
        document.removeEventListener(EVENTS.MINT_SUCCESS, mintSuccessHandler);
        mintSuccessHandler = null;
    }
    if (activityInterval) {
        clearInterval(activityInterval);
        activityInterval = null;
    }
    if (feedStatusTimeout) {
        clearTimeout(feedStatusTimeout);
        feedStatusTimeout = null;
    }
    if (collectionCardClickHandler) {
        document.removeEventListener('click', collectionCardClickHandler);
        collectionCardClickHandler = null;
    }
    if (window.refreshAnalytics) {
        delete window.refreshAnalytics;
    }
}

function updateFeedStatus(text) {
    const el = document.getElementById('feed-status');
    if (el) el.textContent = text;
}

function bindCollectionCardNavigation() {
    if (collectionCardClickHandler) {
        document.removeEventListener('click', collectionCardClickHandler);
    }

    collectionCardClickHandler = (event) => {
        const card = event.target?.closest?.('[data-slug]');
        if (!card) return;
        const slug = card.getAttribute('data-slug');
        if (!slug) return;
        router.navigate(`/analytics/${encodeURIComponent(slug)}`);
    };

    document.addEventListener('click', collectionCardClickHandler);
}

// ============================================
// RENDER HELPERS
// ============================================

function summaryCard(icon, label, value, color) {
    const colors = {
        indigo: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/20',
        green: 'from-green-500/20 to-green-600/5 border-green-500/20',
        yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20',
        purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/20',
        cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20',
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20',
        red: 'from-red-500/20 to-red-600/5 border-red-500/20',
    };

    return `
        <div class="glass-card p-4 rounded-xl border ${colors[color] || colors.indigo} bg-gradient-to-br ${colors[color] || colors.indigo}">
            <div class="text-lg mb-1">${icon}</div>
            <div class="text-xs opacity-50 uppercase tracking-wide mb-1">${label}</div>
            <div class="text-xl md:text-2xl font-bold">${typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
    `;
}

function renderAnalyticsIcon(iconName, colorClass = 'text-indigo-300', size = 'w-5 h-5') {
    return `<span class="${colorClass} inline-flex">${renderIcon(iconName, size)}</span>`;
}

function getLocalBattleHistoryFallback() {
    try {
        return JSON.parse(localStorage.getItem('battle_history') || '[]');
    } catch {
        return [];
    }
}

function buildBattleAnalytics(walletAddress, syncedBattleHistory = []) {
    const wallet = String(walletAddress || '').toLowerCase();
    const remoteEntries = Array.isArray(syncedBattleHistory)
        ? syncedBattleHistory.map((record) => normalizeSyncedBattleRecord(record, wallet)).filter(Boolean)
        : [];

    const source = remoteEntries.length > 0 ? 'synced' : 'local';
    const entries = remoteEntries.length > 0
        ? remoteEntries
        : getLocalBattleHistoryFallback().map(normalizeLocalBattleRecord).filter(Boolean);

    const total = entries.length;
    const wins = entries.filter((entry) => entry.playerWon).length;
    const losses = total - wins;
    const aiBattles = entries.filter((entry) => entry.isAi).length;
    const pvpBattles = total - aiBattles;
    const totalDamage = entries.reduce((sum, entry) => sum + (entry.playerDmg || 0), 0);
    const totalCrits = entries.reduce((sum, entry) => sum + (entry.crits || 0), 0);
    const totalDodges = entries.reduce((sum, entry) => sum + (entry.dodges || 0), 0);
    const totalRounds = entries.reduce((sum, entry) => sum + (entry.rounds || 0), 0);
    const averageRounds = total > 0 ? (totalRounds / total).toFixed(1) : '0.0';
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const fighterWins = {};
    for (const entry of entries) {
        if (!entry.playerWon) continue;
        fighterWins[entry.playerName] = (fighterWins[entry.playerName] || 0) + 1;
    }
    const bestFighter = Object.entries(fighterWins).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No winner yet';

    const sortedEntries = [...entries].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    let streak = 0;
    for (const entry of sortedEntries) {
        if (!entry.playerWon) break;
        streak += 1;
    }

    return {
        source,
        total,
        wins,
        losses,
        aiBattles,
        pvpBattles,
        totalDamage,
        totalCrits,
        totalDodges,
        averageRounds,
        winRate,
        bestFighter,
        streak,
        recent: sortedEntries.slice(0, 8),
    };
}

function normalizeSyncedBattleRecord(record, wallet) {
    const p1 = record?.players?.p1;
    const p2 = record?.players?.p2;
    if (!p1?.name || !p2?.name) return null;

    const isWalletP1 = wallet && String(p1.id || '').toLowerCase() === wallet;
    const side = isWalletP1 ? 'P1' : 'P2';
    const opponent = isWalletP1 ? p2 : p1;
    const logs = Array.isArray(record.logs) ? record.logs : [];

    return {
        id: record.battleId || '',
        playerName: isWalletP1 ? p1.name : p2.name,
        enemyName: opponent?.name || 'Unknown Opponent',
        playerWon: record.result?.winnerSide === side,
        isAi: Boolean(record.options?.isAiBattle),
        rounds: record.result?.rounds || logs[logs.length - 1]?.round || 0,
        playerDmg: logs.filter((log) => log.attackerSide === side).reduce((sum, log) => sum + (log.damage || 0), 0),
        enemyDmg: logs.filter((log) => log.attackerSide !== side).reduce((sum, log) => sum + (log.damage || 0), 0),
        crits: logs.filter((log) => log.attackerSide === side && log.isCrit).length,
        dodges: logs.filter((log) => log.targetSide === side && log.isDodge).length,
        timestamp: record.createdAt || Date.now(),
        canReplay: Boolean(record.battleId),
    };
}

function normalizeLocalBattleRecord(record) {
    if (!record) return null;
    return {
        id: record.id || '',
        playerName: record.playerName || 'You',
        enemyName: record.enemyName || 'Unknown Opponent',
        playerWon: Boolean(record.playerWon),
        isAi: Boolean(record.isAi),
        rounds: record.rounds || 0,
        playerDmg: record.playerDmg || 0,
        enemyDmg: record.enemyDmg || 0,
        crits: record.crits || 0,
        dodges: record.dodges || 0,
        timestamp: record.timestamp || Date.now(),
        canReplay: false,
    };
}

function renderBattleOverview(battleAnalytics) {
    if (!battleAnalytics) return '';

    const sourceBadge = battleAnalytics.source === 'synced'
        ? '<span class="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">SYNCED</span>'
        : '<span class="text-[10px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">LOCAL FALLBACK</span>';

    return `
        <section class="glass-card p-5 rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                <div>
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        ${renderAnalyticsIcon('SWORDS', 'text-red-400')} Arena Overview
                    </h3>
                    <p class="text-sm opacity-50 mt-1">Cross-device battle performance and replay-ready match history.</p>
                </div>
                ${sourceBadge}
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
                ${summaryCard(renderAnalyticsIcon('SWORDS', 'text-red-300'), 'Battles', battleAnalytics.total, 'red')}
                ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-emerald-300'), 'Wins', battleAnalytics.wins, 'emerald')}
                ${summaryCard(renderAnalyticsIcon('CHART', 'text-cyan-300'), 'Win Rate', `${battleAnalytics.winRate}%`, 'cyan')}
                ${summaryCard(renderAnalyticsIcon('SKULL', 'text-orange-300'), 'AI / PvP', `${battleAnalytics.aiBattles}/${battleAnalytics.pvpBattles}`, 'yellow')}
                ${summaryCard(renderAnalyticsIcon('DAMAGE', 'text-orange-300'), 'Damage', battleAnalytics.totalDamage.toLocaleString(), 'purple')}
                ${summaryCard(renderAnalyticsIcon('FLAME', 'text-pink-300'), 'Streak', battleAnalytics.streak, 'blue')}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Best Fighter</div>
                    <div class="font-semibold text-white/90 truncate">${escapeHtml(battleAnalytics.bestFighter)}</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Average Rounds</div>
                    <div class="font-semibold text-cyan-300">${battleAnalytics.averageRounds}</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Crits / Dodges</div>
                    <div class="font-semibold text-yellow-300">${battleAnalytics.totalCrits} / ${battleAnalytics.totalDodges}</div>
                </div>
            </div>
        </section>
    `;
}

function renderBattleHistorySection(battleAnalytics) {
    if (!battleAnalytics) return '';

    return `
        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <div class="flex items-center justify-between gap-3 mb-4">
                <h3 class="text-lg font-bold flex items-center gap-2">
                    ${renderAnalyticsIcon('HISTORY', 'text-indigo-400')} Recent Arena Matches
                </h3>
                <span class="text-xs opacity-40">${battleAnalytics.recent.length} recent</span>
            </div>
            <div class="space-y-2">
                ${battleAnalytics.recent.length === 0
                    ? '<div class="text-center py-8 text-sm opacity-40">No arena matches yet. Start a fight to populate synced history.</div>'
                    : battleAnalytics.recent.map(renderBattleHistoryRow).join('')}
            </div>
        </section>
    `;
}

function renderBattleHistoryRow(entry) {
    const resultBadge = entry.playerWon
        ? '<span class="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-bold">WIN</span>'
        : '<span class="text-[10px] px-2 py-1 rounded bg-red-500/15 text-red-300 border border-red-500/20 font-bold">LOSS</span>';
    const modeBadge = entry.isAi
        ? '<span class="text-[10px] px-2 py-1 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20 font-mono">AI</span>'
        : '<span class="text-[10px] px-2 py-1 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 font-mono">PVP</span>';
    const replayLink = entry.canReplay
        ? `<a href="/battle?replay=${encodeURIComponent(entry.id)}" class="flex items-center gap-1 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">${renderIcon('PLAY', 'w-3.5 h-3.5')} Watch</a>`
        : '<span class="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-500 font-mono">LOCAL</span>';

    return `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
            <div class="flex items-center gap-2 flex-wrap">
                ${resultBadge}
                ${modeBadge}
                <span class="font-medium text-white/90">vs ${escapeHtml(entry.enemyName)}</span>
                <span class="text-xs opacity-40">${entry.rounds} rounds</span>
            </div>
            <div class="flex items-center gap-3 flex-wrap text-xs opacity-70">
                <span>${entry.playerDmg.toLocaleString()} dmg</span>
                <span>${entry.crits} crits</span>
                <span>${getTimeAgo(entry.timestamp)}</span>
                ${replayLink}
            </div>
        </div>
    `;
}

// ========== SOCIAL PROOF TICKER ==========

function renderSocialProof(messages) {
    if (!messages || messages.length === 0) return '';

    return `
        <div class="glass-card px-4 py-3 rounded-xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 overflow-hidden">
            <div class="flex items-center gap-3" id="social-proof-ticker">
                ${renderSocialProofItems(messages)}
            </div>
        </div>
    `;
}

function renderSocialProofItems(messages) {
    return messages.map(m => `
        <div class="flex items-center gap-2 text-sm whitespace-nowrap animate-fade-in">
            ${renderAnalyticsIcon('FLAME', 'text-amber-300', 'w-4 h-4')}
            <span class="font-medium">${escapeHtml(m.text || '')}</span>
        </div>
        <span class="text-white/20 mx-2">•</span>
    `).join('');
}

function renderPointsSection(userStats) {
    if (!userStats) return '';
    const profile = userStats.profile || {};
    const rankings = userStats.rankings || {};

    // AFTER: prefer hash value; fall back to zscore
    const score = Number(profile.totalPoints ?? profile.total_points ?? rankings.points?.score ?? 0) || 0;
    const rank = rankings.points?.rank || 'Unranked';
    const streak = profile.streak || 0;

    const mintPoints = (parseInt(profile.totalMints) || 0) * 10;
    const volumePoints = Math.round(Math.min((parseFloat(profile.totalVolume || 0) * 50), 500));
    const streakPoints = streak >= 3 ? streak * 3 : 0;
    // Note: score also includes wallet_connect (+2) and daily view (+1) bonuses
    // so breakdown will always be slightly less than total — add an "other" row
    const otherPoints = Math.max(0, score - mintPoints - volumePoints - streakPoints);

    return `
      <div class="glass-card p-5 rounded-2xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/5 to-amber-500/5 mt-4">
        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
          ${renderAnalyticsIcon('COIN', 'text-yellow-400')} Your Points
        </h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-xs opacity-50 uppercase">Total Points</div>
            <div class="text-3xl font-bold text-yellow-400">${score.toLocaleString()}</div>
          </div>
          <div>
            <div class="text-xs opacity-50 uppercase">Points Rank</div>
            <div class="text-2xl font-bold">${rank === 'Unranked' ? '—' : `#${rank}`}</div>
          </div>
        </div>
        
        <div class="mt-4 p-3 bg-white/5 rounded-lg space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="opacity-60">From Mints (${profile.totalMints || 0} × 10)</span>
            <span class="font-mono">${mintPoints}</span>
          </div>
          <div class="flex justify-between">
            <span class="opacity-60">From Volume (Est.)</span>
            <span class="font-mono">~${volumePoints}</span>
          </div>
          <div class="flex justify-between">
            <span class="opacity-60">From Streak (${streak} days)</span>
            <span class="font-mono">${streakPoints}</span>
          </div>
          ${otherPoints > 0 ? `
          <div class="flex justify-between opacity-60 text-xs border-t border-white/10 pt-2">
            <span>Bonus (connect, views, etc.)</span>
            <span class="font-mono">+${otherPoints}</span>
          </div>` : ''}
        </div>
      </div>
    `;
}

function renderWalletInsights(userStats, wallet) {
    if (!wallet?.isConnected) {
        return `
            <div class="glass-card p-5 rounded-2xl border border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 class="text-lg font-bold">Connect wallet to see your stats</h2>
                    <p class="opacity-50 text-sm">Track your rank, streak, and contribution</p>
                </div>
                <div class="opacity-20 text-slate-500">${renderIcon('SHIELD', 'w-10 h-10')}</div>
            </div>
        `;
    }

    const profile = userStats?.profile || {};
    const rankings = userStats?.rankings || {};
    const insights = userStats?.insights || {};
    const viewerIdentity = getViewerIdentity(wallet.address);
    const safePrimaryLabel = escapeHtml(viewerIdentity.primaryLabel || shortenAddress(wallet.address));
    const safeWalletLabel = escapeHtml(viewerIdentity.walletLabel || shortenAddress(wallet.address));
    const safeAvatarUrl = sanitizeUrl(viewerIdentity.avatarUrl || '');
    const showSecondaryWallet = Boolean(viewerIdentity.profileLabel && viewerIdentity.walletLabel);
    const avatarHtml = safeAvatarUrl
        ? `<img src="${safeAvatarUrl}" alt="Profile avatar" class="w-4 h-4 rounded-full object-cover">`
        : '<span class="text-[10px] opacity-60"></span>';

    return `
        <div class="glass-card p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/5 relative overflow-hidden">
            <div class="absolute top-2 right-4 opacity-10 text-6xl pointer-events-none"></div>

            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <h2 class="text-lg font-bold flex items-center gap-2 flex-wrap">
                    Wallet Insights
                    <div class="flex items-center gap-1.5 bg-white/10 px-2 py-0.5 rounded-full border border-white/5 max-w-full">
                        ${avatarHtml}
                        <span class="text-xs font-normal truncate max-w-[140px]">${safePrimaryLabel}</span>
                        ${showSecondaryWallet ? `<span class="text-[10px] opacity-50 font-mono hidden sm:inline">${safeWalletLabel}</span>` : ''}
                        <a href="https://basescan.org/address/${wallet.address}" target="_blank" rel="noopener noreferrer" class="text-xs opacity-40 hover:opacity-100 transition inline-flex" title="View on Explorer">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
                    </div>
                    ${insights.badge ? `<span class="text-xs bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-200 border border-yellow-500/20 px-2 py-0.5 rounded-full shadow-sm">${insights.badge}</span>` : ''}
                    ${insights.activityLevel ? `<span class="text-xs bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-indigo-200 px-2 py-0.5 rounded-full">${insights.activityLevel}</span>` : ''}
                    ${profile.streak > 0 ? `<span class="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">${renderIcon('FLAME', 'w-3.5 h-3.5')} ${profile.streak} day streak</span>` : ''}
                </h2>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-4">
                <div>
                    <div class="text-xs opacity-50 uppercase">
                        ${rankings.mints?.rank !== 'Unranked' ? 'Mint Rank' : 'Points Rank'}
                    </div>
                    <div class="text-2xl font-bold text-yellow-400">${rankings.mints?.rank !== 'Unranked'
            ? `#${rankings.mints?.rank}`
            : (rankings.points?.rank !== 'Unranked' ? `#${rankings.points?.rank}` : '—')
        }</div>
                    <div class="text-[10px] opacity-40">${rankings.mints?.rank !== 'Unranked'
            ? (rankings.mints?.percentile || '')
            : (rankings.points?.percentile || '')
        }</div>
                </div>
                <div>
                    <div class="text-xs opacity-50 uppercase">Total Mints</div>
                    <div class="text-2xl font-bold">${profile.totalMints || 0}</div>
                </div>
                <div>
                    <div class="text-xs opacity-50 uppercase">Success Rate</div>
                    <div class="text-2xl font-bold text-green-400">${profile.successRate || '100'}%</div>
                </div>
                <div>
                    <div class="text-xs opacity-50 uppercase">Volume</div>
                    <div class="text-2xl font-bold text-purple-400">${parseFloat(profile.totalVolume || 0).toFixed(4)}</div>
                    <div class="text-[10px] opacity-40">ETH</div>
                </div>
                <div>
                    <div class="text-xs opacity-50 uppercase">Avg Gas</div>
                    <div class="text-2xl font-bold text-cyan-400">${parseFloat(profile.avgGas || 0).toFixed(4)}</div>
                    <div class="text-[10px] opacity-40">ETH/mint</div>
                </div>
                <div>
                    <div class="text-xs opacity-50 uppercase">Reputation</div>
                    <div class="text-2xl font-bold text-amber-400">${rankings.reputation?.score || '0'}</div>
                    <div class="text-[10px] opacity-40">${rankings.reputation?.rank === 'Unranked' ? '' : `#${rankings.reputation?.rank}`}</div>
                </div>
                <div>
                    <div class="text-xs opacity-50 uppercase">Member Since</div>
                    <div class="text-sm font-medium">${profile.firstSeen ? new Date(profile.firstSeen).toLocaleDateString() : '—'}</div>
                    <div class="text-[10px] opacity-40">${insights.memberDays || 0} days</div>
                </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                ${profile.mintContribution ? `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1 flex items-center gap-1">${renderIcon('TROPHY', 'w-3.5 h-3.5')} Your Contribution</div>
                        <div class="text-lg font-bold text-indigo-400">
                            ${profile.mintContribution}%
                            <span class="text-xs font-normal opacity-50">of all mints</span>
                        </div>
                    </div>
                ` : ''}
                ${profile.volumeContribution ? `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1 flex items-center gap-1">${renderIcon('CHART', 'w-3.5 h-3.5')} Revenue Share</div>
                        <div class="text-lg font-bold text-emerald-400">
                            ${profile.volumeContribution}%
                            <span class="text-xs font-normal opacity-50">of total volume</span>
                        </div>
                    </div>
                ` : ''}
                ${profile.favoriteCollection ? `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1 flex items-center gap-1">${renderIcon('STAR', 'w-3.5 h-3.5')} Favorite Collection</div>
                        <div class="text-lg font-bold text-pink-400 truncate">${escapeHtml(profile.favoriteCollection)}</div>
                        <div class="text-[10px] opacity-40">${profile.favoriteCollectionMints || 0} mints</div>
                    </div>
                ` : `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1 flex items-center gap-1">${renderIcon('STAR', 'w-3.5 h-3.5')} Favorite Collection</div>
                        <div class="text-sm font-medium opacity-40">Mint to discover!</div>
                    </div>
                `}
            </div>
            
            ${renderPointsSection(userStats)}
        </div>
    `;
}

// ========== ENHANCED CONVERSION FUNNEL ==========

function renderEnhancedFunnel(funnel) {
    if (!funnel || funnel.length === 0) {
        return '<div class="text-center py-8 opacity-30">No funnel data yet</div>';
    }

    const maxCount = Math.max(...funnel.map(s => s.count), 1);
    const icons = {
        page_view: 'EYE',
        wallet_connect: 'LINK',
        collection_view: 'FOLDER',
        mint_click: 'CURSOR',
        tx_sent: 'EXTERNAL',
        mint_success: 'CHECK'
    };

    // Horizontal funnel flow
    return `
        <div class="space-y-1">
            <div class="flex flex-col gap-3">
                ${funnel.map((step, i) => {
        const width = Math.max((step.count / maxCount) * 100, 12);
        const icon = icons[step.step] || 'CHART';
        const isLast = i === funnel.length - 1;
        const dropOffColor = parseFloat(step.dropOff || 0) > 50 ? 'text-red-400' : parseFloat(step.dropOff || 0) > 25 ? 'text-yellow-400' : 'text-green-400';
        const safeStepLabel = escapeHtml(step.label || step.step.replace(/_/g, ' '));

        return `
                        <div class="relative">
                            <div class="flex items-center gap-3">
                                <div class="w-8 text-center flex-shrink-0 text-indigo-300 inline-flex justify-center">${renderIcon(icon, 'w-4 h-4')}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between text-xs mb-1">
                                        <span class="font-medium">${safeStepLabel}</span>
                                        <div class="flex gap-3">
                                            <span class="font-mono font-bold">${step.count.toLocaleString()}</span>
                                            ${i > 0 ? `
                                                <span class="font-mono ${dropOffColor}">${step.conversionFromPrev}% pass</span>
                                                <span class="font-mono text-red-400/60 text-[10px] leading-4">↓${step.dropOff}% drop</span>
                                            ` : ''}
                                        </div>
                                    </div>
                                    <div class="w-full bg-white/5 rounded-full h-4 overflow-hidden">
                                        <div class="h-full rounded-full transition-all duration-700 ${isLast ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}"
                                             style="width: ${width}%">
                                        </div>
                                    </div>
                                </div>
                            </div>
                            ${!isLast ? '<div class="ml-4 pl-[3px] h-2 border-l-2 border-dashed border-white/10"></div>' : ''}
                        </div>
                    `;
    }).join('')}
            </div>
        </div>
    `;
}

// ========== LEADERBOARD ==========

function renderLeaderboard(leaderboard) {
    if (!leaderboard || leaderboard.length === 0) {
        return '<div class="text-center py-8 opacity-30">No leaderboard data yet. Start minting!</div>';
    }

    const medals = [
        renderAnalyticsIcon('TROPHY', 'text-yellow-300', 'w-4 h-4'),
        renderAnalyticsIcon('STAR', 'text-slate-300', 'w-4 h-4'),
        renderAnalyticsIcon('GEM', 'text-amber-300', 'w-4 h-4')
    ];
    const viewerIdentity = getViewerIdentity(state.wallet?.address || '');
    const safeViewerPrimaryLabel = escapeHtml(viewerIdentity.primaryLabel || '');

    return `
        <table class="w-full text-left border-collapse">
            <thead>
                <tr class="text-[11px] uppercase opacity-40 border-b border-white/10">
                    <th class="py-3 pl-3 w-12">Rank</th>
                    <th class="py-3">Wallet</th>
                    <th class="py-3 text-right pr-3">Score</th>
                </tr>
            </thead>
            <tbody class="text-sm">
                ${leaderboard.map((user, i) => {
        const isMe = (user.wallet || '').toLowerCase() === (state.wallet?.address || '').toLowerCase();
        const label = user.displayName || user.shortAddress || shortenAddress(user.wallet);
        const safeLabel = escapeHtml(label);
        const primaryIdentity = isMe && viewerIdentity.profileLabel ? safeViewerPrimaryLabel : safeLabel;
        const secondaryIdentity = '';
        return `
                        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors ${isMe ? 'bg-indigo-500/10' : ''}">
                            <td class="py-3 pl-3 font-mono text-indigo-300">
                                ${i < 3 ? medals[i] : `#${user.rank}`}
                            </td>
                            <td class="py-3 font-mono">
                                ${primaryIdentity}
                                ${secondaryIdentity}
                                ${isMe ? '<span class="ml-2 text-[10px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded">YOU</span>' : ''}
                            </td>
                            <td class="py-3 text-right pr-3 font-bold">
                                ${typeof user.score === 'number' && user.score % 1 !== 0
                ? user.score.toFixed(4)
                : user.score}
                            </td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>
    `;
}

// ========== LIVE ACTIVITY FEED ==========

function renderActivityFeed(activity) {
    if (!activity || activity.length === 0) {
        return '<div class="text-center py-8 opacity-30">No activity yet. Be the first to mint!</div>';
    }

    const viewerIdentity = getViewerIdentity(state.wallet?.address || '');

    return activity.map(item => {
        const timeAgo = getTimeAgo(item.timestamp);
        const wallet = String(item.wallet || '');
        const isMe = wallet.toLowerCase() === (state.wallet?.address || '').toLowerCase();
        const shortWallet = wallet.length >= 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown';
        const safeCollection = escapeHtml(item.collection || 'Unknown');
        const safeTxHash = encodeURIComponent(String(item.txHash || ''));
        const walletLabel = isMe && viewerIdentity.profileLabel
            ? `<span>${escapeHtml(viewerIdentity.primaryLabel)}</span>`
            : escapeHtml(shortWallet);
        return `
            <div class="flex items-center gap-3 p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-green-500/20 transition-all animate-fade-in">
                <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">${safeCollection}</div>
                    <div class="text-[10px] opacity-50 font-mono">
                        ${walletLabel}
                        <span class="mx-1">•</span>
                        ${timeAgo}
                        ${item.price > 0 ? `<span class="mx-1">•</span> ${parseFloat(item.price).toFixed(4)} ETH` : ''}
                    </div>
                </div>
                ${item.txHash ? `
                    <a href="https://basescan.org/tx/${safeTxHash}" target="_blank" rel="noopener noreferrer"
                       class="p-1 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0 inline-flex">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
                ` : ''}
            </div>
        `;
    }).join('');
}

// ========== COLLECTION STATS ==========

function renderCollectionStats(collections) {
    if (!collections || collections.length === 0) {
        return '<div class="text-center py-8 opacity-30 col-span-full">No collection data yet</div>';
    }

    return collections.map(col => {
        const maxViews = Math.max(...collections.map(c => c.views), 1);
        const barWidth = Math.max((col.views / maxViews) * 100, 5);
        const safeSlug = escapeHtml(col.slug || 'unknown');

        return `
            <div class="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-indigo-500/20 transition-all cursor-pointer" data-slug="${safeSlug}">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-sm truncate flex-1">${safeSlug}</span>
                    <span class="text-xs opacity-50 ml-2">${col.successRate}% success</span>
                </div>
                <div class="w-full bg-white/5 rounded-full h-2 mb-2 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style="width: ${barWidth}%"></div>
                </div>
                <div class="flex gap-4 text-xs opacity-60">
                    <span class="inline-flex items-center gap-1">${renderIcon('EYE', 'w-3.5 h-3.5')} ${col.views} views</span>
                    <span class="inline-flex items-center gap-1">${renderIcon('GEM', 'w-3.5 h-3.5')} ${col.mints} mints</span>
                    ${col.volume > 0 ? `<span class="inline-flex items-center gap-1">${renderIcon('CHART', 'w-3.5 h-3.5')} ${col.volume.toFixed(4)} ETH</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ========== MINT HISTORY ==========

function renderMintHistory(userStats) {
    if (!userStats?.journey || userStats.journey.length === 0) return '';

    const mints = userStats.journey.filter(e => e.type === 'mint_success');
    if (mints.length === 0) return '';

    return `
        <div class="glass-card p-5 rounded-2xl border border-green-500/20 bg-gradient-to-r from-green-500/5 to-emerald-500/5">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                ${renderAnalyticsIcon('GEM', 'text-green-400')} Your Mint History
                <span class="text-xs font-normal opacity-40 ml-auto">${mints.length} mints</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${mints.map(mint => {
        const safeCollection = escapeHtml(mint.collection || 'Unknown Collection');
        const safeTxHash = encodeURIComponent(String(mint.txHash || ''));
        return `
                    <div class="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center text-green-300 flex-shrink-0">${renderIcon('GEM', 'w-5 h-5')}</div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold truncate">${safeCollection}</div>
                            <div class="text-[10px] opacity-50 font-mono">
                                ${mint.timestamp ? new Date(mint.timestamp).toLocaleDateString() : ''}
                                ${mint.txHash ? ` • ${mint.txHash.slice(0, 10)}...` : ''}
                            </div>
                        </div>
                        ${mint.txHash ? `
                            <a href="https://basescan.org/tx/${safeTxHash}" target="_blank" rel="noopener noreferrer"
                               class="p-1 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0 inline-flex">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
                        ` : ''}
                    </div>
                `;
    }).join('')}
            </div>
        </div>
    `;
}

// ========== JOURNEY TIMELINE ==========

function renderJourneyTimeline(userStats) {
    if (!userStats?.journey || userStats.journey.length === 0) return '';

    const journey = userStats.journey;
    const eventIcons = {
        page_view: 'EYE', collection_view: 'FOLDER', mint_click: 'CURSOR',
        mint_attempt: 'HISTORY', tx_sent: 'EXTERNAL', mint_success: 'CHECK',
        mint_failure: 'XMARK', wallet_connect: 'LINK', gallery_view: 'IMAGE', click: 'CURSOR'
    };

    return `
        <div class="glass-card p-5 rounded-2xl border border-white/10">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                ${renderAnalyticsIcon('HISTORY', 'text-blue-400')} Your Journey
                <span class="text-xs font-normal opacity-40 ml-auto">Last ${journey.length} events</span>
            </h3>
            <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                ${journey.map((event) => {
        const eventType = typeof event?.type === 'string' ? event.type : 'unknown';
        const safeTimestamp = event?.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'unknown';
        const safeEventType = escapeHtml(eventType.replace(/_/g, ' '));
        const safeCollection = event.collection ? escapeHtml(event.collection) : '';
        const safePage = event.page ? escapeHtml(event.page) : '';
        return `
                    <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div class="text-base flex-shrink-0 text-indigo-300 inline-flex">${renderIcon(eventIcons[eventType] || 'CHART', 'w-4 h-4')}</div>
                        <div class="flex-1 min-w-0">
                            <span class="text-sm font-medium">${safeEventType}</span>
                            ${safeCollection ? `<span class="text-xs opacity-50 ml-2">${safeCollection}</span>` : ''}
                            ${safePage ? `<span class="text-xs opacity-50 ml-2">${safePage}</span>` : ''}
                        </div>
                        <div class="text-[10px] opacity-40 font-mono flex-shrink-0">
                            ${safeTimestamp}
                        </div>
                    </div>
                `;
    }).join('')}
            </div>
        </div>
    `;
}

function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
// ========== ADMIN PANEL ==========

function renderAdminPanel(wallet, slug) {
    if (!wallet?.isConnected) return '';

    const walletAddress = wallet.address?.toLowerCase();
    const adminHintAllowed = ADMIN_WALLETS.length === 0 || ADMIN_WALLETS.includes(walletAddress);
    if (!adminHintAllowed) return '';

    const hasToken = hasAdminSession();
    const scopeHint = slug ? `<span class="text-[10px] opacity-50">Scoped to ${escapeHtml(slug)}</span>` : '';

    return `
        <div class="glass-card p-5 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/5 to-orange-500/5">
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

            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3 ${hasToken ? '' : 'opacity-40 pointer-events-none'}" id="admin-actions-group">
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
                <div class="text-xs font-mono opacity-60 max-h-32 overflow-y-auto">
                    ${(data.wallets || []).length || 'None'}
                </div>
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
                        <div class="text-lg font-bold ${parseFloat(data.retention.day1.rate) > 20 ? 'text-green-400' : ''}">${data.retention.day1.rate}%</div>
                        <div class="text-[10px] opacity-30">${data.retention.day1.count} user${data.retention.day1.count !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="bg-white/5 rounded p-2">
                        <div class="text-[10px] opacity-40 uppercase">Day 7</div>
                        <div class="text-lg font-bold ${parseFloat(data.retention.day7.rate) > 10 ? 'text-green-400' : ''}">${data.retention.day7.rate}%</div>
                        <div class="text-[10px] opacity-30">${data.retention.day7.count} user${data.retention.day7.count !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="bg-white/5 rounded p-2">
                        <div class="text-[10px] opacity-40 uppercase">Day 30</div>
                        <div class="text-lg font-bold ${parseFloat(data.retention.day30.rate) > 5 ? 'text-green-400' : ''}">${data.retention.day30.rate}%</div>
                        <div class="text-[10px] opacity-30">${data.retention.day30.count} user${data.retention.day30.count !== 1 ? 's' : ''}</div>
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

function setupAdminListeners() {
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
            renderAnalyticsPage(router.getParams());
        });
    }

    const signOutBtn = document.getElementById('admin-signout-btn');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            clearAdminSession();
            setAdminAuthState('Signed out.');
            setAdminLockedState(true);
            renderAnalyticsPage(router.getParams());
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
