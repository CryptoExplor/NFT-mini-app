/**
 * NeonShapes Collection
 * Vibrant geometric abstract art — fully on-chain with dynamic intensity.
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "NeonShapes",
    slug: "neon-shapes",
    description: "Vibrant geometric abstract art preserved on-chain. Infinite combinations of neon shapes, colors, and patterns with dynamic intensity on Base.",
    imageUrl: "/neonshapes.webp",
    shareImageUrl: "/neonshapes-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x8ED87D7E5582Ec38a8F3A6274f2CC7B107958E60", // TODO: replace after deployment
    abiName: "NeonShapes",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 7777,
        maxPerWallet: 7,
        stages: [
            {
                type: "FREE",
                limit: 3,
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: 4,
                price: 7000000000000, // 0.000007 ETH
                name: "Public Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative", "On-Chain"],
    tags: ["neon", "geometric", "abstract", "generative", "on-chain", "base"],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-22T18:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "Just minted a NeonShape on Base. Vibrant geometric art glowing on-chain.",
            "My NeonShape is alive. Infinite neon combinations, fully on-chain.",
            "Collected a NeonShape. Abstract art that amplifies. Built on Base."
        ]
    },

    openseaUrl: "https://opensea.io/collection/neonshapes-",
    website: null,
    twitter: null,
    discord: null
};
