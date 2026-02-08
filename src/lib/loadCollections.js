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
// Import each collection file here
import onchainSigils from '../../collections/onchain-sigils.js';
import zorgz from '../../collections/zorgz.js';
import baseInvaders from '../../collections/base-invaders.js';
// ADD NEW COLLECTION IMPORTS HERE:
// import myCollection from '../../collections/my-collection.js';

// ============================================
// COLLECTIONS MAP
// ============================================
// Map slug -> collection object
const COLLECTIONS_MAP = {
    'onchain-sigils': onchainSigils,
    'zorgz': zorgz,
    'base-invaders': baseInvaders,
    // ADD NEW COLLECTIONS HERE (slug: import):
    // 'my-collection': myCollection,
};

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
    'visibility', 'launched'
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

    // Validate date format (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(collection.launched)) {
        throw new Error(`[${slug}] launched date must be YYYY-MM-DD format, got: ${collection.launched}`);
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

            collections.push(collection);

        } catch (error) {
            console.error(`Error loading collection "${slug}":`, error.message);
        }
    }

    // Sort: featured first, then by launch date (newest first)
    collections.sort((a, b) => {
        // Featured collections first
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;

        // Then by launch date (newest first)
        return new Date(b.launched) - new Date(a.launched);
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
        return collection;
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
    return collections.filter(c => c.status === status);
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
