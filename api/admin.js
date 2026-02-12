import { kv } from '@vercel/kv';
import { requireAdmin } from './lib/authMiddleware.js';

function cors(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Wallet');
}

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // JWT admin auth (preferred) with header fallback
    const auth = await requireAdmin(req);
    if (!auth) {
        // Fallback: x-admin-wallet header (legacy)
        const wallet = req.headers['x-admin-wallet'] || req.query.wallet;
        const adminList = (process.env.ADMIN_WALLETS || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
        if (!wallet || !adminList.includes(wallet.toLowerCase())) {
            return res.status(403).json({ error: 'Unauthorized. Admin JWT or wallet required.' });
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
