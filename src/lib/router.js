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
            const link = e.target.closest('[data-link]');
            if (link) {
                e.preventDefault();
                const href = link.getAttribute('href') || link.dataset.link;
                this.navigate(href);
            }
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
            // Fallback to home
            if (path !== '/') {
                this.navigate('/');
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
