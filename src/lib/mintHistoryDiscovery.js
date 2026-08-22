const PROXY_BASE = `${import.meta.env.VITE_API_URL || ''}/api/nfts`;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HASH_RE = /^0x[a-fA-F0-9]{64}$/;

let collectionByContractPromise = null;
async function getCollectionByContract() {
    if (!collectionByContractPromise) {
        collectionByContractPromise = import('../../collections/index.js').then(({ COLLECTIONS_MAP }) => new Map(
            Object.values(COLLECTIONS_MAP)
                .filter((collection) => collection?.contractAddress && collection?.slug)
                .map((collection) => [String(collection.contractAddress).toLowerCase(), collection])
        ));
    }
    return collectionByContractPromise;
}

function getMintPrice(event) {
    const payment = event?.payment;
    if (!payment || String(payment.symbol || '').toUpperCase() !== 'ETH') return 0;
    const decimals = Math.max(0, Math.min(Number(payment.decimals) || 18, 30));
    const quantity = Number(payment.quantity);
    return Number.isFinite(quantity) && quantity > 0 ? quantity / (10 ** decimals) : 0;
}

function buildEventsUrl(wallet, params) {
    const query = new URLSearchParams(params);
    query.set('path', `events/accounts/${wallet.toLowerCase()}`);
    return `${PROXY_BASE}?${query}`;
}

/**
 * Discover confirmed Base mints through OpenSea's account-events endpoint.
 * This runs in the browser on demand; there is no cron job or dedicated server.
 * Every discovery is still receipt-verified by /api/track before it is counted.
 */
export async function discoverHistoricalMints(wallet, options = {}) {
    if (!ADDRESS_RE.test(String(wallet || ''))) return [];

    const limit = Math.max(1, Math.min(Number(options.limit) || 50, 200));
    const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 3, 5));
    const after = Number(options.after) || Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    const collectionByContract = await getCollectionByContract();
    const discovered = new Map();
    let next = '';

    for (let page = 0; page < maxPages; page++) {
        const url = buildEventsUrl(wallet, {
            event_type: 'mint',
            chain: 'base',
            limit: String(limit),
            after: String(after),
            ...(next ? { next } : {})
        });
        const response = await fetch(url, {
            headers: { Accept: 'application/json' },
            cache: 'no-store'
        });
        if (!response.ok) {
            throw new Error(`OpenSea mint history unavailable (${response.status})`);
        }

        const data = await response.json();
        for (const event of data?.asset_events || []) {
            const txHash = String(event?.transaction || '').toLowerCase();
            const contractAddress = String(event?.nft?.contract || '').toLowerCase();
            const collection = collectionByContract.get(contractAddress);
            const toAddress = String(event?.to_address || wallet).toLowerCase();

            if (!HASH_RE.test(txHash) || !collection || toAddress !== wallet.toLowerCase()) continue;
            if (discovered.has(txHash)) continue;

            discovered.set(txHash, {
                wallet: wallet.toLowerCase(),
                collection: collection.slug,
                txHash,
                chainId: Number(collection.chainId) || 8453,
                timestamp: Number(event?.event_timestamp) > 0
                    ? Number(event.event_timestamp) * 1000
                    : Date.now(),
                tokenId: event?.nft?.identifier !== undefined ? String(event.nft.identifier) : '',
                quantity: Math.max(1, Number(event?.quantity) || 1),
                price: getMintPrice(event),
                source: 'opensea-history'
            });
        }

        next = typeof data?.next === 'string' ? data.next : '';
        if (!next) break;
    }

    return [...discovered.values()].sort((a, b) => a.timestamp - b.timestamp);
}
