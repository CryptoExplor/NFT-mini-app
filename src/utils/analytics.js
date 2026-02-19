
/**
 * Simple Analytics & Tracking Utility
 * Persistent storage via localStorage
 */

const STORAGE_KEY = 'nft_app_analytics';

class AnalyticsSystem {
    constructor() {
        this.data = this._load();
    }

    _load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse analytics', e);
                }
            }
        } catch (e) {
            // localStorage may be unavailable (private browsing, sandboxed iframe)
            console.warn('localStorage unavailable for analytics:', e.message);
        }
        return {
            views: {},      // { slug: count }
            mintAttempts: {}, // { slug: count }
            mintSuccess: {},  // { slug: count }
            journey: [],      // Array of { action, detail, timestamp }
            userPath: []      // Sequence of pages visited
        };
    }

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            // localStorage may be unavailable or quota exceeded
            console.warn('Failed to save analytics:', e.message);
        }
    }

    /**
     * Track a page view or collection view
     */
    trackView(slug = 'home') {
        this.data.views[slug] = (this.data.views[slug] || 0) + 1;
        this.trackAction('view', slug);
        this._save();
    }

    /**
     * Track a mint attempt start
     */
    trackMintAttempt(slug) {
        this.data.mintAttempts[slug] = (this.data.mintAttempts[slug] || 0) + 1;
        this.trackAction('mint_start', slug);
        this._save();
    }

    /**
     * Track a successful mint
     */
    trackMintSuccess(slug, txHash) {
        this.data.mintSuccess[slug] = (this.data.mintSuccess[slug] || 0) + 1;
        this.trackAction('mint_success', { slug, txHash });
        this._save();
    }

    /**
     * Track a failed mint attempt
     */
    trackMintFailure(slug, error) {
        this.trackAction('mint_failure', { slug, error: error?.message || 'Unknown error' });
        this._save();
    }

    /**
     * Track arbitrary action for journey analysis
     */
    trackAction(action, detail) {
        this.data.journey.unshift({
            action,
            detail,
            timestamp: Date.now()
        });

        // Keep last 100 actions
        if (this.data.journey.length > 100) {
            this.data.journey = this.data.journey.slice(0, 100);
        }
        this._save();
    }

    getStats(slug = null) {
        if (slug) {
            const attempts = this.data.mintAttempts[slug] || 0;
            const success = this.data.mintSuccess[slug] || 0;
            return {
                views: this.data.views[slug] || 0,
                attempts,
                success,
                rate: attempts > 0 ? (success / attempts) * 100 : 0
            };
        }

        // Global stats
        const totalViews = Object.values(this.data.views).reduce((a, b) => a + b, 0);
        const totalAttempts = Object.values(this.data.mintAttempts).reduce((a, b) => a + b, 0);
        const totalSuccess = Object.values(this.data.mintSuccess).reduce((a, b) => a + b, 0);

        return {
            totalViews,
            totalAttempts,
            totalSuccess,
            globalRate: totalAttempts > 0 ? (totalSuccess / totalAttempts) * 100 : 0,
            journey: this.data.journey
        };
    }

    getTimeline() {
        return this.data.journey.filter(j =>
            ['mint_success', 'mint_start', 'view'].includes(j.action)
        ).slice(0, 20);
    }
}

export const analytics = new AnalyticsSystem();
