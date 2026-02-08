/**
 * OnchainSigils Collection
 * Occult on-chain sigils - FREE mint only
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "OnchainSigils",
    slug: "onchain-sigils",
    description: "These sigils are geometric artifacts generated entirely on-chain...",
    imageUrl: "/sigil.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0xd243379AC0A9B700f4d9E22C7b3bFc3515150973",
    abiName: "sigil",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 1,
        stages: [
            {
                type: "FREE",
                limit: 1,
                name: "Free Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative"],
    tags: ["on-chain", "occult", "sigils", "schizocore", "Base"],
    status: "live",
    visibility: "public",
    launched: "2026-02-08",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    featured: true,
    farcaster: null,
    website: null,
    twitter: null,
    discord: null
}
