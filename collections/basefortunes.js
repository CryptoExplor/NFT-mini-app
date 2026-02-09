export default {
    name: "BaseFortunes",
    slug: "basefortunes",
    description: "Collect daily wisdom and positive fortunes on-chain.",
    imageUrl: "/demo.png",

    chainId: 8453,
    contractAddress: "",
    abiName: "OnChainNFT",

    mintPolicy: {
        maxSupply: 10000,
        maxPerWallet: 10,
        stages: [
            {
                type: "FREE",
                limit: 3,
                name: "Free Fortune"
            },
            {
                type: "PAID",
                limit: null,
                price: 0.0003 * 1e18,
                name: "More Fortunes"
            }
        ]
    },

    category: ["Fun", "Social", "Wisdom"],
    tags: ["on-chain", "fortune", "wisdom", "lucky", "shareable", "Base"],
    status: "Upcoming",
    visibility: "public",
    launched: "2026-02-10",
    featured: true
};
