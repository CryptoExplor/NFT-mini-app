import { kv } from '@vercel/kv';

// CORS helper
function cors(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Valid event types
const VALID_EVENTS = [
    'page_view',
    'wallet_connect',
    'collection_view',
    'mint_click',
    'mint_attempt',
    'tx_sent',
    'mint_success',
    'mint_failure',
    'gallery_view',
    'click'
];

// Funnel steps (ordered)
const FUNNEL_STEPS = [
    'wallet_connect',
    'collection_view',
    'mint_click',
    'tx_sent',
    'mint_success'
];

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const {
            type,
            wallet,
            collection,
            txHash,
            price,
            gas,
            referrer,
            campaign,
            device,
            page,
            metadata
        } = req.body;

        if (!type || !VALID_EVENTS.includes(type)) {
            return res.status(400).json({ error: `Invalid event type. Valid: ${VALID_EVENTS.join(', ')}` });
        }

        const timestamp = Date.now();
        const eventId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const weekNum = getWeekNumber(new Date());

        // Build event payload
        const event = {
            type,
            wallet: wallet || 'anonymous',
            collection: collection || null,
            txHash: txHash || null,
            price: price || 0,
            gas: gas || 0,
            referrer: referrer || 'direct',
            campaign: campaign || null,
            device: device || 'unknown',
            page: page || null,
            metadata: metadata || {},
            timestamp
        };

        // ===== BATCH ALL REDIS WRITES =====
        const pipe = kv.pipeline();

        // 1. Store raw event log
        pipe.set(`event:${type}:${eventId}`, JSON.stringify(event), { ex: 60 * 60 * 24 * 90 }); // 90 day TTL

        // 2. Global aggregates
        pipe.hincrby('stats:global', 'total_events', 1);

        // 3. Funnel tracking
        if (FUNNEL_STEPS.includes(type)) {
            pipe.hincrby('funnel:mint', type, 1);
        }

        // 4. Daily stats
        pipe.hincrby(`daily:stats:${today}`, type, 1);

        // ===== EVENT-SPECIFIC PROCESSING =====

        if (type === 'page_view') {
            pipe.hincrby('stats:global', 'total_views', 1);
            if (page) {
                pipe.hincrby(`page:${page}:stats`, 'views', 1);
            }
        }

        if (type === 'collection_view' && collection) {
            pipe.hincrby(`collection:${collection}:stats`, 'views', 1);
            pipe.hincrby('stats:global', 'total_views', 1);
        }

        if (type === 'gallery_view') {
            pipe.hincrby('stats:global', 'total_views', 1);
            pipe.hincrby('page:gallery:stats', 'views', 1);
        }

        if (type === 'wallet_connect' && wallet) {
            // Only count unique wallet connects (SADD returns 1 if new, 0 if exists)
            const isNew = await kv.sadd('wallets:connected', wallet.toLowerCase());
            if (isNew) {
                pipe.hincrby('stats:global', 'total_connects', 1);
            }
        }

        if (type === 'mint_success' && wallet && collection) {
            const mintPrice = parseFloat(price) || 0;
            const gasUsed = parseFloat(gas) || 0;

            // Global stats
            pipe.hincrby('stats:global', 'total_mints', 1);
            pipe.hincrbyfloat('stats:global', 'total_volume', mintPrice);
            pipe.hincrbyfloat('stats:global', 'total_gas', gasUsed);

            // Collection stats
            pipe.hincrby(`collection:${collection}:stats`, 'mints', 1);
            pipe.hincrbyfloat(`collection:${collection}:stats`, 'volume', mintPrice);

            // Unique wallets per collection (approximation via counter)
            pipe.sadd(`collection:${collection}:wallets`, wallet);

            // Leaderboards (all-time)
            pipe.zincrby('leaderboard:mints:all_time', 1, wallet);
            if (mintPrice > 0) {
                pipe.zincrby('leaderboard:volume:all_time', mintPrice, wallet);
            }
            if (gasUsed > 0) {
                pipe.zincrby('leaderboard:gas:all_time', gasUsed, wallet);
            }

            // Weekly leaderboard
            pipe.zincrby(`leaderboard:mints:week:${weekNum}`, 1, wallet);

            // Wallet profile
            pipe.hincrby(`user:${wallet}:profile`, 'total_mints', 1);
            pipe.hincrbyfloat(`user:${wallet}:profile`, 'total_volume', mintPrice);
            pipe.hincrbyfloat(`user:${wallet}:profile`, 'total_gas', gasUsed);
            pipe.hset(`user:${wallet}:profile`, 'last_active', timestamp);

            // Daily stats
            pipe.hincrby(`daily:stats:${today}`, 'mints', 1);
            pipe.hincrbyfloat(`daily:stats:${today}`, 'volume', mintPrice);

            // Activity feed (global + collection)
            const activityItem = JSON.stringify({
                wallet, collection, txHash, price: mintPrice, timestamp
            });
            pipe.lpush('activity:global', activityItem);
            pipe.ltrim('activity:global', 0, 99);
            pipe.lpush(`activity:collection:${collection}`, activityItem);
            pipe.ltrim(`activity:collection:${collection}`, 0, 49);
        }

        if (type === 'mint_attempt' && wallet) {
            pipe.hincrby('stats:global', 'total_attempts', 1);
            if (collection) {
                pipe.hincrby(`collection:${collection}:stats`, 'attempts', 1);
            }
            pipe.hincrby(`user:${wallet}:profile`, 'total_attempts', 1);
        }

        if (type === 'mint_failure' && wallet) {
            pipe.hincrby('stats:global', 'total_failures', 1);
            if (collection) {
                pipe.hincrby(`collection:${collection}:stats`, 'failures', 1);
            }
            pipe.hincrby(`user:${wallet}:profile`, 'total_failures', 1);
        }

        // ===== WALLET-LEVEL TRACKING =====
        if (wallet && wallet !== 'anonymous') {
            // Ensure first_seen is set (only once)
            const profile = await kv.hget(`user:${wallet}:profile`, 'first_seen');
            if (!profile) {
                pipe.hset(`user:${wallet}:profile`, 'first_seen', timestamp);
                // Cohort tracking
                pipe.sadd(`cohort:${today}`, wallet);
            }

            // Update last_active
            pipe.hset(`user:${wallet}:profile`, 'last_active', timestamp);

            // Journey log (trimmed)
            pipe.lpush(`user:${wallet}:journey`, JSON.stringify({
                type, collection, page, timestamp,
                ...(txHash ? { txHash } : {})
            }));
            pipe.ltrim(`user:${wallet}:journey`, 0, 199);
        }

        // ===== EXECUTE BATCH =====
        await pipe.exec();

        // Set weekly leaderboard TTL (8 weeks)
        await kv.expire(`leaderboard:mints:week:${weekNum}`, 60 * 60 * 24 * 56);

        return res.status(200).json({ success: true, eventId });

    } catch (error) {
        console.error('Track error:', error);
        return res.status(500).json({ error: 'Failed to track event' });
    }
}

// Helper: Get ISO week number
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
