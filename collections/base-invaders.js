/**
 * BaseInvaders Collection
 * Retro cyber 8-bit invaders – FREE mint
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "BaseInvaders",
    slug: "base-invaders",
    description: "Retro cyber alien invaders generated fully on-chain. 8-bit PFPs with glitch and corruption variants native to Base.",
    imageUrl: "/base-invaders.png",
    shareImageUrl: "/base-invaders-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0xCADD0E7B715d4c398cdeb889964ad8F9886AfaA4",
    abiName: "base-invaders",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 5,
        stages: [
            {
                type: "FREE",
                limit: 5,
                name: "Free Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["PFP", "Generative", "Pixel Art"],
    tags: [
        "on-chain",
        "pixel",
        "invaders",
        "retro",
        "cyber",
        "glitch",
        "Base"
    ],
    status: "live",
    visibility: "public",
    launchAt: "2026-02-08T00:00:00Z",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    traits: {
        Faction: ["OG", "GLITCHED", "CORRUPTED"],
        Background: ["Void", "Grid", "Matrix", "Neon", "Glitch"],
        Body: ["Classic", "Slim", "Heavy", "Cracked"],
        Eyes: ["Square", "Hollow", "X_X", "Laser", "Void"],
        Antenna: ["None", "Short", "Long", "Broken"],
        Corruption: ["None", "Static", "Melt", "Split"]
    },

    ui: {
        mintLabel: "Free Mint",
        soldOutLabel: "All Invaders Deployed",
        walletLimitLabel: "Max 5 Invaders per wallet",
        previewEnabled: true,
        animatedPreview: true
    },

    farcaster: {
        frame: true,
        shareText: [
            "My BASE_INVADER just landed. 8-bit. On-chain. Unstoppable. 👾",
            "Arcade logic meets Base chain. BASE_INVADER minted.",
            "Pixel identity locked in. BASE_INVADER online."
        ]
    },

    openseaUrl: "https://opensea.io/collection/base-invaders-",
    website: null,
    twitter: null,
    discord: null
};
