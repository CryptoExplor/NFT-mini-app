import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { getLeaderboard, getUserStats } from '../lib/api.js';
import { state } from '../state.js';
import { shortenAddress } from '../utils/dom.js';

export async function renderAnalyticsPage(params) {
    const { slug } = params || {};
    const collections = loadCollections();
    const app = document.getElementById('app');

    // Show loading state immediately
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
        getLeaderboard().catch(() => null),
        state.wallet?.isConnected
            ? getUserStats(state.wallet.address).catch(() => null)
            : Promise.resolve(null)
    ]);

    const stats = leaderboardData?.stats || {};
    const funnel = leaderboardData?.funnel || [];
    const leaderboard = leaderboardData?.leaderboard || [];
    const collectionStats = leaderboardData?.collections || [];
    const recentActivity = leaderboardData?.recentActivity || [];
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
                            ${slug ? `${slug} Analytics` : 'Platform Analytics'}
                        </h1>
                        <p class="text-sm opacity-50 mt-1">Real-time insights • Powered by Vercel KV</p>
                    </div>
                    <div class="flex gap-2">
                        <button id="lb-mints-btn" class="analytics-tab analytics-tab-active" data-type="mints">🏆 Mints</button>
                        <button id="lb-volume-btn" class="analytics-tab" data-type="volume">💰 Volume</button>
                        <button id="lb-gas-btn" class="analytics-tab" data-type="gas">⛽ Gas</button>
                    </div>
                </div>
            </header>

            <main class="max-w-6xl mx-auto space-y-6">

                <!-- ============ USER STATS (PRIVATE) ============ -->
                ${renderUserSection(userStats, state.wallet)}

                <!-- ============ GLOBAL SUMMARY CARDS ============ -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${summaryCard('👁️', 'Total Views', stats.totalViews || 0, 'indigo')}
                    ${summaryCard('💎', 'Total Mints', stats.totalMints || 0, 'green')}
                    ${summaryCard('🎯', 'Success Rate', `${stats.successRate || 0}%`, 'yellow')}
                    ${summaryCard('📈', 'Conversion', `${stats.conversionRate || 0}%`, 'purple')}
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    ${summaryCard('⚡', 'Total Events', stats.totalEvents || 0, 'cyan')}
                    ${summaryCard('🔗', 'Wallet Connects', stats.totalConnects || 0, 'blue')}
                    ${summaryCard('💸', 'Total Volume', `${parseFloat(stats.totalVolume || 0).toFixed(4)} ETH`, 'emerald')}
                    ${summaryCard('🔴', 'Collections Live', liveCount, 'red')}
                </div>

                <!-- ============ FUNNEL + LEADERBOARD ============ -->
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    <!-- Conversion Funnel -->
                    <div class="glass-card p-5 rounded-2xl border border-white/10">
                        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                            <span class="text-orange-400">🔥</span> Mint Funnel
                        </h3>
                        <div class="space-y-3">
                            ${renderFunnel(funnel)}
                        </div>
                    </div>

                    <!-- Leaderboard -->
                    <div class="lg:col-span-2 glass-card p-5 rounded-2xl border border-white/10">
                        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                            <span class="text-yellow-400">🏆</span> Top Minters
                            <span class="text-xs font-normal opacity-40 ml-auto">All Time</span>
                        </h3>
                        <div class="overflow-x-auto" id="leaderboard-container">
                            ${renderLeaderboard(leaderboard)}
                        </div>
                    </div>
                </div>

                <!-- ============ COLLECTIONS + ACTIVITY ============ -->
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    <!-- Popular Collections -->
                    <div class="glass-card p-5 rounded-2xl border border-white/10">
                        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                            <span class="text-blue-400">📊</span> Collection Performance
                        </h3>
                        <div class="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            ${renderCollectionStats(collectionStats)}
                        </div>
                    </div>

                    <!-- Recent Activity -->
                    <div class="glass-card p-5 rounded-2xl border border-white/10">
                        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                            <span class="text-green-400">⚡</span> Live Activity Feed
                        </h3>
                        <div class="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            ${renderActivityFeed(recentActivity)}
                        </div>
                    </div>
                </div>

                <!-- ============ USER JOURNEY (PRIVATE) ============ -->
                ${renderJourneyTimeline(userStats)}

            </main>
        </div>
    `;

    // Event listeners
    document.getElementById('back-home-btn').onclick = () => router.navigate('/');

    // Leaderboard tab switching
    document.querySelectorAll('.analytics-tab').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('.analytics-tab').forEach(b => b.classList.remove('analytics-tab-active'));
            btn.classList.add('analytics-tab-active');

            const type = btn.dataset.type;
            const container = document.getElementById('leaderboard-container');
            container.innerHTML = '<div class="text-center py-8 opacity-30">Loading...</div>';

            const data = await getLeaderboard({ type });
            if (data?.leaderboard) {
                container.innerHTML = renderLeaderboard(data.leaderboard);
            }
        });
    });
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

function renderUserSection(userStats, wallet) {
    if (!wallet?.isConnected) {
        return `
            <div class="glass-card p-5 rounded-2xl border border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 class="text-lg font-bold">Connect wallet to see your stats</h2>
                    <p class="opacity-50 text-sm">Track your rank, streak, and journey</p>
                </div>
                <div class="text-3xl opacity-20">🔒</div>
            </div>
        `;
    }

    const profile = userStats?.profile || {};
    const rankings = userStats?.rankings || {};

    return `
        <div class="glass-card p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/5 relative overflow-hidden">
            <div class="absolute top-2 right-4 opacity-10 text-6xl pointer-events-none">👤</div>
            <h2 class="text-lg font-bold mb-4 flex items-center gap-2">
                My Stats
                <span class="text-xs font-normal opacity-50 bg-white/10 px-2 py-0.5 rounded-full">${shortenAddress(wallet.address)}</span>
                ${profile.streak > 0 ? `<span class="text-xs bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">🔥 ${profile.streak} day streak</span>` : ''}
            </h2>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                    <div class="text-xs opacity-50 uppercase">Rank</div>
                    <div class="text-2xl font-bold text-yellow-400">${rankings.mints?.rank === 'Unranked' ? '—' : `#${rankings.mints?.rank}`}</div>
                    <div class="text-[10px] opacity-40">${rankings.mints?.percentile || ''}</div>
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
                    <div class="text-xs opacity-50 uppercase">Member Since</div>
                    <div class="text-sm font-medium">${profile.firstSeen ? new Date(profile.firstSeen).toLocaleDateString() : '—'}</div>
                </div>
            </div>
        </div>
    `;
}

function renderFunnel(funnel) {
    if (!funnel || funnel.length === 0) {
        return '<div class="text-center py-8 opacity-30">No funnel data yet</div>';
    }

    const maxCount = Math.max(...funnel.map(s => s.count), 1);
    const labels = {
        wallet_connect: '🔗 Connect',
        collection_view: '👁️ View',
        mint_click: '👆 Click',
        tx_sent: '📤 Send',
        mint_success: '✅ Success'
    };

    return funnel.map((step, i) => {
        const width = Math.max((step.count / maxCount) * 100, 8);
        const label = labels[step.step] || step.step;
        const convRate = step.conversionFromPrev ? `${step.conversionFromPrev}%` : '';

        return `
            <div>
                <div class="flex justify-between text-xs mb-1">
                    <span class="opacity-70">${label}</span>
                    <span class="font-mono">${step.count.toLocaleString()} ${i > 0 ? `<span class="opacity-40">(${convRate})</span>` : ''}</span>
                </div>
                <div class="w-full bg-white/5 rounded-full h-3 overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500 ${i === funnel.length - 1 ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}"
                         style="width: ${width}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

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
        const isMe = user.wallet === state.wallet?.address;
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

function renderCollectionStats(collections) {
    if (!collections || collections.length === 0) {
        return '<div class="text-center py-8 opacity-30">No collection data yet</div>';
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

function renderActivityFeed(activity) {
    if (!activity || activity.length === 0) {
        return '<div class="text-center py-8 opacity-30">No activity yet. Be the first to mint!</div>';
    }

    return activity.map(item => {
        const timeAgo = getTimeAgo(item.timestamp);
        return `
            <div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-green-500/20 transition-all">
                <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></div>
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium truncate">${item.collection || 'Unknown'}</div>
                    <div class="text-[11px] opacity-50 font-mono">
                        ${shortenAddress(item.wallet || '')}
                        <span class="mx-1">•</span>
                        ${timeAgo}
                        ${item.price > 0 ? `<span class="mx-1">•</span> ${parseFloat(item.price).toFixed(4)} ETH` : ''}
                    </div>
                </div>
                ${item.txHash ? `
                    <a href="https://basescan.org/tx/${item.txHash}" target="_blank" rel="noopener noreferrer"
                       class="p-1.5 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0">
                        ↗
                    </a>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderJourneyTimeline(userStats) {
    if (!userStats?.journey || userStats.journey.length === 0) return '';

    const journey = userStats.journey;
    const eventIcons = {
        page_view: '👁️',
        collection_view: '📂',
        mint_click: '👆',
        mint_attempt: '⏳',
        tx_sent: '📤',
        mint_success: '✅',
        mint_failure: '❌',
        wallet_connect: '🔗',
        gallery_view: '🖼️',
        click: '👆'
    };

    return `
        <div class="glass-card p-5 rounded-2xl border border-white/10">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                <span class="text-blue-400">🗺️</span> Your Journey
                <span class="text-xs font-normal opacity-40 ml-auto">Last ${journey.length} events</span>
            </h3>
            <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                ${journey.map(event => `
                    <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div class="text-base flex-shrink-0">${eventIcons[event.type] || '📌'}</div>
                        <div class="flex-1 min-w-0">
                            <span class="text-sm font-medium">${event.type.replace(/_/g, ' ')}</span>
                            ${event.collection ? `<span class="text-xs opacity-50 ml-2">${event.collection}</span>` : ''}
                            ${event.page ? `<span class="text-xs opacity-50 ml-2">${event.page}</span>` : ''}
                        </div>
                        <div class="text-[10px] opacity-40 font-mono flex-shrink-0">
                            ${new Date(event.timestamp).toLocaleTimeString()}
                        </div>
                    </div>
                `).join('')}
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
