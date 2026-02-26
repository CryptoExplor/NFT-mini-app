import { $ } from '../../utils/dom.js';

/**
 * Premium NFT Fighter Selector
 * Full-screen modal with stat previews, passive ability badges,
 * collection filter tabs, and animated card selection.
 */

const STAT_CONFIG = [
    { key: 'hp', label: 'HP', max: 250, color: '#10b981' },
    { key: 'atk', label: 'ATK', max: 50, color: '#ef4444' },
    { key: 'def', label: 'DEF', max: 50, color: '#3b82f6' },
    { key: 'spd', label: 'SPD', max: 50, color: '#f59e0b' },
];

const PASSIVE_META = {
    'GHOST_STEP': { icon: '👻', color: 'text-purple-400 bg-purple-500/15 border-purple-500/20' },
    'IRON_WALL': { icon: '🛡️', color: 'text-blue-400 bg-blue-500/15 border-blue-500/20' },
    'DRAIN': { icon: '🩸', color: 'text-red-400 bg-red-500/15 border-red-500/20' },
    'BERSERKER': { icon: '🔥', color: 'text-orange-400 bg-orange-500/15 border-orange-500/20' },
    'REGEN_BURST': { icon: '💚', color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20' },
};

export class NFTSelectorModal {
    constructor(containerId, onSelected, onClose) {
        this.container = $(`#${containerId}`);
        this.onSelected = onSelected;
        this.onClose = onClose;
        this.inventory = [];
        this.filteredInventory = [];
        this.activeFilter = 'ALL';
    }

    async loadInventory() {
        const { getCurrentAccount, fetchOwnedBattleNFTs } = await import('../../wallet.js');
        const account = getCurrentAccount();

        if (!account?.address) {
            this.container.innerHTML = `
                <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div class="p-8 text-center bg-slate-900 border border-red-500/20 rounded-2xl max-w-sm shadow-2xl">
                        <div class="text-3xl mb-3">🔌</div>
                        <h3 class="text-lg font-bold text-white mb-2">Wallet Not Connected</h3>
                        <p class="text-sm text-slate-400">Connect your wallet to see your fighters.</p>
                    </div>
                </div>
            `;
            setTimeout(() => this.hide(), 2500);
            return;
        }

        // Loading state
        this.container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div class="p-8 text-center bg-slate-900 border border-white/10 rounded-2xl max-w-sm shadow-2xl">
                    <div class="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h3 class="text-lg font-bold text-white mb-1">Scanning Wallet</h3>
                    <p class="text-sm text-slate-400">Looking for battle-ready NFTs...</p>
                </div>
            </div>
        `;

        this.inventory = await fetchOwnedBattleNFTs(account.address);
        this.filteredInventory = [...this.inventory];
        this.render();
    }

    getCollections() {
        const collections = new Set(this.inventory.map(n => n.collectionName));
        return ['ALL', ...collections];
    }

    filterByCollection(collection) {
        this.activeFilter = collection;
        this.filteredInventory = collection === 'ALL'
            ? [...this.inventory]
            : this.inventory.filter(n => n.collectionName === collection);
        this.renderGrid();
    }

    render() {
        const collections = this.getCollections();
        const total = this.inventory.length;

        this.container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div class="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

                    <!-- Header -->
                    <div class="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-indigo-950/40 to-transparent">
                        <div>
                            <h2 class="text-xl font-bold text-white">Choose Your Fighter</h2>
                            <p class="text-xs text-slate-400 mt-0.5">${total} NFT${total !== 1 ? 's' : ''} ready for battle</p>
                        </div>
                        <button id="close-selector-btn" class="p-2 hover:bg-white/10 rounded-xl transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <!-- Collection Filter Tabs -->
                    ${collections.length > 2 ? `
                    <div class="px-5 pt-3 pb-2 flex gap-2 overflow-x-auto no-scrollbar border-b border-white/5">
                        ${collections.map(c => `
                            <button data-filter="${c}"
                                class="collection-filter px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all
                                ${c === this.activeFilter
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10'
            }">
                                ${c === 'ALL' ? `All (${total})` : c}
                            </button>
                        `).join('')}
                    </div>
                    ` : ''}

                    <!-- NFT Grid -->
                    <div class="p-4 overflow-y-auto flex-1" id="nft-inventory-grid">
                        ${this.renderGridContent()}
                    </div>
                </div>
            </div>
        `;

        // Bind close
        $('#close-selector-btn').addEventListener('click', () => this.hide());

        // Bind filters
        this.container.querySelectorAll('.collection-filter').forEach(btn => {
            btn.addEventListener('click', () => this.filterByCollection(btn.dataset.filter));
        });

        // Bind card clicks
        this.bindCardEvents();
    }

    renderGrid() {
        const grid = $('#nft-inventory-grid');
        if (grid) {
            grid.innerHTML = this.renderGridContent();
            this.bindCardEvents();
        }

        // Update filter button styles
        this.container.querySelectorAll('.collection-filter').forEach(btn => {
            const isActive = btn.dataset.filter === this.activeFilter;
            btn.className = `collection-filter px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${isActive
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-white/5 text-slate-400 border border-transparent hover:bg-white/10'
                }`;
        });
    }

    renderGridContent() {
        if (this.filteredInventory.length === 0) {
            return `
                <div class="text-center py-12">
                    <div class="text-4xl mb-3">🔍</div>
                    <h3 class="text-lg font-bold text-white mb-1">${this.activeFilter === 'ALL' ? 'No Battle NFTs Found' : `No ${this.activeFilter} NFTs`}</h3>
                    <p class="text-sm text-slate-400">${this.activeFilter === 'ALL' ? 'Mint or buy a supported NFT to battle.' : 'Try selecting a different collection.'}</p>
                </div>
            `;
        }

        return `
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                ${this.filteredInventory.map((nft, idx) => this.renderNFTCard(nft, idx)).join('')}
            </div>
        `;
    }

    renderNFTCard(nft, index) {
        const stats = nft.stats || {};
        const passive = nft.passive || nft.stats?.passive;
        const passiveMeta = passive ? PASSIVE_META[passive] : null;
        const delay = index * 0.05;

        const imageElement = nft.imageUrl
            ? `<img src="${nft.imageUrl}" alt="${nft.collectionName} #${nft.nftId}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />`
            : `<div class="w-full h-full flex items-center justify-center text-2xl font-black text-indigo-400/40 group-hover:scale-105 transition-transform">NFT</div>`;

        return `
            <div id="select-nft-${nft.id}"
                 class="group rounded-2xl border border-white/10 bg-white/[0.03] overflow-hidden cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-900/10 transition-all duration-200 active:scale-[0.97] animate-fade-in"
                 style="animation-delay: ${delay}s">

                <!-- Image -->
                <div class="h-28 sm:h-32 bg-slate-800/50 relative overflow-hidden">
                    ${imageElement}
                    ${passiveMeta ? `
                        <div class="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded-md border ${passiveMeta.color} backdrop-blur-sm">
                            ${passiveMeta.icon}
                        </div>
                    ` : ''}
                </div>

                <!-- Info -->
                <div class="p-3">
                    <div class="font-bold text-sm truncate text-white/90">${nft.collectionName}</div>
                    <div class="text-xs text-slate-500 mb-2">#${nft.nftId}</div>

                    <!-- Trait -->
                    ${nft.trait ? `<div class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider mb-2">${nft.trait}</div>` : ''}

                    <!-- Mini Stat Bars -->
                    <div class="space-y-1">
                        ${STAT_CONFIG.map(s => {
            const val = stats[s.key] || 0;
            const pct = Math.min(100, Math.max(5, (val / s.max) * 100));
            return `
                                <div class="flex items-center gap-1.5">
                                    <span class="text-[8px] w-6 text-right text-slate-500">${s.label}</span>
                                    <div class="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                                        <div class="h-full rounded-full" style="width: ${pct}%; background: ${s.color}"></div>
                                    </div>
                                    <span class="text-[9px] w-4 text-right font-mono text-slate-400">${val}</span>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    bindCardEvents() {
        this.filteredInventory.forEach(nft => {
            const btn = $(`#select-nft-${nft.id}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.onSelected(nft);
                    this.hide();
                });
            }
        });
    }

    show() {
        this.container.classList.remove('hidden');
        this.loadInventory();
    }

    hide() {
        this.container.classList.add('hidden');
        this.container.innerHTML = '';
        this.onClose();
    }
}
