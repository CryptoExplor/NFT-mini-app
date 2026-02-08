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
    launched: "2026-02-08",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    featured: true,

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
        shareText: "I just deployed a Base Invader 👾"
    },

    website: null,
    twitter: null,
    discord: null
};
