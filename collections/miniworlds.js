export default {
    name: "MiniWorlds",
    slug: "miniworlds",
    description: "Unique generative landscapes preserved on-chain.",
    imageUrl: "/demo.png",

    chainId: 8453,
    contractAddress: "0x56789012345678901234567890123456789ABCDE",
    abiName: "OnChainNFT",

    mintPolicy: {
        maxSupply: 5000,
        maxPerWallet: 3,
        stages: [
            {
                type: "PAID",
                limit: null,
                price: 0.002 * 1e18,
                name: "Collect World"
            }
        ]
    },

    category: ["Art", "Generative", "Landscape"],
    tags: ["on-chain", "art", "landscape", "generative", "premium", "Base"],
    status: "Upcoming",
    visibility: "public",
    launched: "2026-02-10",
    featured: true
};
