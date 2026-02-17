import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import {
    getLeaderboard,
    getUserStats,
    getAdminData,
    downloadCSV,
    getNonce,
    verifySignature,
    getAuthToken,
    clearAuthToken
} from '../lib/api.js';
import { state, EVENTS } from '../state.js';
import { shortenAddress } from '../utils/dom.js';
import { signMessage } from '@wagmi/core';
import { wagmiAdapter } from '../wallet.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';

const ADMIN_WALLETS = (import.meta.env.VITE_ADMIN_WALLETS || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

let renderVersion = 0;
let walletUpdateHandler = null;
let activityInterval = null;
let feedStatusTimeout = null;
let collectionCardClickHandler = null;

export async function renderAnalyticsPage(params) {
    const currentRender = ++renderVersion;
    const { slug } = params || {};
    const collections = loadCollections();
    const app = document.getElementById('app');
    if (!app) return;

    // Clean up previous listeners + intervals
    teardownAnalyticsPage();

    // Show loading state
    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white p-6 pb-24">
            <div class="max-w-6xl mx-auto text-center py-20">
                <div class="text-4xl mb-4 animate-spin inline-block">⚡</div>
                <p class="opacity-60">Loading analytics...</p>
            </div>
        </div>
    `;

    // Fetch data in parallel
    const [leaderboardData, userStats] = await Promise.all([
        getLeaderboard({ collection: slug || undefined }).catch(() => null),
        state.wallet?.isConnected
            ? getUserStats(state.wallet.address).catch(() => null)
            : Promise.resolve(null)
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

    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white p-4 md:p-6 pb-24">
            <header class="max-w-6xl mx-auto mb-8">
                <button id="back-home-btn" class="text-indigo-400 mb-3 hover:underline flex items-center gap-2 text-sm">
                    <span>←</span> Back Home
                </button>
                <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                    <div>
                        <h1 class="text-3xl md:text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                            ${slug ? `${slug} Analytics` : 'Mint Intelligence'}
                        </h1>
                        <p class="text-sm opacity-50 mt-1">Real-time insights • Powered by Vercel KV</p>
                    </div>
                    <div class="flex gap-2 flex-wrap">
                        <button class="analytics-tab analytics-tab-active" data-type="mints">🏆 Mints</button>
                        <button class="analytics-tab" data-type="volume">💰 Volume</button>
                        <button class="analytics-tab" data-type="gas">⛽ Gas</button>
                        <button class="analytics-tab" data-type="reputation">⭐ Reputation</button>
                        <button class="analytics-tab" data-type="points">🪙 Points</button>
                    </div>
                </div>
            </header>

            <main class="max-w-6xl mx-auto space-y-6">

                ${renderSocialProof(socialProof)}

                ${renderWalletInsights(userStats, state.wallet)}

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${summaryCard('👁️', 'Total Views', stats.totalViews || 0, 'indigo')}
                    ${summaryCard('💎', 'Total Mints', stats.totalMints || 0, 'green')}
                    ${summaryCard('🎯', 'Success Rate', `${stats.successRate || 0}%`, 'yellow')}
                    ${summaryCard('📈', 'Conversion', `${stats.conversionRate || 0}%`, 'purple')}
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${summaryCard('⚡', 'Total Events', stats.totalEvents || 0, 'cyan')}
                    ${summaryCard('🔗', 'Unique Wallets', stats.uniqueWallets || stats.totalConnects || 0, 'blue')}
                    ${summaryCard('💸', 'Total Volume', `${parseFloat(stats.totalVolume || 0).toFixed(4)} ETH`, 'emerald')}
                    ${summaryCard('🔴', 'Collections Live', liveCount, 'red')}
                </div>

                <div class="glass-card p-5 rounded-2xl border border-white/10">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-2">
                        <h3 class="text-lg font-bold flex items-center gap-2">
                            <span class="text-orange-400">🔥</span> Conversion Funnel
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
                            <span class="text-yellow-400">🏆</span> Top Minters
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
                        <span class="text-blue-400">📊</span> Collection Performance
                    </h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        ${renderCollectionStats(collectionStats)}
                    </div>
                </div>

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
                    updateFeedStatus('updated ✓');
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

    // Expose refresh method for external triggers (e.g., mint.js)
    window.refreshAnalytics = () => renderAnalyticsPage(params);
}

export function teardownAnalyticsPage() {
    if (walletUpdateHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);
        walletUpdateHandler = null;
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
            <span>${m.icon}</span>
            <span class="font-medium">${m.text}</span>
        </div>
        <span class="text-white/20 mx-2">•</span>
    `).join('');
}

// ========== WALLET INSIGHTS (PERSONALIZED) ==========

function renderPointsSection(userStats) {
    if (!userStats) return '';
    const profile = userStats.profile || {};
    const rankings = userStats.rankings || {};
    // Removed unused points variable here

    // api/user.js response:
    /*
    profile: {
        totalMints,
        ...
    },
    rankings: {
        points: { score: ... }
    }
    insights: {
        points: ...
    }
    */

    const score = rankings.points?.score || 0;
    const rank = rankings.points?.rank || 'Unranked';
    const streak = profile.streak || 0;

    return `
      <div class="glass-card p-5 rounded-2xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/5 to-amber-500/5 mt-4">
        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
          <span class="text-yellow-400">🪙</span> Your Points
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
            <span class="font-mono">${(parseInt(profile.totalMints) || 0) * 10}</span>
          </div>
          <div class="flex justify-between">
            <span class="opacity-60">From Volume (Est.)</span>
            <span class="font-mono">~${Math.floor((parseFloat(profile.totalVolume || 0) * 50))}</span>
          </div>
          <div class="flex justify-between">
            <span class="opacity-60">From Streak (${streak} days)</span>
            <span class="font-mono">${(streak >= 3 ? (streak * 3) : 0)}</span>
          </div>
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
                <div class="text-3xl opacity-20">🔒</div>
            </div>
        `;
    }

    const profile = userStats?.profile || {};
    const rankings = userStats?.rankings || {};
    const insights = userStats?.insights || {};

    return `
        <div class="glass-card p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/5 relative overflow-hidden">
            <div class="absolute top-2 right-4 opacity-10 text-6xl pointer-events-none">👤</div>

            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-2">
                <h2 class="text-lg font-bold flex items-center gap-2 flex-wrap">
                    Wallet Insights
                    <div class="flex items-center gap-1 bg-white/10 px-2 py-0.5 rounded-full border border-white/5">
                        <span class="text-xs font-normal opacity-50 font-mono">${shortenAddress(wallet.address)}</span>
                        <a href="https://basescan.org/address/${wallet.address}" target="_blank" rel="noopener noreferrer" class="text-xs opacity-40 hover:opacity-100 transition" title="View on Explorer">↗</a>
                    </div>
                    ${insights.badge ? `<span class="text-xs bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-200 border border-yellow-500/20 px-2 py-0.5 rounded-full shadow-sm">${insights.badge}</span>` : ''}
                    ${insights.activityLevel ? `<span class="text-xs bg-gradient-to-r from-indigo-500/30 to-purple-500/30 text-indigo-200 px-2 py-0.5 rounded-full">${insights.activityLevel}</span>` : ''}
                    ${profile.streak > 0 ? `<span class="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">🔥 ${profile.streak} day streak</span>` : ''}
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
                        <div class="text-xs opacity-50 mb-1">🏆 Your Contribution</div>
                        <div class="text-lg font-bold text-indigo-400">
                            ${profile.mintContribution}%
                            <span class="text-xs font-normal opacity-50">of all mints</span>
                        </div>
                    </div>
                ` : ''}
                ${profile.volumeContribution ? `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1">💸 Revenue Share</div>
                        <div class="text-lg font-bold text-emerald-400">
                            ${profile.volumeContribution}%
                            <span class="text-xs font-normal opacity-50">of total volume</span>
                        </div>
                    </div>
                ` : ''}
                ${profile.favoriteCollection ? `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1">❤️ Favorite Collection</div>
                        <div class="text-lg font-bold text-pink-400 truncate">${profile.favoriteCollection}</div>
                        <div class="text-[10px] opacity-40">${profile.favoriteCollectionMints || 0} mints</div>
                    </div>
                ` : `
                    <div class="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div class="text-xs opacity-50 mb-1">❤️ Favorite Collection</div>
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
        page_view: '📄',
        wallet_connect: '🔗',
        collection_view: '👁️',
        mint_click: '👆',
        tx_sent: '📤',
        mint_success: '✅'
    };

    // Horizontal funnel flow
    return `
        <div class="space-y-1">
            <div class="flex flex-col gap-3">
                ${funnel.map((step, i) => {
        const width = Math.max((step.count / maxCount) * 100, 12);
        const icon = icons[step.step] || '📌';
        const isLast = i === funnel.length - 1;
        const dropOffColor = parseFloat(step.dropOff || 0) > 50 ? 'text-red-400' : parseFloat(step.dropOff || 0) > 25 ? 'text-yellow-400' : 'text-green-400';

        return `
                        <div class="relative">
                            <div class="flex items-center gap-3">
                                <div class="w-8 text-center text-lg flex-shrink-0">${icon}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between text-xs mb-1">
                                        <span class="font-medium">${step.label || step.step.replace(/_/g, ' ')}</span>
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

    const medals = ['🥇', '🥈', '🥉'];

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
        return `
                        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors ${isMe ? 'bg-indigo-500/10' : ''}">
                            <td class="py-3 pl-3 font-mono text-indigo-300">
                                ${i < 3 ? medals[i] : `#${user.rank}`}
                            </td>
                            <td class="py-3 font-mono">
                                ${shortenAddress(user.wallet)}
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

    return activity.map(item => {
        const timeAgo = getTimeAgo(item.timestamp);
        return `
            <div class="flex items-center gap-3 p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-green-500/20 transition-all animate-fade-in">
                <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">${item.collection || 'Unknown'}</div>
                    <div class="text-[10px] opacity-50 font-mono">
                        ${shortenAddress(item.wallet || '')}
                        <span class="mx-1">•</span>
                        ${timeAgo}
                        ${item.price > 0 ? `<span class="mx-1">•</span> ${parseFloat(item.price).toFixed(4)} ETH` : ''}
                    </div>
                </div>
                ${item.txHash ? `
                    <a href="https://basescan.org/tx/${item.txHash}" target="_blank" rel="noopener noreferrer"
                       class="p-1 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0">↗</a>
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

        return `
            <div class="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-indigo-500/20 transition-all cursor-pointer" data-slug="${col.slug}">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-sm truncate flex-1">${col.slug}</span>
                    <span class="text-xs opacity-50 ml-2">${col.successRate}% success</span>
                </div>
                <div class="w-full bg-white/5 rounded-full h-2 mb-2 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style="width: ${barWidth}%"></div>
                </div>
                <div class="flex gap-4 text-xs opacity-60">
                    <span>👁️ ${col.views} views</span>
                    <span>💎 ${col.mints} mints</span>
                    ${col.volume > 0 ? `<span>💸 ${col.volume.toFixed(4)} ETH</span>` : ''}
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
                <span class="text-green-400">💎</span> Your Mint History
                <span class="text-xs font-normal opacity-40 ml-auto">${mints.length} mints</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${mints.map(mint => `
                    <div class="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center text-lg flex-shrink-0">💎</div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold truncate">${mint.collection || 'Unknown Collection'}</div>
                            <div class="text-[10px] opacity-50 font-mono">
                                ${mint.timestamp ? new Date(mint.timestamp).toLocaleDateString() : ''}
                                ${mint.txHash ? ` • ${mint.txHash.slice(0, 10)}...` : ''}
                            </div>
                        </div>
                        ${mint.txHash ? `
                            <a href="https://basescan.org/tx/${mint.txHash}" target="_blank" rel="noopener noreferrer"
                               class="p-1 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0">↗</a>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ========== JOURNEY TIMELINE ==========

function renderJourneyTimeline(userStats) {
    if (!userStats?.journey || userStats.journey.length === 0) return '';

    const journey = userStats.journey;
    const eventIcons = {
        page_view: '👁️', collection_view: '📂', mint_click: '👆',
        mint_attempt: '⏳', tx_sent: '📤', mint_success: '✅',
        mint_failure: '❌', wallet_connect: '🔗', gallery_view: '🖼️', click: '👆'
    };

    return `
        <div class="glass-card p-5 rounded-2xl border border-white/10">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                <span class="text-blue-400">🗺️</span> Your Journey
                <span class="text-xs font-normal opacity-40 ml-auto">Last ${journey.length} events</span>
            </h3>
            <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                ${journey.map((event) => {
        const eventType = typeof event?.type === 'string' ? event.type : 'unknown';
        const safeTimestamp = event?.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'unknown';
        return `
                    <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div class="text-base flex-shrink-0">${eventIcons[eventType] || '📌'}</div>
                        <div class="flex-1 min-w-0">
                            <span class="text-sm font-medium">${eventType.replace(/_/g, ' ')}</span>
                            ${event.collection ? `<span class="text-xs opacity-50 ml-2">${event.collection}</span>` : ''}
                            ${event.page ? `<span class="text-xs opacity-50 ml-2">${event.page}</span>` : ''}
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

    const hasToken = Boolean(getAuthToken());
    const scopeHint = slug ? `<span class="text-[10px] opacity-50">Scoped to ${slug}</span>` : '';

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

async function requestAdminAuth() {
    const wallet = state.wallet?.address;
    if (!wallet) return { success: false, error: 'Connect wallet first' };

    try {
        const chainId = state.wallet?.chainId || 8453;
        const nonceData = await getNonce(wallet);
        const nonce = nonceData?.nonce;
        if (!nonce) return { success: false, error: 'Failed to get nonce' };

        const domain = window.location.host;
        const origin = window.location.origin;
        const issuedAt = new Date().toISOString();
        const message = `${domain} wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to Mint Intelligence Admin\n\nURI: ${origin}\nVersion: 1\nChain ID: ${chainId}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

        const signature = await signMessage(wagmiAdapter.wagmiConfig, { message });
        const verified = await verifySignature(message, signature);
        if (!verified?.token) {
            return { success: false, error: 'Signature verified but no token returned' };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error?.message || 'Admin sign-in failed' };
    }
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

function isUnauthorizedAdminResponse(data) {
    return data?.status === 401 || data?.status === 403;
}

async function loadAdminOverview() {
    const content = document.getElementById('admin-panel-content');
    if (!content) return;

    content.innerHTML = '<div class="text-center py-4 opacity-30">Loading...</div>';
    const data = await getAdminData('overview');

    if (isUnauthorizedAdminResponse(data)) {
        clearAuthToken();
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
                ${lb.map(u => `<div class="flex justify-between"><span>${shortenAddress(u.wallet)}</span><span class="font-bold">${u.score}</span></div>`).join('')}
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
    const data = await getAdminData(action, date);

    if (isUnauthorizedAdminResponse(data)) {
        clearAuthToken();
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
                    ${(data.wallets || []).map(w => shortenAddress(w)).join(', ') || 'None'}
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
    const result = await downloadCSV(type);
    if (result?.success) return;

    if (result?.status === 401 || result?.status === 403) {
        clearAuthToken();
        setAdminLockedState(true);
        setAdminAuthState('Admin session expired. Sign in again.', true);
        return;
    }

    setAdminAuthState(result?.error || 'CSV export failed', true);
}

function setupAdminListeners() {
    const hasToken = Boolean(getAuthToken());
    setAdminLockedState(!hasToken);

    const signInBtn = document.getElementById('admin-signin-btn');
    if (signInBtn) {
        signInBtn.addEventListener('click', async () => {
            signInBtn.disabled = true;
            setAdminAuthState('Signing admin message...');
            const authResult = await requestAdminAuth();
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
            clearAuthToken();
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
