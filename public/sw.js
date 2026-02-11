// Service Worker for NFT Mint App
const CACHE_NAME = 'nft-mint-app-v1';
const STATIC_CACHE = 'static-v1';
const DYNAMIC_CACHE = 'dynamic-v1';

// Assets to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/favicon.ico',
    '/icon.png',
    '/image.png',
    // Add other critical assets
];

// Assets that should never be cached
const NEVER_CACHE = [
    '/api/',
    'chrome-extension://',
    'https://base-mainnet.infura.io',
];

// ============================================
// INSTALL EVENT - Cache static assets
// ============================================

self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ============================================
// ACTIVATE EVENT - Clean old caches
// ============================================

self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name !== STATIC_CACHE && name !== DYNAMIC_CACHE;
                        })
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ============================================
// FETCH EVENT - Network strategies
// ============================================

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip items that should never be cached
    if (NEVER_CACHE.some(pattern => url.href.includes(pattern))) {
        return;
    }
    
    // Strategy: Cache First (for static assets)
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // Strategy: Network First (for API calls and dynamic content)
    event.respondWith(networkFirst(request));
});

// ============================================
// CACHING STRATEGIES
// ============================================

// Cache First - Good for static assets (images, fonts, CSS, JS)
async function cacheFirst(request) {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    
    if (cached) {
        console.log('[SW] Serving from cache:', request.url);
        return cached;
    }
    
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            console.log('[SW] Caching new resource:', request.url);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        
        // Return offline fallback if available
        return caches.match('/offline.html') || new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Network First - Good for API calls and dynamic content
async function networkFirst(request) {
    const cache = await caches.open(DYNAMIC_CACHE);
    
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            // Cache successful responses
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        
        const cached = await cache.match(request);
        
        if (cached) {
            return cached;
        }
        
        // Return offline fallback
        return new Response('Offline - No cached version available', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function isStaticAsset(url) {
    const staticExtensions = [
        '.js', '.css', '.png', '.jpg', '.jpeg', '.gif', 
        '.webp', '.svg', '.woff', '.woff2', '.ttf', '.ico'
    ];
    
    return staticExtensions.some(ext => url.pathname.endsWith(ext));
}

// ============================================
// MESSAGE HANDLING
// ============================================

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data.action === 'clearCache') {
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => caches.delete(name))
            );
        }).then(() => {
            event.ports[0].postMessage({ status: 'Cache cleared' });
        });
    }
});

// ============================================
// SYNC EVENT (Background Sync)
// ============================================

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-transactions') {
        event.waitUntil(syncTransactions());
    }
});

async function syncTransactions() {
    // Sync pending transactions when online
    console.log('[SW] Syncing transactions...');
    
    // Implementation would go here
    // This is where you'd sync any pending mint transactions
}

// ============================================
// PUSH NOTIFICATIONS (Optional)
// ============================================

self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'New notification',
        icon: '/icon.png',
        badge: '/badge.png',
        vibrate: [200, 100, 200],
    };
    
    event.waitUntil(
        self.registration.showNotification('NFT Mint App', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});
