import { initWallet, connectWallet, disconnectWallet, switchToBase, wagmiAdapter } from './wallet.js';
import { state, updateState, EVENTS } from './state.js';
import { collections, defaultCollectionId } from './collections.js';
import { getCollectionData, resolveStage, mint } from './nft.js';
import { $, shortenAddress, safeLocalStorage } from './utils/dom.js';
import { DEFAULT_CHAIN } from './utils/chain.js';
import { initFarcasterSDK, isInFarcaster, getFarcasterSDK, notifyReady, promptAddMiniApp } from './farcaster.js';

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
    console.log('🚀 Initializing app...');

    // 1. Initialize Farcaster SDK FIRST
    const { sdk: farcasterSdk, context } = await initFarcasterSDK();

    if (isInFarcaster()) {
        console.log('✅ Running in Farcaster:', context);
        state.farcaster = { sdk: farcasterSdk, context };
    } else {
        console.log('ℹ️ Running in standard browser');
    }

    // 2. Initialize Wallet
    initWallet();

    // 3. Wait for connectors to be ready (improved approach)
    if (isInFarcaster()) {
        await autoConnectFarcaster();
    }

    // 4. Load Default Collection
    const collection = collections[defaultCollectionId];
    updateState('collection', collection);

    // 5. Render Initial UI
    renderCollectionInfo(collection);

    // 6. Hide loading overlay
    hideLoading();

    // 7. CRITICAL: Tell Farcaster the app is ready
    if (isInFarcaster()) {
        const readySuccess = notifyReady();
        if (readySuccess) {
            // Wait for UI to be stable before showing add prompt
            setTimeout(async () => {
                await tryAddMiniApp();
            }, 2000); // Give user time to see the app first
        }
    }

    console.log('✅ App initialization complete');
}

/**
 * Improved auto-connect for Farcaster
 */
async function autoConnectFarcaster() {
    try {
        // Wait for connector to be available (with timeout)
        const connector = await waitForConnector('farcasterMiniApp', 3000);
        
        if (!connector) {
            console.warn('⚠️ Farcaster connector not found after 3s');
            console.log('Available connectors:', 
                wagmiAdapter.wagmiConfig.connectors.map(c => ({ id: c.id, name: c.name }))
            );
            return;
        }

        console.log('✅ Farcaster connector found, connecting...');
        
        const { connect } = await import('@wagmi/core');
        const result = await connect(wagmiAdapter.wagmiConfig, {
            connector
        });

        if (result.accounts && result.accounts[0]) {
            console.log('✅ Connected via Farcaster:', result.accounts[0]);
        }
    } catch (error) {
        console.error('❌ Farcaster auto-connect failed:', error);
        // Don't block app initialization on connection failure
    }
}

/**
 * Wait for a specific connector to be available
 */
async function waitForConnector(connectorId, maxWait = 5000) {
    const startTime = Date.now();
    const pollInterval = 100;

    while (Date.now() - startTime < maxWait) {
        const connector = wagmiAdapter.wagmiConfig.connectors.find(
            c => c.id === connectorId
        );
        
        if (connector) {
            console.log(`✅ Connector '${connectorId}' found after ${Date.now() - startTime}ms`);
            return connector;
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return null;
}

/**
 * Try to show addMiniApp prompt (with localStorage tracking)
 */
async function tryAddMiniApp() {
    if (!isInFarcaster()) {
        return;
    }

    const hasPrompted = safeLocalStorage.getItem('hasPromptedAddApp');

    if (hasPrompted === 'true') {
        console.log('ℹ️ User already prompted for addMiniApp');
        return;
    }

    const success = await promptAddMiniApp();
    
    if (success) {
        safeLocalStorage.setItem('hasPromptedAddApp', 'true');
    }
    // If failed/declined, don't save flag - allow retry next time
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
        await connectWallet();
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
    dom.toast.style.transform = 'translateX(-50%) translateY(0)';
    dom.toast.style.opacity = '1';

    if (type === 'error') {
        dom.toast.style.borderColor = '#EF4444';
    } else {
        dom.toast.style.borderColor = '#6366F1';
    }

    setTimeout(() => {
        dom.toast.style.transform = 'translateX(-50%) translateY(100px)';
        dom.toast.style.opacity = '0';
    }, 3000);
}

// Debug utility
if (typeof window !== 'undefined') {
    window.forceAddMiniApp = async () => {
        console.log('🔧 Forcing addMiniApp prompt...');
        safeLocalStorage.removeItem('hasPromptedAddApp');
        await tryAddMiniApp();
    };
}

// Start
init();
