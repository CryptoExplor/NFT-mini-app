import { fetchNFTsByWallet } from './opensea.js';
import { normalizeFighter, normalizeItemStats, normalizeArenaStats } from './battle/metadataNormalizer.js';
import { COLLECTION_PROFILES, getRoleForSlug, getCollectionProfile } from './battle/collectionProfiles.js';

/**
 * Game Ecosystem Utility
 * Fetches all owned NFTs across the whitelisted collections
 * using the existing OpenSea API client (src/lib/opensea.js) to populate the NFTSelectorModal.
 * 
 * @param {string} walletAddress 
 * @returns {Promise<Array>} Array of normalized game-ready NFT objects
 */
export async function fetchOwnedBattleNFTs(walletAddress) {
    if (!walletAddress) return [];
    console.log(`[Inventory] Deep scanning OpenSea inventory for ${walletAddress}...`);
    
    try {
        const allFetchedNFTs = [];
        let nextCursor = null;
        let pagesFetched = 0;
        const MAX_PAGES = 8; // Scan up to 400 items
        const FETCH_LIMIT = 50; // More reliable than 200 for OS v2

        while (pagesFetched < MAX_PAGES) {
            const result = await fetchNFTsByWallet(walletAddress, {
                chain: 'base',
                limit: FETCH_LIMIT,
                next: nextCursor
            });
            
            if (result.nfts && result.nfts.length > 0) {
                allFetchedNFTs.push(...result.nfts);
            }

            if (!result.next || result.nfts.length === 0) break;
            nextCursor = result.next;
            pagesFetched++;
        }

        console.log(`[Inventory] Total fetched raw NFTs: ${allFetchedNFTs.length}`);

        return allFetchedNFTs
            .map(nft => {
                const rawSlug = nft.collection || '';
                const profile = getCollectionProfile(rawSlug);
                
                if (!profile) {
                    // Log unknown collections only in DEV to keep console clean but traceable
                    if (import.meta.env.DEV) {
                        // console.log(`[Inventory] Skipping non-game collection: ${rawSlug}`);
                    }
                    return null;
                }

                const traits = nft.traits || [];
                const role = profile.role || 'UNKNOWN';

                // Resolve primary trait for display
                let primaryTrait = 'Standard';
                if (traits.length > 0) {
                    const mapped = traits.find(t =>
                        t.trait_type === 'Faction' ||
                        t.trait_type === 'Mood' ||
                        t.trait_type === 'Distortion' ||
                        t.trait_type === 'Rarity'
                    );
                    primaryTrait = mapped ? mapped.value : traits[0].value;
                }

                // Normalize stats
                let stats = {};
                try {
                    if (role === 'FIGHTER') {
                        stats = normalizeFighter(rawSlug, nft.identifier, traits);
                    } else if (role === 'ITEM_BUFF') {
                        stats = normalizeItemStats(rawSlug, nft.identifier, traits);
                    } else if (role === 'ENVIRONMENT') {
                        stats = normalizeArenaStats(rawSlug, nft.identifier, traits);
                    }
                } catch (e) {
                    console.warn(`[Inventory] Norm error for ${rawSlug} #${nft.identifier}`, e.message);
                }

                return {
                    id: `${rawSlug}:${nft.identifier}`,
                    engineId: rawSlug,
                    collectionName: profile.name || rawSlug,
                    nftId: nft.identifier,
                    trait: primaryTrait,
                    role,
                    slotEligible: true,
                    rawAttributes: traits,
                    stats,
                    passive: stats.passive || null,
                    imageUrl: nft.image_url || nft.animation_url || null
                };
            })
            .filter(n => n !== null);
    } catch (e) {
        console.error('[Inventory] Error fetching NFTs:', e);
        return [];
    }
}
