import { $ } from '../../utils/dom.js';
import { renderIcon } from '../../utils/icons.js';

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
    'GHOST_STEP': { icon: renderIcon('GHOST', 'w-4 h-4'), color: 'text-purple-400 bg-purple-500/15 border-purple-500/20' },
    'IRON_WALL': { icon: renderIcon('SHIELD', 'w-4 h-4'), color: 'text-blue-400 bg-blue-500/15 border-blue-500/20' },
    'DRAIN': { icon: renderIcon('DRAIN', 'w-4 h-4'), color: 'text-red-400 bg-red-500/15 border-red-500/20' },
    'BERSERKER': { icon: renderIcon('FLAME', 'w-4 h-4'), color: 'text-orange-400 bg-orange-500/15 border-orange-500/20' },
    'REGEN_BURST': { icon: renderIcon('HEART', 'w-4 h-4'), color: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/20' },
};

export class NFTSelectorModal {
    constructor(containerId, onSelected, onClose) {
        this.container = $(`#${containerId}`);
        this.onSelected = onSelected; // Now expects BattleLoadoutV1
        this.onClose = onClose;
        this.inventory = [];
        this.activeTab = 'FIGHTER'; // FIGHTER | ITEM_BUFF | ENVIRONMENT
        this.filters = {
            search: '',
            sortBy: 'default' // default, hp, atk, def, spd
        };

        this.loadout = {
            fighter: null,
            item: null,
            arena: null,
            teamSnapshot: [],
            schemaVersion: 'battle-loadout-v1'
        };
    }

    async loadInventory() {
        const { getCurrentAccount } = await import('../../wallet.js');
        const { fetchOwnedBattleNFTs } = await import('../../lib/nftInventory.js');
        const account = getCurrentAccount();

        if (!account?.address) {
            console.log('[Inventory] Entering Guest Mode: Loading Trial Armory');
            this.inventory = this.getTrialInventory();
            this.isGuestMode = true;
        } else {
            this.showLoading('Scanning Armory', 'Scanning fighters, items, and arenas...');
            this.inventory = await fetchOwnedBattleNFTs(account.address);
            this.isGuestMode = false;
        }

        // V2: Build team synergy snapshot from top-20 eligible NFTs
        this.loadout.teamSnapshot = this.inventory.slice(0, 20);

        this.render();
    }

    getTrialInventory() {
        return [
            {
                id: 'trial_bg_1',
                role: 'FIGHTER',
                collectionName: 'Base Gods (Trial)',
                nftId: '0',
                imageUrl: '', // Placeholder
                trait: 'Zeus',
                stats: { hp: 110, atk: 22, def: 18, spd: 14 },
                passive: 'DIVINE'
            },
            {
                id: 'trial_void_1',
                role: 'FIGHTER',
                collectionName: 'VoidPFP (Trial)',
                nftId: '1337',
                imageUrl: '',
                trait: 'Void',
                stats: { hp: 100, atk: 18, def: 15, spd: 22 },
                passive: 'GHOST_STEP'
            },
            {
                id: 'trial_item_1',
                role: 'ITEM_BUFF',
                collectionName: 'Lightning Bolt',
                nftId: 'T1',
                imageUrl: '',
                stats: { atk: 5, spd: 3 }
            },
            {
                id: 'trial_arena_1',
                role: 'ENVIRONMENT',
                collectionName: 'Mount Olympus',
                nftId: 'E1',
                imageUrl: '',
                stats: { hp: 10, def: 5 },
                trait: 'Celestial'
            }
        ];
    }

    showError(title, msg) {
        this.container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div class="p-8 text-center bg-slate-900 border border-red-500/20 rounded-2xl max-w-sm shadow-2xl">
                    <div class="text-3xl mb-3 text-red-500">${renderIcon('PLUG', 'w-10 h-10 mx-auto')}</div>
                    <h3 class="text-lg font-bold text-white mb-2">${title}</h3>
                    <p class="text-sm text-slate-400">${msg}</p>
                </div>
            </div>
        `;
        setTimeout(() => this.hide(), 2500);
    }

    showLoading(title, msg) {
        this.container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div class="p-8 text-center bg-slate-900 border border-white/10 rounded-2xl max-w-sm shadow-2xl">
                    <div class="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <h3 class="text-lg font-bold text-white mb-1">${title}</h3>
                    <p class="text-sm text-slate-400">${msg}</p>
                </div>
            </div>
        `;
    }

    setTab(role) {
        // V2: All tabs active (FIGHTER, ITEM_BUFF, ENVIRONMENT)
        this.activeTab = role;
        this.render();
    }

    selectItem(nft) {
        if (nft.role === 'FIGHTER') this.loadout.fighter = nft;
        if (nft.role === 'ITEM_BUFF') {
            // Toggle off if clicking already selected
            if (this.loadout.item?.id === nft.id) this.loadout.item = null;
            else this.loadout.item = nft;
        }
        if (nft.role === 'ENVIRONMENT') {
            if (this.loadout.arena?.id === nft.id) this.loadout.arena = null;
            else this.loadout.arena = nft;
        }
        this.render();
    }

    getFilteredInventory() {
        let items = this.inventory.filter(n => n.role === this.activeTab);
        
        // V2: If no real NFTs found for this category, inject trial items so the UI isn't dead
        if (items.length === 0) {
            items = this.getTrialInventory().filter(n => n.role === this.activeTab);
        }

        // Apply Search
        if (this.filters.search) {
            const query = this.filters.search.toLowerCase();
            items = items.filter(n => 
                (n.collectionName || '').toLowerCase().includes(query) ||
                (n.nftId || '').toLowerCase().includes(query) ||
                (n.trait || '').toLowerCase().includes(query)
            );
        }

        // Apply Sort
        if (this.filters.sortBy !== 'default') {
            const key = this.filters.sortBy;
            items.sort((a, b) => {
                const valA = (a.stats && a.stats[key]) || 0;
                const valB = (b.stats && b.stats[key]) || 0;
                return valB - valA; // Descending
            });
        }
        
        return items;
    }

    render() {
        const items = this.getFilteredInventory();
        const canSubmit = !!this.loadout.fighter;

        this.container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm">
                <div class="bg-slate-900 border border-indigo-500/30 rounded-3xl w-full max-w-4xl max-h-[95vh] flex flex-col overflow-hidden shadow-2xl relative">
                    
                    <!-- Decorative background -->
                    <div class="absolute inset-0 bg-gradient-to-b from-indigo-900/10 to-transparent pointer-events-none"></div>

                    <!-- Header -->
                    <div class="relative p-4 sm:p-6 border-b border-white/10 flex items-center justify-between z-10">
                        <div>
                            <h2 class="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                                Build Your Loadout
                            </h2>
                            <p class="text-xs sm:text-sm text-slate-400 mt-1">Combine Fighter + Item + Arena for maximum synergy.</p>
                        </div>
                        <button id="close-selector-btn" class="p-2 hover:bg-white/10 rounded-xl transition-colors text-white/50 hover:text-white">
                            ${renderIcon('CLOSE', 'w-6 h-6')}
                        </button>
                    </div>

                    ${this.isGuestMode ? `
                        <div class="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20 text-center flex items-center justify-center gap-2">
                            <span class="text-indigo-400 opacity-60">${renderIcon('STAR', 'w-3 h-3')}</span>
                            <span class="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">TRIAL MODE ACTIVE — Connect Wallet for full profile</span>
                            <span class="text-indigo-400 opacity-60">${renderIcon('STAR', 'w-3 h-3')}</span>
                        </div>
                    ` : ''}

                    <!-- Slot Navigation (Fighter, Item Buff, Arena) - SMALLER -->
                    <div class="px-4 sm:px-6 py-3 bg-black/30 border-b border-white/5 flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar z-10 flex-shrink-0">
                        ${this.renderPreviewSlot('FIGHTER', 'Fighter', this.loadout.fighter, 'Req.')}
                        ${this.renderPreviewSlot('ITEM_BUFF', 'Item', this.loadout.item, 'Opt.')}
                        ${this.renderPreviewSlot('ENVIRONMENT', 'Arena', this.loadout.arena, 'Opt.')}
                    </div>

                    <!-- Filter Controls -->
                    <div class="px-4 sm:px-6 py-2 bg-black/20 border-b border-white/5 flex items-center gap-2 sm:gap-4 z-10 flex-shrink-0">
                        <div class="flex-1 relative">
                            <input type="text" id="inventory-search" placeholder="Search collection..." 
                                   value="${this.filters.search}"
                                   class="w-full bg-white/5 border border-white/10 rounded-lg py-2 pl-8 pr-4 text-xs text-white focus:border-indigo-500 outline-none transition-all" />
                            <div class="absolute left-2.5 top-2.5 text-white/30">
                                ${renderIcon('SEARCH', 'w-3.5 h-3.5')}
                            </div>
                        </div>
                        <select id="inventory-sort" class="bg-slate-800 border border-white/10 rounded-lg py-2 px-3 text-xs text-slate-200 focus:border-indigo-500 outline-none transition-all cursor-pointer appearance-none pr-8 relative">
                            <option value="default" class="bg-slate-900 text-white" ${this.filters.sortBy === 'default' ? 'selected' : ''}>Sort: Default</option>
                            <option value="hp" class="bg-slate-900 text-white" ${this.filters.sortBy === 'hp' ? 'selected' : ''}>Sort: HP</option>
                            <option value="atk" class="bg-slate-900 text-white" ${this.filters.sortBy === 'atk' ? 'selected' : ''}>Sort: ATK</option>
                            <option value="def" class="bg-slate-900 text-white" ${this.filters.sortBy === 'def' ? 'selected' : ''}>Sort: DEF</option>
                            <option value="spd" class="bg-slate-900 text-white" ${this.filters.sortBy === 'spd' ? 'selected' : ''}>Sort: SPD</option>
                        </select>
                    </div>

                    <!-- Grid -->
                    <div class="p-4 sm:p-6 overflow-y-auto flex-1 z-10 custom-scrollbar">
                        ${this.renderGrid(items)}
                    </div>

                    <!-- Footer -->
                    <div class="p-4 border-t border-white/10 bg-black/50 flex justify-end z-10">
                        <button id="confirm-loadout-btn" 
                                ${!canSubmit ? 'disabled' : ''}
                                class="px-6 py-3 rounded-xl font-bold transition-all
                                ${canSubmit
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/25 scale-100 hover:scale-105 active:scale-95'
                : 'bg-white/5 text-white/30 cursor-not-allowed'}">
                            ${canSubmit ? 'CONFIRM LOADOUT' : 'SELECT A FIGHTER'}
                        </button>
                    </div>

                </div>
            </div>
        `;

        this.bindEvents();
    }

    renderTabBtn(role, label) {
        const isActive = this.activeTab === role;
        return `
            <button data-tab="${role}" class="loadout-tab px-4 py-2 border-b-2 font-bold text-sm transition-all
                ${isActive ? 'border-indigo-400 text-indigo-300' : 'border-transparent text-slate-500 hover:text-slate-300'}">
                ${label}
            </button>
        `;
    }

    renderPreviewSlot(role, label, entity, hint) {
        const isActive = this.activeTab === role;
        const borderClass = isActive ? 'border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'border-white/10';

        if (!entity) {
            return `
                <div data-tab="${role}" class="loadout-tab flex-1 min-w-[80px] max-w-[120px] min-h-[56px] rounded-lg border-2 border-dashed ${borderClass} flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 transition-colors bg-white/[0.02]">
                    <span class="text-[10px] font-bold text-slate-500">${label}</span>
                    <span class="text-[8px] text-slate-600">${hint}</span>
                </div>
            `;
        }

        return `
            <div data-tab="${role}" class="loadout-tab flex-1 min-w-[80px] max-w-[120px] min-h-[56px] rounded-lg border-2 ${borderClass} bg-indigo-900/30 overflow-hidden relative cursor-pointer group flex items-center gap-1.5 p-1.5">
                <img src="${entity.imageUrl}" class="w-8 h-8 sm:w-10 sm:h-10 rounded-md object-cover border border-white/10" />
                <div class="flex-1 min-w-0">
                    <div class="text-[9px] text-indigo-400 font-bold uppercase leading-none mb-0.5">${label}</div>
                    <div class="text-[10px] text-white truncate font-medium leading-none">#${entity.nftId}</div>
                </div>
            </div>
        `;
    }

    renderGrid(items) {
        if (items.length === 0) {
            const labelMap = { 'FIGHTER': 'Fighters', 'ITEM_BUFF': 'Items', 'ENVIRONMENT': 'Arenas' };
            const friendlyLabel = labelMap[this.activeTab] || this.activeTab;

            return `
                <div class="text-center py-12">
                    <div class="text-slate-500 mb-3 opacity-30">${renderIcon('BOX', 'w-14 h-14 mx-auto')}</div>
                    <h3 class="text-lg font-bold text-slate-300 mb-1">No ${friendlyLabel} Found</h3>
                    <p class="text-sm text-slate-500">Try clearing filters or checking other categories.</p>
                </div>
            `;
        }
        return `
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                ${items.map(nft => this.renderCard(nft)).join('')}
            </div>
        `;
    }

    renderCard(nft) {
        const stats = nft.stats || {};
        const passive = nft.passive;
        const passiveMeta = passive ? PASSIVE_META[passive] : null;

        const isFighter = nft.role === 'FIGHTER';

        // Is selected?
        let isSelected = false;
        if (isFighter) isSelected = this.loadout.fighter?.id === nft.id;
        else if (nft.role === 'ITEM_BUFF') isSelected = this.loadout.item?.id === nft.id;
        else if (nft.role === 'ENVIRONMENT') isSelected = this.loadout.arena?.id === nft.id;

        const borderClass = isSelected ? 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)] bg-emerald-900/20' : 'border-white/10 bg-white/[0.03] hover:border-indigo-400/50 hover:bg-indigo-900/20';

        const imageElement = nft.imageUrl
            ? `<img src="${nft.imageUrl}" alt="${nft.collectionName}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />`
            : `<div class="w-full h-full flex items-center justify-center text-xl font-black text-white/20">NFT</div>`;

        return `
            <div data-nft-id="${nft.id}"
                 class="nft-card group rounded-2xl border-2 ${borderClass} overflow-hidden cursor-pointer transition-all duration-200 active:scale-95 flex flex-col">
                
                <!-- Image -->
                <div class="h-32 bg-slate-800/50 relative overflow-hidden">
                    ${imageElement}
                    ${passiveMeta ? `
                        <div class="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 rounded border ${passiveMeta.color} backdrop-blur-sm shadow-black/50 shadow-sm font-bold">
                            ${passiveMeta.icon} ${passiveMeta.name || passive}
                        </div>
                    ` : ''}
                    ${isSelected ? `
                        <div class="absolute top-2 left-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white/20">
                            ${renderIcon('CHECKMARK', 'h-4 w-4 text-white')}
                        </div>
                    ` : ''}
                </div>

                <!-- Info -->
                <div class="p-3 flex-1 flex flex-col">
                    <div class="font-bold text-sm truncate text-white/90">${nft.collectionName}</div>
                    <div class="text-xs text-slate-500 mb-2">#${nft.nftId}</div>

                    ${nft.trait ? `<div class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider mb-2">${nft.trait}</div>` : ''}

                    ${isFighter ? this.renderFighterStats(stats) : this.renderModifierStats(stats)}
                </div>
            </div>
        `;
    }

    renderFighterStats(stats) {
        return `
            <div class="mt-auto space-y-1">
                ${STAT_CONFIG.map(s => {
            const val = stats[s.key] || 0;
            const pct = Math.min(100, Math.max(5, (val / s.max) * 100));
            return `
                        <div class="flex items-center gap-1.5">
                            <span class="text-[9px] w-6 text-right text-slate-500 font-bold">${s.label}</span>
                            <div class="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
                                <div class="h-full rounded-full" style="width: ${pct}%; background: ${s.color}"></div>
                            </div>
                            <span class="text-[10px] w-5 text-right font-mono text-slate-300">${val}</span>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    }

    renderModifierStats(stats) {
        // Find which stats are non-zero to show as buffs
        const buffs = [];
        if (stats.hp) buffs.push({ label: 'HP', val: stats.hp, color: 'text-emerald-400' });
        if (stats.atk) buffs.push({ label: 'ATK', val: stats.atk, color: 'text-red-400' });
        if (stats.def) buffs.push({ label: 'DEF', val: stats.def, color: 'text-blue-400' });
        if (stats.spd) buffs.push({ label: 'SPD', val: stats.spd, color: 'text-amber-400' });

        if (buffs.length === 0) {
            return `<div class="mt-auto text-xs text-slate-500 italic text-center py-2">Unique Passive</div>`;
        }

        return `
            <div class="mt-auto flex flex-wrap gap-1">
                ${buffs.map(b => `
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/5 border border-white/10 ${b.color}">
                        +${b.val} ${b.label}
                    </span>
                `).join('')}
            </div>
        `;
    }

    bindEvents() {
        $('#close-selector-btn')?.addEventListener('click', () => this.hide());

        this.container.querySelectorAll('.loadout-tab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const role = e.currentTarget.dataset.tab;
                if (role) this.setTab(role);
            });
        });

        this.container.querySelectorAll('.nft-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.nftId;
                const nft = this.inventory.find(n => n.id === id);
                if (nft) this.selectItem(nft);
            });
        });

        $('#confirm-loadout-btn')?.addEventListener('click', () => {
            if (this.loadout.fighter) {
                // Return the whole V2 Loadout Object
                this.onSelected(this.loadout);
                this.hide();
            }
        });

        // Search & Sort Events
        const searchInput = $('#inventory-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.render();
                // Refocus search after render
                $('#inventory-search')?.focus();
                const val = $('#inventory-search')?.value;
                $('#inventory-search')?.setSelectionRange(val.length, val.length);
            });
        }

        const sortSelect = $('#inventory-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.filters.sortBy = e.target.value;
                this.render();
            });
        }
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
