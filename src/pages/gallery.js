/**
 * NFT Gallery Page — OpenSea-style full page gallery
 * Fetches NFTs via OpenSea API, displays grid with filters, search, and detail modal
 */

import { state, EVENTS } from '../state.js';
import { connectWallet, disconnectWallet, wagmiAdapter } from '../wallet.js';
import { router } from '../lib/router.js';
import { fetchNFTsByWallet, extractCollections } from '../lib/opensea.js';
import { showNFTDetailModal } from '../components/NFTDetailModal.js';
import { applyMiniAppAvatar, getWalletIdentityLabel } from '../utils/profile.js';
import { getBalance } from '@wagmi/core';
import { toast } from '../utils/toast.js';

import { trackEvent } from '../lib/api.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';

// HTML escape to prevent XSS from NFT metadata
function esc(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// State
let allNFTs = [];
let filteredNFTs = [];
let collections = [];
let selectedCollection = null;
let searchQuery = '';
let nextCursor = null;
let isLoading = false;
let walletHandler = null;
let scrollHandler = null;
let delegatedClickHandler = null;

/**
 * Render the gallery page
 */
export async function renderGalleryPage() {

    trackEvent('gallery_view', { wallet: state.wallet?.address || null });

    const app = document.getElementById('app');
    app.innerHTML = buildGalleryHTML();

    attachGalleryEvents();
    updateGalleryHeader(state.wallet);

    // Load NFTs if wallet connected
    if (state.wallet?.isConnected && state.wallet?.address) {
        await loadNFTs(true);
        loadBalance();
    }
}

/**
 * Build the gallery page HTML
 */
function buildGalleryHTML() {
    const isConnected = state.wallet?.isConnected;

    return `
    <div class="min-h-screen bg-slate-900 app-text font-sans">
        <!-- Header -->
        <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
            <div class="max-w-7xl mx-auto flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <button id="gallery-back-btn" class="p-2 hover:bg-white/10 rounded-lg transition-colors" aria-label="Back">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/>
                        </svg>
                    </button>
                    <h1 class="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">My NFTs</h1>
                    <div id="gallery-nft-count" class="text-xs opacity-50 font-mono"></div>
                </div>
                <div class="flex items-center space-x-3">
                    <!-- Balance -->
                    <div id="gallery-balance" class="${isConnected ? 'flex' : 'hidden'} flex-col items-end">
                        <div class="text-xs opacity-60">Balance</div>
                        <div class="font-mono font-bold text-sm text-indigo-300 gallery-balance-value">Loading...</div>
                    </div>
                    ${renderThemeToggleButton('theme-toggle-gallery')}
                    <!-- Connect -->
                    <button id="gallery-connect-btn" class="glass-card px-4 py-2 rounded-full flex items-center space-x-2 hover:scale-105 transition-transform text-sm font-medium">
                        <div class="status-glow" style="background: ${isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${isConnected ? '#10B981' : '#EF4444'};"></div>
                        <img id="gallery-connect-avatar" class="w-5 h-5 rounded-full object-cover hidden" alt="Profile avatar">
                        <span>${getWalletIdentityLabel(state.wallet)}</span>
                    </button>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <div class="pt-20 flex max-w-7xl mx-auto">
            <!-- Sidebar (desktop) -->
            <aside id="gallery-sidebar" class="gallery-sidebar hidden lg:block w-64 shrink-0 p-4 sticky top-20 h-[calc(100vh-5rem)] overflow-y-auto custom-scrollbar">
                <!-- Collections Filter -->
                <div class="mb-6">
                    <h3 class="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Collections</h3>
                    <input id="collection-search" type="text" placeholder="Search collections..."
                        class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors mb-3" />
                    <div id="collection-list" class="space-y-1">
                        <div class="text-xs opacity-30 py-4 text-center">Connect wallet to see collections</div>
                    </div>
                </div>
            </aside>

            <!-- Grid Section -->
            <main class="flex-1 p-4 pb-20 min-w-0">
                <!-- Top Bar: Search + View Toggle + Mobile Filter -->
                <div class="flex flex-wrap gap-3 items-center mb-6">
                    <div class="relative flex-1 min-w-[200px]">
                        <input type="text" id="gallery-search" placeholder="Search NFTs by name..."
                            class="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2.5 pl-10 focus:outline-none focus:border-indigo-500/50 transition-colors text-sm" />
                        <span class="absolute left-3 top-2.5 opacity-50 text-sm">🔍</span>
                    </div>

                    <!-- Mobile filter toggle -->
                    <button id="mobile-filter-btn" class="lg:hidden glass-card px-3 py-2.5 rounded-lg flex items-center space-x-2 hover:bg-white/10 transition-colors text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"/>
                        </svg>
                        <span>Filters</span>
                    </button>

                    <!-- Grid size toggle -->
                    <div class="hidden sm:flex glass-card rounded-lg overflow-hidden">
                        <button data-grid="large" class="gallery-grid-toggle px-3 py-2.5 hover:bg-white/10 transition-colors bg-white/10" title="Large grid">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z"/>
                            </svg>
                        </button>
                        <button data-grid="small" class="gallery-grid-toggle px-3 py-2.5 hover:bg-white/10 transition-colors" title="Small grid">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h1.5a.75.75 0 0 1 0 1.5H6a.75.75 0 0 0-.75.75v1.5a.75.75 0 0 1-1.5 0V6ZM3.75 15.75A2.25 2.25 0 0 0 6 18h1.5a.75.75 0 0 0 0-1.5H6a.75.75 0 0 1-.75-.75v-1.5a.75.75 0 0 0-1.5 0v1.5ZM15.75 3.75a.75.75 0 0 0 0 1.5H18a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 0 1.5 0V6A2.25 2.25 0 0 0 18 3.75h-2.25ZM18 16.5h-2.25a.75.75 0 0 0 0 1.5H18a2.25 2.25 0 0 0 2.25-2.25v-1.5a.75.75 0 0 0-1.5 0v1.5a.75.75 0 0 1-.75.75Z"/>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Active Filters -->
                <div id="active-filters" class="hidden mb-4 flex-wrap gap-2"></div>

                <!-- NFT Grid -->
                <div id="gallery-grid" class="gallery-grid gallery-grid-large">
                    ${!isConnected ? buildEmptyState('connect') : buildLoadingSkeletons(12)}
                </div>

                <!-- Load More -->
                <div id="gallery-load-more" class="hidden text-center py-8">
                    <button id="load-more-btn" class="glass-card px-8 py-3 rounded-xl font-medium hover:bg-white/10 transition-colors">
                        Load More
                    </button>
                </div>
            </main>
        </div>

        <!-- Mobile Filter Drawer -->
        <div id="mobile-filter-drawer" class="fixed inset-0 z-50 hidden">
            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" id="mobile-filter-backdrop"></div>
            <div class="absolute left-0 top-0 bottom-0 w-80 max-w-[85vw] bg-[#0f172a] border-r border-white/10 p-6 transform -translate-x-full transition-transform duration-300" id="mobile-filter-content">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-lg font-bold">Filters</h2>
                    <button id="close-filter-btn" class="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                </div>
                <div class="mb-6">
                    <h3 class="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Collections</h3>
                    <input id="mobile-collection-search" type="text" placeholder="Search collections..."
                        class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50 transition-colors mb-3" />
                    <div id="mobile-collection-list" class="space-y-1 max-h-[60vh] overflow-y-auto custom-scrollbar"></div>
                </div>
            </div>
        </div>

        ${renderBottomNav('gallery')}
    </div>
    `;
}

// ============================================
// NFT LOADING
// ============================================

async function loadNFTs(fresh = false) {
    if (isLoading) return;
    if (!state.wallet?.isConnected || !state.wallet?.address) return;

    isLoading = true;
    const grid = document.getElementById('gallery-grid');

    if (fresh) {
        allNFTs = [];
        filteredNFTs = [];
        collections = [];
        selectedCollection = null;
        searchQuery = '';
        nextCursor = null;
        if (grid) grid.innerHTML = buildLoadingSkeletons(12);
    }

    try {
        const result = await fetchNFTsByWallet(state.wallet.address, {
            chain: 'base',
            limit: 50,
            next: nextCursor,
            collection: null // Fetch all, filter client-side
        });

        allNFTs = fresh ? result.nfts : [...allNFTs, ...result.nfts];
        nextCursor = result.next;

        // Extract collections from all loaded NFTs
        collections = extractCollections(allNFTs);
        renderCollectionSidebar();

        // Apply filters
        applyFilters();

        // Update count
        const countEl = document.getElementById('gallery-nft-count');
        if (countEl) countEl.textContent = `${allNFTs.length} items`;

        // Show/hide load more
        const loadMoreSection = document.getElementById('gallery-load-more');
        if (loadMoreSection) {
            loadMoreSection.classList.toggle('hidden', !nextCursor);
        }
    } catch (err) {
        console.error('Failed to load NFTs:', err);
        if (grid && fresh) {
            grid.innerHTML = buildEmptyState('error');
        }
        toast.show('Failed to load NFTs. Check your API key.', 'error');
    } finally {
        isLoading = false;
    }
}

async function loadBalance() {
    const balEl = document.querySelector('.gallery-balance-value');
    const balContainer = document.getElementById('gallery-balance');
    if (!balEl || !balContainer) return;

    if (!state.wallet?.isConnected) {
        balContainer.classList.add('hidden');
        return;
    }

    balContainer.classList.remove('hidden');
    balContainer.classList.add('flex');
    balEl.textContent = 'Loading...';

    try {
        const balance = await getBalance(wagmiAdapter.wagmiConfig, {
            address: state.wallet.address,
            chainId: state.wallet.chainId || 8453
        });
        if (!state.wallet?.isConnected) { balContainer.classList.add('hidden'); return; }
        const eth = Number(balance.value) / 1e18;
        balEl.textContent = `${eth.toFixed(4)} ETH`;
    } catch (e) {
        balEl.textContent = 'Error';
    }
}

// ============================================
// FILTERING & SEARCH
// ============================================

function applyFilters() {
    filteredNFTs = allNFTs.filter(nft => {
        // Collection filter
        if (selectedCollection && nft.collection !== selectedCollection) return false;
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            const nameMatch = (nft.name || '').toLowerCase().includes(q);
            const collMatch = (nft.collection || '').toLowerCase().includes(q);
            const idMatch = (nft.identifier || '').toString().includes(q);
            if (!nameMatch && !collMatch && !idMatch) return false;
        }
        return true;
    });

    renderNFTGrid();
    renderActiveFilters();
}

function renderActiveFilters() {
    const container = document.getElementById('active-filters');
    if (!container) return;

    const chips = [];
    if (selectedCollection) {
        chips.push(`
            <button class="filter-chip filter-chip-active" data-clear="collection">
                📁 ${selectedCollection} <span class="ml-1 opacity-60">✕</span>
            </button>
        `);
    }
    if (searchQuery) {
        chips.push(`
            <button class="filter-chip filter-chip-active" data-clear="search">
                🔍 "${searchQuery}" <span class="ml-1 opacity-60">✕</span>
            </button>
        `);
    }

    if (chips.length > 0) {
        container.innerHTML = chips.join('');
        container.classList.remove('hidden');
        container.classList.add('flex');

        container.querySelectorAll('[data-clear]').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.clear;
                if (type === 'collection') {
                    selectedCollection = null;
                    // Deselect in sidebar
                    document.querySelectorAll('.collection-item').forEach(el => el.classList.remove('bg-white/10'));
                }
                if (type === 'search') {
                    searchQuery = '';
                    const searchInput = document.getElementById('gallery-search');
                    if (searchInput) searchInput.value = '';
                }
                applyFilters();
            });
        });
    } else {
        container.classList.add('hidden');
    }
}

// ============================================
// RENDERING
// ============================================

function renderNFTGrid() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    if (filteredNFTs.length === 0) {
        grid.innerHTML = allNFTs.length > 0
            ? buildEmptyState('no-results')
            : buildEmptyState('no-nfts');
        return;
    }

    grid.innerHTML = filteredNFTs.map((nft, i) => buildNFTCard(nft, i)).join('');

    // Attach click listeners
    grid.querySelectorAll('.nft-card').forEach(card => {
        card.addEventListener('click', () => {
            const idx = parseInt(card.dataset.index, 10);
            const nft = filteredNFTs[idx];
            if (nft) showNFTDetailModal(nft, 'base');
        });
    });
}

function buildNFTCard(nft, index) {
    const displayName = esc(nft.name || `#${nft.identifier}`);
    const collectionName = esc((nft.collection || '').replace(/-/g, ' '));
    const safeId = esc(nft.identifier);

    return `
        <div class="nft-card glass-card rounded-xl overflow-hidden cursor-pointer group" data-index="${index}">
            <div class="nft-card-image aspect-square overflow-hidden relative bg-black/30">
                ${nft.image_url
            ? `<img src="${encodeURI(nft.image_url)}" alt="${displayName}" loading="lazy"
                            class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 img-fade-in"
                            onerror="this.src='/placeholder.png'" />`
            : `<div class="w-full h-full flex items-center justify-center text-4xl opacity-30">🖼️</div>`
        }
                <!-- Hover Overlay -->
                <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
                    <span class="text-xs bg-indigo-500/80 backdrop-blur-sm px-2 py-1 rounded-full font-medium">View Details</span>
                </div>
            </div>
            <div class="p-3">
                <div class="text-sm font-bold truncate">${displayName}</div>
                <div class="text-xs opacity-50 truncate capitalize mt-0.5">${collectionName}</div>
                <div class="text-[10px] font-mono opacity-30 mt-1">#${safeId}</div>
            </div>
        </div>
    `;
}

function renderCollectionSidebar() {
    const desktopList = document.getElementById('collection-list');
    const mobileList = document.getElementById('mobile-collection-list');

    const html = collections.length > 0
        ? `<button class="collection-item w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors flex justify-between items-center ${!selectedCollection ? 'bg-white/10' : ''}" data-collection="">
                <span>All</span>
                <span class="text-xs opacity-50 font-mono">${allNFTs.length}</span>
           </button>` +
        collections.map(c => `
            <button class="collection-item w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-white/10 transition-colors flex justify-between items-center ${selectedCollection === c.slug ? 'bg-white/10' : ''}" data-collection="${c.slug}">
                <span class="truncate capitalize mr-2">${c.slug.replace(/-/g, ' ')}</span>
                <span class="text-xs opacity-50 font-mono shrink-0">${c.count}</span>
            </button>
          `).join('')
        : '<div class="text-xs opacity-30 py-4 text-center">No collections found</div>';

    if (desktopList) {
        desktopList.innerHTML = html;
        attachCollectionListeners(desktopList);
    }
    if (mobileList) {
        mobileList.innerHTML = html;
        attachCollectionListeners(mobileList);
    }
}

function attachCollectionListeners(container) {
    container.querySelectorAll('.collection-item').forEach(item => {
        item.addEventListener('click', () => {
            selectedCollection = item.dataset.collection || null;
            // Update active state
            container.querySelectorAll('.collection-item').forEach(el => el.classList.remove('bg-white/10'));
            item.classList.add('bg-white/10');
            applyFilters();
        });
    });
}

// ============================================
// EMPTY STATES & SKELETONS
// ============================================

function buildEmptyState(type) {
    const states = {
        'connect': {
            icon: '👛',
            title: 'Connect Your Wallet',
            subtitle: 'Connect your wallet to view your NFT collection',
            action: '<button id="empty-connect-btn" class="legendary-button px-8 py-3 rounded-xl font-bold text-white mt-4">Connect Wallet</button>'
        },
        'no-nfts': {
            icon: '🖼️',
            title: 'No NFTs Found',
            subtitle: 'This wallet doesn\'t have any NFTs on Base yet',
            action: '<button id="browse-collections-btn" class="glass-card px-6 py-3 rounded-xl font-medium mt-4 hover:bg-white/10 transition-colors">Browse Collections</button>'
        },
        'no-results': {
            icon: '🔍',
            title: 'No Results',
            subtitle: 'No NFTs match your current filters',
            action: '<button id="clear-filters-btn" class="glass-card px-6 py-3 rounded-xl font-medium mt-4 hover:bg-white/10 transition-colors">Clear Filters</button>'
        },
        'error': {
            icon: '⚠️',
            title: 'Failed to Load',
            subtitle: 'Check your OpenSea API key in .env and try again',
            action: '<button id="retry-btn" class="glass-card px-6 py-3 rounded-xl font-medium mt-4 hover:bg-white/10 transition-colors">Retry</button>'
        }
    };
    const s = states[type] || states['error'];
    return `
        <div class="col-span-full flex flex-col items-center justify-center py-20 text-center">
            <div class="text-6xl mb-4">${s.icon}</div>
            <h3 class="text-xl font-bold mb-2">${s.title}</h3>
            <p class="text-sm opacity-50 max-w-sm">${s.subtitle}</p>
            ${s.action}
        </div>
    `;
}

function buildLoadingSkeletons(count) {
    return Array.from({ length: count }, () => `
        <div class="glass-card rounded-xl overflow-hidden animate-pulse">
            <div class="aspect-square bg-white/5"></div>
            <div class="p-3 space-y-2">
                <div class="h-4 bg-white/10 rounded w-3/4"></div>
                <div class="h-3 bg-white/10 rounded w-1/2"></div>
            </div>
        </div>
    `).join('');
}

// ============================================
// EVENT HANDLERS
// ============================================

function attachGalleryEvents() {
    // Cleanup old handlers
    if (walletHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletHandler);
    }
    if (scrollHandler) {
        window.removeEventListener('scroll', scrollHandler);
    }
    if (delegatedClickHandler) {
        document.removeEventListener('click', delegatedClickHandler);
    }

    // Wallet update
    walletHandler = (e) => {
        const account = e.detail;
        updateGalleryHeader(account);
        if (account?.isConnected && account?.address) {
            loadNFTs(true);
            loadBalance();
        } else {
            // Disconnected
            allNFTs = [];
            filteredNFTs = [];
            collections = [];
            nextCursor = null;
            const grid = document.getElementById('gallery-grid');
            if (grid) grid.innerHTML = buildEmptyState('connect');
            renderCollectionSidebar();
            const countEl = document.getElementById('gallery-nft-count');
            if (countEl) countEl.textContent = '';
            const balContainer = document.getElementById('gallery-balance');
            if (balContainer) balContainer.classList.add('hidden');
            const loadMoreSection = document.getElementById('gallery-load-more');
            if (loadMoreSection) loadMoreSection.classList.add('hidden');
        }
    };
    document.addEventListener(EVENTS.WALLET_UPDATE, walletHandler);

    // Back button
    document.getElementById('gallery-back-btn')?.addEventListener('click', () => router.navigate('/'));

    // Connect button
    document.getElementById('gallery-connect-btn')?.addEventListener('click', async () => {
        if (state.wallet?.isConnected) {
            await disconnectWallet();
        } else {
            await connectWallet();
        }
    });

    // Empty state + delegated click handlers
    delegatedClickHandler = (e) => {
        if (e.target.id === 'empty-connect-btn') connectWallet();
        if (e.target.id === 'browse-collections-btn') router.navigate('/');
        if (e.target.id === 'clear-filters-btn') {
            selectedCollection = null;
            searchQuery = '';
            const searchInput = document.getElementById('gallery-search');
            if (searchInput) searchInput.value = '';
            applyFilters();
            renderCollectionSidebar();
        }
        if (e.target.id === 'retry-btn') loadNFTs(true);
    };
    document.addEventListener('click', delegatedClickHandler);

    // Search
    const searchInput = document.getElementById('gallery-search');
    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            searchQuery = e.target.value.trim();
            applyFilters();
        }, 300);
    });

    // Collection search (sidebar)
    const collSearchDesktop = document.getElementById('collection-search');
    collSearchDesktop?.addEventListener('input', (e) => filterCollectionList(e.target.value, 'collection-list'));

    const collSearchMobile = document.getElementById('mobile-collection-search');
    collSearchMobile?.addEventListener('input', (e) => filterCollectionList(e.target.value, 'mobile-collection-list'));

    // Grid toggle
    document.querySelectorAll('.gallery-grid-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const grid = document.getElementById('gallery-grid');
            const size = btn.dataset.grid;
            document.querySelectorAll('.gallery-grid-toggle').forEach(b => b.classList.remove('bg-white/10'));
            btn.classList.add('bg-white/10');
            if (grid) {
                grid.classList.remove('gallery-grid-large', 'gallery-grid-small');
                grid.classList.add(`gallery-grid-${size}`);
            }
        });
    });

    // Load more
    document.getElementById('load-more-btn')?.addEventListener('click', () => loadNFTs(false));

    // Mobile filter drawer
    setupMobileFilterDrawer();

    // Infinite scroll
    setupInfiniteScroll();
    bindBottomNavEvents();
    bindThemeToggleEvents();
}

function updateGalleryHeader(account) {
    const connectBtn = document.getElementById('gallery-connect-btn');
    if (connectBtn) {
        const glow = connectBtn.querySelector('.status-glow');
        const avatar = document.getElementById('gallery-connect-avatar');
        const text = connectBtn.querySelector('span:last-child');

        applyMiniAppAvatar(avatar);

        if (account?.isConnected) {
            if (glow) { glow.style.background = '#10B981'; glow.style.boxShadow = '0 0 10px #10B981'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
        } else {
            if (glow) { glow.style.background = '#EF4444'; glow.style.boxShadow = '0 0 10px #EF4444'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
        }
    }
}

function filterCollectionList(query, listId) {
    const items = document.querySelectorAll(`#${listId} .collection-item`);
    const q = query.toLowerCase();
    items.forEach(item => {
        const slug = (item.dataset.collection || '').toLowerCase();
        item.style.display = (!q || slug === '' || slug.includes(q)) ? '' : 'none';
    });
}

function setupMobileFilterDrawer() {
    const drawer = document.getElementById('mobile-filter-drawer');
    const backdrop = document.getElementById('mobile-filter-backdrop');
    const content = document.getElementById('mobile-filter-content');
    const openBtn = document.getElementById('mobile-filter-btn');
    const closeBtn = document.getElementById('close-filter-btn');

    if (!drawer) return;

    const open = () => {
        drawer.classList.remove('hidden');
        setTimeout(() => {
            backdrop?.classList.add('opacity-100');
            content?.classList.remove('-translate-x-full');
        }, 10);
    };

    const close = () => {
        content?.classList.add('-translate-x-full');
        backdrop?.classList.remove('opacity-100');
        setTimeout(() => drawer.classList.add('hidden'), 300);
    };

    openBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
}

function setupInfiniteScroll() {
    let ticking = false;
    scrollHandler = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            ticking = false;
            if (!nextCursor || isLoading) return;
            const scrollBottom = window.innerHeight + window.scrollY;
            const docHeight = document.documentElement.scrollHeight;
            if (scrollBottom >= docHeight - 500) {
                loadNFTs(false);
            }
        });
    };
    window.addEventListener('scroll', scrollHandler);
}
