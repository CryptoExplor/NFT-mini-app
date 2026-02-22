/**
 * Mint Page - Dynamic Collection Minting
 * Renders mint interface for any collection based on slug
 */

import { getCollectionBySlug } from '../lib/loadCollections.js';
import { getCollectionData, resolveStage, mint, getMintButtonText } from '../lib/mintHelpers.js';
import { state, EVENTS } from '../state.js';
import { router } from '../lib/router.js';
import { switchChain, getGasPrice } from '@wagmi/core';
import { connectWallet, wagmiAdapter } from '../wallet.js';
import { getExplorerUrl, getChainName } from '../utils/chain.js';
import { toast } from '../utils/toast.js';
import { handleMintError } from '../utils/errorHandler.js';
import { trackMint, trackMintClick, trackMintAttempt, trackTxSent, trackMintFailure, trackCollectionView } from '../lib/api.js';
import { renderTransactionHistory } from '../components/TransactionHistory.js';
import { shareCollection, shareToTwitter } from '../utils/social.js';
import { cache } from '../utils/cache.js';
import { getCollectionActions, getActionInputDefs, getActionConfigInputDefs, executeContractAction } from '../lib/contractActions.js';
import { fetchOwnedTokenIdsForContract, getOpenSeaChainFromChainId } from '../lib/opensea.js';

import { applyMiniAppAvatar, getWalletIdentityLabel } from '../utils/profile.js';
import { bindBottomNavEvents, renderBottomNav } from '../components/BottomNav.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';

// Current collection reference
let currentCollection = null;
let currentCollectionActions = [];
let mintCountdownInterval = null;
let ownedTokenIdsRequestNonce = 0;
let ownedTokenIdsLoading = false;

function clearMintCountdownTicker() {
  if (mintCountdownInterval) {
    clearInterval(mintCountdownInterval);
    mintCountdownInterval = null;
  }
}

function formatMintCountdown(ms) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getActionButtonText(action) {
  if (action.buttonLabel) return action.buttonLabel;
  if (action.type === 'TRANSFER') return 'Transfer';
  if (action.type === 'SEND_TO_DEAD') return 'Send to Dead';
  return 'Run Action';
}

function renderActionInput(action, input) {
  const inputKey = `${action.id}:${input.key}`;
  const label = escapeHtml(input.label || input.key);
  const placeholder = escapeHtml(input.placeholder || '');
  const normalizedType = String(input.type || '').toLowerCase();

  if (normalizedType === 'bool') {
    return `
      <label class="block">
        <span class="text-xs opacity-60 mb-1 block">${label}</span>
        <select
          data-action-input="${inputKey}"
          class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50"
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      </label>
    `;
  }

  const isIntegerNumeric = normalizedType.startsWith('uint') || normalizedType.startsWith('int');
  const isDecimalNumeric = normalizedType === 'eth' || normalizedType === 'decimal';
  const inputMode = isIntegerNumeric ? 'numeric' : isDecimalNumeric ? 'decimal' : 'text';

  return `
    <label class="block">
      <span class="text-xs opacity-60 mb-1 block">${label}</span>
      <input
        type="text"
        inputmode="${inputMode}"
        placeholder="${placeholder}"
        data-action-input="${inputKey}"
        class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500/50"
      />
    </label>
  `;
}

function actionNeedsTokenId(action) {
  return (action.args || []).some((arg) => String(arg.key || '').toLowerCase() === 'tokenid');
}

function collectionNeedsTokenId(actions) {
  return actions.some((action) => actionNeedsTokenId(action));
}

function getMergedActionInputDefs(action) {
  const merged = [...getActionInputDefs(action), ...getActionConfigInputDefs(action)];
  const seen = new Set();
  return merged.filter((input) => {
    const key = String(input?.key || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderContractActionsSection(actions) {
  if (!actions.length) return '';
  const showTokenIds = collectionNeedsTokenId(actions);

  return `
    <div class="glass-card p-8 rounded-2xl mt-8">
      <h2 class="text-2xl font-bold mb-2">Contract Actions</h2>
      <p class="text-sm opacity-60 mb-6">Collection-specific interactions for holders.</p>
      ${showTokenIds ? `
        <div id="owned-token-ids-panel" class="mb-6 p-4 bg-emerald-500/10 border border-emerald-400/30 rounded-xl">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div class="text-sm font-semibold text-emerald-200">Your Token IDs</div>
            <button
              type="button"
              id="refresh-token-ids-btn"
              class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Refresh
            </button>
          </div>
          <div id="owned-token-ids-content" class="text-xs opacity-70">
            Connect wallet to load token IDs.
          </div>
        </div>
      ` : ''}
      <div class="space-y-4">
        ${actions.map((action) => {
    const inputDefs = getMergedActionInputDefs(action);
    return `
            <div class="p-4 bg-white/5 rounded-xl border border-white/10" data-contract-action="${action.id}">
              <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                <div>
                  <div class="text-base font-semibold">${escapeHtml(action.label)}</div>
                  ${action.description ? `<div class="text-xs opacity-60 mt-1">${escapeHtml(action.description)}</div>` : ''}
                </div>
                <button
                  type="button"
                  data-action-exec="${action.id}"
                  class="self-start md:self-auto px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  ${escapeHtml(getActionButtonText(action))}
                </button>
              </div>
              <div class="grid md:grid-cols-2 gap-3">
                ${inputDefs.length
        ? inputDefs.map((input) => renderActionInput(action, input)).join('')
        : '<div class="text-xs opacity-50">No additional input required.</div>'}
              </div>
              <p class="text-xs mt-3 opacity-60" data-action-status="${action.id}"></p>
            </div>
          `;
  }).join('')}
      </div>
    </div>
  `;
}

/**
 * Render the mint page for a collection
 * @param {Object} params - Route params with slug
 */
export async function renderMintPage(params) {
  const { slug } = params;
  clearMintCountdownTicker();
  const collection = getCollectionBySlug(slug);

  // Track collection view for funnel analytics
  trackCollectionView(slug, state.wallet?.address || null);

  if (!collection) {
    render404(slug);
    return;
  }



  currentCollection = collection;
  currentCollectionActions = getCollectionActions(collection);

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="min-h-screen bg-slate-900 app-text">
      <!-- Header -->
      <header class="glass-header fixed top-0 left-0 right-0 z-40 p-4">
        <div class="max-w-6xl mx-auto flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <button id="back-btn" class="text-white hover:text-indigo-400 transition flex items-center space-x-2">
              <span>←</span>
              <span>Back</span>
            </button>
            <button id="share-btn" class="glass-card px-3 py-1.5 rounded-full flex items-center space-x-2 border border-indigo-500/30 hover:border-indigo-400 hover:scale-105 active:scale-95 transition-all group">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-indigo-300 group-hover:text-white transition-colors translate-x-[0.5px]">
                <path stroke-linecap="round" stroke-linejoin="round" d="M18 18.72a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM18 5.28a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0ZM7.5 12a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="m13.5 16.3-5.06-3.04m5.06-4.52-5.06 3.04" />
              </svg>
              <span class="text-xs font-bold text-indigo-100 group-hover:text-white">Share</span>
            </button>
          </div>
          
          <div class="flex items-center space-x-2">
            ${renderThemeToggleButton('theme-toggle-mint')}
            <button id="connect-btn" class="glass-card px-4 py-2 rounded-full flex items-center space-x-2 hover:scale-105 transition-transform">
              <div class="status-glow" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
              <img id="connect-avatar" class="w-5 h-5 rounded-full object-cover hidden" alt="Profile avatar">
              <span id="connect-text" class="text-sm font-medium">
                ${getWalletIdentityLabel(state.wallet)}
              </span>
            </button>
          </div>
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
                     loading="lazy"
                     class="w-full aspect-square object-cover rounded-xl shadow-2xl img-fade-in"
                     onerror="this.src='/placeholder.png'">
                

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

                ${collection.openseaUrl ? `
                  <div class="mt-5">
                    <a href="${collection.openseaUrl}"
                       target="_blank"
                       rel="noopener noreferrer"
                       class="inline-flex items-center px-4 py-2 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 hover:bg-emerald-500/25 hover:text-emerald-200 transition-colors text-sm font-semibold">
                      View on OpenSea
                    </a>
                  </div>
                ` : ''}
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
            
            <!-- Transaction Preview -->
            <div id="tx-preview" class="mb-6 p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/30 hidden">
              <h3 class="text-sm font-bold mb-2 text-indigo-300">Transaction Preview</h3>
              <div class="space-y-1 text-xs">
                <div class="flex justify-between">
                  <span class="opacity-60">Mint Price</span>
                  <span id="preview-price">0 ETH</span>
                </div>
                <div class="flex justify-between">
                  <span class="opacity-60">Estimated Gas</span>
                  <span id="preview-gas">0 ETH</span>
                </div>
                <div class="pt-1 mt-1 border-t border-white/10 flex justify-between font-bold">
                  <span>Total Est.</span>
                  <span id="preview-total" class="text-indigo-300">0 ETH</span>
                </div>
              </div>
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
          
          <!-- Recent Transactions -->
          <div id="tx-history-container">
            ${renderTransactionHistory()}
          </div>

          ${renderContractActionsSection(currentCollectionActions)}
          
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
            ${collection.openseaUrl ? `
              <p>
                OpenSea:
                <a href="${collection.openseaUrl}"
                   target="_blank"
                   rel="noopener noreferrer"
                   class="hover:text-emerald-300 hover:underline transition-colors">
                  View Collection
                </a>
              </p>
            ` : ''}
          </div>
        </div>
      </main>
      ${renderBottomNav('home')}
    </div>
  `;

  // Attach event handlers
  attachEventHandlers(collection, currentCollectionActions);
  updateMintHeaderIdentity(state.wallet);

  // Initialize mint interface
  await initMintInterface(collection);
  void loadOwnedTokenIds(collection);

  // Listen for wallet updates
  document.addEventListener(EVENTS.WALLET_UPDATE, handleWalletUpdate);
}

/**
 * Render 404 page
 */
function render404(slug) {
  document.getElementById('app').innerHTML = `
    <div class="min-h-screen bg-slate-900 app-text flex items-center justify-center">
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
function attachEventHandlers(collection, actions = []) {
  // Back button
  document.getElementById('back-btn')?.addEventListener('click', () => {
    router.navigate('/');
  });

  // Share button
  document.getElementById('share-btn')?.addEventListener('click', async () => {
    if (currentCollection) await shareCollection(currentCollection);
  });



  // Connect button
  document.getElementById('connect-btn')?.addEventListener('click', async () => {
    await connectWallet();
  });

  // Mint button - will be set up in initMintInterface
  bindContractActionHandlers(collection, actions);
  document.getElementById('refresh-token-ids-btn')?.addEventListener('click', () => {
    if (ownedTokenIdsLoading) return;
    void loadOwnedTokenIds(collection, { force: true });
  });
  bindBottomNavEvents();
  bindThemeToggleEvents();
}

function getActionInputValues(action) {
  const inputValues = {};
  const inputDefs = getMergedActionInputDefs(action);

  for (const input of inputDefs) {
    const selector = `[data-action-input="${action.id}:${input.key}"]`;
    const element = document.querySelector(selector);
    inputValues[input.key] = element?.value?.trim() || '';
  }

  return inputValues;
}

function setOwnedTokenIdsLoading(isLoading) {
  ownedTokenIdsLoading = isLoading === true;
  const refreshBtn = document.getElementById('refresh-token-ids-btn');
  if (!refreshBtn) return;

  refreshBtn.disabled = ownedTokenIdsLoading;
  refreshBtn.classList.toggle('opacity-60', ownedTokenIdsLoading);
  refreshBtn.classList.toggle('cursor-not-allowed', ownedTokenIdsLoading);
  refreshBtn.innerHTML = ownedTokenIdsLoading
    ? `
      <span class="inline-flex items-center gap-1">
        <svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" stroke-width="3"></circle>
          <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
        </svg>
        Refreshing
      </span>
    `
    : 'Refresh';
}

function bindContractActionHandlers(collection, actions) {
  if (!actions.length) return;

  for (const action of actions) {
    const button = document.querySelector(`[data-action-exec="${action.id}"]`);
    const statusEl = document.querySelector(`[data-action-status="${action.id}"]`);
    if (!button) continue;

    button.addEventListener('click', async () => {
      const originalLabel = button.textContent;

      if (statusEl) {
        statusEl.classList.remove('text-red-300', 'text-green-300');
      }

      try {
        if (!state.wallet?.isConnected || !state.wallet?.address) {
          if (statusEl) statusEl.textContent = 'Connect wallet to continue';
          await connectWallet();
        }

        if (!state.wallet?.isConnected || !state.wallet?.address) {
          if (statusEl) {
            statusEl.classList.add('text-red-300');
            statusEl.textContent = 'Wallet connection is required';
          }
          return;
        }

        if (state.wallet.chainId !== collection.chainId) {
          if (statusEl) statusEl.textContent = `Switching to ${getChainName(collection.chainId)}...`;
          await switchChain(wagmiAdapter.wagmiConfig, { chainId: collection.chainId });
        }

        const inputValues = getActionInputValues(action);

        button.disabled = true;
        button.textContent = 'Confirm in Wallet';
        if (statusEl) statusEl.textContent = 'Confirm transaction in your wallet';

        const hash = await executeContractAction(collection, action, inputValues, state.wallet.address);
        const explorerBase = getExplorerUrl(collection.chainId);
        const successText = action.successMessage || `${action.label} completed`;

        if (statusEl) {
          statusEl.classList.add('text-green-300');
          statusEl.innerHTML = `
            ${escapeHtml(successText)}.
            <a
              href="${explorerBase}/tx/${hash}"
              target="_blank"
              rel="noopener noreferrer"
              class="underline text-indigo-300 ml-1"
            >
              View transaction
            </a>
          `;
        }

        toast.show(successText, 'success');

        cache.delete(`col_data_${collection.slug}_${state.wallet.address}`);
        void loadOwnedTokenIds(collection, { force: true });

      } catch (error) {
        const friendlyMessage = handleMintError(error);
        if (statusEl) {
          statusEl.classList.add('text-red-300');
          statusEl.textContent = friendlyMessage;
        }
        toast.show(friendlyMessage, 'error');
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  }
}

function getOpenSeaCollectionSlug(collection) {
  const rawUrl = String(collection?.openseaUrl || '').trim();
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const collectionIndex = segments.findIndex((seg) => seg.toLowerCase() === 'collection');
    if (collectionIndex >= 0 && segments[collectionIndex + 1]) {
      return segments[collectionIndex + 1];
    }
    if (segments.length) {
      return segments[segments.length - 1];
    }
  } catch {
    // Ignore malformed URL and fallback to null.
  }

  return null;
}

function setOwnedTokenIdsMessage(message, tone = 'neutral') {
  const content = document.getElementById('owned-token-ids-content');
  if (!content) return;

  const toneClass = tone === 'error'
    ? 'text-red-300'
    : tone === 'success'
      ? 'text-emerald-200'
      : 'opacity-70';

  content.innerHTML = `<span class="${toneClass}">${escapeHtml(message)}</span>`;
}

function applyTokenIdToActionInputs(tokenId) {
  const tokenInputs = [...document.querySelectorAll('[data-action-input]')].filter((input) =>
    String(input.getAttribute('data-action-input') || '').toLowerCase().endsWith(':tokenid')
  );
  if (!tokenInputs.length) return;

  const active = document.activeElement;
  const preferred = tokenInputs.find((input) => input === active);
  const empty = tokenInputs.find((input) => !String(input.value || '').trim());
  const target = preferred || empty || tokenInputs[0];
  if (!target) return;

  target.value = String(tokenId);
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.focus();
}

function renderOwnedTokenIdChips(tokenIds) {
  const content = document.getElementById('owned-token-ids-content');
  if (!content) return;

  const chips = tokenIds.slice(0, 80).map((tokenId) => `
    <button
      type="button"
      data-owned-token-id="${escapeHtml(tokenId)}"
      class="px-2 py-1 rounded bg-white/10 hover:bg-indigo-500/30 border border-white/10 hover:border-indigo-400 transition-colors font-mono text-[11px]"
    >
      #${escapeHtml(tokenId)}
    </button>
  `).join('');

  const overflow = tokenIds.length > 80
    ? `<span class="text-[11px] opacity-60 px-2 py-1">+${tokenIds.length - 80} more</span>`
    : '';

  content.innerHTML = `
    <div class="mb-2 opacity-70">Tap a token ID to autofill action inputs.</div>
    <div class="flex flex-wrap gap-2">${chips}${overflow}</div>
  `;

  content.querySelectorAll('[data-owned-token-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const tokenId = button.getAttribute('data-owned-token-id');
      if (!tokenId) return;
      applyTokenIdToActionInputs(tokenId);
    });
  });
}

async function loadOwnedTokenIds(collection, options = {}) {
  const panel = document.getElementById('owned-token-ids-panel');
  const content = document.getElementById('owned-token-ids-content');
  if (!panel || !content) return;

  if (!state.wallet?.isConnected || !state.wallet?.address) {
    setOwnedTokenIdsLoading(false);
    setOwnedTokenIdsMessage('Connect wallet to load token IDs.', 'neutral');
    return;
  }

  const chain = getOpenSeaChainFromChainId(collection.chainId);
  const requestNonce = ++ownedTokenIdsRequestNonce;
  setOwnedTokenIdsLoading(true);
  setOwnedTokenIdsMessage('Loading token IDs...', 'neutral');

  try {
    const collectionSlug = getOpenSeaCollectionSlug(collection);
    let tokenIds = await fetchOwnedTokenIdsForContract(state.wallet.address, {
      chain: chain || null,
      chainId: collection.chainId,
      contractAddress: collection.contractAddress,
      collection: collectionSlug,
      maxPages: 8,
      limit: 50,
      force: options.force === true
    });

    if (!tokenIds.length && collectionSlug && chain) {
      tokenIds = await fetchOwnedTokenIdsForContract(state.wallet.address, {
        chain,
        chainId: collection.chainId,
        contractAddress: collection.contractAddress,
        collection: null,
        maxPages: 8,
        limit: 50,
        force: options.force === true
      });
    }

    if (requestNonce !== ownedTokenIdsRequestNonce) return;

    if (!tokenIds.length) {
      setOwnedTokenIdsMessage('No token IDs found for this collection in your connected wallet.', 'neutral');
      return;
    }

    renderOwnedTokenIdChips(tokenIds);
  } catch (error) {
    if (requestNonce !== ownedTokenIdsRequestNonce) return;
    console.warn('Failed to load held token IDs:', error);
    setOwnedTokenIdsMessage('Unable to load token IDs right now.', 'error');
  } finally {
    if (requestNonce === ownedTokenIdsRequestNonce) {
      setOwnedTokenIdsLoading(false);
    }
  }
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
  const status = String(collection.status || '').toLowerCase();

  // Upcoming collections are visible in the 72h window, but minting stays locked until launchAt.
  if (status === 'upcoming') {
    clearMintCountdownTicker();
    mintText.textContent = 'Coming Soon';
    mintBtn.disabled = true;
    stageInfo.classList.add('border-blue-500/30', 'bg-blue-500/10');

    const launchTs = Number(collection.launchAtTs);
    const hasValidLaunch = Number.isFinite(launchTs);

    const renderUpcomingState = () => {
      if (!window.location.pathname.startsWith('/mint/')) {
        clearMintCountdownTicker();
        return;
      }

      if (hasValidLaunch) {
        const remaining = launchTs - Date.now();
        if (remaining <= 0) {
          clearMintCountdownTicker();
          const fresh = getCollectionBySlug(collection.slug);
          if (fresh) {
            currentCollection = fresh;
            initMintInterface(fresh);
          } else {
            router.navigate('/');
          }
          return;
        }

        stageName.textContent = `Launches in ${formatMintCountdown(remaining)}`;
        mintStatus.textContent = `Launch: ${new Date(launchTs).toUTCString()}`;
      } else {
        stageName.textContent = 'This collection is coming soon';
      }
    };

    renderUpcomingState();
    if (hasValidLaunch) {
      mintCountdownInterval = setInterval(renderUpcomingState, 1000);
    }

    // Show user's mints section but with zero counts
    const yourMintsSection = document.getElementById('your-mints');
    const yourMintCount = document.getElementById('your-mint-count');
    const remainingCount = document.getElementById('remaining-count');

    if (yourMintsSection && yourMintCount) {
      yourMintsSection.classList.remove('hidden');
      yourMintCount.textContent = '0';

      if (remainingCount) {
        const max = collection.mintPolicy.maxPerWallet || 0;
        remainingCount.textContent = max ? max : '∞';
      }
    }

    // Update supply display to show max supply
    document.getElementById('minted-count').textContent = '0';
    document.getElementById('supply-minted').textContent = '0';
    document.getElementById('supply-bar').style.width = '0%';
    return;
  }

  clearMintCountdownTicker();
  stageInfo.classList.remove('border-blue-500/30', 'bg-blue-500/10');

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
    mintText.textContent = await getMintButtonText(stage);
    mintBtn.disabled = false;

    // Update Transaction Preview
    updateTransactionPreview(collection, stage);

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
      // Track click intent
      if (state.wallet?.address) {
        trackMintClick(state.wallet.address, collection.slug);
      }
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
/**
 * Update transaction preview with gas estimation
 */
async function updateTransactionPreview(collection, stage) {
  const preview = document.getElementById('tx-preview');
  if (!preview) return;

  if (!state.wallet?.isConnected || !stage) {
    preview.classList.add('hidden');
    return;
  }

  preview.classList.remove('hidden');
  const priceText = document.getElementById('preview-price');
  const gasText = document.getElementById('preview-gas');
  const totalText = document.getElementById('preview-total');

  const itemCost = stage.price ? Number(stage.price) / 1e18 : 0;

  if (stage.type === 'BURN_ERC20') {
    priceText.textContent = `Burn ${stage.amount} ${stage.tokenName || 'Tokens'}`;
    priceText.classList.add('text-orange-400');
  } else {
    priceText.textContent = `${itemCost.toFixed(6)} ETH`;
    priceText.classList.remove('text-orange-400');
  }

  try {
    const cacheKey = `gas_price_${collection.chainId}`;
    let gasPrice = cache.get(cacheKey);

    if (!gasPrice) {
      gasPrice = await getGasPrice(wagmiAdapter.wagmiConfig);
      cache.set(cacheKey, gasPrice, 15000); // 15s cache
    }

    // Estimate gas for a standard mint (approx 200k gas as buffer if estimation fails)
    // Burn mints usually cost more gas (approx 250k-300k with approval)
    const gasLimit = stage.type === 'BURN_ERC20' ? 300000n : 200000n;
    const gasCost = Number(gasLimit * gasPrice.gasPrice) / 1e18;

    gasText.textContent = `~${gasCost.toFixed(6)} ETH`;

    if (stage.type === 'BURN_ERC20') {
      totalText.textContent = `Burn + ~${gasCost.toFixed(6)} ETH`;
    } else {
      totalText.textContent = `${(itemCost + gasCost).toFixed(6)} ETH`;
    }
  } catch (e) {
    gasText.textContent = 'Estimation failed';
    totalText.textContent = stage.type === 'BURN_ERC20' ? 'Burn + gas' : `${itemCost.toFixed(6)} ETH + gas`;
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
      const errorMsg = handleMintError(e);
      toast.show(errorMsg, 'error');
      mintStatus.textContent = `Please switch to ${getChainName(collection.chainId)}`;
      return;
    }
  }

  try {
    mintBtn.disabled = true;
    mintText.textContent = 'Minting...';
    mintStatus.textContent = 'Confirm transaction in your wallet';

    // Track attempt

    trackMintAttempt(state.wallet.address, collection.slug);

    const hash = await mint(collection, stage);

    // Track success


    toast.show('Successfully minted NFT! 🎉', 'success');

    // Track on server (full funnel: tx_sent + mint_success)
    const mintPrice = stage.price ? Number(stage.price) / 1e18 : 0;
    trackTxSent(state.wallet.address, collection.slug, hash);
    trackMint(state.wallet.address, collection.slug, hash, mintPrice);

    mintText.textContent = 'Success! 🎉';
    mintStatus.textContent = `Transaction: ${hash.slice(0, 10)}...`;

    const explorerBase = getExplorerUrl(collection.chainId);
    mintStatus.innerHTML = `
      <div class="flex flex-col items-center space-y-4">
        <a href="${explorerBase}/tx/${hash}" target="_blank" class="text-indigo-400 underline text-sm mb-2">View on Explorer</a>
        ${collection.openseaUrl ? `
          <a href="${collection.openseaUrl}" target="_blank" rel="noopener noreferrer" class="text-emerald-300 underline text-sm">View Collection on OpenSea</a>
        ` : ''}
        
        <div class="w-full h-px mint-divider my-2"></div>
        
        <p class="mint-share-text font-bold">Share your mint! 🚀</p>
        
        <div class="flex space-x-3">
          <button id="share-mint-success" class="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl flex items-center space-x-2 transition-all transform hover:scale-105">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
              <path stroke-linecap="round" stroke-linejoin="round" d="M7.217 10.907a2.25 2.25 0 1 1 0 3.186m9.566-3.186a2.25 2.25 0 1 0 0 3.186m-7.566-1.593h5.566" />
            </svg>
            <span class="text-xs font-bold">Share Mint</span>
          </button>
          
          <button id="share-twitter-success" class="bg-gray-900 hover:bg-gray-800 text-white border border-gray-700 px-4 py-2 rounded-xl flex items-center space-x-2 transition-all transform hover:scale-105">
             <span class="text-lg">𝕏</span>
             <span class="text-xs font-bold">Share on X</span>
          </button>
        </div>
      </div>
    `;

    // Attach success share handlers
    document.getElementById('share-mint-success')?.addEventListener('click', () => {
      shareCollection(collection);
    });

    document.getElementById('share-twitter-success')?.addEventListener('click', () => {
      shareToTwitter(collection);
    });

    // Store transaction locally
    const { storeTransaction } = await import('../lib/mintHelpers.js');
    storeTransaction({
      hash,
      collectionName: collection.name,
      slug: collection.slug,
      chainId: collection.chainId
    });

    // Clear cache for this collection to force refresh
    cache.delete(`col_data_${collection.slug}_${state.wallet.address}`);

    // Refresh after success
    setTimeout(() => {
      initMintInterface(collection);
      void loadOwnedTokenIds(collection, { force: true });
    }, 3000);

  } catch (error) {
    console.error('Mint error:', error);

    // Track failure

    trackMintFailure(state.wallet.address, collection.slug, error?.message || 'unknown');

    const friendlyMessage = handleMintError(error);
    toast.show(friendlyMessage, 'error');

    mintText.textContent = 'Mint Failed';
    mintStatus.textContent = friendlyMessage;
    mintBtn.disabled = false;

    // Reset after error
    setTimeout(() => {
      initMintInterface(collection);
      updateTransactionPreview(collection, stage);
    }, 5000);
  }
}

/**
 * Handle wallet update event
 */
async function handleWalletUpdate(e) {
  const account = e.detail;

  // Update state
  state.wallet = account;

  updateMintHeaderIdentity(account);

  // Refresh mint interface
  if (currentCollection) {
    await initMintInterface(currentCollection);
    void loadOwnedTokenIds(currentCollection);
  }
}

function updateMintHeaderIdentity(account) {
  const connectText = document.getElementById('connect-text');
  const statusGlow = document.querySelector('.status-glow');
  const connectAvatar = document.getElementById('connect-avatar');

  if (connectText) {
    connectText.textContent = getWalletIdentityLabel(account);
  }

  if (statusGlow) {
    statusGlow.style.background = account?.isConnected ? '#10B981' : '#EF4444';
    statusGlow.style.boxShadow = `0 0 10px ${account?.isConnected ? '#10B981' : '#EF4444'}`;
  }

  applyMiniAppAvatar(connectAvatar);
}

// Cleanup on page leave
export function cleanup() {
  document.removeEventListener(EVENTS.WALLET_UPDATE, handleWalletUpdate);
  clearMintCountdownTicker();
  currentCollection = null;
  currentCollectionActions = [];
  ownedTokenIdsRequestNonce++;
  ownedTokenIdsLoading = false;
}

