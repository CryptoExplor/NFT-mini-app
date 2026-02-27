/**
 * NFT Multi-Collection Mint App - PERFORMANCE OPTIMIZED
 * Main entry point with lazy-loaded wallet & deferred heavy dependencies
 */

// Import CSS first
import './index.css';

// Import polyfills
import './polyfills.js';

// Lightweight core imports only (no heavy vendor deps)
import { state, EVENTS } from './state.js';
import { router } from './lib/router.js';
import { toast } from './utils/toast.js';
import { $ } from './utils/dom.js';
import { initTheme } from './utils/theme.js';
// Farcaster SDK is kept as static import (~100KB) so ready() fires instantly.
// Without this, the app stays stuck on the Farcaster splash screen.
import { sdk as farcasterSdk } from '@farcaster/miniapp-sdk';
import { initFarcasterSDK } from './farcaster.js';

// Apply theme as early as possible to avoid flash on first paint.
initTheme();

// ============================================
// LAZY MODULE LOADERS
// ============================================

// wallet.js pulls in ~1.6MB of vendor JS (appkit, viem, wagmi).
// We load it lazily so the page renders before those deps are parsed.
let _walletModule = null;
async function getWalletModule() {
    if (!_walletModule) _walletModule = await import('./wallet.js');
    return _walletModule;
}

// ============================================
// OPTIMIZED INITIALIZATION
// ============================================

async function init() {
    console.log('🚀 Initializing NFT Mint App (Perf Optimized)...');

    const startTime = performance.now();

    // ⚡ STEP 0: Call ready() IMMEDIATELY — before ANY async work.
    // This dismisses the Farcaster mobile splash screen ASAP.
    // Uses the statically imported SDK — no dynamic import delay.
    try {
        await farcasterSdk.actions.ready({ disableNativeGestures: true });
        console.log('✅ Farcaster ready() fired');
    } catch (e) {
        // Not in Farcaster or SDK not available — totally fine
        console.log('ℹ️ Farcaster ready() skipped (not in frame)');
    }

    // Step 1: Initialize Farcaster context in background (lightweight)
    const farcasterPromise = initFarcasterSDK()
        .catch(e => {
            console.warn('Farcaster init failed:', e);
            return { sdk: null, context: null, inMiniApp: false, host: 'web', clientFid: null };
        });

    // Step 2: Init toast (sync, tiny)
    toast.init();

    // Step 3: Setup routes (synchronous, no waiting)
    setupRoutes();

    // Step 4: Render the page IMMEDIATELY — user sees content NOW
    await router.handleRoute();

    // Step 5: Hide loading overlay — content is visible
    hideLoading();

    // Performance logging (before wallet loads)
    const renderTime = performance.now() - startTime;
    console.log(`🎉 Page rendered in ${renderTime.toFixed(0)}ms`);

    // ============================================
    // DEFERRED: Load wallet & Farcaster in background
    // These are non-blocking — user already sees the page.
    // ============================================

    // Wait for Farcaster context (usually fast, ~50ms)
    const farcasterResult = await farcasterPromise;

    if (farcasterResult.inMiniApp && farcasterResult.context) {
        console.log(`📱 Running in ${farcasterResult.host === 'base' ? 'Base App' : 'Farcaster Mini App'}`);
        state.farcaster = farcasterResult;
        state.platform = {
            inMiniApp: true,
            host: farcasterResult.host || 'unknown-miniapp',
            clientFid: farcasterResult.clientFid ?? null
        };
    } else {
        console.log('🌐 Running in browser');
        state.platform = {
            inMiniApp: false,
            host: 'web',
            clientFid: null
        };
    }

    if (typeof document !== 'undefined') {
        document.documentElement.dataset.miniappHost = state.platform.host;
        document.documentElement.dataset.inMiniapp = String(state.platform.inMiniApp);
    }

    // Load wallet module and initialize (background, non-blocking for UI)
    try {
        const walletMod = await getWalletModule();
        await walletMod.initWallet();

        // Auto-connect in mini-app after wallet is ready
        if (farcasterResult.inMiniApp) {
            walletMod.connectMiniAppWalletSilently().catch(e => console.warn('Auto-connect failed:', e));
        }
    } catch (e) {
        console.warn('Wallet init deferred error:', e);
    }

    // Add to mini app (non-blocking)
    if (farcasterResult.sdk) {
        farcasterResult.sdk.actions.addMiniApp().catch(e => console.warn('addMiniApp:', e));
    }

    // Track total performance including wallet
    const totalTime = performance.now() - startTime;
    console.log(`📊 Full init (incl. wallet) in ${totalTime.toFixed(0)}ms`);
    trackPerformance(totalTime);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function setupRoutes() {
    let activePageCleanup = null;

    const runActivePageCleanup = async () => {
        if (typeof activePageCleanup !== 'function') return;
        try {
            await activePageCleanup();
        } catch (error) {
            console.warn('Page cleanup error:', error);
        } finally {
            activePageCleanup = null;
        }
    };

    const loadPageModule = async (loader) => {
        await runActivePageCleanup();
        const pageModule = await loader();
        activePageCleanup = typeof pageModule.cleanup === 'function' ? pageModule.cleanup : null;
        return pageModule;
    };

    const cleanupAnalyticsIfNeeded = async () => {
        if (window.location.pathname.startsWith('/analytics')) return;
        const { teardownAnalyticsPage } = await import('./pages/analytics.js');
        teardownAnalyticsPage();
    };

    // Lazy-load page modules for code splitting
    router.route('/', async () => {
        await cleanupAnalyticsIfNeeded();
        const page = await loadPageModule(() => import('./pages/home.js'));
        await page.renderHomePage();
    });

    router.route('/mint/:slug', async (params) => {
        await cleanupAnalyticsIfNeeded();
        const page = await loadPageModule(() => import('./pages/mint.js'));
        await page.renderMintPage(params);
    });

    router.route('/analytics', async () => {
        await runActivePageCleanup();
        const { renderAnalyticsPage } = await import('./pages/analytics.js');
        await renderAnalyticsPage();
    });

    router.route('/battle', async () => {
        await cleanupAnalyticsIfNeeded();
        const page = await loadPageModule(() => import('./pages/battle.js'));
        await page.renderBattlePage();
    });

    router.route('/analytics/:slug', async (params) => {
        await runActivePageCleanup();
        const { renderAnalyticsPage } = await import('./pages/analytics.js');
        await renderAnalyticsPage(params);
    });

    router.route('/gallery', async () => {
        await cleanupAnalyticsIfNeeded();
        const page = await loadPageModule(() => import('./pages/gallery.js'));
        await page.renderGalleryPage();
    });
}

function hideLoading() {
    const loadingOverlay = $('#loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        loadingOverlay.style.pointerEvents = 'none';
        setTimeout(() => loadingOverlay.remove(), 500);
    }
}

function trackPerformance(loadTime) {
    if (typeof window !== 'undefined' && window.performance) {
        setTimeout(() => {
            const perfData = performance.getEntriesByType('navigation')[0];
            if (perfData) {
                const metrics = {
                    appInit: loadTime,
                    domContentLoaded: perfData.domContentLoadedEventEnd - perfData.fetchStart,
                    loadComplete: perfData.loadEventEnd - perfData.fetchStart,
                };

                console.log('📊 Performance Metrics:', metrics);

                // Send to analytics if available
                if (window.analytics?.trackPerformance) {
                    window.analytics.trackPerformance(metrics);
                }
            }
        }, 0);
    }
}

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered'))
            .catch(err => console.warn('Service Worker registration failed:', err));
    });
}

// ============================================
// DEBUG UTILITIES
// ============================================

if (typeof window !== 'undefined' && import.meta.env.DEV) {
    window.router = router;
    window.state = state;
    window.navigate = (path) => router.navigate(path);

    // Performance helper
    window.measurePerformance = () => {
        const nav = performance.getEntriesByType('navigation')[0];
        const paint = performance.getEntriesByType('paint');

        console.table({
            'DNS': `${(nav.domainLookupEnd - nav.domainLookupStart).toFixed(0)}ms`,
            'TCP': `${(nav.connectEnd - nav.connectStart).toFixed(0)}ms`,
            'Request': `${(nav.responseStart - nav.requestStart).toFixed(0)}ms`,
            'Response': `${(nav.responseEnd - nav.responseStart).toFixed(0)}ms`,
            'DOM Processing': `${(nav.domComplete - nav.domLoading).toFixed(0)}ms`,
            'First Paint': paint[0] ? `${paint[0].startTime.toFixed(0)}ms` : 'N/A',
            'First Contentful Paint': paint[1] ? `${paint[1].startTime.toFixed(0)}ms` : 'N/A',
        });
    };
}

// ============================================
// START APP
// ============================================

init().catch(error => {
    console.error('❌ App initialization failed:', error);
    document.getElementById('app').innerHTML = `
        <div class="min-h-screen flex items-center justify-center bg-slate-900 app-text">
            <div class="text-center">
                <h1 class="text-4xl font-bold mb-4">⚠️ Initialization Error</h1>
                <p class="text-lg opacity-60 mb-4">Failed to start the app</p>
                <button onclick="location.reload()" class="px-6 py-3 bg-indigo-600 rounded-xl">
                    Reload Page
                </button>
            </div>
        </div>
    `;
});
