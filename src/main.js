import { initWallet, connectWallet, disconnectWallet, switchToBase, wagmiAdapter } from './wallet.js';
import { state, updateState, EVENTS } from './state.js';
import { collections, defaultCollectionId } from './collections.js';
import { getCollectionData, resolveStage, mint } from './nft.js';
import { $, shortenAddress, safeLocalStorage } from './utils/dom.js';
import { DEFAULT_CHAIN } from './utils/chain.js';
import { initFarcasterSDK, isInFarcaster, getFarcasterSDK, addMiniApp } from './farcaster.js';

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

// Track if we've prompted in this session
let hasPromptedThisSession = false;

// --- Initialization ---

async function init() {
    // 1. Initialize Farcaster SDK FIRST
    const { sdk, context } = await initFarcasterSDK();
    
    if (isInFarcaster()) {
        console.log('Running in Farcaster:', context);
        state.farcaster = { sdk, context };
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

    // 6. CRITICAL: Tell Farcaster the app is ready - MUST BE LAST
    const farcasterSdk = getFarcasterSDK();
    if (farcasterSdk) {
        try {
            farcasterSdk.actions.ready();
            console.log('Farcaster SDK: ready() called');
        } catch (error) {
            console.warn('Failed to call ready():', error);
        }
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

    // Prompt to add mini app after successful connection
    if (account.isConnected && isInFarcaster()) {
        await promptAddMiniApp();
    }
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

/**
 * Prompt user to add the mini app
 * Uses session storage and timestamp to control frequency
 */
async function promptAddMiniApp() {
    // Don't prompt multiple times in same session
    if (hasPromptedThisSession) {
        console.log('Already prompted in this session - skipping');
        return;
    }

    // Check last prompt timestamp (use 24-hour cooldown)
    const lastPromptTime = safeLocalStorage.getItem('lastAddAppPrompt');
    const now = Date.now();
    const cooldownPeriod = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

    if (lastPromptTime) {
        const timeSinceLastPrompt = now - parseInt(lastPromptTime);
        if (timeSinceLastPrompt < cooldownPeriod) {
            console.log('Cooldown period active - skipping prompt');
            return;
        }
    }

    // Wait a moment for better UX (user just connected)
    setTimeout(async () => {
        console.log('Attempting to show add mini app prompt...');
        const success = await addMiniApp();
        
        if (success) {
            hasPromptedThisSession = true;
            safeLocalStorage.setItem('lastAddAppPrompt', now.toString());
            showToast('Add this app for quick access!', 'success');
        } else {
            console.log('Add mini app prompt was not shown or declined');
        }
    }, 1500);
}

// Expose function to window for manual testing
if (typeof window !== 'undefined') {
    window.forceAddAppPrompt = async () => {
        console.log('Forcing add app prompt...');
        hasPromptedThisSession = false;
        safeLocalStorage.removeItem('lastAddAppPrompt');
        await promptAddMiniApp();
    };
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

        const hash = await mint(state.collection, stage);
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

// Start
init();
