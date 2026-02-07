import { initWallet, connectWallet, disconnectWallet, switchToBase, wagmiAdapter } from './wallet.js';
import { state, updateState, EVENTS } from './state.js';
import { collections, defaultCollectionId } from './collections.js';
import { getCollectionData, resolveStage, mint } from './nft.js';
import { $, shortenAddress } from './utils/dom.js';
import { DEFAULT_CHAIN } from './utils/chain.js';

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
    // 1. Initialize Wallet
    initWallet();

    // 2. Load Default Collection
    const collection = collections[defaultCollectionId];
    updateState('collection', collection);

    // 3. Render Initial UI
    renderCollectionInfo(collection);

    // 4. Check Farcaster
    if (window.frameContext) {
        console.log('Farcaster Frame Context detected');
        // Auto-connect processing if needed
    }

    hideLoading();
}

function hideLoading() {
    if (dom.loadingOverlay) {
        dom.loadingOverlay.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => dom.loadingOverlay.remove(), 1000); // Remove after fade
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
        // Optional: Auto switch
        // switchToBase();
    }
});

// 2. UI Actions
if (dom.connectBtn) {
    dom.connectBtn.addEventListener('click', async () => {
        if (state.wallet.isConnected) {
            // confirm disconnect?
            // await disconnectWallet(); // Usually UI doesn't have explicit disconnect in button if using modal
            await connectWallet(); // Open modal (which has disconnect)
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

    // Resolve Stage
    const stage = resolveStage(collection.mintPolicy, mintedCount);
    updateState('mintPolicyState.activeStage', stage);

    renderMintButton(stage, totalSupply, collection.maxSupply);
    renderSupply(totalSupply, collection.maxSupply);
}

// --- Rendering ---

function updateConnectButton(account) {
    if (account.isConnected) {
        dom.connectText.textContent = shortenAddress(account.address);
        dom.connectBtn.classList.remove('bg-indigo-600');
        dom.connectBtn.classList.add('bg-green-600', 'bg-opacity-20');
        dom.connectionStatus.textContent = 'Connected';
        dom.statusGlow.style.background = '#10B981';
        dom.statusGlow.style.boxShadow = '0 0 10px #10B981';
    } else {
        dom.connectText.textContent = 'Connect Wallet';
        dom.connectBtn.classList.add('bg-indigo-600');
        dom.connectBtn.classList.remove('bg-green-600', 'bg-opacity-20');
        dom.connectionStatus.textContent = 'Disconnected';
        dom.statusGlow.style.background = '#EF4444';
        dom.statusGlow.style.boxShadow = '0 0 10px #EF4444';
    }
}

function renderMintButton(stage, currentSupply, maxSupply) {
    if (currentSupply >= maxSupply) {
        dom.mintText.textContent = 'Sold Out';
        dom.mintBtn.disabled = true;
        dom.mintBtn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    if (!stage) {
        dom.mintText.textContent = 'Limit Reached';
        dom.mintBtn.disabled = true;
        dom.mintBtn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    dom.mintBtn.disabled = false;
    dom.mintBtn.classList.remove('opacity-50', 'cursor-not-allowed');

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

        // Optimistic update or wait for receipt?
        // Let's reset Text but keep refreshing
        setTimeout(refreshMintState, 2000);

    } catch (e) {
        console.error(e);
        showToast(e.message || 'Mint failed', 'error');
    } finally {
        dom.mintBtn.disabled = false;
        // Button text will update on refreshMintState
    }
}

function showToast(msg, type = 'info') {
    if (!dom.toast) return;

    dom.toastMessage.textContent = msg;
    dom.toast.classList.remove('translate-y-20', 'opacity-0');

    // Style based on type
    if (type === 'error') {
        dom.toast.classList.add('border-red-500');
    } else {
        dom.toast.classList.remove('border-red-500');
    }

    setTimeout(() => {
        dom.toast.classList.add('translate-y-20', 'opacity-0');
    }, 3000);
}

// Start
init();
