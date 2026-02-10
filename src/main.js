/**
 * NFT Multi-Collection Mint App
 * Main entry point with client-side routing
 * 
 * Routes:
 * - /           → Homepage (collection grid)
 * - /mint/:slug → Mint page for specific collection
 */

import { initWallet, connectWallet, wagmiAdapter } from './wallet.js';
import { state, updateState, EVENTS } from './state.js';
import { initFarcasterSDK, isInFarcaster, getFarcasterSDK } from './farcaster.js';
import { router } from './lib/router.js';
import { renderHomePage } from './pages/home.js';
import { renderMintPage } from './pages/mint.js';
import { renderAnalyticsPage } from './pages/analytics.js';
import { $, safeLocalStorage } from './utils/dom.js';
import { toast } from './utils/toast.js';

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    console.log('🚀 Initializing Multi-Collection NFT Mint App...');

    // 0. Initialize Toast
    toast.init();

    // 1. Initialize Farcaster SDK FIRST
    const { sdk: farcasterSdk, context } = await initFarcasterSDK();

    if (isInFarcaster()) {
        console.log('📱 Running in Farcaster:', context);
        state.farcaster = { sdk: farcasterSdk, context };

        // Auto-connect with Farcaster connector
        try {
            await new Promise(resolve => setTimeout(resolve, 500));

            const farcasterConnector = wagmiAdapter.wagmiConfig.connectors.find(
                c => c.id === 'farcaster' ||
                    c.id === 'farcasterMiniApp' ||
                    c.name?.toLowerCase().includes('farcaster')
            );

            if (farcasterConnector) {
                console.log('🔗 Farcaster connector found, connecting...');
                const { connect } = await import('@wagmi/core');
                const result = await connect(wagmiAdapter.wagmiConfig, {
                    connector: farcasterConnector
                });

                if (result.accounts && result.accounts[0]) {
                    console.log('✅ Connected via Farcaster:', result.accounts[0]);
                }
            } else {
                console.warn('⚠️ Farcaster connector not found');
                console.log('Available connectors:', wagmiAdapter.wagmiConfig.connectors.map(c => c.id));
            }
        } catch (error) {
            console.error('❌ Farcaster auto-connect failed:', error);
        }
    } else {
        console.log('🌐 Running in regular browser - Farcaster wallet extension detection enabled');
        // In regular browser, the injected connector will detect Farcaster wallet extension
    }

    // 2. Initialize Wallet
    initWallet();
    console.log('✅ Wallet initialized');

    // 3. Tell Farcaster we're ready ✅ EARLY!
    const farcasterSDKInstance = getFarcasterSDK();
    if (farcasterSDKInstance) {
        try {
            await farcasterSDKInstance.actions.ready({ disableNativeGestures: true });
            console.log('✅ Farcaster ready() called');
        } catch (error) {
            console.warn('⚠️ Failed to call ready():', error);
        }
    }

    // 4. Setup Router
    setupRoutes();
    console.log('✅ Router configured');

    // 5. Handle initial route
    await router.handleRoute();

    // 6. Hide loading overlay
    hideLoading();

    // 7. Try addMiniApp (after everything else)
    if (farcasterSDKInstance) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        await tryAddMiniApp();
    }

    console.log('🎉 App initialized successfully!');
}

// ============================================
// ROUTE SETUP
// ============================================

function setupRoutes() {
    // Homepage - Collection Grid
    router.route('/', renderHomePage);

    // Mint Page - Dynamic by slug
    router.route('/mint/:slug', renderMintPage);

    // Analytics Page
    router.route('/analytics', renderAnalyticsPage);
    router.route('/analytics/:slug', renderAnalyticsPage);

    // Add more routes as needed:
    // router.route('/about', renderAboutPage);
    // router.route('/my-nfts', renderMyNFTsPage);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function hideLoading() {
    const loadingOverlay = $('#loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.pointerEvents = 'none';
        setTimeout(() => loadingOverlay.remove(), 1000);
    }
}

async function tryAddMiniApp() {
    if (!isInFarcaster()) {
        console.log('Not in Farcaster - skipping addMiniApp');
        return;
    }

    const hasPromptedAddApp = safeLocalStorage.getItem('hasPromptedAddApp');

    if (!hasPromptedAddApp) {
        try {
            console.log('📲 Attempting to show addMiniApp prompt...');
            const farcasterSDKInstance = getFarcasterSDK();

            if (farcasterSDKInstance?.actions?.addMiniApp) {
                await farcasterSDKInstance.actions.addMiniApp();
                console.log('✅ addMiniApp prompt shown successfully');
                safeLocalStorage.setItem('hasPromptedAddApp', 'true');
            } else {
                console.warn('addMiniApp action not available');
            }
        } catch (e) {
            console.log('Add mini app prompt declined or failed:', e);
        }
    } else {
        console.log('User already prompted for addMiniApp - skipping');
    }
}

// ============================================
// DEBUG UTILITIES
// ============================================

if (typeof window !== 'undefined') {
    // Expose router for debugging
    window.router = router;

    // Force addMiniApp (for testing)
    window.forceAddMiniApp = async () => {
        console.log('🔧 Forcing addMiniApp prompt (debug)...');
        safeLocalStorage.removeItem('hasPromptedAddApp');
        await tryAddMiniApp();
    };

    // Navigate helper (for testing)
    window.navigate = (path) => {
        router.navigate(path);
    };
}

// ============================================
// START APP
// ============================================

init();