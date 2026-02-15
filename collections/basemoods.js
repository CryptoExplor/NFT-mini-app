/**
 * BaseMoods Collection
 * Fully on-chain emotional expression NFTs
 */

export default {
    // ============================================
    // REQUIRED FIELDS
    // ============================================

    name: "BaseMoods",
    slug: "base-moods",
    description: "Fully on-chain emotional expression NFTs. Cute faces that reflect different moods - perfect for daily vibes. 100% generated in Solidity.",
    imageUrl: "/base-moods.png",
    shareImageUrl: "/base-moods-share.png",

    // ============================================
    // CONTRACT CONFIGURATION
    // ============================================

    chainId: 8453, // Base Mainnet
    contractAddress: "0x8BE6974fFc8feea343af658e84193FfC03fdEafe", // TODO: Replace with deployed address
    abiName: "basemoods",

    // ============================================
    // MINT CONFIGURATION
    // ============================================

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 100,
        stages: [
            {
                type: "FREE",
                limit: 5,
                name: "Free Mint"
            },
            {
                type: "PAID",
                limit: 100, // Up to global maxPerWallet
                price: 0.00005 * 1e18, // 0.00005 ETH
                name: "Paid Mint"
            }
        ]
    },

    // ============================================
    // METADATA
    // ============================================

    category: ["PFP", "Generative", "On-Chain"],
    tags: [
        "on-chain",
        "moods",
        "svg",
        "emotional",
        "cute",
        "Base"
    ],
    status: "live",
    visibility: "public",
    launched: "2026-02-13",

    // ============================================
    // OPTIONAL FIELDS
    // ============================================

    featured: false,

    traits: {
        Mood: ["Happy", "Sad", "Excited", "Chill", "Sleepy", "Angry", "Confused", "In Love", "Zen", "Party"],
        "Face Color": ["Pastel Red", "Pastel Blue", "Pastel Orange", "Pastel Purple", "Pastel Green", "Pastel Pink", "Pastel Peach", "Pastel Cyan"],
        Eyes: ["^_^", "T_T", "*o*", "-_-", "u_u", ">_<", "O_o", "<3_<3", "~_~", "@_@"],
        Mouth: ["u", "n", "o", "_", "z", "A", "?", "3", "-", "D"]
    },

    ui: {
        mintLabel: "Mint Mood",
        soldOutLabel: "All Moods Taken",
        walletLimitLabel: "Max 100 Moods per wallet",
        previewEnabled: true,
        animatedPreview: false
    },

    farcaster: {
        frame: true,
        shareText: [
            "I just minted my current vibe with BaseMoods. 😌",
            "Feeling this on-chain mood. BaseMoods minted! ✨",
            "My mood is now immutable. Checked in with BaseMoods. 🟢"
        ]
    },

    openseaUrl: "https://opensea.io/collection/basemoods",
    website: null,
    twitter: null,
    discord: null
};
