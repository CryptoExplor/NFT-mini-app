
import { loadCollections, getCollectionBySlug } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';

export function renderAnalyticsPage(params) {
    const { slug } = params || {};
    const collections = loadCollections();
    const collection = slug ? getCollectionBySlug(slug) : collections[0];

    if (!collection) {
        router.navigate('/');
        return;
    }

    const app = document.getElementById('app');
    app.innerHTML = `
        <div class="min-h-screen bg-slate-900 text-white p-6">
            <header class="max-w-6xl mx-auto mb-10 flex justify-between items-center">
                <div>
                   <button id="back-home-btn" class="text-indigo-400 mb-2 hover:underline">← Back Home</button>
                   <h1 class="text-4xl font-bold bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                       Collection Analytics
                   </h1>
                </div>
                
                <select id="collection-selector" class="glass-card bg-black/20 border border-white/10 rounded-lg px-4 py-2">
                    ${collections.map(c => `
                        <option value="${c.slug}" ${c.slug === collection.slug ? 'selected' : ''}>${c.name}</option>
                    `).join('')}
                </select>
            </header>

            <main class="max-w-6xl mx-auto">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div class="glass-card p-6 rounded-xl border border-white/10">
                        <h4 class="text-sm opacity-60 mb-2">Total Volume</h4>
                        <div class="text-3xl font-bold">${(Math.random() * 100).toFixed(2)} ETH</div>
                        <div class="text-xs text-green-400 mt-2">↑ 12% this week</div>
                    </div>
                    
                    <div class="glass-card p-6 rounded-xl border border-white/10">
                        <h4 class="text-sm opacity-60 mb-2">Unique Holders</h4>
                        <div class="text-3xl font-bold">${Math.floor(collection.mintPolicy.maxSupply * 0.4)}</div>
                        <div class="text-xs text-indigo-400 mt-2">68% Retention rate</div>
                    </div>
                    
                    <div class="glass-card p-6 rounded-xl border border-white/10">
                        <h4 class="text-sm opacity-60 mb-2">Floor Price</h4>
                        <div class="text-3xl font-bold">${(Math.random() * 0.1).toFixed(4)} ETH</div>
                        <div class="text-xs text-green-400 mt-2">↑ 5.4% last 24h</div>
                    </div>
                </div>

                <div class="glass-card p-8 rounded-2xl border border-white/10 min-h-[400px] flex items-center justify-center">
                    <div class="text-center">
                        <div class="text-6xl mb-4">📊</div>
                        <h3 class="text-xl font-bold mb-2">Minting Activity Chart</h3>
                        <p class="opacity-50">Chart.js visualization would render here in a production environment</p>
                        
                        <div class="mt-8 flex gap-2 justify-center">
                            ${Array.from({ length: 12 }).map(() => `
                                <div class="w-8 bg-indigo-500/20 rounded-t-lg transition-all hover:bg-indigo-500/50" 
                                     style="height: ${Math.floor(Math.random() * 200) + 50}px"></div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    `;

    document.getElementById('back-home-btn').onclick = () => router.navigate('/');
    document.getElementById('collection-selector').onchange = (e) => {
        router.navigate(`/analytics/${e.target.value}`);
    };
}
