
import { loadCollections, getCollectionBySlug } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { analytics } from '../utils/analytics.js';

export function renderAnalyticsPage(params) {
    const { slug } = params || {};
    const collections = loadCollections();
    const stats = analytics.getStats(slug);
    const globalStats = analytics.getStats();
    const timeline = analytics.getTimeline();

    const app = document.getElementById('app');

    // Header section
    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white p-6 pb-24">
            <header class="max-w-6xl mx-auto mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                   <button id="back-home-btn" class="text-indigo-400 mb-2 hover:underline flex items-center gap-2">
                       <span>←</span> Back Home
                   </button>
                   <h1 class="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                       ${slug ? `${getCollectionBySlug(slug)?.name} Analytics` : 'Global Analytics'}
                   </h1>
                </div>
                
                <div class="flex items-center gap-3">
                    <span class="text-sm opacity-50">Filter:</span>
                    <select id="collection-selector" class="glass-card bg-black/40 border border-white/10 rounded-lg px-4 py-2 outline-none focus:border-indigo-500 transition-colors">
                        <option value="">All Collections</option>
                        ${collections.map(c => `
                            <option value="${c.slug}" ${c.slug === slug ? 'selected' : ''}>${c.name}</option>
                        `).join('')}
                    </select>
                </div>
            </header>

            <main class="max-w-6xl mx-auto">
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div class="glass-card p-6 rounded-2xl border border-white/10 relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span class="text-4xl">👁️</span>
                        </div>
                        <h4 class="text-xs uppercase tracking-wider opacity-60 mb-2">Total Views</h4>
                        <div class="text-3xl font-bold text-white">${slug ? stats.views : globalStats.totalViews}</div>
                        <div class="text-[10px] text-indigo-400 mt-2 font-mono">Live Session Data</div>
                    </div>
                    
                    <div class="glass-card p-6 rounded-2xl border border-white/10 relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span class="text-4xl">🚀</span>
                        </div>
                        <h4 class="text-xs uppercase tracking-wider opacity-60 mb-2">Mint Success Rate</h4>
                        <div class="text-3xl font-bold text-green-400">
                            ${(slug ? stats.rate : globalStats.globalRate).toFixed(1)}%
                        </div>
                        <div class="text-[10px] opacity-40 mt-2">
                            ${slug ? `${stats.success} success / ${stats.attempts} attempts` : `${globalStats.totalSuccess} total successful mints`}
                        </div>
                    </div>
                    
                    <div class="glass-card p-6 rounded-2xl border border-white/10 relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span class="text-4xl">⏱️</span>
                        </div>
                        <h4 class="text-xs uppercase tracking-wider opacity-60 mb-2">Recent Activity</h4>
                        <div class="text-3xl font-bold text-white">${timeline.length}</div>
                        <div class="text-[10px] opacity-40 mt-2">Actions tracked this session</div>
                    </div>

                    <div class="glass-card p-6 rounded-2xl border border-white/10 relative overflow-hidden group">
                        <div class="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                            <span class="text-4xl">💎</span>
                        </div>
                        <h4 class="text-xs uppercase tracking-wider opacity-60 mb-2">Engagement</h4>
                        <div class="text-3xl font-bold text-purple-400">
                            ${globalStats.totalViews > 0 ? ((globalStats.totalAttempts / globalStats.totalViews) * 100).toFixed(1) : '0'}%
                        </div>
                        <div class="text-[10px] opacity-40 mt-2">View-to-Mint conversion</div>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- User Journey Timeline -->
                    <div class="lg:col-span-2 glass-card p-6 rounded-2xl border border-white/10">
                        <h3 class="text-xl font-bold mb-6 flex items-center gap-2">
                             <span class="text-indigo-400">🕒</span> User Journey Timeline
                        </h3>
                        
                        <div class="space-y-6 relative before:absolute before:inset-0 before:left-3 before:w-px before:bg-white/5">
                            ${timeline.length > 0 ? timeline.map(event => `
                                <div class="relative pl-8 group">
                                    <div class="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-slate-800 border-2 border-indigo-500 z-10 group-hover:scale-125 transition-transform"></div>
                                    <div class="flex justify-between items-start mb-1">
                                        <div class="font-bold text-sm capitalize">
                                            ${event.action.replace('_', ' ')}
                                        </div>
                                        <div class="text-[10px] opacity-40 font-mono">
                                            ${new Date(event.timestamp).toLocaleTimeString()}
                                        </div>
                                    </div>
                                    <div class="text-xs opacity-60 bg-white/5 p-2 rounded-lg">
                                        ${typeof event.detail === 'object' ?
            `Minted <span class="text-indigo-300 font-bold">${event.detail.slug}</span> (tx: ${event.detail.txHash.slice(0, 10)}...)` :
            `Target: <span class="text-indigo-300 font-bold">${event.detail}</span>`
        }
                                    </div>
                                </div>
                            `).join('') : `
                                <div class="text-center py-10 opacity-30 italic">No activity recorded yet</div>
                            `}
                        </div>
                    </div>

                    <!-- Market Insights -->
                    <div class="space-y-6">
                        <div class="glass-card p-6 rounded-2xl border border-white/10">
                            <h3 class="text-lg font-bold mb-4">Popular Collections</h3>
                            <div class="space-y-4">
                                ${collections.sort((a, b) => (analytics.data.views[b.slug] || 0) - (analytics.data.views[a.slug] || 0)).slice(0, 5).map(c => `
                                    <div class="flex items-center justify-between">
                                        <div class="flex items-center gap-3">
                                            <img src="${c.imageUrl}" class="w-8 h-8 rounded-lg object-cover" />
                                            <span class="text-sm font-medium transition-colors hover:text-indigo-400 cursor-pointer" onclick="window.router.navigate('/mint/${c.slug}')">${c.name}</span>
                                        </div>
                                        <div class="text-xs font-mono opacity-60">${analytics.data.views[c.slug] || 0} views</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="glass-card p-6 rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-500/10 to-transparent">
                            <h3 class="text-lg font-bold mb-2">Optimization Tip 💡</h3>
                            <p class="text-xs opacity-70 leading-relaxed">
                                Your current view-to-mint conversion is <span class="font-bold text-indigo-300">${globalStats.totalViews > 0 ? ((globalStats.totalAttempts / globalStats.totalViews) * 100).toFixed(1) : '0'}%</span>. 
                                Consider adding a countdown timer or "Limited Supply" badge to trending collections to drive more mints.
                            </p>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;

    document.getElementById('back-home-btn').onclick = () => router.navigate('/');
    document.getElementById('collection-selector').onchange = (e) => {
        const val = e.target.value;
        router.navigate(val ? `/analytics/${val}` : '/analytics');
    };
}
