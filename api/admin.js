import { kv } from '@vercel/kv';
import { requireAdmin } from './_lib/authMiddleware.js';
import { setCors } from './_lib/cors.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type, Authorization, X-Admin-Wallet'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Allow dev access without auth (ONLY explicit development mode)
    if (process.env.NODE_ENV === 'development') {
        // Continue...
    } else {
        // Production requires authenticated admin JWT
        const auth = await requireAdmin(req);
        if (!auth) {
            return res.status(403).json({ error: 'Unauthorized. Admin JWT required.' });
        }
    }

    const { action, target } = req.query;

    try {
        // Default: return system overview
        if (!action || action === 'overview') {
            const pipe = kv.pipeline();
            pipe.hgetall('stats:global');
            pipe.hgetall('funnel:mint');
            pipe.zrange('leaderboard:mints:all_time', 0, 19, { rev: true, withScores: true });
            pipe.lrange('activity:global', 0, 49);
            pipe.zcard('leaderboard:mints:all_time');

            const [globalStats, funnel, leaderboard, activity, totalWallets] = await pipe.exec();

            return res.status(200).json({
                stats: globalStats || {},
                funnel: funnel || {},
                leaderboard: formatLeaderboard(leaderboard),
                recentActivity: parseList(activity),
                totalTrackedWallets: totalWallets || 0
            });
        }

        // Action: lookup any user's data
        if (action === 'user' && target) {
            const pipe = kv.pipeline();
            pipe.hgetall(`user:${target}:profile`);
            pipe.lrange(`user:${target}:journey`, 0, 199);
            pipe.zrevrank('leaderboard:mints:all_time', target);
            pipe.zscore('leaderboard:mints:all_time', target);

            const [profile, journey, rank, score] = await pipe.exec();

            return res.status(200).json({
                wallet: target,
                profile: profile || {},
                journey: parseList(journey),
                rank: rank !== null ? rank + 1 : 'Unranked',
                score: score || 0
            });
        }

        // Action: collection stats
        if (action === 'collection' && target) {
            const stats = await kv.hgetall(`collection:${target}:stats`);
            const wallets = await kv.scard(`collection:${target}:wallets`);
            const activity = await kv.lrange(`activity:collection:${target}`, 0, 49);

            return res.status(200).json({
                collection: target,
                stats: stats || {},
                uniqueWallets: wallets || 0,
                recentActivity: parseList(activity)
            });
        }

        // Action: cohort data
        if (action === 'cohort' && target) {
            const wallets = await kv.smembers(`cohort:${target}`);
            return res.status(200).json({
                date: target,
                wallets: wallets || [],
                count: wallets?.length || 0
            });
        }

        // Action: daily stats
        if (action === 'daily' && target) {
            const stats = await kv.hgetall(`daily:stats:${target}`);
            return res.status(200).json({
                date: target,
                stats: stats || {}
            });
        }

        // Action: retention analysis (Day 1, 7, 30)
        if (action === 'retention' && target) {
            // target is the cohort date YYYY-MM-DD
            const date = new Date(target);
            const d1 = new Date(date); d1.setDate(d1.getDate() + 1);
            const d7 = new Date(date); d7.setDate(d7.getDate() + 7);
            const d30 = new Date(date); d30.setDate(d30.getDate() + 30);

            const day1 = d1.toISOString().split('T')[0];
            const day7 = d7.toISOString().split('T')[0];
            const day30 = d30.toISOString().split('T')[0];

            const cohortKey = `cohort:${target}`;
            const cohortSize = await kv.scard(cohortKey) || 0;

            let r1 = 0, r7 = 0, r30 = 0;

            if (cohortSize > 0) {
                // Calculate intersections
                const s1 = await kv.sinter(cohortKey, `active:${day1}`);
                r1 = s1?.length || 0;

                const s7 = await kv.sinter(cohortKey, `active:${day7}`);
                r7 = s7?.length || 0;

                const s30 = await kv.sinter(cohortKey, `active:${day30}`);
                r30 = s30?.length || 0;
            }

            return res.status(200).json({
                date: target,
                cohortSize,
                retention: {
                    day1: { count: r1, rate: cohortSize > 0 ? ((r1 / cohortSize) * 100).toFixed(1) : '0.0' },
                    day7: { count: r7, rate: cohortSize > 0 ? ((r7 / cohortSize) * 100).toFixed(1) : '0.0' },
                    day30: { count: r30, rate: cohortSize > 0 ? ((r30 / cohortSize) * 100).toFixed(1) : '0.0' }
                }
            });
        }

        return res.status(400).json({ error: 'Invalid action. Use: overview, user, collection, cohort, daily' });

    } catch (error) {
        console.error('Admin API error:', error);
        return res.status(500).json({ error: 'Failed to fetch admin data' });
    }
}

function formatLeaderboard(data) {
    if (!data || !Array.isArray(data)) return [];
    const result = [];
    for (let i = 0; i < data.length; i += 2) {
        result.push({ wallet: data[i], score: parseFloat(data[i + 1]) || 0, rank: Math.floor(i / 2) + 1 });
    }
    return result;
}

function parseList(list) {
    return (list || []).map(item => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return item; }
    });
}
