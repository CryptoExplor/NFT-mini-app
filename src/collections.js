import { base, baseSepolia } from 'viem/chains';

// Configuration for Universal Mint Policy
export const collections = {
    zorgz: {
        id: 'zorgz',
        name: 'Zorgz Legendary',
        symbol: 'ZRZ',
        description: 'A legendary definition of 8-bit art.',
        imageUrl: '/image.png', // Placeholder
        chainId: base.id, // Defaults to Base
        contractAddress: '0x1234567890123456789012345678901234567890', // REPLACE ME
        maxSupply: 10000,

        // Universal Mint Policy
        mintPolicy: {
            maxPerWallet: null, // Unlimited
            stages: [
                {
                    type: 'FREE',
                    limit: 1, // First one is free
                    name: 'Free Mint'
                },
                {
                    type: 'PAID',
                    limit: null, // Unlimited paid
                    price: 0.001 * 1e18, // 0.001 ETH
                    name: 'Public Mint'
                }
                // Example Burn Stage (commented out for now)
                /*
                {
                  type: 'BURN_ERC20',
                  limit: null,
                  token: '0xBurnTokenAddress', 
                  amount: 100n * 10n ** 18n,
                  name: 'Burn to Mint'
                }
                */
            ]
        }
    },
    // Example 16-bit collection
    pixel_legends: {
        id: 'pixel_legends',
        name: 'Pixel Legends (16-bit)',
        symbol: 'PXL',
        description: '16-bit masterpieces on Base.',
        imageUrl: '/image.png',
        chainId: base.id,
        contractAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdef', // REPLACE ME
        maxSupply: 5000,

        mintPolicy: {
            maxPerWallet: 5,
            stages: [
                {
                    type: 'PAID',
                    limit: 5,
                    price: 0.005 * 1e18,
                    name: 'Public Mint'
                }
            ]
        }
    }
};

export const defaultCollectionId = 'zorgz';

