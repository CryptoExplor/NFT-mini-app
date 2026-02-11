/**
 * OpenSea API v2 Client
 * Fetches NFTs by wallet address with caching & pagination
 */

import { cache } from '../utils/cache.js';

const API_BASE = 'https://api.opensea.io/api/v2';
const API_KEY = import.meta.env.VITE_OPENSEA_API_KEY;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Make an authenticated request to OpenSea API
 */
async function openseaFetch(url, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'X-API-KEY': API_KEY || ''
                }
            });

            if (res.status === 429) {
                // Rate limited — wait and retry
                const wait = Math.pow(2, attempt) * 1000;
                console.warn(`[OpenSea] Rate limited, retrying in ${wait}ms...`);
                await new Promise(r => setTimeout(r, wait));
                continue;
            }

            if (!res.ok) {
                throw new Error(`OpenSea API ${res.status}: ${res.statusText}`);
            }

            return await res.json();
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

/**
 * Fetch NFTs owned by a wallet address
 * @param {string} address - Wallet address
 * @param {Object} options
 * @param {string} options.chain - Chain identifier (default: 'base')
 * @param {number} options.limit - Items per page (max 200, default 50)
 * @param {string} options.next - Pagination cursor
 * @param {string} options.collection - Filter by collection slug
 * @returns {Promise<{nfts: Array, next: string|null}>}
 */
export async function fetchNFTsByWallet(address, options = {}) {
    const {
        chain = 'base',
        limit = 50,
        next = null,
        collection = null
    } = options;

    const cacheKey = `opensea_nfts_${chain}_${address}_${limit}_${next || 'first'}_${collection || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({ limit: String(limit) });
    if (next) params.set('next', next);
    if (collection) params.set('collection', collection);

    const url = `${API_BASE}/chain/${chain}/account/${address}/nfts?${params}`;
    const data = await openseaFetch(url);

    const result = {
        nfts: (data.nfts || []).map(normalizeNFT),
        next: data.next || null
    };

    cache.set(cacheKey, result, CACHE_TTL);
    return result;
}

/**
 * Fetch a single NFT's details
 * @param {string} chain
 * @param {string} contractAddress
 * @param {string} tokenId
 * @returns {Promise<Object>}
 */
export async function fetchNFTDetails(chain, contractAddress, tokenId) {
    const cacheKey = `opensea_nft_${chain}_${contractAddress}_${tokenId}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const url = `${API_BASE}/chain/${chain}/contract/${contractAddress}/nfts/${tokenId}`;
    const data = await openseaFetch(url);

    const result = normalizeNFT(data.nft || data);
    cache.set(cacheKey, result, CACHE_TTL * 5); // Cache details longer
    return result;
}

/**
 * Normalize OpenSea NFT data into a consistent shape
 */
function normalizeNFT(nft) {
    return {
        identifier: nft.identifier || nft.token_id || '',
        name: nft.name || `#${nft.identifier || nft.token_id || '?'}`,
        description: nft.description || '',
        image_url: nft.image_url || nft.display_image_url || nft.image || '',
        animation_url: nft.animation_url || '',
        metadata_url: nft.metadata_url || '',
        collection: nft.collection || '',
        contract: nft.contract || '',
        token_standard: nft.token_standard || 'erc721',
        opensea_url: nft.opensea_url || '',
        traits: (nft.traits || []).map(t => ({
            trait_type: t.trait_type || t.type || '',
            value: t.value || '',
            display_type: t.display_type || '',
            trait_count: t.trait_count || null
        })),
        // Keep raw for anything we missed
        _raw: nft
    };
}

/**
 * Extract unique collections from a list of NFTs
 * @param {Array} nfts - Array of normalized NFTs
 * @returns {Array<{slug: string, count: number}>}
 */
export function extractCollections(nfts) {
    const map = {};
    for (const nft of nfts) {
        const slug = nft.collection || 'unknown';
        if (!map[slug]) {
            map[slug] = { slug, count: 0 };
        }
        map[slug].count++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
}
