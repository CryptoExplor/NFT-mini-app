/**
 * Base Gods Collection
 * Legendary Deities on Base
 */

export default {
    name: "Base Gods",
    slug: "base-gods",
    description: "The divine entities of the Base ecosystem. Ancient deities reborn as on-chain fighters with immense power and wisdom.",
    imageUrl: "/base-gods.webp",
    shareImageUrl: "/base-gods-share.png",

    chainId: 8453,
    contractAddress: "0x2d53d0545cd1275b69040e3c50587e2cc4443a52",
    abiName: "erc721", // Standard ERC721

    mintPolicy: {
        maxSupply: 888,
        maxPerWallet: 1,
        stages: [
            {
                type: "PAID",
                price: "0.069",
                name: "Divine Mint"
            }
        ]
    },

    category: ["PFP", "Legendary", "Divine"],
    tags: [
        "Base",
        "Gods",
        "Mythology",
        "High-Stake",
        "Divine"
    ],
    status: "live",
    visibility: "public",
    launchAt: "2026-03-15T00:00:00Z",

    traits: {
        Deity: ["Zeus", "Hades", "Poseidon", "Athena", "Ares"],
        Background: ["Mount Olympus", "Underworld", "Abyssal Sea", "Celestial Realm"],
        Aura: ["Gold", "Purple", "Blue", "Red"],
        Weapon: ["Thunderbolt", "Bident", "Trident", "Spear"]
    },

    ui: {
        mintLabel: "Summon Deity",
        soldOutLabel: "Pantheon Complete",
        previewEnabled: true
    },

    farcaster: {
        frame: true,
        shareText: [
            "A deity has joined my ranks. Base Gods are here. ⚡",
            "Divine intervention on Base. Base Gods online.",
            "I have summoned a Base God. The arena will tremble."
        ]
    },

    openseaUrl: "https://opensea.io/collection/base-gods",
    twitter: "https://x.com/basegods"
};
