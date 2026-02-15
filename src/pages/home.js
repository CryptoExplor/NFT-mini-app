import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { state, EVENTS } from '../state.js';
import { connectWallet, disconnectWallet, wagmiAdapter } from '../wallet.js';
import { shortenAddress } from '../utils/dom.js';
import { readContract, getPublicClient, getBalance } from '@wagmi/core';
import { getContractConfig } from '../../contracts/index.js';
import { parseAbiItem, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { toast } from '../utils/toast.js';
import { renderTransactionHistory } from '../components/TransactionHistory.js';
import { shareCollection, shareAppOnFarcaster } from '../utils/social.js';
import { getExplorerAddressUrl } from '../utils/chain.js';
import { cache } from '../utils/cache.js';
import { analytics } from '../utils/analytics.js';
import { trackPageView } from '../lib/api.js';

// Store event handler reference for cleanup
let walletUpdateHandler = null;
let searchInputHandler = null;
let filterChangeHandler = null;

/**
 * Render the homepage with collection grid
 */
export async function renderHomePage() {
  analytics.trackView('home');
  trackPageView('home', state.wallet?.address || null);
  let collections = loadCollections();

  // Randomly promote one LIVE collection to the top
  const liveCollections = collections.filter(c => c.status.toLowerCase() === 'live');
  if (liveCollections.length > 0) {
    const randomLive = liveCollections[Math.floor(Math.random() * liveCollections.length)];
    // Remove it from current position
    collections = collections.filter(c => c.slug !== randomLive.slug);
    // Add to front
    collections.unshift(randomLive);
  }

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 text-white font-sans">
      <!-- Header -->
      <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Base Mint App</h1>
            
            <!-- Wallet Balance -->
            <div id="wallet-balance" class="hidden md:flex flex-col items-end mr-4 animate-fade-in">
                 <div class="text-xs opacity-60">Balance</div>
                 <div class="font-mono font-bold text-sm text-indigo-300 balance-value">Loading...</div>
            </div>
          </div>
          
          <div class="flex items-center space-x-3">
            <!-- Desktop My NFTs Button -->
            <button id="desktop-analytics-btn" class="hidden sm:flex glass-card px-4 py-2 rounded-full items-center space-x-2 hover:bg-white/10 transition-colors">
              <span class="text-sm font-medium">Analytics</span>
            </button>

            <button id="desktop-nfts-btn" class="hidden sm:flex glass-card px-4 py-2 rounded-full items-center space-x-2 hover:bg-white/10 transition-colors">
              <span class="text-sm font-medium">My NFTs</span>
            </button>

            <!-- Desktop Connect Button -->
            <button id="connect-btn" class="hidden sm:flex glass-card px-4 py-2 rounded-full items-center space-x-2 hover:scale-105 transition-transform">
              <div class="status-glow" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
              <span id="connect-text" class="text-sm font-medium">
                ${state.wallet?.isConnected ? shortenAddress(state.wallet.address) : 'Connect Wallet'}
              </span>
            </button>

            <!-- Global Share Button -->
            <button id="global-share-btn" class="glass-card relative p-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group overflow-hidden border border-indigo-500/30 hover:border-indigo-400">
                <!-- Inner Glow -->
                <div class="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 text-indigo-300 group-hover:text-white transition-colors relative z-10 translate-x-[1px]">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM18 5.28a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM7.5 12a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="m13.5 16.3-5.06-3.04m5.06-4.52-5.06 3.04" />
                </svg>
                
                <!-- Orbiting Glow (subtle) -->
                <div class="absolute inset-0 rounded-full border border-indigo-500/0 group-hover:border-indigo-500/50 group-hover:animate-pulse transition-all"></div>
            </button>

            <!-- Mobile Profile Button (Person Icon) -->
            <button id="mobile-profile-btn" class="sm:hidden glass-card p-2 w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
            </button>
          </div>
        </div>
      </header>
      
      <!-- Profile Modal / Drawer -->
      <div id="profile-modal" class="fixed inset-0 z-50 hidden transition-all duration-300">
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 transition-opacity duration-300" id="profile-backdrop"></div>
          <div class="absolute right-0 top-0 bottom-0 w-full max-w-xs bg-[#0f172a] border-l border-white/10 p-6 shadow-2xl transform translate-x-full transition-transform duration-300 flex flex-col justify-center gap-6" id="profile-content">
              
              <button id="close-profile-btn" class="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <!-- Analytics -->
              <button id="mobile-analytics-btn" class="glass-card p-5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all active:scale-95">
                  <div class="flex items-center gap-4">
                      <span class="text-lg font-bold">Analytics</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 opacity-50 group-hover:translate-x-1 transition-transform">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
              </button>

              <!-- My NFTs -->
              <button id="mobile-gallery-btn" class="glass-card p-5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all active:scale-95">
                  <div class="flex items-center gap-4">
                      <span class="text-lg font-bold">My NFTs</span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 opacity-50 group-hover:translate-x-1 transition-transform">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
              </button>

              <!-- Wallet -->
              <button id="mobile-wallet-btn" class="glass-card p-5 rounded-2xl flex items-center justify-between group hover:bg-white/5 transition-all active:scale-95">
                  <div class="flex items-center gap-4">
                      <div class="status-glow w-6 h-6 rounded-full" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
                      <span id="mobile-wallet-text" class="text-lg font-bold truncate max-w-[140px]">
                          ${state.wallet?.isConnected ? shortenAddress(state.wallet.address) : 'Connect Wallet'}
                      </span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 opacity-50 group-hover:translate-x-1 transition-transform">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
              </button>
          </div>
      </div>

      <!-- Main Content -->
      <main class="pt-24 pb-20 px-6 blur-0 transition-all duration-300" id="main-content">
        <div class="max-w-6xl mx-auto">
          <!-- Hero Section -->
          <div class="mb-10 text-center">
            <h1 class="text-5xl font-bold mb-3 bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent animate-pulse">
              NFT Collections
            </h1>
            <p class="text-xl opacity-70">
              ${collections.length} collection${collections.length !== 1 ? 's' : ''} available to mint
            </p>
          </div>

          <!-- Search & Filters -->
          <div class="mb-8 flex flex-col md:flex-row gap-4 justify-between items-center glass-card p-4 rounded-xl">
             <div class="relative w-full md:w-1/3">
                <input type="text" 
                       id="search-input" 
                       placeholder="Search collections..."
                       class="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500/50 transition-colors pl-10">
                <span class="absolute left-3 top-2.5 opacity-50">🔍</span>
             </div>
             
             <div class="flex gap-3 w-full md:w-auto">
                 <select id="status-filter" class="glass-card bg-black/20 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500/50 cursor-pointer flex-1 md:flex-none">
                    <option value="all">All Status</option>
                    <option value="live">Live</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="sold-out">Sold Out</option>
                 </select>
                 
                 <select id="type-filter" class="glass-card bg-black/20 border border-white/10 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500/50 cursor-pointer flex-1 md:flex-none">
                    <option value="all">All Types</option>
                    <option value="free">Free Mint</option>
                    <option value="paid">Paid Mint</option>
                    <option value="burn">Burn to Mint</option>
                 </select>
             </div>
          </div>
          
          <!-- Collection Grid -->
          <div id="collection-grid" class="flex flex-wrap justify-center gap-6">
            ${collections.length > 0
      ? collections.map(collection => renderCollectionCard(collection)).join('')
      : '<p class="text-center opacity-50">No collections available</p>'
    }
          </div>
        </div>
      </main>
      
      <!-- Footer -->
      <footer class="fixed bottom-0 left-0 right-0 glass-header p-4 z-10">
        <div class="max-w-6xl mx-auto text-center text-sm opacity-50">
          Built with ❤️ for Farcaster & Base 
        </div>
      </footer>
    </div>
  `;

  // Attach event handlers
  attachEventHandlers();

  // Fetch balance on initial load if wallet is already connected
  if (state.wallet?.isConnected && state.wallet?.address) {
    updateWalletBalance(state.wallet);
  }
}

/**
 * Render a single collection card
 */
function renderCollectionCard(collection) {
  const statusClass = getStatusClass(collection.status);
  const mintTypeLabel = getMintTypeLabel(collection.mintPolicy);

  return `
    <div class="glass-card p-1 rounded-2xl cursor-pointer hover:scale-105 transition-all duration-300 group w-full sm:max-w-[320px] lg:max-w-[350px]"
         data-collection="${collection.slug}">
      
      <div class="relative bg-[#1a1b2e] rounded-xl overflow-hidden">
        <!-- Image -->
        <div class="aspect-square overflow-hidden relative">
          <img src="${collection.imageUrl}" 
               alt="${collection.name}"
               loading="lazy"
               class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500 img-fade-in"
               onerror="this.src='/placeholder.png'">
          
          <!-- Share Button Overlay -->
          <button class="share-btn absolute top-2 right-2 bg-indigo-500/20 backdrop-blur-md p-2 rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 hover:bg-indigo-500/40 border border-white/10 hover:border-indigo-400 z-10 flex items-center justify-center"
                  data-slug="${collection.slug}"
                  onclick="event.stopPropagation();">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-white translate-x-[0.5px]">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM18 5.28a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM7.5 12a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="m13.5 16.3-5.06-3.04m5.06-4.52-5.06 3.04" />
              </svg>
          </button>
        </div>
        
        <!-- Gradient Overlay -->
        <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
        
        <!-- Content -->
        <div class="p-4">
          <div class="flex justify-between items-start mb-2">
            <h3 class="text-xl font-bold truncate">${collection.name}</h3>
            <span class="${statusClass} px-2 py-1 rounded text-xs font-bold uppercase whitespace-nowrap ml-2">
              ${collection.status}
            </span>
          </div>
          
          <p class="text-sm opacity-70 mb-4 line-clamp-2">
            ${collection.description}
          </p>
          
          <div class="flex justify-between items-center">
            <div class="text-xs opacity-60">
              ${collection.mintPolicy.maxSupply.toLocaleString()} supply
            </div>
            <div class="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-medium">
              ${mintTypeLabel}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Get status badge class
 */
function getStatusClass(status) {
  const classes = {
    'live': 'bg-green-500/20 text-green-400 border border-green-500/30',
    'upcoming': 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
    'sold-out': 'bg-red-500/20 text-red-400 border border-red-500/30',
    'paused': 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
  };
  return classes[status] || classes['paused'];
}

/**
 * Get mint type label
 */
function getMintTypeLabel(mintPolicy) {
  const hasFree = mintPolicy.stages.some(s => s.type === 'FREE');
  const hasPaid = mintPolicy.stages.some(s => s.type === 'PAID');
  const hasBurn = mintPolicy.stages.some(s => s.type === 'BURN_ERC20');

  if (hasFree && hasPaid) return 'FREE + PAID';
  if (hasFree && hasBurn) return 'FREE + BURN';
  if (hasFree) return 'FREE MINT';
  if (hasPaid) return 'PAID MINT';
  if (hasBurn) return 'BURN TO MINT';
  return 'MINT';
}

/**
 * Collection Card Skeleton
 */
function CollectionCardSkeleton() {
  return `
    <div class="glass-card p-1 rounded-2xl animate-pulse w-full sm:max-w-[320px] lg:max-w-[350px]">
      <div class="aspect-square bg-white/5 rounded-xl"></div>
      <div class="p-4 space-y-3">
        <div class="h-6 bg-white/10 rounded w-3/4"></div>
        <div class="h-4 bg-white/10 rounded w-full"></div>
        <div class="h-4 bg-white/10 rounded w-2/3"></div>
      </div>
    </div>
  `;
}

/**
 * Attach event handlers
 */
function attachEventHandlers() {
  // Remove old wallet update listener if exists
  if (walletUpdateHandler) {
    document.removeEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);
  }

  // Add wallet update listener
  walletUpdateHandler = (e) => {
    const account = e.detail;
    updateConnectButton(account);
    updateProfileWalletInfo(account);

    if (account?.isConnected && account?.address) {
      // Connected — fetch balance and NFTs
      updateWalletBalance(account);
      fetchUserNFTs();
    } else {
      // Disconnected — clear balance display and NFT grid
      clearWalletBalance();
      clearNFTGrid();
    }
  };
  document.addEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);

  // Search & Filter Logic
  const searchInput = document.getElementById('search-input');
  const statusFilter = document.getElementById('status-filter');
  const typeFilter = document.getElementById('type-filter');

  const updateFilters = () => {
    const query = searchInput?.value.toLowerCase() || '';
    const status = statusFilter?.value || 'all';
    const type = typeFilter?.value || 'all';

    const collections = loadCollections();
    const filtered = collections.filter(c => {
      const matchesQuery = c.name.toLowerCase().includes(query) || c.description.toLowerCase().includes(query);
      const matchesStatus = status === 'all' || c.status.toLowerCase() === status.toLowerCase();

      let matchesType = true;
      if (type === 'paid') matchesType = c.mintPolicy.stages.some(s => s.type === 'PAID');
      if (type === 'free') matchesType = c.mintPolicy.stages.some(s => s.type === 'FREE');
      if (type === 'burn') matchesType = c.mintPolicy.stages.some(s => s.type === 'BURN_ERC20');

      return matchesQuery && matchesStatus && matchesType;
    });

    const grid = document.getElementById('collection-grid');
    if (grid) {
      if (filtered.length > 0) {
        grid.innerHTML = filtered.map(collection => renderCollectionCard(collection)).join('');
        // Re-attach card listeners
        const cards = document.querySelectorAll('[data-collection]');
        cards.forEach(card => {
          card.addEventListener('click', () => {
            const slug = card.dataset.collection;
            router.navigate(`/mint/${slug}`);
          });
        });
      } else {
        grid.innerHTML = '<div class="col-span-full text-center py-10 opacity-50">No collections found matching your filters</div>';
      }
    }
  };

  if (searchInput) searchInput.addEventListener('input', updateFilters);
  if (statusFilter) statusFilter.addEventListener('change', updateFilters);
  if (typeFilter) typeFilter.addEventListener('change', updateFilters);

  // Connect button logic
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      if (state.wallet?.isConnected) {
        // Disconnect immediately
        await disconnectWallet();
      } else {
        await connectWallet();
      }
    });
  }

  // Analytics button logic
  const analyticsBtn = document.getElementById('desktop-analytics-btn');
  const profileAnalyticsBtn = document.getElementById('view-analytics-btn');

  if (analyticsBtn) {
    analyticsBtn.addEventListener('click', () => {
      router.navigate('/analytics');
    });
  }

  if (profileAnalyticsBtn) {
    profileAnalyticsBtn.addEventListener('click', () => {
      router.navigate('/analytics');
    });
  }

  // Share button logic
  const shareBtns = document.querySelectorAll('.share-btn');
  shareBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const slug = btn.dataset.slug;
      const collection = loadCollections().find(c => c.slug === slug);
      if (collection) await shareCollection(collection);
    });
  });

  // Global share button logic
  const globalShareBtn = document.getElementById('global-share-btn');
  if (globalShareBtn) {
    globalShareBtn.addEventListener('click', async () => {
      await shareAppOnFarcaster();
    });
  }

  // Collection cards interaction
  const cards = document.querySelectorAll('[data-collection]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const slug = card.dataset.collection;
      router.navigate(`/mint/${slug}`);
    });
  });

  // Initialize Profile Modal
  setupProfileModal();
}

/**
 * Update the connect button UI
 */
function updateConnectButton(account) {
  const connectText = document.getElementById('connect-text');
  const statusGlow = document.querySelector('.status-glow');

  if (connectText) {
    connectText.textContent = account?.isConnected
      ? shortenAddress(account.address)
      : 'Connect Wallet';
  }

  if (statusGlow) {
    const color = account?.isConnected ? '#10B981' : '#EF4444';
    statusGlow.style.background = color;
    statusGlow.style.boxShadow = `0 0 10px ${color}`;
  }
}



// ============================================
// PROFILE MODAL LOGIC
// ============================================

function setupProfileModal() {
  const mobileBtn = document.getElementById('mobile-profile-btn');
  const desktopBtn = document.getElementById('desktop-nfts-btn');
  const modal = document.getElementById('profile-modal');
  const backdrop = document.getElementById('profile-backdrop');
  const content = document.getElementById('profile-content');
  const closeBtn = document.getElementById('close-profile-btn');

  // New Menu Buttons
  const analyticsBtn = document.getElementById('mobile-analytics-btn');
  const galleryBtn = document.getElementById('mobile-gallery-btn');
  const walletBtn = document.getElementById('mobile-wallet-btn');

  if (!modal) return;

  const openModal = () => {
    modal.classList.remove('hidden');
    setTimeout(() => {
      backdrop.classList.remove('opacity-0');
      content.classList.remove('translate-x-full');
    }, 10);
    updateProfileWalletInfo(state.wallet);
  };

  const closeModal = () => {
    backdrop.classList.add('opacity-0');
    content.classList.add('translate-x-full');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  };

  // Trigger Logic
  if (mobileBtn) mobileBtn.onclick = openModal;

  // Desktop button logic
  if (desktopBtn) desktopBtn.onclick = () => {
    router.navigate('/gallery');
  };

  if (closeBtn) closeBtn.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  // Menu Actions
  if (analyticsBtn) {
    analyticsBtn.onclick = () => {
      closeModal();
      router.navigate('/analytics');
    };
  }

  if (galleryBtn) {
    galleryBtn.onclick = () => {
      closeModal();
      router.navigate('/gallery');
    };
  }

  if (walletBtn) {
    walletBtn.onclick = async () => {
      if (state.wallet?.isConnected) {
        await disconnectWallet();
      } else {
        await connectWallet();
      }
    };
  }
}


function updateProfileWalletInfo(account) {
  const walletText = document.getElementById('mobile-wallet-text');
  const walletGlow = document.querySelector('#mobile-wallet-btn .status-glow');

  if (walletText) {
    walletText.textContent = account?.isConnected
      ? shortenAddress(account.address)
      : 'Connect Wallet';
  }

  if (walletGlow) {
    const color = account?.isConnected ? '#10B981' : '#EF4444';
    walletGlow.style.background = color;
    walletGlow.style.boxShadow = `0 0 10px ${color}`;
  }
}

/**
 * Remove legacy fetchUserNFTs if no longer needed, or keep for potential reuse
 * (It will return early as grid is gone)
 */
async function fetchUserNFTs() {
  const grid = document.getElementById('my-nfts-grid');
  if (!grid) return;

  if (!state.wallet?.isConnected) {
    grid.innerHTML = `
            <div class="col-span-2 text-center py-20 opacity-30">
                <div class="text-4xl mb-4">👛</div>
                <p>Connect wallet to view your NFTs</p>
            </div>
        `;
    return;
  }

  // Clear grid and show loader
  grid.innerHTML = '';
  const loadingEl = document.createElement('div');
  loadingEl.className = 'col-span-2 text-center py-10 opacity-50 animate-pulse text-xs';
  loadingEl.innerText = 'Scanning collections...';
  grid.appendChild(loadingEl);

  const collections = loadCollections();
  const userAddress = state.wallet.address;
  const client = createPublicClient({
    chain: base,
    transport: http('https://base-mainnet.infura.io/v3/f0c6b3797dd54dc2aa91cd4a463bcc57')
  });

  let hasFoundAny = false;

  // Process collections in parallel (skip upcoming collections)
  await Promise.all(collections.map(async (collection) => {
    // Skip upcoming collections - users can't own NFTs from unreleased collections
    if (collection.status.toLowerCase() === 'upcoming') {
      return;
    }

    try {
      const config = getContractConfig(collection);

      // 1. Get Balance
      const balance = await readContract(wagmiAdapter.wagmiConfig, {
        address: config.address,
        abi: config.abi,
        functionName: 'balanceOf',
        args: [userAddress],
        chainId: config.chainId
      });

      const count = Number(balance);

      if (count > 0) {
        hasFoundAny = true;
        const cardId = `nft-card-${collection.slug}`;
        const explorerUrl = getExplorerAddressUrl(collection.chainId, collection.contractAddress);

        // 2. Render Summary Card IMMEDIATELY
        const summaryHtml = `
                    <div id="${cardId}" class="col-span-2 bg-white/5 p-4 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors mb-2">
                        <div class="flex items-center space-x-3">
                            <img src="${collection.imageUrl}" class="w-10 h-10 rounded-lg object-cover img-fade-in" loading="lazy" onerror="this.src='/placeholder.png'"/>
                            <div>
                                <div class="font-bold">${collection.name}</div>
                                <div class="text-xs opacity-60">You own: <span class="text-indigo-300 font-bold">${count}</span></div>
                                <div class="text-[10px] opacity-40 animate-pulse mt-1 status-text">Loading previews...</div>
                            </div>
                        </div>
                        <a href="${explorerUrl}?a=${userAddress}" target="_blank" class="glass-card px-3 py-1 rounded-lg text-xs font-medium hover:bg-indigo-500/20 transition-colors">
                            View
                        </a>
                    </div>
                `;

        const container = document.createElement('div');
        container.className = 'col-span-2';
        container.innerHTML = summaryHtml;

        if (loadingEl.parentNode) loadingEl.remove();
        grid.appendChild(container);

        // 3. Background Fetch Images
        (async () => {
          try {
            const logs = await client.getLogs({
              address: config.address,
              event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'),
              args: { to: userAddress },
              fromBlock: 'earliest'
            });

            const uniqueIds = [...new Set(logs.map(l => l.args.tokenId))];
            const subsetIds = uniqueIds.slice(0, 12);

            let tokens = [];
            for (const id of subsetIds) {
              try {
                const owner = await readContract(wagmiAdapter.wagmiConfig, { ...config, functionName: 'ownerOf', args: [id] });
                if (owner.toLowerCase() === userAddress.toLowerCase()) {
                  let image = collection.imageUrl;
                  let name = `${collection.name} #${id}`;
                  try {
                    const uri = await readContract(wagmiAdapter.wagmiConfig, { ...config, functionName: 'tokenURI', args: [id] });
                    const meta = await resolveMetadata(uri);
                    if (meta.image) image = meta.image;
                    if (meta.name) name = meta.name;
                  } catch (_) { }
                  tokens.push({ id: id.toString(), image, name });
                }
              } catch (_) { }
            }

            if (tokens.length > 0) {
              container.innerHTML = `
                                <div class="col-span-2 mb-4 bg-white/5 rounded-xl p-3 border border-white/5">
                                    <div class="flex items-center justify-between mb-3 px-1">
                                        <div class="flex items-center space-x-2">
                                            <img src="${collection.imageUrl}" class="w-6 h-6 rounded-md img-fade-in" loading="lazy"/>
                                            <span class="font-bold text-sm">${collection.name}</span>
                                            <span class="text-xs opacity-50">(${count})</span>
                                        </div>
                                        <a href="${explorerUrl}?a=${userAddress}" target="_blank" class="text-[10px] opacity-50 hover:opacity-100">Explorer ↗</a>
                                    </div>
                                    <div class="grid grid-cols-3 gap-2">
                                        ${tokens.map(t => `
                                            <div class="aspect-square bg-black/50 rounded-lg overflow-hidden relative group cursor-pointer border border-white/5 hover:border-indigo-500/50 transition-all"
                                                 onclick="window.open('${explorerUrl}?a=${t.id}', '_blank')">
                                                <img src="${t.image}" class="w-full h-full object-cover img-fade-in" loading="lazy" onerror="this.src='${collection.imageUrl}'" />
                                                <div class="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[9px] font-mono backdrop-blur-md">#${t.id}</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `;
            } else {
              const statusEl = container.querySelector('.status-text');
              if (statusEl) statusEl.remove();
            }
          } catch (e) {
            const statusEl = container.querySelector('.status-text');
            if (statusEl) statusEl.textContent = 'Preview unavailable';
          }
        })();
      }
    } catch (e) {
      console.warn(`Error processing ${collection.name}`, e);
    }
  }));

  if (loadingEl.parentNode) {
    loadingEl.remove();
    if (!hasFoundAny) {
      grid.innerHTML = '<div class="col-span-2 text-center py-20 opacity-30"><div class="text-4xl mb-4">📉</div><p>No NFTs found.</p></div>';
    }
  }
}

async function resolveMetadata(uri) {
  if (!uri) return {};

  const cacheKey = `metadata_${uri}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  if (uri.startsWith('data:application/json;base64,')) {
    try {
      const json = atob(uri.replace('data:application/json;base64,', ''));
      const data = JSON.parse(json);
      cache.set(cacheKey, data, 24 * 60 * 60 * 1000, true);
      return data;
    } catch (e) { return {}; }
  }
  let url = uri;
  if (uri.startsWith('ipfs://')) url = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  if (url.startsWith('http')) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      // Cache metadata persistently for 24 hours
      cache.set(cacheKey, data, 24 * 60 * 60 * 1000, true);
      return data;
    } catch (e) { return {}; }
  }
  return {};
}

if (typeof window !== 'undefined') {
  window.router = router;
}

/**
 * Update wallet balance display
 */
async function updateWalletBalance(account) {
  const balanceContainer = document.getElementById('wallet-balance');
  const balanceValue = document.querySelector('.balance-value');

  if (!balanceContainer || !balanceValue) return;

  if (!account?.isConnected || !account?.address) {
    clearWalletBalance();
    return;
  }

  balanceContainer.classList.remove('hidden');
  balanceContainer.classList.add('md:flex');
  balanceValue.textContent = 'Loading...';

  try {
    // Use chainId from account, or default to base (8453)
    const chainId = account.chainId || 8453;
    const balance = await getBalance(wagmiAdapter.wagmiConfig, {
      address: account.address,
      chainId: chainId
    });

    // Check if wallet is still connected (may have disconnected during async fetch)
    if (!state.wallet?.isConnected) {
      clearWalletBalance();
      return;
    }

    const eth = Number(balance.value) / 1e18;
    balanceValue.textContent = `${eth.toFixed(4)} ETH`;
  } catch (e) {
    console.error('Failed to fetch balance:', e);
    balanceValue.textContent = 'Error';
  }
}

/**
 * Clear wallet balance display on disconnect
 */
function clearWalletBalance() {
  const balanceContainer = document.getElementById('wallet-balance');
  const balanceValue = document.querySelector('.balance-value');

  if (balanceContainer) {
    balanceContainer.classList.add('hidden');
    balanceContainer.classList.remove('md:flex');
  }
  if (balanceValue) {
    balanceValue.textContent = 'Loading...';
  }
}

/**
 * Clear NFT grid on disconnect
 */
function clearNFTGrid() {
  const grid = document.getElementById('my-nfts-grid');
  if (grid) {
    grid.innerHTML = `
      <div class="col-span-2 text-center py-20 opacity-30">
        <div class="text-4xl mb-4">🖼️</div>
        <p class="text-sm">Connect wallet to view your NFT gallery</p>
      </div>
    `;
  }
}
