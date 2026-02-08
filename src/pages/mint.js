/**
 * Mint Page - Dynamic Collection Minting
 * Renders mint interface for any collection based on slug
 */

import { getCollectionBySlug } from '../lib/loadCollections.js';
import { getContractConfig } from '../../contracts/index.js';
import { getCollectionData, resolveStage, mint, getMintButtonText } from '../lib/mintHelpers.js';
import { state, updateState, EVENTS } from '../state.js';
import { router } from '../lib/router.js';
import { switchChain } from '@wagmi/core';
import { connectWallet, switchToBase, wagmiAdapter } from '../wallet.js';
import { shortenAddress } from '../utils/dom.js';
import { DEFAULT_CHAIN } from '../utils/chain.js';

// Current collection reference
let currentCollection = null;

/**
 * Render the mint page for a collection
 * @param {Object} params - Route params with slug
 */
export async function renderMintPage(params) {
  const { slug } = params;
  const collection = getCollectionBySlug(slug);

  if (!collection) {
    render404(slug);
    return;
  }

  currentCollection = collection;

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 text-white">
      <!-- Header -->
      <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <button id="back-btn" class="text-white hover:text-indigo-400 transition flex items-center space-x-2">
            <span>←</span>
            <span>Back</span>
          </button>
          
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
        <div class="max-w-4xl mx-auto">
          <!-- Collection Info Card -->
          <div class="glass-card p-8 rounded-2xl mb-8">
            <div class="grid md:grid-cols-2 gap-8">
              <!-- Image -->
              <div class="relative">
                <img src="${collection.imageUrl}" 
                     alt="${collection.name}"
                     class="w-full aspect-square object-cover rounded-xl shadow-2xl"
                     onerror="this.src='/placeholder.png'">
                
                ${collection.featured ? `
                  <div class="absolute top-4 right-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-black px-3 py-1 rounded-full text-sm font-bold">
                    ⭐ FEATURED
                  </div>
                ` : ''}
              </div>
              
              <!-- Details -->
              <div class="flex flex-col justify-center">
                <h1 class="text-4xl font-bold mb-4 bg-gradient-to-r from-indigo-400 to-purple-500 bg-clip-text text-transparent">
                  ${collection.name}
                </h1>
                
                <p class="text-lg opacity-80 mb-6">
                  ${collection.description}
                </p>
                
                <!-- Stats Grid -->
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  <div class="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                    <div class="text-xs opacity-60 mb-1">Total Supply</div>
                    <div class="text-2xl font-bold">${collection.mintPolicy.maxSupply.toLocaleString()}</div>
                  </div>
                  <div class="bg-white/5 p-4 rounded-xl border border-white/10 text-center">
                    <div class="text-xs opacity-60 mb-1">Minted</div>
                    <div id="minted-count" class="text-2xl font-bold">
                      <span class="animate-pulse">...</span>
                    </div>
                  </div>
                  <div class="bg-white/5 p-4 rounded-xl border border-white/10 text-center col-span-2 md:col-span-1">
                    <div class="text-xs opacity-60 mb-1">Max per Wallet</div>
                    <div class="text-2xl font-bold">${collection.mintPolicy.maxPerWallet || '∞'}</div>
                  </div>
                </div>
                
                <!-- Tags -->
                <div class="flex flex-wrap gap-2">
                  ${collection.tags.map(tag => `
                    <span class="px-3 py-1 bg-indigo-500/20 text-indigo-300 rounded-full text-xs font-medium">
                      #${tag}
                    </span>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
          
          <!-- Mint Interface Card -->
          <div class="glass-card p-8 rounded-2xl">
            <h2 class="text-2xl font-bold mb-6">Mint Your NFT</h2>
            
            <!-- Progress Bar -->
            <div class="mb-6">
              <div class="flex justify-between text-sm mb-2">
                <span class="opacity-60">Mint Progress</span>
                <span>
                  <span id="supply-minted">0</span> / ${collection.mintPolicy.maxSupply.toLocaleString()}
                </span>
              </div>
              <div class="w-full bg-white/10 rounded-full h-3 overflow-hidden">
                <div id="supply-bar" class="bg-gradient-to-r from-indigo-500 to-purple-500 h-3 rounded-full transition-all duration-500" style="width: 0%"></div>
              </div>
            </div>
            
            <!-- Stage Info -->
            <div id="stage-info" class="mb-6 p-4 bg-white/5 rounded-xl border border-white/10">
              <div class="text-sm opacity-60">Current Stage</div>
              <div id="stage-name" class="text-lg font-medium">Loading...</div>
            </div>
            
            <!-- Mint Button -->
            <button id="mint-btn" class="w-full legendary-button py-4 rounded-xl font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all">
              <span id="mint-text">Loading...</span>
            </button>
            
            <!-- Status Message -->
            <p id="mint-status" class="text-center text-sm mt-4 opacity-60"></p>
            
            <!-- Your Mints -->
            <div id="your-mints" class="mt-6 pt-6 border-t border-white/10 hidden">
              <div class="flex justify-between items-end">
                <div>
                  <div class="text-sm opacity-60 mb-1">Your Mints</div>
                  <div id="your-mint-count" class="text-2xl font-bold">0</div>
                </div>
                <div class="text-right">
                  <div class="text-xs opacity-50 mb-1">Remaining</div>
                  <div id="remaining-count" class="text-lg font-medium text-indigo-300">0</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Contract Info -->
          <div class="mt-8 text-center text-sm opacity-40">
            <p>
              Contract: 
              <a href="${getExplorerUrl(collection.chainId)}/address/${collection.contractAddress}" 
                 target="_blank" 
                 rel="noopener noreferrer"
                 class="hover:text-indigo-400 hover:underline transition-colors">
                ${collection.contractAddress.slice(0, 10)}...${collection.contractAddress.slice(-8)}
              </a>
            </p>
            <p>Chain: ${getChainName(collection.chainId)}</p>
          </div>
        </div>
      </main>
    </div>
  `;

  // Attach event handlers
  attachEventHandlers(collection);

  // Initialize mint interface
  await initMintInterface(collection);

  // Listen for wallet updates
  document.addEventListener(EVENTS.WALLET_UPDATE, handleWalletUpdate);
}

/**
 * Render 404 page
 */
function render404(slug) {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen bg-slate-900 text-white flex items-center justify-center">
      <div class="text-center">
        <h1 class="text-6xl font-bold mb-4">404</h1>
        <p class="text-xl opacity-60 mb-8">Collection "${slug}" not found</p>
        <button id="go-home-btn" class="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-medium transition">
          Go Home
        </button>
      </div>
    </div>
  `;

  document.getElementById('go-home-btn')?.addEventListener('click', () => {
    router.navigate('/');
  });
}

/**
 * Attach event handlers
 */
function attachEventHandlers(collection) {
  // Back button
  document.getElementById('back-btn')?.addEventListener('click', () => {
    router.navigate('/');
  });

  // Connect button
  document.getElementById('connect-btn')?.addEventListener('click', async () => {
    await connectWallet();
  });

  // Mint button - will be set up in initMintInterface
}

/**
 * Initialize mint interface with on-chain data
 */
async function initMintInterface(collection) {
  const mintBtn = document.getElementById('mint-btn');
  const mintText = document.getElementById('mint-text');
  const mintStatus = document.getElementById('mint-status');
  const stageInfo = document.getElementById('stage-info');
  const stageName = document.getElementById('stage-name');

  // Check wallet connection
  if (!state.wallet?.isConnected || !state.wallet?.address) {
    mintText.textContent = 'Connect Wallet';
    stageName.textContent = 'Connect to view';

    mintBtn.onclick = async () => {
      await connectWallet();
    };
    return;
  }

  try {
    // Fetch on-chain data
    const { mintedCount, totalSupply, maxSupply } = await getCollectionData(collection, state.wallet.address);

    // Update UI
    document.getElementById('minted-count').textContent = totalSupply.toLocaleString();
    document.getElementById('supply-minted').textContent = totalSupply.toLocaleString();
    document.getElementById('supply-bar').style.width = `${(totalSupply / maxSupply) * 100}%`;

    // Show user's mints
    const yourMintsSection = document.getElementById('your-mints');
    const yourMintCount = document.getElementById('your-mint-count');
    const remainingCount = document.getElementById('remaining-count');

    if (yourMintsSection && yourMintCount) {
      yourMintsSection.classList.remove('hidden');
      yourMintCount.textContent = mintedCount;

      if (remainingCount) {
        const max = collection.mintPolicy.maxPerWallet || 0;
        const left = Math.max(0, max - mintedCount);
        remainingCount.textContent = max ? left : '∞';
      }
    }

    // Check if sold out
    if (totalSupply >= maxSupply) {
      mintText.textContent = 'Sold Out 🎉';
      mintBtn.disabled = true;
      stageName.textContent = 'Collection sold out!';
      stageInfo.classList.add('border-green-500/30', 'bg-green-500/10');
      return;
    }

    // Resolve current stage
    const stage = resolveStage(collection.mintPolicy, mintedCount);

    if (!stage) {
      mintText.textContent = 'Limit Reached';
      mintBtn.disabled = true;
      stageName.textContent = 'You have reached your mint limit';
      stageInfo.classList.add('border-yellow-500/30', 'bg-yellow-500/10');
      return;
    }

    // Update stage info
    stageName.textContent = stage.name || stage.type;
    mintText.textContent = getMintButtonText(stage);
    mintBtn.disabled = false;

    // Show Burn Token info
    if (stage.type === 'BURN_ERC20' && stage.token) {
      const stageInfo = document.getElementById('stage-info');

      // Check if already added
      if (!document.getElementById('burn-token-info')) {
        const tokenDiv = document.createElement('div');
        tokenDiv.id = 'burn-token-info';
        tokenDiv.className = 'mt-3 pt-3 border-t border-white/10 text-xs flex justify-between items-center';
        tokenDiv.innerHTML = `
                <span class="opacity-60">Token: <span class="font-mono text-indigo-300 ml-1">${stage.token.slice(0, 6)}...${stage.token.slice(-4)}</span></span>
                <button class="bg-white/10 hover:bg-white/20 px-2 py-1 rounded transition-colors text-[10px]" 
                        onclick="navigator.clipboard.writeText('${stage.token}'); this.innerText = 'Copied!'; setTimeout(() => this.innerText = 'Copy', 1000);">
                    Copy
                </button>
            `;
        stageInfo.appendChild(tokenDiv);
      }
    }

    // Set up mint handler
    mintBtn.onclick = async () => {
      await handleMint(collection, stage);
    };

  } catch (error) {
    console.error('Error initializing mint interface:', error);
    mintStatus.textContent = 'Error loading collection data';
    mintText.textContent = 'Error';
    mintBtn.disabled = true;
  }
}

/**
 * Handle mint action
 */
async function handleMint(collection, stage) {
  const mintBtn = document.getElementById('mint-btn');
  const mintText = document.getElementById('mint-text');
  const mintStatus = document.getElementById('mint-status');

  // Check wallet
  if (!state.wallet?.isConnected) {
    await connectWallet();
    return;
  }

  // Check chain
  if (state.wallet.chainId !== collection.chainId) {
    try {
      mintStatus.textContent = `Switching to ${getChainName(collection.chainId)}...`;
      await switchChain(wagmiAdapter.wagmiConfig, { chainId: collection.chainId });
    } catch (e) {
      mintStatus.textContent = `Please switch to ${getChainName(collection.chainId)}`;
      return;
    }
  }

  try {
    mintBtn.disabled = true;
    mintText.textContent = 'Minting...';
    mintStatus.textContent = 'Confirm transaction in your wallet';

    const hash = await mint(collection, stage);

    mintText.textContent = 'Success! 🎉';
    mintStatus.textContent = `Transaction: ${hash.slice(0, 10)}...`;
    mintStatus.innerHTML = `<a href="https://basescan.org/tx/${hash}" target="_blank" class="text-indigo-400 underline">View on Basescan</a>`;

    // Refresh after success
    setTimeout(() => {
      initMintInterface(collection);
    }, 3000);

  } catch (error) {
    console.error('Mint error:', error);
    mintText.textContent = 'Mint Failed';
    mintStatus.textContent = error.message || 'Something went wrong';
    mintBtn.disabled = false;

    // Reset after error
    setTimeout(() => {
      initMintInterface(collection);
    }, 3000);
  }
}

/**
 * Handle wallet update event
 */
async function handleWalletUpdate(e) {
  const account = e.detail;

  // Update state
  state.wallet = account;

  // Update connect button
  const connectText = document.getElementById('connect-text');
  const statusGlow = document.querySelector('.status-glow');

  if (connectText) {
    connectText.textContent = account.isConnected ? shortenAddress(account.address) : 'Connect Wallet';
  }

  if (statusGlow) {
    statusGlow.style.background = account.isConnected ? '#10B981' : '#EF4444';
    statusGlow.style.boxShadow = `0 0 10px ${account.isConnected ? '#10B981' : '#EF4444'}`;
  }

  // Refresh mint interface
  if (currentCollection) {
    await initMintInterface(currentCollection);
  }
}

/**
 * Get chain name from ID
 */
function getChainName(chainId) {
  const chains = {
    1: 'Ethereum',
    8453: 'Base',
    84532: 'Base Sepolia',
    10: 'Optimism',
    42161: 'Arbitrum'
  };
  return chains[chainId] || `Chain ${chainId}`;
}

// Cleanup on page leave
export function cleanup() {
  document.removeEventListener(EVENTS.WALLET_UPDATE, handleWalletUpdate);
  currentCollection = null;
}

/**
 * Get block explorer URL
 */
function getExplorerUrl(chainId) {
  const explorers = {
    1: 'https://etherscan.io',
    8453: 'https://basescan.org',
    84532: 'https://sepolia.basescan.org',
    10: 'https://optimistic.etherscan.io',
    42161: 'https://arbiscan.io'
  };
  return explorers[chainId] || 'https://basescan.org';
}
