/**
 * Simple Client-Side Router
 * Handles SPA navigation without page refreshes
 * 
 * Features:
 * - Route registration with dynamic params (e.g., /mint/:slug)
 * - History API integration (back/forward buttons work)
 * - Link interception for data-link elements
 */

class Router {
    constructor() {
        this.routes = {};
        this.currentRoute = null;
        this.params = {};

        // Listen for popstate (back/forward buttons)
        window.addEventListener('popstate', () => this.handleRoute());

        // Intercept clicks on elements with data-link attribute
        document.addEventListener('click', (e) => {
            const link = e.target?.closest?.('[data-link]');
            if (!link) return;

            const href = link.getAttribute('href') || link.dataset.link;
            if (!href) return;

            // External / protocol links must be left to the browser.
            const isExternal = /^(?:[a-z]+:)?\/\//i.test(href) || href.startsWith('mailto:') || href.startsWith('tel:');
            if (isExternal || link.target === '_blank') return;

            e.preventDefault();
            this.navigate(href);
        });
    }

    /**
     * Register a route
     * @param {string} path - Route pattern (e.g., "/mint/:slug")
     * @param {Function} handler - Async function to handle the route
     */
    route(path, handler) {
        this.routes[path] = handler;
        console.log(`📍 Route registered: ${path}`);
    }

    /**
     * Navigate to a path
     * @param {string} path - Path to navigate to
     */
    navigate(path) {
        console.log(`🔀 Navigating to: ${path}`);
        window.history.pushState(null, '', path);
        this.handleRoute();
    }

    /**
     * Handle the current route
     */
    async handleRoute() {
        const path = window.location.pathname;
        console.log(`🔍 Handling route: ${path}`);

        let handler = null;
        let params = {};

        // Check exact match first
        if (this.routes[path]) {
            handler = this.routes[path];
            params = {};
        } else {
            // Check dynamic routes (e.g., /mint/:slug)
            for (const [routePath, routeHandler] of Object.entries(this.routes)) {
                const paramMatch = this.matchRoute(routePath, path);
                if (paramMatch) {
                    handler = routeHandler;
                    params = paramMatch;
                    break;
                }
            }
        }

        if (handler) {
            this.currentRoute = path;
            this.params = params;

            try {
                await handler(params);
            } catch (error) {
                console.error('Route handler error:', error);
            }
        } else {
            console.warn(`⚠️ 404 - Route not found: ${path}`);
            // Fallback to home. Guard against recursing forever if '/' itself
            // is not registered (previously this silently did nothing and left
            // the user on a blank screen).
            if (path !== '/' && this.routes['/']) {
                this.navigate('/');
                return;
            }

            const app = document.getElementById('app');
            if (app && !this.routes['/']) {
                app.innerHTML = `
                    <div class="min-h-screen flex items-center justify-center p-6 text-center">
                        <div>
                            <h1 class="text-2xl font-bold mb-2">Page not found</h1>
                            <p class="opacity-60 mb-4">We could not find anything at this address.</p>
                            <a href="/" data-link class="px-5 py-2.5 rounded-xl bg-indigo-600 text-white inline-block">Go home</a>
                        </div>
                    </div>
                `;
            }
        }
    }

    /**
     * Match a route pattern against a path
     * @param {string} pattern - Route pattern (e.g., "/mint/:slug")
     * @param {string} path - Actual path (e.g., "/mint/voidmasks")
     * @returns {Object|null} Matched params or null if no match
     */
    matchRoute(pattern, path) {
        const patternParts = pattern.split('/').filter(Boolean);
        const pathParts = path.split('/').filter(Boolean);

        // Must have same number of parts
        if (patternParts.length !== pathParts.length) return null;

        const params = {};

        for (let i = 0; i < patternParts.length; i++) {
            if (patternParts[i].startsWith(':')) {
                // Dynamic parameter - extract value
                const paramName = patternParts[i].slice(1);
                params[paramName] = decodeURIComponent(pathParts[i]);
            } else if (patternParts[i] !== pathParts[i]) {
                // Static part doesn't match
                return null;
            }
        }

        return params;
    }

    /**
     * Get current route params
     * @returns {Object} Current route params
     */
    getParams() {
        return this.params;
    }

    /**
     * Get current route path
     * @returns {string} Current path
     */
    getCurrentRoute() {
        return this.currentRoute;
    }

    /**
     * Go back in history
     */
    back() {
        window.history.back();
    }

    /**
     * Go forward in history
     */
    forward() {
        window.history.forward();
    }
}

// Export singleton instance
export const router = new Router();

// Also export class for testing
export { Router };
