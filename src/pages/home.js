import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { state, EVENTS } from '../state.js';
// wallet.js and @wagmi/core are lazy-loaded to avoid pulling 1.6MB+ of vendor JS into the home page chunk.
// They are only needed on wallet button clicks and balance fetches.
import { shareCollection, shareAppToFeed } from '../utils/social.js';

import { trackPageView } from '../lib/api.js';
import { applyMiniAppAvatar, getMiniAppProfile, getMiniAppProfileLabel, getWalletIdentityLabel } from '../utils/profile.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';

// Lazy wallet module loader
let _walletMod = null;
async function getWalletModule() {
  if (!_walletMod) _walletMod = await import('../wallet.js');
  return _walletMod;
}

async function connectWallet() {
  const mod = await getWalletModule();
  return mod.connectWallet();
}

async function disconnectWallet() {
  const mod = await getWalletModule();
  return mod.disconnectWallet();
}

// Store event handler reference for cleanup
let walletUpdateHandler = null;
let homeCountdownInterval = null;
const ONBOARDING_STORAGE_KEY = 'mint_app_onboarding_seen_v1';
const ONBOARDING_STEPS = [
  {
    title: 'Discover collections',
    description: 'Browse live and upcoming drops, then open any collection to view supply and mint details.',
    hint: 'Tip: use filters to quickly find free, paid, or burn mints.'
  },
  {
    title: 'Connect and prepare',
    description: 'Connect your wallet once to unlock minting and track your onchain activity in one place.',
    hint: 'Your profile and wallet status are shown in the header.'
  },
  {
    title: 'Mint and share',
    description: 'Mint directly from each collection page, then share your mint and view it on OpenSea or explorer.',
    hint: 'You are ready to start minting.'
  }
];

function getCollectionStatus(collection) {
  return String(collection?.status || collection?.computedStatus || 'paused').toLowerCase();
}

function formatCountdown(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function clearHomeCountdownTicker() {
  if (homeCountdownInterval) {
    clearInterval(homeCountdownInterval);
    homeCountdownInterval = null;
  }
}

function startHomeCountdownTicker() {
  clearHomeCountdownTicker();

  const countdownEls = document.querySelectorAll('[data-launch-ts]');
  if (!countdownEls.length) return;

  const updateCountdowns = () => {
    let needsRefresh = false;
    countdownEls.forEach((container) => {
      const launchTs = Number(container.getAttribute('data-launch-ts'));
      const textEl = container.querySelector('[data-countdown-text]');
      if (!Number.isFinite(launchTs) || !textEl) return;

      const remaining = launchTs - Date.now();
      if (remaining <= 0) {
        needsRefresh = true;
        return;
      }

      textEl.textContent = formatCountdown(remaining);
    });

    if (needsRefresh) {
      clearHomeCountdownTicker();
      renderHomePage();
    }
  };

  updateCountdowns();
  homeCountdownInterval = setInterval(updateCountdowns, 1000);
}

/**
 * Render the homepage with collection grid
 */
export async function renderHomePage() {

  trackPageView('home', state.wallet?.address || null);
  clearHomeCountdownTicker();
  let collections = loadCollections();
  const profile = getMiniAppProfile();
  const profileLabel = getMiniAppProfileLabel(profile);
  const profileSourceLabel = state.platform?.inMiniApp ? 'User' : 'Wallet';

  // Randomly promote one LIVE collection to the top
  const liveCollections = collections.filter(c => getCollectionStatus(c) === 'live');
  if (liveCollections.length > 0) {
    const randomLive = liveCollections[Math.floor(Math.random() * liveCollections.length)];
    // Remove it from current position
    collections = collections.filter(c => c.slug !== randomLive.slug);
    // Add to front
    collections.unshift(randomLive);
  }

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 app-text font-sans">
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
              <img id="connect-avatar" class="w-5 h-5 rounded-full object-cover hidden" alt="Profile avatar">
              <span id="connect-text" class="text-sm font-medium">
                ${getWalletIdentityLabel(state.wallet)}
              </span>
            </button>

            ${renderThemeToggleButton('theme-toggle-home')}

            <!-- Global Share Button -->
            <button id="global-share-btn" class="glass-card relative p-2 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 group overflow-hidden border border-indigo-500/30 hover:border-indigo-400" aria-label="Share app" title="Share app">
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
            <button id="mobile-profile-btn" class="sm:hidden glass-card w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors overflow-hidden" aria-label="Open profile menu" title="Open profile menu">
                <img id="mobile-profile-avatar" class="w-full h-full rounded-full object-cover hidden" alt="Profile avatar">
                <svg id="mobile-profile-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
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
              
              <button id="close-profile-btn" class="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors" aria-label="Close profile menu" title="Close profile menu">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>

              <div class="glass-card p-4 rounded-2xl flex items-center gap-3">
                  <img id="profile-avatar" class="w-11 h-11 rounded-full object-cover hidden" alt="Profile avatar">
                  <div id="profile-avatar-fallback" class="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 opacity-80">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                  </div>
                  <div class="min-w-0">
                      <div class="text-xs uppercase tracking-wide opacity-60">${profileSourceLabel}</div>
                      <div id="profile-identity-text" class="text-base font-bold truncate">${profileLabel || 'Guest'}</div>
                  </div>
              </div>

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
                          ${getWalletIdentityLabel(state.wallet)}
                      </span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 opacity-50 group-hover:translate-x-1 transition-transform">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
              </button>
          </div>
      </div>

      <!-- Onboarding Modal -->
      <div id="onboarding-modal" class="fixed inset-0 z-[60] hidden">
          <div id="onboarding-backdrop" class="absolute inset-0 bg-black/70 backdrop-blur-sm opacity-0 transition-opacity duration-300"></div>
          <div id="onboarding-card" class="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto glass-card rounded-2xl p-5 border border-indigo-500/30 shadow-2xl transform translate-y-4 opacity-0 transition-all duration-300">
              <div class="flex items-center justify-between mb-4">
                  <span id="onboarding-step-label" class="text-xs uppercase tracking-wide opacity-60">Step 1 of 3</span>
                  <button id="onboarding-skip-btn" class="text-sm opacity-70 hover:opacity-100 transition-colors min-h-[44px] px-3">Skip</button>
              </div>
              <h2 id="onboarding-title" class="text-2xl font-bold mb-3"></h2>
              <p id="onboarding-description" class="text-sm opacity-80 leading-relaxed"></p>
              <p id="onboarding-hint" class="text-xs text-indigo-300/90 mt-3"></p>
              <div id="onboarding-dots" class="flex items-center gap-2 mt-5"></div>
              <div class="flex gap-2 mt-5">
                  <button id="onboarding-prev-btn" class="glass-card min-h-[44px] px-4 rounded-xl text-sm font-medium">Back</button>
                  <button id="onboarding-next-btn" class="legendary-button min-h-[44px] px-4 rounded-xl text-sm font-bold flex-1">Next</button>
              </div>
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
      
      ${renderBottomNav('home')}
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
  const status = getCollectionStatus(collection);
  const statusClass = getStatusClass(status);
  const mintTypeLabel = getMintTypeLabel(collection.mintPolicy);
  const isUpcoming = status === 'upcoming' && Number.isFinite(collection.launchAtTs);
  const countdown = isUpcoming ? formatCountdown(collection.launchAtTs - Date.now()) : '';

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
                  aria-label="Share ${collection.name}"
                  title="Share ${collection.name}"
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
            <h3 class="text-xl font-bold text-slate-100 truncate">${collection.name}</h3>
            <span class="${statusClass} px-2 py-1 rounded text-xs font-bold uppercase whitespace-nowrap ml-2">
              ${status}
            </span>
          </div>
          
          <p class="text-sm text-slate-300 mb-4 line-clamp-2">
            ${collection.description}
          </p>

          ${isUpcoming ? `
            <div class="mb-3 text-xs text-blue-300/90" data-launch-ts="${collection.launchAtTs}">
              Launches in <span data-countdown-text>${countdown}</span>
            </div>
          ` : ''}
          
          <div class="flex justify-between items-center">
            <div class="text-xs text-slate-300/80">
              ${collection.mintPolicy.maxSupply.toLocaleString()} supply
            </div>
            <div class="px-3 py-1 bg-indigo-500/20 text-indigo-200 rounded-full text-xs font-medium">
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

function bindCollectionCardNavigation() {
  const cards = document.querySelectorAll('[data-collection]');
  cards.forEach((card) => {
    card.addEventListener('click', () => {
      const slug = card.dataset.collection;
      router.navigate(`/mint/${slug}`);
    });
  });
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
      updateWalletBalance(account);
    } else {
      clearWalletBalance();
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
      const matchesStatus = status === 'all' || getCollectionStatus(c) === status.toLowerCase();

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
        bindCollectionCardNavigation();
        startHomeCountdownTicker();
      } else {
        grid.innerHTML = '<div class="col-span-full text-center py-10 opacity-50">No collections found matching your filters</div>';
        clearHomeCountdownTicker();
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
      await shareAppToFeed();
    });
  }

  // Collection cards interaction
  bindCollectionCardNavigation();

  // Initialize Profile Modal
  setupProfileModal();
  updateConnectButton(state.wallet);
  updateProfileWalletInfo(state.wallet);
  updateMiniAppProfileUI();
  bindBottomNavEvents();
  bindThemeToggleEvents();
  setupOnboardingFlow();
  startHomeCountdownTicker();
}

/**
 * Update the connect button UI
 */
function updateConnectButton(account) {
  const connectText = document.getElementById('connect-text');
  const statusGlow = document.querySelector('.status-glow');

  if (connectText) {
    connectText.textContent = getWalletIdentityLabel(account);
  }

  if (statusGlow) {
    const color = account?.isConnected ? '#10B981' : '#EF4444';
    statusGlow.style.background = color;
    statusGlow.style.boxShadow = `0 0 10px ${color}`;
  }

  updateMiniAppProfileUI();
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
    updateMiniAppProfileUI();
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
    walletText.textContent = getWalletIdentityLabel(account);
  }

  if (walletGlow) {
    const color = account?.isConnected ? '#10B981' : '#EF4444';
    walletGlow.style.background = color;
    walletGlow.style.boxShadow = `0 0 10px ${color}`;
  }
}

function updateMiniAppProfileUI() {
  const profile = getMiniAppProfile();
  const profileLabel = getMiniAppProfileLabel(profile) || 'Guest';

  const connectAvatar = document.getElementById('connect-avatar');
  const mobileAvatar = document.getElementById('mobile-profile-avatar');
  const profileAvatar = document.getElementById('profile-avatar');
  const profileAvatarFallback = document.getElementById('profile-avatar-fallback');
  const mobileProfileIcon = document.getElementById('mobile-profile-icon');
  const profileIdentityText = document.getElementById('profile-identity-text');

  applyMiniAppAvatar(connectAvatar);
  applyMiniAppAvatar(mobileAvatar, mobileProfileIcon);
  applyMiniAppAvatar(profileAvatar, profileAvatarFallback);

  if (profileIdentityText) {
    profileIdentityText.textContent = profileLabel;
  }
}

function hasSeenOnboarding() {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setOnboardingSeen() {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
  } catch {
    // Ignore storage failures in restricted contexts.
  }
}

function setupOnboardingFlow() {
  const modal = document.getElementById('onboarding-modal');
  const backdrop = document.getElementById('onboarding-backdrop');
  const card = document.getElementById('onboarding-card');
  const stepLabel = document.getElementById('onboarding-step-label');
  const title = document.getElementById('onboarding-title');
  const description = document.getElementById('onboarding-description');
  const hint = document.getElementById('onboarding-hint');
  const dots = document.getElementById('onboarding-dots');
  const skipBtn = document.getElementById('onboarding-skip-btn');
  const prevBtn = document.getElementById('onboarding-prev-btn');
  const nextBtn = document.getElementById('onboarding-next-btn');

  if (!modal || !backdrop || !card || !stepLabel || !title || !description || !hint || !dots || !skipBtn || !prevBtn || !nextBtn) {
    return;
  }

  if (hasSeenOnboarding()) {
    modal.remove();
    return;
  }

  let stepIndex = 0;

  const renderStep = () => {
    const step = ONBOARDING_STEPS[stepIndex];
    if (!step) return;

    stepLabel.textContent = `Step ${stepIndex + 1} of ${ONBOARDING_STEPS.length}`;
    title.textContent = step.title;
    description.textContent = step.description;
    hint.textContent = step.hint;

    dots.innerHTML = ONBOARDING_STEPS.map((_, index) => `
      <span class="h-2 rounded-full transition-all ${index === stepIndex ? 'w-5 bg-indigo-400' : 'w-2 bg-white/30'}"></span>
    `).join('');

    prevBtn.classList.toggle('invisible', stepIndex === 0);
    nextBtn.textContent = stepIndex === ONBOARDING_STEPS.length - 1 ? 'Start minting' : 'Next';
  };

  const closeModal = () => {
    setOnboardingSeen();
    backdrop.classList.add('opacity-0');
    card.classList.add('opacity-0', 'translate-y-4');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 250);
  };

  skipBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  prevBtn.addEventListener('click', () => {
    if (stepIndex <= 0) return;
    stepIndex -= 1;
    renderStep();
  });

  nextBtn.addEventListener('click', () => {
    if (stepIndex >= ONBOARDING_STEPS.length - 1) {
      closeModal();
      return;
    }
    stepIndex += 1;
    renderStep();
  });

  renderStep();
  modal.classList.remove('hidden');
  requestAnimationFrame(() => {
    backdrop.classList.remove('opacity-0');
    card.classList.remove('opacity-0', 'translate-y-4');
  });
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
    // Lazy-load wagmi getBalance + adapter (only on demand)
    const [{ getBalance }, walletMod] = await Promise.all([
      import('@wagmi/core'),
      getWalletModule()
    ]);

    // Use chainId from account, or default to base (8453)
    const chainId = account.chainId || 8453;
    const balance = await getBalance(walletMod.wagmiAdapter.wagmiConfig, {
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

export function cleanup() {
  clearHomeCountdownTicker();
  if (walletUpdateHandler) {
    document.removeEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);
    walletUpdateHandler = null;
  }
}