
import { loadCollections, getCollectionBySlug } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { analytics } from '../utils/analytics.js'; // Keep for session tracking
import { getLeaderboard, getUserStats } from '../lib/api.js';
import { state } from '../state.js';
import { shortenAddress } from '../utils/dom.js';

export async function renderAnalyticsPage(params) {
    const { slug } = params || {};
    const collections = loadCollections();

    // Fetch API data
    const leaderboardData = await getLeaderboard();
    const userStats = state.wallet?.isConnected ? await getUserStats(state.wallet.address) : null;

    const app = document.getElementById('app');

    // Calculate collection specific stats if slug is present, otherwise global
    const totalMints = leaderboardData?.totalMints || 0;
    const recentMints = leaderboardData?.recentMints || [];
    const topUsers = leaderboardData?.topUsers || [];

    const isCollection = !!slug;
    const collectionName = isCollection ? getCollectionBySlug(slug)?.name : 'Global';

    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white p-6 pb-24">
            <header class="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                   <button id="back-home-btn" class="text-indigo-400 mb-2 hover:underline flex items-center gap-2">
                       <span>←</span> Back Home
                   </button>
                   <h1 class="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                       ${collectionName} Analytics
                   </h1>
                </div>
                
                <!-- Filter removed for now as API is global-first, but keeping UI clean -->
            </header>

            <main class="max-w-6xl mx-auto space-y-8">
                
                <!-- User Stats (If Connected) -->
                ${state.wallet?.isConnected ? `
                <div class="glass-card p-6 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 relative overflow-hidden">
                    <div class="absolute top-0 right-0 p-4 opacity-10 text-6xl">👤</div>
                    <h2 class="text-xl font-bold mb-4 flex items-center gap-2">
                        My Stats <span class="text-xs font-normal opacity-60 bg-white/10 px-2 py-0.5 rounded-full">${shortenAddress(state.wallet.address)}</span>
                    </h2>
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <div class="text-xs opacity-60 uppercase">Global Rank</div>
                            <div class="text-3xl font-bold text-yellow-400">#${userStats?.globalRank || '-'}</div>
                        </div>
                        <div>
                            <div class="text-xs opacity-60 uppercase">Total Mints</div>
                            <div class="text-3xl font-bold text-white">${userStats?.totalMints || 0}</div>
                        </div>
                        <!-- Add more user specific stats here if available -->
                    </div>
                </div>
                ` : `
                <div class="glass-card p-6 rounded-2xl border border-white/10 flex justify-between items-center">
                    <div>
                        <h2 class="text-xl font-bold">Connect to see your stats</h2>
                        <p class="opacity-60 text-sm">View your global rank and mint history</p>
                    </div>
                    ${/* Connect button handled globally or user can use header */ ''}
                </div>
                `}

                <!-- Global Stats -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div class="glass-card p-6 rounded-2xl border border-white/10">
                        <div class="text-xs opacity-60 uppercase mb-2">Total Mints Tracked</div>
                        <div class="text-4xl font-bold text-indigo-400">${totalMints.toLocaleString()}</div>
                    </div>
                     <div class="glass-card p-6 rounded-2xl border border-white/10">
                        <div class="text-xs opacity-60 uppercase mb-2">Live Collections</div>
                        <div class="text-4xl font-bold text-white">${collections.filter(c => c.status === 'live').length}</div>
                    </div>
                     <div class="glass-card p-6 rounded-2xl border border-white/10">
                        <div class="text-xs opacity-60 uppercase mb-2">Top Minter</div>
                        <div class="text-4xl font-bold text-green-400">
                            ${topUsers.length > 0 ? topUsers[0].score : 0}
                        </div>
                        <div class="text-xs opacity-50 truncate">${topUsers.length > 0 ? shortenAddress(topUsers[0].member) : '-'}</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- Leaderboard -->
                    <div class="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/10">
                        <h3 class="text-xl font-bold mb-6 flex items-center gap-2">
                             <span class="text-yellow-400">🏆</span> Top Collectors
                        </h3>
                        
                        <div class="overflow-x-auto">
                            <table class="w-full text-left border-collapse">
                                <thead>
                                    <tr class="text-xs uppercase opacity-40 border-b border-white/10">
                                        <th class="py-3 pl-4">Rank</th>
                                        <th class="py-3">Wallet</th>
                                        <th class="py-3 text-right pr-4">Mints</th>
                                    </tr>
                                </thead>
                                <tbody class="text-sm">
                                    ${topUsers.length > 0 ? topUsers.map((user, index) => `
                                        <tr class="border-b border-white/5 hover:bg-white/5 transition-colors">
                                            <td class="py-4 pl-4 font-mono text-indigo-300">#${index + 1}</td>
                                            <td class="py-4 font-mono">
                                                ${shortenAddress(user.member)}
                                                ${user.member === state.wallet?.address ? '<span class="ml-2 text-[10px] bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded">YOU</span>' : ''}
                                            </td>
                                            <td class="py-4 text-right pr-4 font-bold">${user.score}</td>
                                        </tr>
                                    `).join('') : `
                                        <tr>
                                            <td colspan="3" class="text-center py-8 opacity-30">No data available yet</td>
                                        </tr>
                                    `}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Recent Activity -->
                    <div class="glass-card p-6 rounded-2xl border border-white/10">
                        <h3 class="text-lg font-bold mb-4">Recent Mints ⚡</h3>
                        <div class="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                            ${recentMints.length > 0 ? recentMints.map(mint => `
                                <div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                                    <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                    <div class="flex-1 min-w-0">
                                        <div class="text-sm font-bold truncate">${mint.collection || 'Unknown Collection'}</div>
                                        <div class="text-xs opacity-50 font-mono flex items-center gap-1">
                                            by ${shortenAddress(mint.wallet)} 
                                            <span class="text-[10px] opacity-60">• ${new Date(mint.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                    </div>
                                    <a href="https://basescan.org/tx/${mint.txHash}" target="_blank" class="p-2 hover:bg-white/10 rounded-lg opacity-50 hover:opacity-100 transition">
                                        ↗
                                    </a>
                                </div>
                            `).join('') : `
                                <div class="text-center py-10 opacity-30">No recent activity</div>
                            `}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;

    document.getElementById('back-home-btn').onclick = () => router.navigate('/');
}
