/**
 * NFT Multi-Collection Mint App - OPTIMIZED
 * Main entry point with parallel initialization
 */

// Import CSS first
import './index.css';

// Import polyfills
import './polyfills.js';

// Core imports
import { initWallet, wagmiAdapter } from './wallet.js';
import { state, EVENTS } from './state.js';
import { initFarcasterSDK, isInFarcaster } from './farcaster.js';
import { router } from './lib/router.js';
import { toast } from './utils/toast.js';
import { $ } from './utils/dom.js';

// ============================================
// OPTIMIZED INITIALIZATION
// ============================================

async function init() {
    console.log('🚀 Initializing NFT Mint App (Optimized)...');

    const startTime = performance.now();

    // Step 1: Start all independent tasks in PARALLEL
    const [farcasterResult, toastReady] = await Promise.all([
        initFarcasterSDK().catch(e => {
            console.warn('Farcaster init failed:', e);
            return { sdk: null, context: null };
        }),
        Promise.resolve(toast.init())
    ]);

    if (isInFarcaster() && farcasterResult.context) {
        console.log('📱 Running in Farcaster');
        state.farcaster = farcasterResult;

        // Try auto-connect (non-blocking)
        autoConnectFarcaster().catch(e => console.warn('Auto-connect failed:', e));
    } else {
        console.log('🌐 Running in browser');
    }

    // Step 2: Setup routes (synchronous, no waiting)
    setupRoutes();

    // Step 3: Initialize wallet + render page IN PARALLEL
    // This shows the page immediately while wallet connects in background
    await Promise.all([
        initWallet(),
        router.handleRoute() // User sees content immediately!
    ]);

    // Step 4: Notify Farcaster we're ready (non-blocking)
    if (farcasterResult.sdk) {
        notifyFarcasterReady(farcasterResult.sdk);
    }

    // Step 5: Hide loading overlay
    hideLoading();

    // Performance logging
    const loadTime = performance.now() - startTime;
    console.log(`🎉 App initialized in ${loadTime.toFixed(0)}ms`);

    // Track performance
    trackPerformance(loadTime);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function autoConnectFarcaster() {
    await new Promise(resolve => setTimeout(resolve, 300));

    const farcasterConnector = wagmiAdapter.wagmiConfig.connectors.find(
        c => c.id === 'farcaster' ||
            c.id === 'farcasterMiniApp' ||
            c.name?.toLowerCase().includes('farcaster')
    );

    if (farcasterConnector) {
        const { connect } = await import('@wagmi/core');
        const result = await connect(wagmiAdapter.wagmiConfig, {
            connector: farcasterConnector
        });

        if (result.accounts?.[0]) {
            console.log('✅ Auto-connected via Farcaster');
        }
    }
}

function notifyFarcasterReady(sdk) {
    // Run in background, don't block
    Promise.all([
        sdk.actions.ready({ disableNativeGestures: true }),
        new Promise(resolve => setTimeout(resolve, 1000))
            .then(() => sdk.actions.addMiniApp())
    ]).catch(e => console.warn('Farcaster notification:', e));
}

function setupRoutes() {
    // Lazy-load page modules for code splitting
    router.route('/', async () => {
        const { renderHomePage } = await import('./pages/home.js');
        await renderHomePage();
    });

    router.route('/mint/:slug', async (params) => {
        const { renderMintPage } = await import('./pages/mint.js');
        await renderMintPage(params);
    });

    router.route('/analytics', async () => {
        const { renderAnalyticsPage } = await import('./pages/analytics.js');
        await renderAnalyticsPage();
    });

    router.route('/analytics/:slug', async (params) => {
        const { renderAnalyticsPage } = await import('./pages/analytics.js');
        await renderAnalyticsPage(params);
    });

    router.route('/gallery', async () => {
        const { renderGalleryPage } = await import('./pages/gallery.js');
        await renderGalleryPage();
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

if (typeof window !== 'undefined') {
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
        <div class="min-h-screen flex items-center justify-center bg-slate-900 text-white">
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
