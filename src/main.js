import { initWallet, connectWallet, disconnectWallet, switchToBase, wagmiAdapter } from './wallet.js';
import { state, updateState, EVENTS } from './state.js';
import { collections, defaultCollectionId } from './collections.js';
import { getCollectionData, resolveStage, mint } from './nft.js';
import { $, shortenAddress, safeLocalStorage } from './utils/dom.js';
import { DEFAULT_CHAIN } from './utils/chain.js';
import { initFarcasterSDK, isInFarcaster, getFarcasterSDK } from './farcaster.js';
import { sdk } from '@farcaster/miniapp-sdk';

// --- DOM Elements ---
const dom = {
    connectBtn: $('#connect-btn'),
    connectText: $('#connect-text'),
    connectionStatus: $('#connection-status'),
    statusGlow: $('.status-glow'),

    mintBtn: $('#mint-btn'),
    mintText: $('#mint-text'),

    supplyCount: $('#supply-count'),
    maxSupply: $('#max-supply'),

    collectionName: $('#collection-name'),
    collectionImage: $('#collection-image'),

    loadingOverlay: $('#loading-overlay'),

    toast: $('#toast'),
    toastMessage: $('#toast-message')
};

// --- Initialization ---

async function init() {
    // 1. Initialize Farcaster SDK FIRST and WAIT for ready
    const { sdk: farcasterSdk, context } = await initFarcasterSDK();
    
    if (isInFarcaster()) {
        console.log('Running in Farcaster:', context);
        state.farcaster = { sdk: farcasterSdk, context };
    }

    // 2. Initialize Wallet
    initWallet();

    // 3. Load Default Collection
    const collection = collections[defaultCollectionId];
    updateState('collection', collection);

    // 4. Render Initial UI
    renderCollectionInfo(collection);

    // 5. Hide loading overlay
    hideLoading();

    // 6. CRITICAL: Tell Farcaster the app is ready
    const farcasterSDKInstance = getFarcasterSDK();
    if (farcasterSDKInstance) {
        try {
            await farcasterSDKInstance.actions.ready({ disableNativeGestures: true });
            console.log('Farcaster SDK: ready() called');
            
            // 7. IMPORTANT: Call addMiniApp AFTER ready() and after a small delay
            await new Promise(resolve => setTimeout(resolve, 1000));
            await tryAddMiniApp();
        } catch (error) {
            console.warn('Failed to call ready():', error);
        }
    }
}

// Function to try adding mini app
async function tryAddMiniApp() {
    if (!isInFarcaster()) {
        console.log('Not in Farcaster - skipping addMiniApp');
        return;
    }

    const hasPromptedAddApp = safeLocalStorage.getItem('hasPromptedAddApp');
    
    if (!hasPromptedAddApp) {
        try {
            console.log('Attempting to show addMiniApp prompt...');
            const farcasterSDKInstance = getFarcasterSDK();
            
            if (farcasterSDKInstance && farcasterSDKInstance.actions && farcasterSDKInstance.actions.addMiniApp) {
                await farcasterSDKInstance.actions.addMiniApp();
                console.log('✅ addMiniApp prompt shown successfully');
                safeLocalStorage.setItem('hasPromptedAddApp', 'true');
            } else {
                console.warn('addMiniApp action not available');
            }
        } catch (e) {
            console.log('Add mini app prompt declined or failed:', e);
            // Don't save the flag if it failed - allow retry on next visit
        }
    } else {
        console.log('User already prompted for addMiniApp - skipping');
    }
}

function hideLoading() {
    if (dom.loadingOverlay) {
        dom.loadingOverlay.style.opacity = '0';
        dom.loadingOverlay.style.pointerEvents = 'none';
        setTimeout(() => dom.loadingOverlay.remove(), 1000);
    }
}

// --- Event Listeners ---

// 1. Wallet Events
document.addEventListener(EVENTS.WALLET_UPDATE, async (e) => {
    const account = e.detail;
    state.wallet = account;

    updateConnectButton(account);
    await refreshMintState();
});

document.addEventListener(EVENTS.CHAIN_UPDATE, (e) => {
    const { chainId } = e.detail;
    if (chainId !== DEFAULT_CHAIN.id) {
        showToast('Wrong Network. Please switch to Base.', 'error');
    }
});

// 2. UI Actions
if (dom.connectBtn) {
    dom.connectBtn.addEventListener('click', async () => {
        if (state.wallet.isConnected) {
            await connectWallet();
        } else {
            await connectWallet();
        }
    });
}

if (dom.mintBtn) {
    dom.mintBtn.addEventListener('click', handleMint);
}

// --- Logic ---

async function refreshMintState() {
    if (!state.wallet.isConnected || !state.wallet.address) return;

    const collection = state.collection;
    const { mintedCount, totalSupply } = await getCollectionData(collection, state.wallet.address);

    updateState('mintPolicyState.mintedCount', mintedCount);
    updateState('mintPolicyState.totalSupply', totalSupply);

    const stage = resolveStage(collection.mintPolicy, mintedCount);
    updateState('mintPolicyState.activeStage', stage);

    renderMintButton(stage, totalSupply, collection.maxSupply);
    renderSupply(totalSupply, collection.maxSupply);
}

// --- Rendering ---

function updateConnectButton(account) {
    if (account.isConnected) {
        dom.connectText.textContent = shortenAddress(account.address);
        dom.connectionStatus.textContent = 'Connected';
        dom.statusGlow.style.background = '#10B981';
        dom.statusGlow.style.boxShadow = '0 0 10px #10B981';
    } else {
        dom.connectText.textContent = 'Connect Wallet';
        dom.connectionStatus.textContent = 'Disconnected';
        dom.statusGlow.style.background = '#EF4444';
        dom.statusGlow.style.boxShadow = '0 0 10px #EF4444';
    }
}

function renderMintButton(stage, currentSupply, maxSupply) {
    if (currentSupply >= maxSupply) {
        dom.mintText.textContent = 'Sold Out';
        dom.mintBtn.disabled = true;
        dom.mintBtn.style.opacity = '0.5';
        dom.mintBtn.style.cursor = 'not-allowed';
        return;
    }

    if (!stage) {
        dom.mintText.textContent = 'Limit Reached';
        dom.mintBtn.disabled = true;
        dom.mintBtn.style.opacity = '0.5';
        dom.mintBtn.style.cursor = 'not-allowed';
        return;
    }

    dom.mintBtn.disabled = false;
    dom.mintBtn.style.opacity = '1';
    dom.mintBtn.style.cursor = 'pointer';

    switch (stage.type) {
        case 'FREE':
            dom.mintText.textContent = 'Free Mint';
            break;
        case 'PAID':
            dom.mintText.textContent = `Mint (${stage.price / 1e18} ETH)`;
            break;
        case 'BURN_ERC20':
            dom.mintText.textContent = 'Burn to Mint';
            break;
        default:
            dom.mintText.textContent = 'Mint';
    }
}

function renderSupply(current, max) {
    if (dom.supplyCount) dom.supplyCount.textContent = current;
    if (dom.maxSupply) dom.maxSupply.textContent = max;
}

function renderCollectionInfo(collection) {
    if (dom.collectionName) dom.collectionName.textContent = collection.name;
    if (dom.collectionImage) dom.collectionImage.src = collection.imageUrl;
}

// --- Actions ---

async function handleMint() {
    if (!state.wallet.isConnected) {
        await connectWallet();
        return;
    }

    if (state.wallet.chainId !== DEFAULT_CHAIN.id) {
        try {
            await switchToBase();
        } catch (e) {
            showToast('Please switch to Base chain', 'error');
            return;
        }
    }

    const stage = state.mintPolicyState.activeStage;
    if (!stage) return;

    try {
        dom.mintBtn.disabled = true;
        dom.mintText.textContent = 'Minting...';

        const tokenId = state.mintPolicyState.totalSupply ?? 0;
        const hash = await mint(state.collection, { ...stage, tokenId });
        console.log('Tx Hash:', hash);
        showToast('Mint Submitted!', 'success');

        setTimeout(refreshMintState, 2000);

    } catch (e) {
        console.error(e);
        showToast(e.message || 'Mint failed', 'error');
    } finally {
        dom.mintBtn.disabled = false;
    }
}

function showToast(msg, type = 'info') {
    if (!dom.toast) return;

    dom.toastMessage.textContent = msg;
    dom.toast.classList.add('show');

    if (type === 'error') {
        dom.toast.classList.add('error');
    } else {
        dom.toast.classList.remove('error');
    }

    setTimeout(() => {
        dom.toast.classList.remove('show');
    }, 3000);
}

// Expose function to window for manual testing/debugging
if (typeof window !== 'undefined') {
    window.forceAddMiniApp = async () => {
        console.log('🔧 Forcing addMiniApp prompt (debug)...');
        safeLocalStorage.removeItem('hasPromptedAddApp');
        await tryAddMiniApp();
    };
}

// Start
init();
