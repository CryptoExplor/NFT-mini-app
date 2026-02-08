/**
 * Zorgz Legendary Collection
 * 8-bit art with FREE + PAID mint stages
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "Zorgz Legendary",
    slug: "zorgz",
    description: "A legendary definition of 8-bit art.",
    imageUrl: "/image.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x1234567890123456789012345678901234567890", // REPLACE WITH ACTUAL
    abiName: "ERC721Standard",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: null, // Unlimited
        stages: [
            {
                type: "FREE",
                limit: 1, // First one is free
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: null, // Unlimited paid
                price: 0.001 * 1e18, // 0.001 ETH
                name: "Public Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["PFP", "Pixel Art"],
    tags: ["8-bit", "legendary", "retro"],
    status: "upcoming", // Set to "live" when contract is deployed
    visibility: "private",
    launched: "2026-02-08",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    featured: false,
    farcaster: null,
    website: null,
    twitter: null,
    discord: null
}
