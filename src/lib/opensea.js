/**
 * OpenSea API v2 Client
 * Fetches NFTs by wallet address with caching, pagination, and on-chain fallback
 */

import { readContract } from '@wagmi/core';
import { cache } from '../utils/cache.js';
import { wagmiAdapter } from '../wallet.js';

const API_BASE = 'https://api.opensea.io/api/v2';
const API_KEY = import.meta.env.VITE_OPENSEA_API_KEY;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const CHAIN_ID_TO_OPENSEA = {
    1: 'ethereum',
    8453: 'base',
    84532: 'base_sepolia'
};
const ERC721_ENUMERABLE_ABI = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    },
    {
        name: 'tokenOfOwnerByIndex',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

function normalizeContractAddress(contractValue) {
    if (!contractValue) return '';
    if (typeof contractValue === 'string') return contractValue.toLowerCase();
    if (typeof contractValue === 'object') {
        return String(
            contractValue.address ||
            contractValue.contract_address ||
            contractValue.contractAddress ||
            ''
        ).toLowerCase();
    }
    return '';
}

function sortTokenIds(tokenIds) {
    return [...tokenIds].sort((a, b) => {
        const aNum = /^\d+$/.test(String(a));
        const bNum = /^\d+$/.test(String(b));

        if (aNum && bNum) {
            const aBig = BigInt(String(a));
            const bBig = BigInt(String(b));
            if (aBig === bBig) return 0;
            return aBig < bBig ? -1 : 1;
        }

        return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
    });
}

export function getOpenSeaChainFromChainId(chainId) {
    const normalized = Number(chainId);
    return CHAIN_ID_TO_OPENSEA[normalized] || null;
}

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
                if (attempt === retries) {
                    throw new Error('OpenSea API rate limited (429)');
                }
                const wait = Math.pow(2, attempt) * 1000;
                console.warn(`[OpenSea] Rate limited, retrying in ${wait}ms...`);
                await new Promise((resolve) => setTimeout(resolve, wait));
                continue;
            }

            if (!res.ok) {
                throw new Error(`OpenSea API ${res.status}: ${res.statusText}`);
            }

            return await res.json();
        } catch (error) {
            if (attempt === retries) throw error;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
    }

    throw new Error('OpenSea request failed');
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

async function fetchOwnedTokenIdsViaOpenSea(address, options = {}) {
    const {
        chain,
        contractAddress,
        maxPages = 6,
        limit = 50,
        collection = null
    } = options;

    if (!chain) return [];

    const normalizedContract = normalizeContractAddress(contractAddress);
    if (!normalizedContract) return [];

    const tokenIds = new Set();
    let next = null;
    let page = 0;

    while (page < maxPages) {
        const result = await fetchNFTsByWallet(address, {
            chain,
            limit,
            next,
            collection
        });

        for (const nft of result.nfts || []) {
            const nftContract = normalizeContractAddress(nft.contract);
            if (nftContract === normalizedContract && nft.identifier !== undefined && nft.identifier !== null) {
                tokenIds.add(String(nft.identifier));
            }
        }

        if (!result.next) break;
        next = result.next;
        page++;
    }

    return sortTokenIds([...tokenIds]);
}

async function fetchOwnedTokenIdsOnChain(address, options = {}) {
    const {
        chainId,
        contractAddress,
        force = false,
        maxOnchainTokenIds = 300
    } = options;

    const normalizedContract = normalizeContractAddress(contractAddress);
    const normalizedChainId = Number(chainId);

    if (!address || !normalizedContract || !Number.isFinite(normalizedChainId)) {
        return [];
    }

    const cacheKey = `onchain_token_ids_${normalizedChainId}_${address}_${normalizedContract}_${maxOnchainTokenIds}`;
    if (!force) {
        const cached = cache.get(cacheKey);
        if (cached) return cached;
    }

    const wagmiConfig = wagmiAdapter?.wagmiConfig;
    if (!wagmiConfig) {
        throw new Error('Wallet config is not available for on-chain token lookup');
    }

    const rawBalance = await readContract(wagmiConfig, {
        address: normalizedContract,
        abi: ERC721_ENUMERABLE_ABI,
        functionName: 'balanceOf',
        args: [address],
        chainId: normalizedChainId
    });

    const balance = typeof rawBalance === 'bigint'
        ? rawBalance
        : BigInt(String(rawBalance || '0'));

    if (balance <= 0n) {
        cache.set(cacheKey, [], CACHE_TTL);
        return [];
    }

    const maxCountValue = Number.isFinite(Number(maxOnchainTokenIds)) && Number(maxOnchainTokenIds) > 0
        ? BigInt(Math.floor(Number(maxOnchainTokenIds)))
        : balance;
    const count = balance < maxCountValue ? balance : maxCountValue;

    const tokenIds = [];
    for (let index = 0n; index < count; index++) {
        const tokenId = await readContract(wagmiConfig, {
            address: normalizedContract,
            abi: ERC721_ENUMERABLE_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [address, index],
            chainId: normalizedChainId
        });
        tokenIds.push(String(tokenId));
    }

    const sorted = sortTokenIds(tokenIds);
    cache.set(cacheKey, sorted, CACHE_TTL);
    return sorted;
}

/**
 * Fetch token IDs owned by a wallet for a specific contract.
 * Primary source is OpenSea account endpoint, with optional on-chain fallback.
 * @param {string} address
 * @param {Object} options
 * @param {string|null} options.chain - OpenSea chain slug (e.g. "base")
 * @param {number|null} options.chainId - EVM chainId for on-chain fallback
 * @param {string} options.contractAddress
 * @param {number} options.maxPages
 * @param {number} options.limit
 * @param {string|null} options.collection
 * @param {boolean} options.force
 * @param {boolean} options.allowOnChainFallback
 * @param {number} options.maxOnchainTokenIds
 * @returns {Promise<string[]>}
 */
export async function fetchOwnedTokenIdsForContract(address, options = {}) {
    const {
        chain = null,
        chainId = null,
        contractAddress,
        maxPages = 6,
        limit = 50,
        collection = null,
        force = false,
        allowOnChainFallback = true,
        maxOnchainTokenIds = 300
    } = options;

    if (!address || !contractAddress) return [];

    const normalizedContract = normalizeContractAddress(contractAddress);
    if (!normalizedContract) return [];

    const normalizedChainId = Number.isFinite(Number(chainId)) ? Number(chainId) : null;

    const cacheKey = `owned_token_ids_${chain || 'none'}_${normalizedChainId || 'na'}_${address}_${normalizedContract}_${collection || 'all'}_${maxPages}_${limit}_${allowOnChainFallback ? 1 : 0}_${maxOnchainTokenIds}`;
    if (!force) {
        const cached = cache.get(cacheKey);
        if (cached) return cached;
    }

    const canUseOpenSea = typeof chain === 'string' && chain.trim() !== '';
    let openSeaError = null;
    let openSeaTokenIds = [];

    if (canUseOpenSea) {
        try {
            openSeaTokenIds = await fetchOwnedTokenIdsViaOpenSea(address, {
                chain,
                contractAddress: normalizedContract,
                maxPages,
                limit,
                collection
            });

            if (openSeaTokenIds.length) {
                cache.set(cacheKey, openSeaTokenIds, CACHE_TTL);
                return openSeaTokenIds;
            }
        } catch (error) {
            openSeaError = error;
            console.warn('[OpenSea] Token ID lookup failed, trying on-chain fallback:', error);
        }
    }

    const canUseOnChainFallback = allowOnChainFallback && Number.isFinite(normalizedChainId);
    if (canUseOnChainFallback) {
        try {
            const onChainTokenIds = await fetchOwnedTokenIdsOnChain(address, {
                chainId: normalizedChainId,
                contractAddress: normalizedContract,
                force,
                maxOnchainTokenIds
            });

            if (onChainTokenIds.length || openSeaError || !canUseOpenSea) {
                cache.set(cacheKey, onChainTokenIds, CACHE_TTL);
                return onChainTokenIds;
            }
        } catch (fallbackError) {
            if (openSeaError) {
                throw new Error(
                    `OpenSea lookup failed (${openSeaError.message}); on-chain fallback failed (${fallbackError?.message || fallbackError})`
                );
            }

            if (!canUseOpenSea) {
                throw fallbackError;
            }

            console.warn('[OpenSea] On-chain token lookup fallback failed:', fallbackError);
        }
    }

    if (openSeaError) {
        throw openSeaError;
    }

    cache.set(cacheKey, openSeaTokenIds, CACHE_TTL);
    return openSeaTokenIds;
}

/**
 * Normalize OpenSea NFT data into a consistent shape
 */
function normalizeNFT(nft) {
    const contractAddress = normalizeContractAddress(
        nft.contract ||
        nft.contract_address ||
        nft.contractAddress
    );

    return {
        identifier: nft.identifier || nft.token_id || '',
        name: nft.name || `#${nft.identifier || nft.token_id || '?'}`,
        description: nft.description || '',
        image_url: nft.image_url || nft.display_image_url || nft.image || '',
        animation_url: nft.animation_url || '',
        metadata_url: nft.metadata_url || '',
        collection: nft.collection || '',
        contract: contractAddress,
        token_standard: nft.token_standard || 'erc721',
        opensea_url: nft.opensea_url || '',
        traits: (nft.traits || []).map((trait) => ({
            trait_type: trait.trait_type || trait.type || '',
            value: trait.value || '',
            display_type: trait.display_type || '',
            trait_count: trait.trait_count || null
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
