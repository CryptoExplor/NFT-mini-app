import { loadCollections } from '../lib/loadCollections.js';
import { router } from '../lib/router.js';
import { state, EVENTS } from '../state.js';
import { connectWallet, disconnectWallet, wagmiAdapter } from '../wallet.js';
import { shortenAddress } from '../utils/dom.js';
import { readContract, getPublicClient } from '@wagmi/core';
import { getContractConfig } from '../../contracts/index.js';
import { parseAbiItem, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

// Store event handler reference for cleanup
let walletUpdateHandler = null;

/**
 * Render the homepage with collection grid
 */
export async function renderHomePage() {
  const collections = loadCollections();

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 text-white font-sans">
      <!-- Header -->
      <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <h1 class="text-xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Base Mint App</h1>
          </div>
          
          <div class="flex items-center space-x-3">
            <!-- Desktop My NFTs Button -->
            <button id="desktop-nfts-btn" class="hidden sm:flex glass-card px-4 py-2 rounded-full items-center space-x-2 hover:bg-white/10 transition-colors">
              <span>🖼️</span>
              <span class="text-sm font-medium">My NFTs</span>
            </button>

            <!-- Desktop Connect Button -->
            <button id="connect-btn" class="hidden sm:flex glass-card px-4 py-2 rounded-full items-center space-x-2 hover:scale-105 transition-transform">
              <div class="status-glow" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
              <span id="connect-text" class="text-sm font-medium">
                ${state.wallet?.isConnected ? shortenAddress(state.wallet.address) : 'Connect Wallet'}
              </span>
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
          <div class="absolute right-0 top-0 bottom-0 w-full max-w-md bg-[#0f172a] border-l border-white/10 p-6 shadow-2xl transform translate-x-full transition-transform duration-300 flex flex-col" id="profile-content">
              
              <!-- Modal Header -->
              <div class="flex justify-between items-center mb-6">
                  <h2 class="text-2xl font-bold">My Profile</h2>
                  <button id="close-profile-btn" class="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
              </div>
              
              <!-- Wallet Connect Section -->
              <div class="mb-8 p-4 bg-white/5 rounded-xl border border-white/10">
                  <div id="profile-wallet-info" class="flex flex-col items-center">
                      <p class="opacity-50 text-sm mb-2">Wallet Status</p>
                      <button id="modal-connect-btn" class="w-full glass-card py-3 rounded-xl font-bold hover:bg-indigo-500/20 transition-all">
                        Connect Wallet
                      </button>
                  </div>
              </div>

              <!-- My NFTs Content -->
              <div class="flex-1 overflow-hidden flex flex-col">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold">My Collection</h3>
                    <button id="refresh-nfts-btn" class="text-xs opacity-50 hover:opacity-100 flex items-center space-x-1">
                        <span>🔄 Refresh</span>
                    </button>
                </div>
                
                <div id="my-nfts-grid" class="flex-1 overflow-y-auto grid grid-cols-2 gap-4 pb-10 pr-2 custom-scrollbar">
                    <div class="col-span-2 text-center py-20 opacity-30">
                        <div class="text-4xl mb-4">🖼️</div>
                        <p>Connect wallet to view your NFTs</p>
                    </div>
                </div>
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
    state.wallet = account;
    updateConnectButton(account);
    updateProfileWalletInfo(account);
    if (account.isConnected) {
      fetchUserNFTs();
    }
  };
  document.addEventListener(EVENTS.WALLET_UPDATE, walletUpdateHandler);

  // Connect button logic
  const connectBtn = document.getElementById('connect-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      if (state.wallet?.isConnected) {
        if (confirm('Disconnect wallet?')) {
          await disconnectWallet();
        }
      } else {
        await connectWallet();
      }
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
  const modal = document.getElementById('profile-modal');
  const backdrop = document.getElementById('profile-backdrop');
  const content = document.getElementById('profile-content');
  const closeBtn = document.getElementById('close-profile-btn');

  const mobileBtn = document.getElementById('mobile-profile-btn');
  const desktopBtn = document.getElementById('desktop-nfts-btn');
  const refreshBtn = document.getElementById('refresh-nfts-btn');
  const modalConnectBtn = document.getElementById('modal-connect-btn');

  if (!modal) return;

  const openModal = () => {
    modal.classList.remove('hidden');
    setTimeout(() => {
      backdrop.classList.remove('opacity-0');
      content.classList.remove('translate-x-full');
    }, 10);

    updateProfileWalletInfo(state.wallet);
    fetchUserNFTs();
  };

  const closeModal = () => {
    backdrop.classList.add('opacity-0');
    content.classList.add('translate-x-full');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  };

  // Event Listeners
  if (mobileBtn) mobileBtn.onclick = openModal;
  if (desktopBtn) desktopBtn.onclick = openModal;
  if (closeBtn) closeBtn.onclick = closeModal;
  if (backdrop) backdrop.onclick = closeModal;

  if (refreshBtn) {
    refreshBtn.onclick = () => {
      // Force refresh
      fetchUserNFTs();
    };
  }

  // Handle Connect inside modal
  if (modalConnectBtn) {
    modalConnectBtn.onclick = async () => {
      if (state.wallet?.isConnected) {
        if (confirm('Disconnect wallet?')) {
          await disconnectWallet();
        }
      } else {
        await connectWallet();
      }
    };
  }
}

function updateProfileWalletInfo(account) {
  const connectBtn = document.getElementById('modal-connect-btn');
  if (!connectBtn) return;

  if (account?.isConnected) {
    connectBtn.textContent = 'Disconnect ' + shortenAddress(account.address);
    connectBtn.className = 'w-full glass-card py-3 rounded-xl font-bold bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-all';
  } else {
    connectBtn.textContent = 'Connect Wallet';
    connectBtn.className = 'w-full glass-card py-3 rounded-xl font-bold hover:bg-indigo-500/20 transition-all';
  }
}

// Optimized Incremental Fetch
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

  // Process collections in parallel
  await Promise.all(collections.map(async (collection) => {
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
                            <img src="${collection.imageUrl}" class="w-10 h-10 rounded-lg object-cover" onerror="this.src='/placeholder.png'"/>
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
                                            <img src="${collection.imageUrl}" class="w-6 h-6 rounded-md"/>
                                            <span class="font-bold text-sm">${collection.name}</span>
                                            <span class="text-xs opacity-50">(${count})</span>
                                        </div>
                                        <a href="${explorerUrl}?a=${userAddress}" target="_blank" class="text-[10px] opacity-50 hover:opacity-100">Explorer ↗</a>
                                    </div>
                                    <div class="grid grid-cols-3 gap-2">
                                        ${tokens.map(t => `
                                            <div class="aspect-square bg-black/50 rounded-lg overflow-hidden relative group cursor-pointer border border-white/5 hover:border-indigo-500/50 transition-all"
                                                 onclick="window.open('${explorerUrl}?a=${t.id}', '_blank')">
                                                <img src="${t.image}" class="w-full h-full object-cover" onerror="this.src='${collection.imageUrl}'" />
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
  if (uri.startsWith('data:application/json;base64,')) {
    try {
      const json = atob(uri.replace('data:application/json;base64,', ''));
      return JSON.parse(json);
    } catch (e) { return {}; }
  }
  let url = uri;
  if (uri.startsWith('ipfs://')) url = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  if (url.startsWith('http')) {
    try {
      const res = await fetch(url);
      return await res.json();
    } catch (e) { return {}; }
  }
  return {};
}

function getExplorerAddressUrl(chainId, address) {
  if (chainId === 8453) return `https://basescan.org/token/${address}`;
  return `https://etherscan.io/token/${address}`;
}

// Expose router to window for debugging
if (typeof window !== 'undefined') {
  window.router = router;
}
