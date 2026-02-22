/**
 * NeonRunes Collection
 * Mystical glowing runes with combination mechanics and power amplification.
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "NeonRunes",
    slug: "neon-runes",
    description: "Mystical glowing runes preserved fully on-chain. Combine runes and amplify power through holder interactions on Base.",
    imageUrl: "/neonrunes.webp",
    shareImageUrl: "/neonrunes-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x64b41CdF5ec5ECBDbBC684e760f93Ddbde05067c", // TODO: replace with deployed NeonRunes address
    abiName: "NeonRunes",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 8888,
        maxPerWallet: 8,
        stages: [
            {
                type: "FREE",
                limit: 2,
                name: "Free Inscription"
            },
            {
                type: "PAID",
                limit: 6,
                price: 400000000000000, // 0.0004 ETH
                name: "Public Inscription"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative", "On-Chain"],
    tags: ["runes", "neon", "mythic", "combine", "amplify", "base"],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-27T00:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "I just inscribed a NeonRune on Base. Ancient symbols, modern chain energy.",
            "My NeonRune got stronger on-chain. Combine and amplify power.",
            "NeonRunes minted. Mystical runes now living on Base."
        ]
    },

    openseaUrl: "https://opensea.io/collection/neonrunes-",
    website: null,
    twitter: null,
    discord: null
};
