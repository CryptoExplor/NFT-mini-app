/**
 * Fighter ownership verification.
 *
 * Stats are clamped (sanitize.js) and outcomes are server-simulated
 * (record.js / fight.js), but nothing checked that a player actually OWNS the
 * NFT they are fighting with — any wallet could enter the arena with any
 * token id from any supported collection.
 *
 * This resolves the collection slug to its contract, asks the chain who owns
 * the token, and caches the answer briefly so a fight costs at most one RPC
 * call (usually zero).
 *
 * Policy:
 *   - known collection + wallet is not the owner  → rejected
 *   - collection has no contract mapping          → allowed, flagged `skipped`
 *     (set STRICT_BATTLE_OWNERSHIP=true to reject these instead)
 *   - RPC/KV failure                              → allowed, flagged `skipped`
 *     (fail-open: an infra blip must not block play; cheating still needs a
 *     valid JWT and everything else stays clamped/verified)
 */

import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const OWNER_CACHE_TTL_SECONDS = 600; // 10 minutes
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const OWNERSHIP_ABI = [
    {
        name: 'ownerOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'tokenId', type: 'uint256' }],
        outputs: [{ name: '', type: 'address' }]
    },
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'owner', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
    }
];

let publicClientPromise = null;
function getPublicClient() {
    if (!publicClientPromise) {
        publicClientPromise = Promise.resolve(
            createPublicClient({ chain: base, transport: http(process.env.RPC_URL) })
        );
    }
    return publicClientPromise;
}

let contractMapPromise = null;

/**
 * slug (and every known alias) → { address, chainId }
 * Built from the collection registry, extended with the battle profiles' aliases.
 */
async function getContractMap() {
    if (contractMapPromise) return contractMapPromise;

    contractMapPromise = (async () => {
        const map = new Map();

        try {
            const { loadCollections } = await import('../../../src/lib/loadCollections.js');
            for (const collection of loadCollections() || []) {
                if (!collection?.slug || !collection?.contractAddress) continue;
                map.set(collection.slug.toLowerCase(), {
                    address: collection.contractAddress,
                    chainId: Number(collection.chainId) || base.id
                });
            }
        } catch (error) {
            console.warn('[Ownership] Collection registry unavailable:', error?.message);
            return map;
        }

        // Battle profiles use their own ids/aliases (e.g. "BaseMoods",
        // "base_moods"); point them at the same contract.
        try {
            const { COLLECTION_PROFILES } = await import('../../../src/lib/battle/collectionProfiles.js');
            for (const [profileId, profile] of Object.entries(COLLECTION_PROFILES || {})) {
                const direct = map.get(profileId.toLowerCase());
                const aliases = [profileId, ...(profile?.engineAlias || [])].map(a => String(a).toLowerCase());
                const known = direct || aliases.map(a => map.get(a)).find(Boolean);
                if (!known) continue;
                for (const alias of aliases) {
                    if (!map.has(alias)) map.set(alias, known);
                }
            }
        } catch (error) {
            console.warn('[Ownership] Battle profiles unavailable:', error?.message);
        }

        return map;
    })();

    return contractMapPromise;
}

export async function resolveCollectionContract(slug) {
    if (!slug) return null;
    const map = await getContractMap();
    return map.get(String(slug).toLowerCase()) || null;
}

function normalizeTokenId(value) {
    if (value === undefined || value === null || value === '') return null;
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw) || raw.length > 78) return null;
    try {
        return BigInt(raw);
    } catch {
        return null;
    }
}

/**
 * @param {Object} kv - KV client (used purely as an owner cache; optional)
 * @param {{ wallet: string, collectionSlug?: string, tokenId?: string|number }} fighter
 * @returns {Promise<{ owned: boolean, skipped: boolean, reason?: string, owner?: string }>}
 */
export async function verifyFighterOwnership(kv, fighter) {
    const strict = process.env.STRICT_BATTLE_OWNERSHIP === 'true';
    const wallet = String(fighter?.wallet || '').toLowerCase();
    const skip = (reason) => ({ owned: !strict, skipped: true, reason });

    if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
        return { owned: false, skipped: false, reason: 'invalid_wallet' };
    }

    const tokenId = normalizeTokenId(fighter?.tokenId);
    if (tokenId === null) return skip('invalid_token_id');

    const contract = await resolveCollectionContract(fighter?.collectionSlug);
    if (!contract) return skip('unknown_collection');

    const cacheKey = `own:${contract.address.toLowerCase()}:${tokenId}`;

    // 1. Cached owner
    try {
        const cached = await kv?.get?.(cacheKey);
        if (typeof cached === 'string' && cached.startsWith('0x')) {
            return { owned: cached === wallet, skipped: false, owner: cached };
        }
    } catch { /* cache miss / KV down — fall through to RPC */ }

    // 2. Ask the chain
    try {
        const client = await getPublicClient();
        let owner = null;

        try {
            owner = await client.readContract({
                address: contract.address,
                abi: OWNERSHIP_ABI,
                functionName: 'ownerOf',
                args: [tokenId]
            });
        } catch {
            // Not an ERC-721 (or the token does not exist): fall back to a
            // balance check, which is the best an ERC-1155 can offer here.
            const balance = await client.readContract({
                address: contract.address,
                abi: OWNERSHIP_ABI,
                functionName: 'balanceOf',
                args: [wallet]
            });
            const owned = (typeof balance === 'bigint' ? balance : BigInt(balance || 0)) > 0n;
            return { owned, skipped: false, reason: owned ? undefined : 'not_owner' };
        }

        const normalizedOwner = String(owner || '').toLowerCase();
        if (!normalizedOwner || normalizedOwner === ZERO_ADDRESS) {
            return { owned: false, skipped: false, reason: 'token_not_minted' };
        }

        // Cache regardless of who owns it — transfers are rare relative to fights.
        try {
            await kv?.set?.(cacheKey, normalizedOwner, { ex: OWNER_CACHE_TTL_SECONDS });
        } catch { /* caching is best effort */ }

        return {
            owned: normalizedOwner === wallet,
            skipped: false,
            owner: normalizedOwner,
            reason: normalizedOwner === wallet ? undefined : 'not_owner'
        };
    } catch (error) {
        console.warn('[Ownership] Verification unavailable:', error?.message);
        return skip('rpc_unavailable');
    }
}

/** Pull the identifying fields out of a BattleLoadoutV1 fighter slot. */
export function getFighterIdentity(loadout) {
    const fighter = loadout?.fighter || {};
    return {
        collectionSlug: fighter.collectionSlug || fighter.collectionId || fighter.collectionName || null,
        tokenId: fighter.tokenId ?? fighter.nftId ?? null
    };
}
