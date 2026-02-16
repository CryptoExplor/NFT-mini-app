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
    imageUrl: "/sigil.webp",
    shareImageUrl: "/sigil.png",

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
    launchAt: "2026-02-08T00:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "I inscribed my ONCHAIN_SIGIL — geometry encoded forever. ⟁",
            "This sigil now lives fully on-chain. No storage. No decay. ONCHAIN_SIGILS.",
            "Activated my ONCHAIN_SIGIL. The pattern chose me."
        ]
    },
    openseaUrl: "https://opensea.io/collection/onchain_sigils",
    website: null,
    twitter: null,
    discord: null
}
