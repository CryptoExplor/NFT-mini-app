/**
 * Collection Loader
 * Loads, validates, and provides access to all collections
 * 
 * HOW TO ADD A NEW COLLECTION:
 * 1. Create a new file in collections/ folder (e.g., my-collection.js)
 * 2. Import it below
 * 3. Add it to COLLECTIONS_MAP with slug as key
 */

// ============================================
// COLLECTION IMPORTS
// ============================================
// Import generated collection registry
import { COLLECTIONS_MAP } from '../../collections/index.js';
import { parseCollectionLaunchDate, withComputedCollectionState } from './collectionSchedule.js';

// ============================================
// COLLECTIONS MAP
// ============================================
// Map slug -> collection object (auto-generated in collections/index.js)

// ============================================
// VALIDATION
// ============================================

/**
 * Required fields for each collection
 */
const REQUIRED_FIELDS = [
    'name', 'slug', 'description', 'imageUrl',
    'chainId', 'contractAddress', 'abiName',
    'mintPolicy', 'category', 'tags', 'status',
    'visibility'
];

/**
 * Valid stage types
 */
const VALID_STAGE_TYPES = ['FREE', 'PAID', 'BURN_ERC20'];

/**
 * Validates a collection object
 * @param {Object} collection - Collection to validate
 * @param {string} slug - Slug identifier for error messages
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
function validateCollection(collection, slug) {
    // Check required fields
    for (const key of REQUIRED_FIELDS) {
        if (collection[key] === undefined || collection[key] === null) {
            throw new Error(`[${slug}] Missing required field: ${key}`);
        }
    }

    // Validate mint policy structure
    if (!collection.mintPolicy.stages || collection.mintPolicy.stages.length === 0) {
        throw new Error(`[${slug}] Mint policy must have at least one stage`);
    }

    // Validate each stage
    for (const stage of collection.mintPolicy.stages) {
        if (!VALID_STAGE_TYPES.includes(stage.type)) {
            throw new Error(`[${slug}] Invalid stage type: ${stage.type}. Valid: ${VALID_STAGE_TYPES.join(', ')}`);
        }

        if (stage.type === 'PAID' && (stage.price === undefined || stage.price === null)) {
            throw new Error(`[${slug}] PAID stage requires a price`);
        }

        if (stage.type === 'BURN_ERC20') {
            if (!stage.token) throw new Error(`[${slug}] BURN_ERC20 stage requires token address`);
            if (!stage.amount) throw new Error(`[${slug}] BURN_ERC20 stage requires amount`);
        }
    }

    const launchDate = parseCollectionLaunchDate(collection);
    if (!launchDate) {
        throw new Error(`[${slug}] Missing or invalid launch date. Provide launchAt (ISO) or launched (YYYY-MM-DD).`);
    }

    // Validate slug matches
    if (collection.slug !== slug) {
        console.warn(`[${slug}] Collection slug "${collection.slug}" doesn't match map key "${slug}"`);
    }

    return true;
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Load and validate all public collections
 * @returns {Array} Array of valid, public collections
 */
export function loadCollections() {
    const collections = [];
    const slugs = new Set();
    const nowMs = Date.now();

    for (const [slug, collection] of Object.entries(COLLECTIONS_MAP)) {
        try {
            // Skip template file
            if (slug.startsWith('_')) continue;

            // Validate collection
            validateCollection(collection, slug);

            // Check for duplicate slugs
            if (slugs.has(collection.slug)) {
                console.error(`[${slug}] Duplicate slug detected: ${collection.slug}`);
                continue;
            }
            slugs.add(collection.slug);

            // Filter by visibility
            if (collection.visibility === 'private') {
                console.log(`[${slug}] Skipping private collection`);
                continue;
            }

            const computed = withComputedCollectionState(collection, nowMs);
            if (!computed.isVisible) {
                continue;
            }

            collections.push(computed);

        } catch (error) {
            console.error(`Error loading collection "${slug}":`, error.message);
        }
    }

    // Sort by runtime status priority, then launch date (soonest live/upcoming first)
    collections.sort((a, b) => {
        const statusPriority = {
            'live': 3,
            'upcoming': 2,
            'sold-out': 1,
            'paused': 0
        };

        const aPriority = statusPriority[a.status.toLowerCase()] || 0;
        const bPriority = statusPriority[b.status.toLowerCase()] || 0;

        if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
        }

        const aLaunch = Number.isFinite(a.launchAtTs) ? a.launchAtTs : Number.MAX_SAFE_INTEGER;
        const bLaunch = Number.isFinite(b.launchAtTs) ? b.launchAtTs : Number.MAX_SAFE_INTEGER;
        return aLaunch - bLaunch;
    });

    console.log(`✅ Loaded ${collections.length} collections`);

    return collections;
}

/**
 * Get a single collection by slug
 * @param {string} slug - Collection slug
 * @returns {Object|undefined} Collection object or undefined if not found
 */
export function getCollectionBySlug(slug) {
    const collection = COLLECTIONS_MAP[slug];

    if (!collection) {
        console.warn(`Collection not found: ${slug}`);
        return undefined;
    }

    // Validate before returning
    try {
        validateCollection(collection, slug);
        const computed = withComputedCollectionState(collection, Date.now());
        if (!computed.isVisible) {
            return undefined;
        }
        return computed;
    } catch (error) {
        console.error(`Error loading collection "${slug}":`, error.message);
        return undefined;
    }
}

/**
 * Get collections by status
 * @param {string} status - Status to filter by (live, upcoming, sold-out, paused)
 * @returns {Array} Filtered collections
 */
export function getCollectionsByStatus(status) {
    const collections = loadCollections();
    const normalized = String(status || '').toLowerCase();
    return collections.filter(c => c.status.toLowerCase() === normalized);
}

/**
 * Get featured collections
 * @returns {Array} Featured collections
 */
export function getFeaturedCollections() {
    const collections = loadCollections();
    return collections.filter(c => c.featured === true);
}

/**
 * Get all available collection slugs
 * @returns {string[]} Array of slugs
 */
export function getCollectionSlugs() {
    return Object.keys(COLLECTIONS_MAP).filter(slug => !slug.startsWith('_'));
}
