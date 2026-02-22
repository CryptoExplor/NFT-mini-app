/**
 * Collection Loader
 * Loads, validates, and provides access to all collections
 *
 * Collection entries are generated from collections/*.js
 * into collections/index.js by `npm run collections:sync`.
 */

import { COLLECTIONS_MAP } from '../../collections/index.js';
import { parseCollectionLaunchDate, withComputedCollectionState } from './collectionSchedule.js';

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
const VALID_CONTRACT_ACTION_TYPES = ['CONTRACT_CALL', 'TRANSFER', 'SEND_TO_DEAD'];
const STATUS_PRIORITY = {
    live: 3,
    upcoming: 2,
    'sold-out': 1,
    paused: 0
};

function normalizeStatus(status) {
    return String(status || '').toLowerCase();
}

function isSupportedScalarConfigValue(value) {
    return typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint';
}

function validateActionValueConfig(valueConfig, slug, actionIndex) {
    if (valueConfig === undefined || valueConfig === null || valueConfig === '') return;

    const prefix = `[${slug}] contractActions[${actionIndex}].value`;
    if (isSupportedScalarConfigValue(valueConfig)) return;

    if (typeof valueConfig !== 'object' || Array.isArray(valueConfig)) {
        throw new Error(`${prefix} must be a string, number, bigint, or object`);
    }

    if (
        valueConfig.required !== undefined &&
        typeof valueConfig.required !== 'boolean'
    ) {
        throw new Error(`${prefix}.required must be a boolean`);
    }

    if (valueConfig.unit !== undefined) {
        const unit = String(valueConfig.unit).toLowerCase();
        if (unit !== 'wei' && unit !== 'eth') {
            throw new Error(`${prefix}.unit must be \"wei\" or \"eth\"`);
        }
    }

    if (valueConfig.inputKey !== undefined) {
        if (typeof valueConfig.inputKey !== 'string' || !valueConfig.inputKey.trim()) {
            throw new Error(`${prefix}.inputKey must be a non-empty string`);
        }
    }

    if (valueConfig.label !== undefined && typeof valueConfig.label !== 'string') {
        throw new Error(`${prefix}.label must be a string`);
    }

    if (valueConfig.placeholder !== undefined && typeof valueConfig.placeholder !== 'string') {
        throw new Error(`${prefix}.placeholder must be a string`);
    }

    const scalarKeys = ['value', 'wei', 'eth'];
    for (const key of scalarKeys) {
        if (valueConfig[key] !== undefined && !isSupportedScalarConfigValue(valueConfig[key])) {
            throw new Error(`${prefix}.${key} must be a string, number, or bigint`);
        }
    }
}

function validateActionApprovalConfig(approvalConfig, slug, actionIndex) {
    if (approvalConfig === undefined || approvalConfig === null) return;

    const prefix = `[${slug}] contractActions[${actionIndex}].approvalRequired`;
    if (typeof approvalConfig !== 'object' || Array.isArray(approvalConfig)) {
        throw new Error(`${prefix} must be an object`);
    }

    if (
        typeof approvalConfig.tokenAddress !== 'string' ||
        !approvalConfig.tokenAddress.trim()
    ) {
        throw new Error(`${prefix}.tokenAddress is required and must be a non-empty string`);
    }

    if (
        approvalConfig.spender !== undefined &&
        (typeof approvalConfig.spender !== 'string' || !approvalConfig.spender.trim())
    ) {
        throw new Error(`${prefix}.spender must be a non-empty string when provided`);
    }

    const amountKeys = ['amount', 'amountWei'];
    for (const key of amountKeys) {
        if (approvalConfig[key] !== undefined && !isSupportedScalarConfigValue(approvalConfig[key])) {
            throw new Error(`${prefix}.${key} must be a string, number, or bigint`);
        }
    }

    if (
        approvalConfig.amountInputKey !== undefined &&
        (typeof approvalConfig.amountInputKey !== 'string' || !approvalConfig.amountInputKey.trim())
    ) {
        throw new Error(`${prefix}.amountInputKey must be a non-empty string when provided`);
    }

    if (approvalConfig.amountLabel !== undefined && typeof approvalConfig.amountLabel !== 'string') {
        throw new Error(`${prefix}.amountLabel must be a string`);
    }

    if (
        approvalConfig.amountPlaceholder !== undefined &&
        typeof approvalConfig.amountPlaceholder !== 'string'
    ) {
        throw new Error(`${prefix}.amountPlaceholder must be a string`);
    }

    if (
        approvalConfig.decimals !== undefined &&
        (!Number.isFinite(Number(approvalConfig.decimals)) || Number(approvalConfig.decimals) < 0)
    ) {
        throw new Error(`${prefix}.decimals must be a non-negative number`);
    }

    if (
        approvalConfig.required !== undefined &&
        typeof approvalConfig.required !== 'boolean'
    ) {
        throw new Error(`${prefix}.required must be a boolean`);
    }

    if (
        approvalConfig.resetToZeroFirst !== undefined &&
        typeof approvalConfig.resetToZeroFirst !== 'boolean'
    ) {
        throw new Error(`${prefix}.resetToZeroFirst must be a boolean`);
    }

    const hasAmountSource = (
        approvalConfig.amount !== undefined ||
        approvalConfig.amountWei !== undefined ||
        (typeof approvalConfig.amountInputKey === 'string' && approvalConfig.amountInputKey.trim())
    );

    if (!hasAmountSource) {
        throw new Error(`${prefix} requires amount, amountWei, or amountInputKey`);
    }
}

function validateContractActions(collection, slug) {
    if (
        collection.includeDefaultContractActions !== undefined &&
        typeof collection.includeDefaultContractActions !== 'boolean'
    ) {
        throw new Error(`[${slug}] includeDefaultContractActions must be a boolean`);
    }

    if (
        collection.autoLoadContractFunctions !== undefined &&
        typeof collection.autoLoadContractFunctions !== 'boolean'
    ) {
        throw new Error(`[${slug}] autoLoadContractFunctions must be a boolean`);
    }

    if (
        collection.autoLoadPayableContractFunctions !== undefined &&
        typeof collection.autoLoadPayableContractFunctions !== 'boolean'
    ) {
        throw new Error(`[${slug}] autoLoadPayableContractFunctions must be a boolean`);
    }

    if (
        collection.autoLoadContractFunctionMaxInputs !== undefined &&
        !Number.isFinite(Number(collection.autoLoadContractFunctionMaxInputs))
    ) {
        throw new Error(`[${slug}] autoLoadContractFunctionMaxInputs must be a number`);
    }

    if (
        collection.autoLoadContractFunctionNames !== undefined &&
        !Array.isArray(collection.autoLoadContractFunctionNames)
    ) {
        throw new Error(`[${slug}] autoLoadContractFunctionNames must be an array of strings`);
    }

    if (
        collection.autoExcludeContractFunctionNames !== undefined &&
        !Array.isArray(collection.autoExcludeContractFunctionNames)
    ) {
        throw new Error(`[${slug}] autoExcludeContractFunctionNames must be an array of strings`);
    }

    if (Array.isArray(collection.autoLoadContractFunctionNames)) {
        for (const [index, name] of collection.autoLoadContractFunctionNames.entries()) {
            if (typeof name !== 'string' || !name.trim()) {
                throw new Error(`[${slug}] autoLoadContractFunctionNames[${index}] must be a non-empty string`);
            }
        }
    }

    if (Array.isArray(collection.autoExcludeContractFunctionNames)) {
        for (const [index, name] of collection.autoExcludeContractFunctionNames.entries()) {
            if (typeof name !== 'string' || !name.trim()) {
                throw new Error(`[${slug}] autoExcludeContractFunctionNames[${index}] must be a non-empty string`);
            }
        }
    }

    if (collection.contractActions === undefined) return;

    if (!Array.isArray(collection.contractActions)) {
        throw new Error(`[${slug}] contractActions must be an array`);
    }

    for (const [index, action] of collection.contractActions.entries()) {
        if (!action || typeof action !== 'object') {
            throw new Error(`[${slug}] contractActions[${index}] must be an object`);
        }

        const type = String(action.type || '').toUpperCase();
        if (!VALID_CONTRACT_ACTION_TYPES.includes(type)) {
            throw new Error(
                `[${slug}] Invalid contract action type: ${action.type}. Valid: ${VALID_CONTRACT_ACTION_TYPES.join(', ')}`
            );
        }

        if (!action.label) {
            throw new Error(`[${slug}] contractActions[${index}] requires a label`);
        }

        if (type === 'CONTRACT_CALL' && !action.functionName) {
            throw new Error(`[${slug}] contractActions[${index}] CONTRACT_CALL requires functionName`);
        }

        if (action.args !== undefined && !Array.isArray(action.args)) {
            throw new Error(`[${slug}] contractActions[${index}].args must be an array`);
        }

        if (Array.isArray(action.args)) {
            for (const [argIndex, arg] of action.args.entries()) {
                if (!arg || typeof arg !== 'object') {
                    throw new Error(`[${slug}] contractActions[${index}].args[${argIndex}] must be an object`);
                }

                if (!arg.key && !arg.name) {
                    throw new Error(
                        `[${slug}] contractActions[${index}].args[${argIndex}] requires key or name`
                    );
                }
            }
        }

        validateActionValueConfig(action.value, slug, index);
        validateActionApprovalConfig(action.approvalRequired, slug, index);
    }
}

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

    validateContractActions(collection, slug);

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
        const aPriority = STATUS_PRIORITY[normalizeStatus(a.status)] || 0;
        const bPriority = STATUS_PRIORITY[normalizeStatus(b.status)] || 0;

        if (aPriority !== bPriority) {
            return bPriority - aPriority; // Higher priority first
        }

        const aLaunch = Number.isFinite(a.launchAtTs) ? a.launchAtTs : Number.MAX_SAFE_INTEGER;
        const bLaunch = Number.isFinite(b.launchAtTs) ? b.launchAtTs : Number.MAX_SAFE_INTEGER;
        return aLaunch - bLaunch;
    });

    console.log(`[collections] Loaded ${collections.length} collections`);

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
    const normalized = normalizeStatus(status);
    return collections.filter(c => normalizeStatus(c.status) === normalized);
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

