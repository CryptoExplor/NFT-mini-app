import { kv } from './_lib/kv.js';
import { setCors } from './_lib/cors.js';

// NOTE: loadCollections uses import.meta.env (Vite-only) which doesn't exist in
// Vercel serverless Node.js runtime. We wrap it in a try/catch to degrade gracefully.
let loadCollections;
try {
    const mod = await import('../src/lib/loadCollections.js');
    loadCollections = mod.loadCollections;
} catch (e) {
    console.warn('[leaderboard] Could not load loadCollections - import.meta.env is unavailable in this runtime. Falling back to KV-only slugs.');
    loadCollections = () => [];
}

const VALID_TYPES = new Set(['mints', 'volume', 'gas', 'reputation', 'points', 'battle_wins', 'battle_points']);
const SNAPSHOT_TYPES = new Set(['battle_wins', 'points', 'mints', 'volume', 'battle_points']);
const SNAPSHOT_TTL_SECONDS = 8 * 24 * 60 * 60;

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');

        const {
            type = 'mints',
            period = 'all_time',
            limit = 10,
            collection = null,
            viewer = null,
            surface = null
        } = req.query;

        const typeKey = VALID_TYPES.has(type) ? type : 'mints';
        const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 100));
        const collectionSlug = typeof collection === 'string' && collection.trim() ? collection.trim() : null;
        const viewerWallet = normalizeWallet(viewer);
        const isCompetitionSurface = !collectionSlug && surface === 'competition';
        const leaderboardKey = getLeaderboardKey(typeKey, period, collectionSlug);

        if (collectionSlug) {
            const collectionPayload = await getCollectionPayload({
                collectionSlug,
                typeKey,
                period,
                safeLimit
            });
            return res.status(200).json(collectionPayload);
        }

        if (isCompetitionSurface) {
            const competitionPayload = await getCompetitionPayload({
                typeKey,
                period,
                safeLimit,
                leaderboardKey,
                viewerWallet
            });
            return res.status(200).json(competitionPayload);
        }

        const defaultPayload = await getDefaultGlobalPayload({
            typeKey,
            period,
            safeLimit,
            leaderboardKey
        });
        return res.status(200).json(defaultPayload);
    } catch (error) {
        console.error('Leaderboard error:', error);
        return res.status(500).json({ error: 'Failed to fetch analytics' });
    }
}

async function getCollectionPayload({ collectionSlug, typeKey, period, safeLimit }) {
    const pipeline = kv.pipeline();
    pipeline.hgetall(`collection:${collectionSlug}:stats`);
    pipeline.hgetall(`funnel:mint:${collectionSlug}`);
    pipeline.zrange(getLeaderboardKey(typeKey, period, collectionSlug), 0, safeLimit - 1, { rev: true, withScores: true });
    pipeline.lrange(`activity:collection:${collectionSlug}`, 0, 29);
    pipeline.scard(`collection:${collectionSlug}:wallets`);

    const [rawStats, funnelData, rawLeaderboard, recentActivity, uniqueWallets] = await pipeline.exec();
    const collections = await getTopCollections();
    const formattedLeaderboard = await hydrateLeaderboardRows(formatLeaderboard(rawLeaderboard, typeKey));
    const parsedActivity = parseList(recentActivity);
    const socialProof = generateSocialProof(parsedActivity, formattedLeaderboard, collections);
    const funnelSteps = buildFunnel(funnelData || {});

    return {
        scope: 'collection',
        collection: collectionSlug,
        stats: toCollectionStats(rawStats || {}, uniqueWallets || 0),
        funnel: funnelSteps,
        overallConversion: computeOverallConversion(funnelSteps),
        leaderboard: formattedLeaderboard,
        viewerRow: null,
        collections,
        recentActivity: parsedActivity,
        socialProof
    };
}

async function getCompetitionPayload({ typeKey, period, safeLimit, leaderboardKey, viewerWallet }) {
    const pipeline = kv.pipeline();
    pipeline.hgetall('stats:global');
    pipeline.zrange(leaderboardKey, 0, safeLimit - 1, { rev: true, withScores: true });
    pipeline.lrange('activity:battles:global', 0, 29);
    pipeline.zcard('leaderboard:battle_wins:all_time');
    pipeline.get('global:battle_count');

    const [rawStats, rawLeaderboard, recentActivity, uniqueWallets, globalBattleCount] = await pipeline.exec();
    const leaderboard = await hydrateLeaderboardRows(formatLeaderboard(rawLeaderboard, typeKey));

    let yesterdaySnapshot = null;
    if (period === 'all_time' && SNAPSHOT_TYPES.has(typeKey)) {
        await ensureDailySnapshot(typeKey, leaderboardKey);
        yesterdaySnapshot = await getSnapshotForDay(typeKey, getUtcDayOffset(-1));
    }

    const rankedLeaderboard = leaderboard.map((entry) => ({
        ...entry,
        rank_change: getRankChange(yesterdaySnapshot, entry.wallet, entry.rank)
    }));

    const viewerRow = await getViewerRow({
        viewerWallet,
        leaderboard: rankedLeaderboard,
        leaderboardKey,
        snapshot: yesterdaySnapshot
    });

    return {
        scope: 'global',
        collection: null,
        stats: toGlobalStats(rawStats || {}, uniqueWallets || 0, globalBattleCount),
        funnel: [],
        overallConversion: '0.0',
        leaderboard: rankedLeaderboard,
        viewerRow,
        collections: [],
        recentActivity: parseList(recentActivity),
        socialProof: []
    };
}

async function getDefaultGlobalPayload({ typeKey, period, safeLimit, leaderboardKey }) {
    const pipeline = kv.pipeline();
    pipeline.hgetall('stats:global');
    pipeline.hgetall('funnel:mint');
    pipeline.zrange(leaderboardKey, 0, safeLimit - 1, { rev: true, withScores: true });
    pipeline.lrange('activity:global', 0, 29);
    pipeline.scard('wallets:connected');

    const [rawStats, funnelData, rawLeaderboard, recentActivity, uniqueWallets] = await pipeline.exec();
    const collections = await getTopCollections();
    const formattedLeaderboard = await hydrateLeaderboardRows(formatLeaderboard(rawLeaderboard, typeKey));
    const parsedActivity = parseList(recentActivity);
    const socialProof = generateSocialProof(parsedActivity, formattedLeaderboard, collections);
    const funnelSteps = buildFunnel(funnelData || {});

    return {
        scope: 'global',
        collection: null,
        stats: toGlobalStats(rawStats || {}, uniqueWallets || 0, null),
        funnel: funnelSteps,
        overallConversion: computeOverallConversion(funnelSteps),
        leaderboard: formattedLeaderboard,
        viewerRow: null,
        collections,
        recentActivity: parsedActivity,
        socialProof
    };
}

function getLeaderboardKey(type, period, collectionSlug) {
    if (type === 'battle_points') type = 'battle_wins';

    if (collectionSlug && ['mints', 'volume', 'gas'].includes(type) && period === 'all_time') {
        return `leaderboard:${type}:${period}:${collectionSlug}`;
    }

    if (type === 'points') {
        return period === 'all_time' ? 'leaderboard:points' : `leaderboard:points:week:${period}`;
    }
    if (type === 'reputation') {
        return 'leaderboard:reputation';
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
        step.conversion = i === 0
            ? '100.0'
            : (step.conversionFromPrev || '0.0');
    }

    return funnelSteps;
}

function computeOverallConversion(funnelSteps) {
    if (!funnelSteps || funnelSteps.length === 0) return '0.0';
    const firstStep = funnelSteps[0].count || 0;
    if (firstStep === 0) return '0.0';
    return ((funnelSteps[funnelSteps.length - 1].count / firstStep) * 100).toFixed(1);
}

function formatLeaderboard(raw, typeKey) {
    if (!raw || !Array.isArray(raw)) return [];

    const multiplier = typeKey === 'battle_points' ? 5 : 1;
    const aggregated = new Map();
    for (let i = 0; i < raw.length; i += 2) {
        const wallet = String(raw[i] || '').toLowerCase();
        const score = (parseFloat(raw[i + 1]) || 0) * multiplier;
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

async function hydrateLeaderboardRows(rows) {
    if (!rows || rows.length === 0) return [];

    const namePipe = kv.pipeline();
    for (const entry of rows) {
        namePipe.hget(`user:${entry.wallet}:profile`, 'display_name');
    }
    const names = await namePipe.exec();

    return rows.map((entry, index) => {
        const wallet = entry.wallet;
        return {
            ...entry,
            displayName: names[index] || null,
            shortAddress: shortenAddr(wallet)
        };
    });
}

async function getViewerRow({ viewerWallet, leaderboard, leaderboardKey, snapshot }) {
    if (!viewerWallet) return null;
    if ((leaderboard || []).some((entry) => entry.wallet === viewerWallet)) {
        return null;
    }

    const pipe = kv.pipeline();
    pipe.zrevrank(leaderboardKey, viewerWallet);
    pipe.zscore(leaderboardKey, viewerWallet);
    pipe.hget(`user:${viewerWallet}:profile`, 'display_name');
    const [rank, score, displayName] = await pipe.exec();

    if (rank === null || score === null) {
        return null;
    }

    return {
        wallet: viewerWallet,
        score: parseFloat(score) || 0,
        rank: rank + 1,
        displayName: displayName || null,
        shortAddress: shortenAddr(viewerWallet),
        rank_change: getRankChange(snapshot, viewerWallet, rank + 1)
    };
}

function parseList(list) {
    return (list || []).map((item) => {
        try {
            return typeof item === 'string' ? JSON.parse(item) : item;
        } catch {
            return item;
        }
    });
}

function toGlobalStats(raw, uniqueWallets, globalBattleCount) {
    const totalViews = parseInt(raw.total_views, 10) || 0;
    const totalMints = parseInt(raw.total_mints, 10) || 0;
    const totalAttempts = parseInt(raw.total_attempts, 10) || 0;
    const totalVolume = parseFloat(raw.total_volume) || 0;
    const totalGas = parseFloat(raw.total_gas) || 0;
    const fallbackBattleTotal = parseInt(raw.battle_total, 10) || 0;
    const battleTotal = parseInt(globalBattleCount, 10) || fallbackBattleTotal;
    const battleWins = parseInt(raw.battle_wins, 10) || 0;

    return {
        totalViews,
        totalMints,
        totalAttempts,
        totalVolume: totalVolume.toFixed(6),
        totalGas: totalGas.toFixed(6),
        battleTotal,
        battleWins,
        battleWinRate: battleTotal > 0 ? ((battleWins / battleTotal) * 100).toFixed(1) : '0.0',
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
        for (const milestone of milestones) {
            if ((col.mints || 0) >= milestone) {
                messages.push({
                    type: 'milestone',
                    icon: 'Milestone',
                    text: `${col.slug} crossed ${milestone}+ mints`,
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

    const uniqueRecentWallets = new Set(activity.map((entry) => entry?.wallet).filter(Boolean)).size;
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

function getRankChange(snapshot, wallet, currentRank) {
    const previousRank = snapshot?.ranks?.[wallet];
    if (!previousRank) return 'new';
    if (currentRank < previousRank) return 'up';
    if (currentRank > previousRank) return 'down';
    return 'same';
}

async function ensureDailySnapshot(typeKey, leaderboardKey) {
    const today = getUtcDayOffset(0);
    const snapshotKey = getSnapshotKey(typeKey, today);
    const existing = await kv.get(snapshotKey);
    if (existing) return;

    const raw = await kv.zrange(leaderboardKey, 0, -1, { rev: true, withScores: true });
    const formatted = formatLeaderboard(raw);
    const ranks = {};
    for (const entry of formatted) {
        ranks[entry.wallet] = entry.rank;
    }

    const payload = JSON.stringify({
        createdAt: Date.now(),
        ranks
    });

    await kv.set(snapshotKey, payload, { ex: SNAPSHOT_TTL_SECONDS, nx: true });
}

async function getSnapshotForDay(typeKey, day) {
    const raw = await kv.get(getSnapshotKey(typeKey, day));
    if (!raw) return null;
    try {
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return null;
    }
}

function getSnapshotKey(typeKey, day) {
    return `leaderboard:snapshot:${typeKey}:${day}`;
}

function getUtcDayOffset(offsetDays) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return date.toISOString().split('T')[0];
}

function shortenAddr(addr) {
    if (!addr || addr.length < 10) return addr || 'Unknown';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function normalizeWallet(value) {
    if (typeof value !== 'string') return null;
    const normalized = value.trim().toLowerCase();
    return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

async function getTopCollections() {
    try {
        const configuredSlugs = getConfiguredCollectionSlugs();
        const slugs = [...configuredSlugs];

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
