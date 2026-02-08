/**
 * Collection Schema Template
 * Copy this file for each new collection
 * 
 * Usage: cp collections/_TEMPLATE.js collections/my-collection.js
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    // Display name
    name: "Collection Name",

    // URL slug (must be unique, lowercase, hyphenated)
    slug: "collection-slug",

    // Description (1-2 sentences)
    description: "Brief description of what makes this collection special.",

    // Collection image (relative to public folder or absolute URL)
    imageUrl: "/collection-image.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    // Chain ID (8453 = Base, 84532 = Base Sepolia, 1 = Ethereum)
    chainId: 8453,

    // Contract address (0x...)
    contractAddress: "0x1234567890123456789012345678901234567890",

    // ABI reference (must match filename in contracts/abis/)
    abiName: "ERC721Standard",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        // Max supply (total NFTs that can be minted)
        maxSupply: 10000,

        // Max per wallet (null = unlimited)
        maxPerWallet: 5,

        // Mint stages (executed in order based on user's mint count)
        stages: [
            // FREE MINT STAGE
            {
                type: "FREE",        // Type: FREE, PAID, BURN_ERC20
                limit: 1,            // First 1 is free (null = unlimited)
                name: "Free Mint"
            },

            // PAID MINT STAGE (after free is used)
            {
                type: "PAID",
                limit: null,         // Unlimited paid mints
                price: 0.001 * 1e18, // 0.001 ETH in wei
                name: "Public Mint"
            }

            // BURN TO MINT (optional example)
            /*
            {
              type: "BURN_ERC20",
              limit: null,
              token: "0xBurnTokenAddress",
              amount: 100n * 10n ** 18n,  // 100 tokens
              name: "Burn to Mint"
            }
            */
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    // Categories for filtering
    category: ["PFP", "Art"],

    // Tags for search
    tags: ["generative", "on-chain"],

    // Status: "upcoming" | "live" | "sold-out" | "paused"
    status: "live",

    // Visibility: "public" | "private"
    visibility: "public",

    // Launch date (YYYY-MM-DD)
    launched: "2026-02-01",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    // Featured on homepage (shows star badge)
    featured: false,

    // Farcaster frame URL
    farcaster: null,

    // Social links
    website: "https://collection.xyz",
    twitter: "https://twitter.com/collection",
    discord: "https://discord.gg/collection"
}
