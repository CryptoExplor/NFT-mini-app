import { router } from '../lib/router.js';
import { getBattleHistory, getLeaderboard, getUserStats } from '../lib/api.js';
import { state, EVENTS } from '../state.js';
import { shortenAddress } from '../utils/dom.js';
import { escapeHtml } from '../utils/html.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';
import { getMiniAppProfile, getMiniAppProfileLabel } from '../utils/profile.js';
import { renderIcon } from '../utils/icons.js';
import { renderWalletInsights } from '../components/analytics/WalletInsights.js';
import { renderLeaderboard } from '../components/analytics/MintLeaderboard.js';
import { renderRecentActivity } from '../components/analytics/RecentActivity.js';
import {
    buildBattleAnalytics,
    renderBattleOverview,
    renderBattleHistorySection
} from '../components/analytics/BattleOverview.js';
import { renderAdminPanel, setupAdminListeners } from '../components/analytics/AdminPanel.js';
import { renderCollectionStats } from '../components/analytics/CollectionPerformance.js';
import { renderEnhancedFunnel } from '../components/analytics/ConversionFunnel.js';
import { renderMintHistory, renderJourneyTimeline } from '../components/analytics/UserTimeline.js';
import { renderAnalyticsIcon, summaryCard } from '../components/analytics/AnalyticsUtils.js';

const ADMIN_WALLETS = (import.meta.env.VITE_ADMIN_WALLETS || '')
    .split(',')
    .map((wallet) => wallet.trim().toLowerCase())
    .filter(Boolean);

const ROOT_VIEWS = new Set(['arena', 'nft']);

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
    const isCollectionRoute = Boolean(slug);
    const app = document.getElementById('app');
    if (!app) return;

    teardownAnalyticsPage();

    const viewerWallet = state.wallet?.isConnected ? state.wallet.address : null;
    const viewerIdentity = getViewerIdentity(viewerWallet);
    const feedState = { isPaused: false };
    const activeMetric = {
        arena: 'battle_wins',
        nft: 'mints',
        collection: 'mints'
    };
    let activeRootView = isCollectionRoute ? 'nft' : getInitialRootView();
    let cachedUserStats = null;
    let cachedArenaData = null;
    let cachedNftData = null;
    let cachedCollectionData = null;

    app.innerHTML = renderLoadingState();

    async function loadUserStatsOnce() {
        if (!viewerWallet) return null;
        if (cachedUserStats) return cachedUserStats;
        cachedUserStats = await getUserStats(viewerWallet).catch(() => null);
        return cachedUserStats;
    }

    async function loadArenaData(type = activeMetric.arena) {
        activeMetric.arena = type;
        if (cachedArenaData?.metric === type) return cachedArenaData;

        const [leaderboardData, syncedBattleHistory] = await Promise.all([
            getLeaderboard({
                type,
                viewer: viewerWallet || undefined,
                surface: 'competition'
            }).catch(() => null),
            viewerWallet ? getBattleHistory(viewerWallet, 50).catch(() => []) : Promise.resolve([])
        ]);

        cachedArenaData = {
            metric: type,
            leaderboardData,
            battleAnalytics: buildBattleAnalytics(viewerWallet, syncedBattleHistory)
        };
        return cachedArenaData;
    }

    async function loadNftData(type = activeMetric.nft) {
        activeMetric.nft = type;
        if (cachedNftData?.metric === type) return cachedNftData;

        cachedNftData = {
            metric: type,
            leaderboardData: await getLeaderboard({ type }).catch(() => null)
        };
        return cachedNftData;
    }

    async function loadCollectionData(type = activeMetric.collection) {
        activeMetric.collection = type;
        if (cachedCollectionData?.metric === type) return cachedCollectionData;

        cachedCollectionData = {
            metric: type,
            leaderboardData: await getLeaderboard({
                type,
                collection: slug || undefined
            }).catch(() => null)
        };
        return cachedCollectionData;
    }

    if (isCollectionRoute) {
        await Promise.all([
            loadUserStatsOnce(),
            loadCollectionData(activeMetric.collection)
        ]);
    } else {
        await Promise.all([
            loadUserStatsOnce(),
            activeRootView === 'nft'
                ? loadNftData(activeMetric.nft)
                : loadArenaData(activeMetric.arena)
        ]);
    }
    if (currentRender !== renderVersion) return;

    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 app-text p-4 md:p-6 pb-24">
            ${renderHeader({
        slug,
        isCollectionRoute,
        activeRootView,
        activeCollectionMetric: activeMetric.collection
    })}

            <main class="max-w-6xl mx-auto space-y-6">
                <div id="${isCollectionRoute ? 'analytics-collection-content' : 'analytics-root-content'}">
                    ${isCollectionRoute ? renderCollectionView() : renderRootView()}
                </div>

                ${renderAdminPanel(state.wallet, slug, ADMIN_WALLETS)}
            </main>
            ${renderBottomNav('analytics')}
        </div>
    `;

    bindStaticAnalyticsEvents();
    bindRootViewTabs();
    bindMetricTabs();
    bindCollectionCardNavigation();
    bindFeedHover(feedState, getActiveRefreshLabel());
    bindFeedRefresh({ currentRender, isCollectionRoute, feedState });

    setupAdminListeners(() => renderAnalyticsPage(params));
    bindBottomNavEvents();
    bindThemeToggleEvents();

    walletUpdateHandler = () => {
        setTimeout(() => renderAnalyticsPage(params), 300);
    };
    document.addEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);

    mintSuccessHandler = () => {
        setTimeout(() => renderAnalyticsPage(params), 300);
    };
    document.addEventListener(EVENTS.MINT_SUCCESS, mintSuccessHandler);

    window.refreshAnalytics = () => renderAnalyticsPage(params);

    function renderRootView() {
        if (activeRootView === 'nft') {
            const data = cachedNftData?.leaderboardData || {};
            return renderNftView({
                leaderboardData: data,
                userStats: cachedUserStats,
                wallet: state.wallet,
                viewerIdentity,
                activeMetric: activeMetric.nft,
                refreshLabel: getActiveRefreshLabel()
            });
        }

        const data = cachedArenaData?.leaderboardData || {};
        return renderArenaView({
            leaderboardData: data,
            userStats: cachedUserStats,
            wallet: state.wallet,
            viewerIdentity,
            battleAnalytics: cachedArenaData?.battleAnalytics || null,
            activeMetric: activeMetric.arena,
            refreshLabel: getActiveRefreshLabel()
        });
    }

    function renderCollectionView() {
        return renderCollectionAnalytics({
            slug,
            leaderboardData: cachedCollectionData?.leaderboardData || {},
            userStats: cachedUserStats,
            wallet: state.wallet,
            viewerIdentity,
            activeMetric: activeMetric.collection,
            refreshLabel: getActiveRefreshLabel()
        });
    }

    async function switchRootView(view) {
        if (!ROOT_VIEWS.has(view) || isCollectionRoute) return;
        activeRootView = view;
        setRootViewInUrl(view);
        updateRootViewTabs(activeRootView);

        const container = document.getElementById('analytics-root-content');
        if (!container) return;
        container.innerHTML = renderSectionLoading(view === 'nft' ? 'Loading NFT analytics...' : 'Loading arena analytics...');

        if (view === 'nft') {
            await loadNftData(activeMetric.nft);
        } else {
            await loadArenaData(activeMetric.arena);
        }
        if (currentRender !== renderVersion) return;

        container.innerHTML = renderRootView();
        bindMetricTabs();
        bindCollectionCardNavigation();
        feedState.isPaused = false;
        bindFeedHover(feedState, getActiveRefreshLabel());
    }

    async function switchMetric(type) {
        const normalizedType = normalizeMetric(type);
        if (!normalizedType) return;

        if (isCollectionRoute) {
            activeMetric.collection = normalizedType;
            await updateCollectionMetric(normalizedType);
            return;
        }

        if (activeRootView === 'arena') {
            if (!['battle_wins', 'points', 'battle_points'].includes(normalizedType)) return;
            activeMetric.arena = normalizedType;
            await updateRootMetric('arena', normalizedType);
            return;
        }

        if (!['mints', 'volume', 'points'].includes(normalizedType)) return;
        activeMetric.nft = normalizedType;
        await updateRootMetric('nft', normalizedType);
    }

    async function updateRootMetric(view, type) {
        const container = document.getElementById('analytics-root-content');
        if (!container) return;
        
        const lbContainer = document.getElementById('leaderboard-container');
        if (lbContainer) {
            lbContainer.innerHTML = '<div class="py-8 text-center"><div class="inline-block w-8 h-8 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin mb-3"></div></div>';
        }

        if (view === 'arena') {
            await loadArenaData(type);
        } else {
            await loadNftData(type);
        }
        if (currentRender !== renderVersion) return;

        container.innerHTML = renderRootView();
        bindMetricTabs();
        bindCollectionCardNavigation();
        bindFeedHover(feedState, getActiveRefreshLabel());
    }

    async function updateCollectionMetric(type) {
        const container = document.getElementById('analytics-collection-content');
        if (!container) return;
        
        const lbContainer = document.getElementById('leaderboard-container');
        if (lbContainer) {
            lbContainer.innerHTML = '<div class="py-8 text-center"><div class="inline-block w-8 h-8 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin mb-3"></div></div>';
        }

        await loadCollectionData(type);
        if (currentRender !== renderVersion) return;

        container.innerHTML = renderCollectionView();
        bindMetricTabs();
        bindCollectionCardNavigation();
        bindFeedHover(feedState, getActiveRefreshLabel());
    }

    function bindRootViewTabs() {
        document.querySelectorAll('[data-analytics-view]').forEach((button) => {
            button.addEventListener('click', () => {
                const view = button.getAttribute('data-analytics-view');
                switchRootView(view);
            });
        });
    }

    function bindMetricTabs() {
        document.querySelectorAll('[data-analytics-metric]').forEach((button) => {
            button.addEventListener('click', () => {
                const type = button.getAttribute('data-analytics-metric');
                switchMetric(type);
            });
        });
        updateMetricLabel();
    }

    function bindFeedRefresh({ currentRender: renderId, isCollectionRoute: collectionMode, feedState: stateRef }) {
        activityInterval = setInterval(async () => {
            if (stateRef.isPaused) return;

            try {
                if (collectionMode) {
                    const data = await getLeaderboard({
                        type: activeMetric.collection,
                        collection: slug || undefined
                    });
                    if (renderId !== renderVersion) return;
                    cachedCollectionData = { metric: activeMetric.collection, leaderboardData: data };
                    renderLeaderboardContainer(data, walletAddressOrNull(), viewerIdentity, false);
                    renderFeedContainer(data?.recentActivity || [], 'mint', walletAddressOrNull(), viewerIdentity);
                    flashFeedStatus(getActiveRefreshLabel());
                    return;
                }

                const view = activeRootView;
                const metric = activeMetric[view];
                const data = await getLeaderboard(buildRootLeaderboardRequest(view, metric, viewerWallet));
                if (renderId !== renderVersion) return;

                if (view === 'arena') {
                    cachedArenaData = {
                        ...(cachedArenaData || {}),
                        metric,
                        leaderboardData: data
                    };
                } else {
                    cachedNftData = {
                        metric,
                        leaderboardData: data
                    };
                }

                renderLeaderboardContainer(data, walletAddressOrNull(), viewerIdentity, view === 'arena');
                renderFeedContainer(data?.recentActivity || [], view === 'arena' ? 'battle' : 'mint', walletAddressOrNull(), viewerIdentity);
                flashFeedStatus(getActiveRefreshLabel());
            } catch {
                // Transient analytics misses should not interrupt the page.
            }
        }, getActiveRefreshMs());
    }

    function getActiveRefreshLabel() {
        if (isCollectionRoute) return 'auto-refresh 10s';
        return 'auto-refresh 30s';
    }

    function getActiveRefreshMs() {
        return isCollectionRoute ? 10_000 : 30_000;
    }
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

function renderLoadingState() {
    return `
        <div class="min-h-screen bg-slate-900 app-text p-6 pb-24">
            <div class="max-w-6xl mx-auto text-center py-20">
                <div class="inline-block w-10 h-10 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin mb-4"></div>
                <p class="opacity-60">Loading analytics...</p>
            </div>
        </div>
    `;
}

function renderSectionLoading(text) {
    return `
        <section class="glass-card p-8 rounded-2xl border border-white/10 text-center">
            <div class="inline-block w-8 h-8 rounded-full border-4 border-indigo-500/30 border-t-indigo-400 animate-spin mb-3"></div>
            <p class="opacity-60">${escapeHtml(text)}</p>
        </section>
    `;
}

function renderHeader({ slug, isCollectionRoute, activeRootView, activeCollectionMetric }) {
    return `
        <header class="max-w-6xl mx-auto mb-8">
            <button id="back-home-btn" class="text-indigo-400 mb-3 hover:underline flex items-center gap-2 text-sm">
                <span>${renderIcon('CHEVRON_LEFT', 'w-4 h-4')}</span> Back Home
            </button>
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <div>
                    <h1 id="analytics-title" class="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                        ${isCollectionRoute ? `${escapeHtml(slug)} Analytics` : 'Analytics'}
                    </h1>
                    <p id="analytics-subtitle" class="text-sm opacity-50 mt-1">
                        ${isCollectionRoute
            ? 'Collection funnel, mint telemetry, and audience activity.'
            : 'Switch between arena competition and NFT collector intelligence.'}
                    </p>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    ${renderThemeToggleButton('theme-toggle-analytics')}
                    ${isCollectionRoute
            ? renderMetricTabs(getNftMetricTabs(), activeCollectionMetric)
            : renderRootViewTabs(activeRootView)}
                </div>
            </div>
        </header>
    `;
}

function renderRootViewTabs(activeView) {
    const tabs = [
        { view: 'arena', label: 'Arena', icon: 'SWORDS' },
        { view: 'nft', label: 'NFT', icon: 'GEM' }
    ];

    return tabs.map((tab) => `
        <button
            class="analytics-tab analytics-view-tab ${activeView === tab.view ? 'analytics-tab-active' : ''} inline-flex items-center gap-2"
            data-analytics-view="${tab.view}">
            ${renderIcon(tab.icon, 'w-4 h-4')} ${tab.label}
        </button>
    `).join('');
}

function renderMetricTabs(tabs, activeType) {
    return tabs.map((tab) => `
        <button
            class="analytics-tab analytics-metric-tab ${activeType === tab.type ? 'analytics-tab-active' : ''} inline-flex items-center gap-2"
            data-analytics-metric="${tab.type}">
            ${renderIcon(tab.icon, 'w-4 h-4')} ${tab.label}
        </button>
    `).join('');
}

function renderArenaView({ leaderboardData, userStats, wallet, viewerIdentity, battleAnalytics, activeMetric, refreshLabel }) {
    const stats = leaderboardData?.stats || {};
    const leaderboard = leaderboardData?.leaderboard || [];
    const viewerRow = leaderboardData?.viewerRow || null;
    const recentActivity = leaderboardData?.recentActivity || [];
    const walletConnected = Boolean(wallet?.isConnected);

    return `
        ${renderWalletInsights(userStats, wallet, viewerIdentity, { mode: 'arena' })}

        <section class="glass-card p-5 rounded-2xl border border-white/10 bg-gradient-to-r from-indigo-500/5 via-transparent to-cyan-500/5">
            <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-5">
                <div>
                    <h2 class="text-lg font-bold flex items-center gap-2">
                        ${renderAnalyticsIcon('TROPHY', 'text-yellow-400')} Global Competition
                    </h2>
                    <p class="text-sm opacity-50 mt-1">Battle to hold your spot. Arena leaderboards use the optimized competition surface.</p>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs uppercase tracking-[0.18em] opacity-40" id="leaderboard-surface-label">Live ladder: battle wins</span>
                    ${renderMetricTabs(getArenaMetricTabs(), activeMetric)}
                </div>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                ${summaryCard(renderAnalyticsIcon('SWORDS', 'text-cyan-300'), 'Total Battles', stats.battleTotal || 0, 'cyan')}
                ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-emerald-300'), 'Arena Wins', stats.battleWins || 0, 'emerald')}
                ${summaryCard(renderAnalyticsIcon('USERS', 'text-indigo-300'), 'Competitors', stats.uniqueWallets || 0, 'indigo')}
                ${summaryCard(renderAnalyticsIcon('TARGET', 'text-yellow-300'), 'Win Rate', `${stats.battleWinRate || '0.0'}%`, 'yellow')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div class="lg:col-span-2">
                    <div class="mb-3 flex items-center justify-between gap-3">
                        <h3 class="text-base font-bold flex items-center gap-2">
                            ${renderAnalyticsIcon('TROPHY', 'text-indigo-300')} Arena Ladder
                        </h3>
                        <span class="text-xs opacity-40">Top competitors update from KV snapshots</span>
                    </div>
                    <div id="leaderboard-container">
                        ${renderLeaderboard(leaderboard, wallet?.address, viewerIdentity, { viewerRow })}
                    </div>
                </div>

                <div class="glass-card p-5 rounded-2xl border border-green-500/20 relative" id="activity-feed-card">
                    <div class="flex items-center justify-between mb-4">
                        <h3 class="text-lg font-bold flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                            Live Fights
                        </h3>
                        <span id="feed-status" class="text-[10px] opacity-40 font-mono">${refreshLabel}</span>
                    </div>
                    <div class="space-y-2 max-h-[450px] overflow-y-auto custom-scrollbar pr-1" id="activity-feed">
                        ${renderRecentActivity(recentActivity, wallet?.address, viewerIdentity, { mode: 'battle' })}
                    </div>
                </div>
            </div>
        </section>

        ${walletConnected
            ? `
                <section class="space-y-4">
                    ${renderBattleOverview(battleAnalytics, { walletConnected: true })}
                    ${renderBattleHistorySection(battleAnalytics, { walletConnected: true })}
                </section>
            `
            : renderBattleOverview(null, { walletConnected: false })}
    `;
}

function renderNftView({ leaderboardData, userStats, wallet, viewerIdentity, activeMetric, refreshLabel }) {
    const stats = leaderboardData?.stats || {};
    const funnel = leaderboardData?.funnel || [];
    const overallConversion = leaderboardData?.overallConversion || '0.0';
    const leaderboard = leaderboardData?.leaderboard || [];
    const collectionStats = leaderboardData?.collections || [];
    const recentActivity = leaderboardData?.recentActivity || [];
    const socialProof = leaderboardData?.socialProof || [];

    return `
        ${renderSocialProofMarquee(socialProof)}
        ${renderWalletInsights(userStats, wallet, viewerIdentity, { mode: 'nft' })}

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${summaryCard(renderAnalyticsIcon('EYE', 'text-indigo-300'), 'Total Views', stats.totalViews || 0, 'indigo')}
            ${summaryCard(renderAnalyticsIcon('GEM', 'text-green-300'), 'Total Mints', stats.totalMints || 0, 'green')}
            ${summaryCard(renderAnalyticsIcon('TARGET', 'text-yellow-300'), 'Success Rate', `${stats.successRate || 0}%`, 'yellow')}
            ${summaryCard(renderAnalyticsIcon('CHART', 'text-purple-300'), 'Conversion', `${stats.conversionRate || 0}%`, 'purple')}
        </div>

        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-2">
                <h3 class="text-lg font-bold flex items-center gap-2">
                    ${renderAnalyticsIcon('FLAME', 'text-orange-400')} Conversion Funnel
                </h3>
                <div class="text-sm">
                    <span class="opacity-50">Overall:</span>
                    <span class="font-bold ${parseFloat(overallConversion) > 50 ? 'text-green-400' : parseFloat(overallConversion) > 20 ? 'text-yellow-400' : 'text-red-400'}">${overallConversion}%</span>
                    <span class="opacity-40 text-xs ml-1">wallets to success</span>
                </div>
            </div>
            ${renderEnhancedFunnel(funnel)}
        </section>

        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                ${renderAnalyticsIcon('CHART', 'text-blue-400')} Collection Performance
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${renderCollectionStats(collectionStats)}
            </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 glass-card p-5 rounded-2xl border border-white/10">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        ${renderAnalyticsIcon('TROPHY', 'text-yellow-400')} Global Mint Leaderboard
                    </h3>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-normal opacity-40" id="leaderboard-surface-label">All time: mints</span>
                        ${renderMetricTabs(getNftMetricTabs(), activeMetric)}
                    </div>
                </div>
                <div id="leaderboard-container">
                    ${renderLeaderboard(leaderboard, wallet?.address, viewerIdentity)}
                </div>
            </div>

            <div class="glass-card p-5 rounded-2xl border border-green-500/20 relative" id="activity-feed-card">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        Live Mint Feed
                    </h3>
                    <span id="feed-status" class="text-[10px] opacity-40 font-mono">${refreshLabel}</span>
                </div>
                <div class="space-y-2 max-h-[450px] overflow-y-auto custom-scrollbar pr-1" id="activity-feed">
                    ${renderRecentActivity(recentActivity, wallet?.address, viewerIdentity, { mode: 'mint' })}
                </div>
            </div>
        </div>

        ${renderMintHistory(userStats)}
        ${renderJourneyTimeline(userStats)}
    `;
}

function renderCollectionAnalytics({ leaderboardData, userStats, wallet, viewerIdentity, activeMetric, refreshLabel }) {
    const stats = leaderboardData?.stats || {};
    const funnel = leaderboardData?.funnel || [];
    const overallConversion = leaderboardData?.overallConversion || '0.0';
    const leaderboard = leaderboardData?.leaderboard || [];
    const collectionStats = leaderboardData?.collections || [];
    const recentActivity = leaderboardData?.recentActivity || [];

    return `
        ${renderWalletInsights(userStats, wallet, viewerIdentity, { mode: 'nft' })}

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            ${summaryCard(renderAnalyticsIcon('EYE', 'text-indigo-300'), 'Total Views', stats.totalViews || 0, 'indigo')}
            ${summaryCard(renderAnalyticsIcon('GEM', 'text-green-300'), 'Total Mints', stats.totalMints || 0, 'green')}
            ${summaryCard(renderAnalyticsIcon('TARGET', 'text-yellow-300'), 'Success Rate', `${stats.successRate || 0}%`, 'yellow')}
            ${summaryCard(renderAnalyticsIcon('CHART', 'text-purple-300'), 'Conversion', `${stats.conversionRate || 0}%`, 'purple')}
        </div>

        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-2">
                <h3 class="text-lg font-bold flex items-center gap-2">
                    ${renderAnalyticsIcon('FLAME', 'text-orange-400')} Conversion Funnel
                </h3>
                <div class="text-sm">
                    <span class="opacity-50">Overall:</span>
                    <span class="font-bold ${parseFloat(overallConversion) > 50 ? 'text-green-400' : parseFloat(overallConversion) > 20 ? 'text-yellow-400' : 'text-red-400'}">${overallConversion}%</span>
                    <span class="opacity-40 text-xs ml-1">wallets to success</span>
                </div>
            </div>
            ${renderEnhancedFunnel(funnel)}
        </section>

        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                ${renderAnalyticsIcon('CHART', 'text-blue-400')} Collection Performance
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${renderCollectionStats(collectionStats)}
            </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 glass-card p-5 rounded-2xl border border-white/10">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        ${renderAnalyticsIcon('TROPHY', 'text-yellow-400')} Leaderboard
                    </h3>
                    <span class="text-xs font-normal opacity-40" id="leaderboard-surface-label">All time: ${escapeHtml(activeMetric)}</span>
                </div>
                <div id="leaderboard-container">
                    ${renderLeaderboard(leaderboard, wallet?.address, viewerIdentity)}
                </div>
            </div>

            <div class="glass-card p-5 rounded-2xl border border-green-500/20 relative" id="activity-feed-card">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        <span class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                        Live Feed
                    </h3>
                    <span id="feed-status" class="text-[10px] opacity-40 font-mono">${refreshLabel}</span>
                </div>
                <div class="space-y-2 max-h-[450px] overflow-y-auto custom-scrollbar pr-1" id="activity-feed">
                    ${renderRecentActivity(recentActivity, wallet?.address, viewerIdentity, { mode: 'mint' })}
                </div>
            </div>
        </div>

        ${renderMintHistory(userStats)}
        ${renderJourneyTimeline(userStats)}
    `;
}

function bindStaticAnalyticsEvents() {
    const backHomeBtn = document.getElementById('back-home-btn');
    if (backHomeBtn) {
        backHomeBtn.onclick = () => {
            teardownAnalyticsPage();
            router.navigate('/');
        };
    }
}

function bindFeedHover(feedState, refreshLabel) {
    const feedCard = document.getElementById('activity-feed-card');
    if (!feedCard) return;

    feedCard.addEventListener('mouseenter', () => {
        feedState.isPaused = true;
        updateFeedStatus('paused');
    });
    feedCard.addEventListener('mouseleave', () => {
        feedState.isPaused = false;
        updateFeedStatus(refreshLabel);
    });
}

function buildRootLeaderboardRequest(view, type, viewerWallet) {
    if (view === 'arena') {
        return {
            type,
            viewer: viewerWallet || undefined,
            surface: 'competition'
        };
    }

    return { type };
}

function renderLeaderboardContainer(data, walletAddress, viewerIdentity, includeViewerRow) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    if (data?.leaderboard) {
        container.innerHTML = renderLeaderboard(data.leaderboard, walletAddress, viewerIdentity, {
            viewerRow: includeViewerRow ? data.viewerRow || null : null
        });
        updateMetricLabel();
        return;
    }

    container.innerHTML = '<div class="text-center py-8 text-red-400">Failed to load leaderboard</div>';
}

function renderFeedContainer(activity, mode, walletAddress, viewerIdentity) {
    const feedEl = document.getElementById('activity-feed');
    if (!feedEl) return;

    feedEl.innerHTML = renderRecentActivity(activity, walletAddress, viewerIdentity, { mode });
}

function flashFeedStatus(refreshLabel) {
    updateFeedStatus('updated');
    if (feedStatusTimeout) clearTimeout(feedStatusTimeout);
    feedStatusTimeout = setTimeout(() => updateFeedStatus(refreshLabel), 2000);
}

function updateFeedStatus(text) {
    const el = document.getElementById('feed-status');
    if (el) el.textContent = text;
}

function updateRootViewTabs(activeView) {
    document.querySelectorAll('[data-analytics-view]').forEach((button) => {
        const view = button.getAttribute('data-analytics-view');
        button.classList.toggle('analytics-tab-active', view === activeView);
    });
}

function updateMetricLabel() {
    const labelEl = document.getElementById('leaderboard-surface-label');
    if (!labelEl) return;

    const activeButton = document.querySelector('[data-analytics-metric].analytics-tab-active');
    const activeMetric = activeButton?.getAttribute('data-analytics-metric') || '';
    const labelMap = {
        battle_wins: 'battle wins',
        battle_points: 'battle points',
        points: 'points',
        mints: 'mints',
        volume: 'volume'
    };

    if (labelEl.textContent?.startsWith('Live ladder')) {
        labelEl.textContent = `Live ladder: ${labelMap[activeMetric] || activeMetric}`;
        return;
    }

    labelEl.textContent = `All time: ${labelMap[activeMetric] || activeMetric}`;
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

function renderSocialProofMarquee(messages) {
    if (!messages || messages.length === 0) return '';

    const items = messages.map((message) => `
        <span class="inline-flex items-center gap-2 text-sm whitespace-nowrap px-4">
            ${renderAnalyticsIcon('FLAME', 'text-amber-300', 'w-4 h-4')}
            <span class="font-medium">${escapeHtml(message.text || '')}</span>
        </span>
    `).join('');

    return `
        <style>
            @keyframes analytics-marquee-scroll {
                from { transform: translateX(0); }
                to { transform: translateX(-50%); }
            }
            .analytics-marquee-track {
                animation: analytics-marquee-scroll 32s linear infinite;
            }
            .analytics-marquee:hover .analytics-marquee-track {
                animation-play-state: paused;
            }
            @media (prefers-reduced-motion: reduce) {
                .analytics-marquee-track {
                    animation: none;
                    transform: none;
                }
            }
        </style>
        <div class="glass-card px-4 py-3 rounded-xl border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5 overflow-hidden analytics-marquee">
            <div class="flex w-max analytics-marquee-track">
                <div class="flex items-center">${items}</div>
                <div class="flex items-center" aria-hidden="true">${items}</div>
            </div>
        </div>
    `;
}

function getArenaMetricTabs() {
    return [
        { type: 'battle_wins', label: 'Wins', icon: 'SWORDS' },
        { type: 'battle_points', label: 'Battle Pts', icon: 'COIN' }
    ];
}

function getNftMetricTabs() {
    return [
        { type: 'mints', label: 'Mints', icon: 'TROPHY' },
        { type: 'volume', label: 'Volume', icon: 'CHART' },
        { type: 'points', label: 'Points', icon: 'COIN' }
    ];
}

function normalizeMetric(type) {
    return ['battle_wins', 'battle_points', 'points', 'mints', 'volume'].includes(type) ? type : null;
}

function getInitialRootView() {
    if (typeof window === 'undefined') return 'arena';
    const requestedView = new URLSearchParams(window.location.search).get('view');
    return ROOT_VIEWS.has(requestedView) ? requestedView : 'arena';
}

function setRootViewInUrl(view) {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname || '/analytics';
    window.history.replaceState(null, '', `${path}?view=${view}`);
}

function walletAddressOrNull() {
    return state.wallet?.isConnected ? state.wallet.address : null;
}
