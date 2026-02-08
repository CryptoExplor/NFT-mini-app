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
    OnchainSigils: {
        id: 'OnchainSigils',
        name: 'OnchainSigils',
        symbol: 'SIGIL',
        description: 'Occult on-chain sigils.',
        imageUrl: '/image.png',
        chainId: base.id,
        contractAddress: '0xd243379AC0A9B700f4d9E22C7b3bFc3515150973',
        maxSupply: 10000,

        mintPolicy: {
            maxPerWallet: 1,
            stages: [
                {
                    type: 'FREE',
                    limit: 1,
                    name: 'Public Mint'
                }
            ]
        }
    }
};

export const defaultCollectionId = 'OnchainSigils';


