import { kv } from '@vercel/kv';

function cors(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { type = 'mints', period = 'all_time', limit = 10 } = req.query;

        const pipe = kv.pipeline();

        // 1. Global stats
        pipe.hgetall('stats:global');

        // 2. Funnel data
        pipe.hgetall('funnel:mint');

        // 3. Leaderboard (mints, volume, gas - all-time or weekly)
        const leaderboardKey = `leaderboard:${type}:${period}`;
        pipe.zrange(leaderboardKey, 0, parseInt(limit) - 1, { rev: true, withScores: true });

        // 4. Recent global activity
        pipe.lrange('activity:global', 0, 29);

        // Execute batch
        const [globalStats, funnelData, leaderboard, recentActivity] = await pipe.exec();

        // 5. Fetch top collection stats (separate query)
        const collections = await getTopCollections();

        // Format leaderboard data
        const formattedLeaderboard = [];
        if (leaderboard && Array.isArray(leaderboard)) {
            for (let i = 0; i < leaderboard.length; i += 2) {
                formattedLeaderboard.push({
                    wallet: leaderboard[i],
                    score: parseFloat(leaderboard[i + 1]) || 0,
                    rank: Math.floor(i / 2) + 1
                });
            }
        }

        // Parse activity
        const parsedActivity = (recentActivity || []).map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; }
            catch { return item; }
        });

        // Calculate funnel conversion
        const funnel = funnelData || {};
        const funnelSteps = [
            { step: 'wallet_connect', count: parseInt(funnel.wallet_connect) || 0 },
            { step: 'collection_view', count: parseInt(funnel.collection_view) || 0 },
            { step: 'mint_click', count: parseInt(funnel.mint_click) || 0 },
            { step: 'tx_sent', count: parseInt(funnel.tx_sent) || 0 },
            { step: 'mint_success', count: parseInt(funnel.mint_success) || 0 }
        ];

        // Calculate conversion rates
        for (let i = 1; i < funnelSteps.length; i++) {
            const prev = funnelSteps[i - 1].count;
            funnelSteps[i].conversionFromPrev = prev > 0
                ? ((funnelSteps[i].count / prev) * 100).toFixed(1)
                : '0.0';
        }

        const stats = globalStats || {};
        const totalViews = parseInt(stats.total_views) || 0;
        const totalMints = parseInt(stats.total_mints) || 0;
        const totalAttempts = parseInt(stats.total_attempts) || 0;
        const totalVolume = parseFloat(stats.total_volume) || 0;
        const totalGas = parseFloat(stats.total_gas) || 0;
        const successRate = totalAttempts > 0
            ? ((totalMints / totalAttempts) * 100).toFixed(1)
            : '0.0';
        const conversionRate = totalViews > 0
            ? ((totalMints / totalViews) * 100).toFixed(1)
            : '0.0';

        return res.status(200).json({
            stats: {
                totalViews,
                totalMints,
                totalAttempts,
                totalVolume: totalVolume.toFixed(6),
                totalGas: totalGas.toFixed(6),
                successRate,
                conversionRate,
                totalConnects: parseInt(stats.total_connects) || 0,
                totalFailures: parseInt(stats.total_failures) || 0,
                totalEvents: parseInt(stats.total_events) || 0
            },
            funnel: funnelSteps,
            leaderboard: formattedLeaderboard,
            collections,
            recentActivity: parsedActivity
        });

    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
}

/**
 * Fetch top collections by mints
 * Since we don't have a master list in Redis, we use known slugs
 * or scan for collection keys. For now, return available collections.
 */
async function getTopCollections() {
    try {
        // Get all collection stat keys (limited approach for Vercel KV)
        // In production, maintain a set of collection slugs
        const knownSlugs = [
            'onchain-sigils', 'zorgz', 'base-invaders',
            'baseheads-404', 'basemoods', 'pixelpets',
            'miniworlds', 'neonshapes', 'basefortunes'
        ];

        const pipe = kv.pipeline();
        for (const slug of knownSlugs) {
            pipe.hgetall(`collection:${slug}:stats`);
        }

        const results = await pipe.exec();
        const collections = [];

        for (let i = 0; i < knownSlugs.length; i++) {
            const stats = results[i];
            if (stats && (parseInt(stats.views) > 0 || parseInt(stats.mints) > 0)) {
                collections.push({
                    slug: knownSlugs[i],
                    views: parseInt(stats.views) || 0,
                    mints: parseInt(stats.mints) || 0,
                    attempts: parseInt(stats.attempts) || 0,
                    volume: parseFloat(stats.volume) || 0,
                    successRate: (parseInt(stats.attempts) || 0) > 0
                        ? (((parseInt(stats.mints) || 0) / (parseInt(stats.attempts) || 1)) * 100).toFixed(1)
                        : '0.0'
                });
            }
        }

        // Sort by views descending
        collections.sort((a, b) => b.views - a.views);
        return collections;

    } catch (error) {
        console.error('Error fetching collection stats:', error);
        return [];
    }
}
