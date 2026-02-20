/**
 * MiniWorlds Collection
 * Generative tiny worlds — fully on-chain landscapes with mountains, trees, sky, and atmosphere.
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "MiniWorlds",
    slug: "mini-worlds",
    description: "Generative tiny worlds preserved on-chain. Each world is a unique landscape with mountains, trees, sky, and dynamic atmosphere on Base.",
    imageUrl: "/miniworlds.webp",
    shareImageUrl: "/miniworlds-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x72810F6963E94742799A945EF01BECd34bb7374c", // TODO: replace after deployment
    abiName: "MiniWorlds",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 5000,
        maxPerWallet: 5,
        stages: [
            {
                type: "FREE",
                limit: 3,
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: 2,
                price: 20000000000000, // 0.00002 ETH
                name: "Public Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["Art", "Generative", "On-Chain"],
    tags: ["landscape", "generative", "on-chain", "world", "base"],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-20T24:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    farcaster: {
        frame: true,
        shareText: [
            "Just minted a tiny MiniWorld on Base. Mountains, trees, and sky preserved on-chain forever.",
            "My MiniWorld is alive on-chain. Each one is a unique generative landscape.",
            "Collected a MiniWorld. Generative art that evolves. Fully on Base."
        ]
    },

    openseaUrl: "https://opensea.io/collection/miniworlds-",
    website: null,
    twitter: null,
    discord: null
};
