import { kv } from '@vercel/kv';
import { loadCollections } from '../src/lib/loadCollections.js';

function cors(res) {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const VALID_TYPES = new Set(['mints', 'volume', 'gas', 'reputation', 'points']);

export default async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { type = 'mints', period = 'all_time', limit = 10, collection = null } = req.query;
        const typeKey = VALID_TYPES.has(type) ? type : 'mints';
        const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
        const collectionSlug = typeof collection === 'string' && collection.trim() ? collection.trim() : null;

        const pipeline = kv.pipeline();

        if (collectionSlug) {
            pipeline.hgetall(`collection:${collectionSlug}:stats`);
            pipeline.hgetall(`funnel:mint:${collectionSlug}`);
            pipeline.zrange(getLeaderboardKey(typeKey, period, collectionSlug), 0, safeLimit - 1, { rev: true, withScores: true });
            pipeline.lrange(`activity:collection:${collectionSlug}`, 0, 29);
            pipeline.scard(`collection:${collectionSlug}:wallets`);
        } else {
            pipeline.hgetall('stats:global');
            pipeline.hgetall('funnel:mint');
            pipeline.zrange(getLeaderboardKey(typeKey, period, null), 0, safeLimit - 1, { rev: true, withScores: true });
            pipeline.lrange('activity:global', 0, 29);
            pipeline.scard('wallets:connected');
        }

        const [rawStats, funnelData, rawLeaderboard, recentActivity, uniqueWallets] = await pipeline.exec();
        const collections = await getTopCollections();

        const formattedLeaderboard = formatLeaderboard(rawLeaderboard);
        const parsedActivity = parseList(recentActivity);
        const socialProof = generateSocialProof(parsedActivity, formattedLeaderboard, collections);
        const funnelSteps = buildFunnel(funnelData || {});
        const overallConversion = computeOverallConversion(funnelSteps);
        const stats = collectionSlug
            ? toCollectionStats(rawStats || {}, uniqueWallets || 0)
            : toGlobalStats(rawStats || {}, uniqueWallets || 0);

        return res.status(200).json({
            scope: collectionSlug ? 'collection' : 'global',
            collection: collectionSlug,
            stats,
            funnel: funnelSteps,
            overallConversion,
            leaderboard: formattedLeaderboard,
            collections,
            recentActivity: parsedActivity,
            socialProof
        });
    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
}

function getLeaderboardKey(type, period, collectionSlug) {
    if (collectionSlug && ['mints', 'volume', 'gas'].includes(type) && period === 'all_time') {
        return `leaderboard:${type}:${period}:${collectionSlug}`;
    }
    return `leaderboard:${type}:${period}`;
}

function buildFunnel(funnel) {
    const funnelSteps = [
        { step: 'page_view', label: 'Page View', count: parseInt(funnel.page_view, 10) || 0 },
        { step: 'wallet_connect', label: 'Wallet Connect', count: parseInt(funnel.wallet_connect, 10) || 0 },
        { step: 'collection_view', label: 'View Collection', count: parseInt(funnel.collection_view, 10) || 0 },
        { step: 'mint_click', label: 'Click Mint', count: parseInt(funnel.mint_click, 10) || 0 },
        { step: 'tx_sent', label: 'Send Transaction', count: parseInt(funnel.tx_sent, 10) || 0 },
        { step: 'mint_success', label: 'Mint Success', count: parseInt(funnel.mint_success, 10) || 0 }
    ];

    const firstStep = funnelSteps[0].count || 1;
    for (let i = 0; i < funnelSteps.length; i++) {
        const step = funnelSteps[i];
        if (i > 0) {
            const prev = funnelSteps[i - 1].count;
            step.conversionFromPrev = prev > 0 ? ((step.count / prev) * 100).toFixed(1) : '0.0';
            step.dropOff = prev > 0 ? (((prev - step.count) / prev) * 100).toFixed(1) : '0.0';
        }
        step.overallConversion = ((step.count / firstStep) * 100).toFixed(1);
    }

    return funnelSteps;
}

function computeOverallConversion(funnelSteps) {
    if (!funnelSteps || funnelSteps.length === 0) return '0.0';
    const firstStep = funnelSteps[0].count || 0;
    if (firstStep === 0) return '0.0';
    return ((funnelSteps[funnelSteps.length - 1].count / firstStep) * 100).toFixed(1);
}

function formatLeaderboard(raw) {
    if (!raw || !Array.isArray(raw)) return [];

    const aggregated = new Map();
    for (let i = 0; i < raw.length; i += 2) {
        const wallet = String(raw[i] || '').toLowerCase();
        const score = parseFloat(raw[i + 1]) || 0;
        if (!wallet) continue;
        aggregated.set(wallet, (aggregated.get(wallet) || 0) + score);
    }

    const rows = [...aggregated.entries()]
        .map(([wallet, score]) => ({ wallet, score }))
        .sort((a, b) => b.score - a.score);

    return rows.map((row, index) => ({
        wallet: row.wallet,
        score: row.score,
        rank: index + 1
    }));
}

function parseList(list) {
    return (list || []).map((item) => {
        try { return typeof item === 'string' ? JSON.parse(item) : item; }
        catch { return item; }
    });
}

function toGlobalStats(raw, uniqueWallets) {
    const totalViews = parseInt(raw.total_views, 10) || 0;
    const totalMints = parseInt(raw.total_mints, 10) || 0;
    const totalAttempts = parseInt(raw.total_attempts, 10) || 0;
    const totalVolume = parseFloat(raw.total_volume) || 0;
    const totalGas = parseFloat(raw.total_gas) || 0;

    return {
        totalViews,
        totalMints,
        totalAttempts,
        totalVolume: totalVolume.toFixed(6),
        totalGas: totalGas.toFixed(6),
        successRate: totalAttempts > 0 ? ((totalMints / totalAttempts) * 100).toFixed(1) : '0.0',
        conversionRate: totalViews > 0 ? ((totalMints / totalViews) * 100).toFixed(1) : '0.0',
        totalConnects: parseInt(raw.total_connects, 10) || 0,
        totalFailures: parseInt(raw.total_failures, 10) || 0,
        totalEvents: parseInt(raw.total_events, 10) || 0,
        uniqueWallets
    };
}

function toCollectionStats(raw, uniqueWallets) {
    const views = parseInt(raw.views, 10) || 0;
    const mints = parseInt(raw.mints, 10) || 0;
    const attempts = parseInt(raw.attempts, 10) || 0;
    const failures = parseInt(raw.failures, 10) || 0;
    const volume = parseFloat(raw.volume) || 0;
    const successRate = attempts > 0 ? ((mints / attempts) * 100).toFixed(1) : '0.0';
    const conversionRate = views > 0 ? ((mints / views) * 100).toFixed(1) : '0.0';

    return {
        totalViews: views,
        totalMints: mints,
        totalAttempts: attempts,
        totalVolume: volume.toFixed(6),
        totalGas: '0.000000',
        successRate,
        conversionRate,
        totalConnects: 0,
        totalFailures: failures,
        totalEvents: attempts + mints + failures + views,
        uniqueWallets
    };
}

function generateSocialProof(activity, leaderboard, collections) {
    const messages = [];

    if (leaderboard.length > 0) {
        const top = leaderboard[0];
        if (top.score >= 5) {
            messages.push({
                type: 'whale',
                icon: 'Whale',
                text: `${shortenAddr(top.wallet)} is leading with ${top.score} mints`,
                timestamp: Date.now()
            });
        }
    }

    for (const col of collections) {
        const milestones = [1000, 500, 100, 50, 10];
        for (const m of milestones) {
            if ((col.mints || 0) >= m) {
                messages.push({
                    type: 'milestone',
                    icon: 'Milestone',
                    text: `${col.slug} crossed ${m}+ mints`,
                    timestamp: Date.now()
                });
                break;
            }
        }
    }

    if (activity.length > 0) {
        const latest = activity[0];
        if (latest && latest.wallet) {
            messages.push({
                type: 'recent',
                icon: 'Mint',
                text: `${shortenAddr(latest.wallet)} minted from ${latest.collection || 'a collection'}`,
                timestamp: latest.timestamp || Date.now()
            });
        }
    }

    const uniqueRecentWallets = new Set(activity.map((a) => a?.wallet).filter(Boolean)).size;
    if (uniqueRecentWallets > 1) {
        messages.push({
            type: 'social',
            icon: 'Active',
            text: `${uniqueRecentWallets} wallets active now`,
            timestamp: Date.now()
        });
    }

    return messages;
}

function shortenAddr(addr) {
    if (!addr || addr.length < 10) return addr || 'Unknown';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function getTopCollections() {
    try {
        const configuredSlugs = getConfiguredCollectionSlugs();
        const keys = await scanAllKeys('collection:*:stats');
        const statsSlugs = keys
            .map((k) => k.split(':')[1])
            .filter(Boolean);
        const slugs = configuredSlugs.size > 0
            ? [...configuredSlugs]
            : [...new Set(statsSlugs)];

        if (slugs.length === 0) return [];

        const pipe = kv.pipeline();
        for (const slug of slugs) {
            pipe.hgetall(`collection:${slug}:stats`);
        }
        const results = await pipe.exec();

        const collections = [];
        for (let i = 0; i < slugs.length; i++) {
            const stats = results[i] || {};
            const views = parseInt(stats.views, 10) || 0;
            const mints = parseInt(stats.mints, 10) || 0;
            const attempts = parseInt(stats.attempts, 10) || 0;
            const volume = parseFloat(stats.volume) || 0;
            if (!configuredSlugs.has(slugs[i]) && views === 0 && mints === 0 && attempts === 0 && volume === 0) continue;
            collections.push({
                slug: slugs[i],
                views,
                mints,
                attempts,
                volume,
                successRate: attempts > 0 ? ((mints / attempts) * 100).toFixed(1) : '0.0'
            });
        }

        collections.sort((a, b) => b.views - a.views);
        return collections;
    } catch (error) {
        console.error('Error fetching collection stats:', error);
        return [];
    }
}

async function scanAllKeys(match) {
    const keys = [];
    let cursor = '0';
    do {
        const [nextCursor, batch] = await kv.scan(cursor, { match, count: 1000 });
        cursor = String(nextCursor);
        if (Array.isArray(batch) && batch.length > 0) {
            keys.push(...batch);
        }
    } while (cursor !== '0');
    return keys;
}

function getConfiguredCollectionSlugs() {
    try {
        const collections = loadCollections();
        return new Set(
            (collections || [])
                .filter((collection) => collection?.slug)
                .map((collection) => collection.slug)
        );
    } catch {
        return new Set();
    }
}
