/**
 * Homepage - Collection Grid
 * Displays all available collections with navigation
 */

import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { state, EVENTS } from '../state.js';
import { connectWallet } from '../wallet.js';
import { shortenAddress } from '../utils/dom.js';

// Store event handler reference for cleanup
let walletUpdateHandler = null;

/**
 * Render the homepage with collection grid
 */
export async function renderHomePage() {
  const collections = loadCollections();

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 text-white">
      <!-- Header -->
      <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <h1 class="text-xl font-bold tracking-tight">Base Mint App</h1>
          </div>
          
          <button id="connect-btn" class="glass-card px-4 py-2 rounded-full flex items-center space-x-2 hover:scale-105 transition-transform">
            <div class="status-glow" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
            <span id="connect-text" class="text-sm font-medium">
              ${state.wallet?.isConnected ? shortenAddress(state.wallet.address) : 'Connect Wallet'}
            </span>
          </button>
        </div>
      </header>
      
      <!-- Main Content -->
      <main class="pt-24 pb-20 px-6">
        <div class="max-w-6xl mx-auto">
          <!-- Hero Section -->
          <div class="mb-10 text-center">
            <h1 class="text-5xl font-bold mb-3 bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
              NFT Collections
            </h1>
            <p class="text-xl opacity-70">
              ${collections.length} collection${collections.length !== 1 ? 's' : ''} available to mint
            </p>
          </div>
          
          <!-- Collection Grid (Centered) -->
          <div id="collection-grid" class="flex flex-wrap justify-center gap-6">
            ${collections.length > 0
      ? collections.map(collection => renderCollectionCard(collection)).join('')
      : '<p class="text-center opacity-50">No collections available</p>'
    }
          </div>
        </div>
      </main>
      
      <!-- Footer -->
      <footer class="fixed bottom-0 left-0 right-0 glass-header p-4">
        <div class="max-w-6xl mx-auto text-center text-sm opacity-50">
          Built with ❤️ for Farcaster
        </div>
      </footer>
    </div>
  `;

  // Attach event handlers
  attachEventHandlers();
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
      
      ${collection.featured ? `
        <div class="absolute top-4 right-4 z-10 bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-2 py-1 rounded text-xs font-bold">
          ⭐ FEATURED
        </div>
      ` : ''}
      
      <div class="relative bg-[#1a1b2e] rounded-xl overflow-hidden">
        <!-- Image -->
        <div class="aspect-square overflow-hidden">
          <img src="${collection.imageUrl}" 
               alt="${collection.name}"
               class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
               onerror="this.src='/placeholder.png'">
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
    // Update state
    state.wallet = account;
    // Update UI
    updateConnectButton(account);
  };
  document.addEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);

  // Connect button
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      await connectWallet();
    });
  }

  // Collection cards
  const cards = document.querySelectorAll('[data-collection]');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      const slug = card.dataset.collection;
      router.navigate(`/mint/${slug}`);
    });
  });
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

// Expose router to window for debugging
if (typeof window !== 'undefined') {
  window.router = router;
}

