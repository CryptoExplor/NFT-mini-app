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

        // 5. Total unique wallets
        pipe.scard('wallets:connected');

        // Execute batch
        const [globalStats, funnelData, leaderboard, recentActivity, uniqueWallets] = await pipe.exec();

        // 6. Fetch top collection stats (separate query)
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

        // Parse activity + generate social proof messages
        const parsedActivity = (recentActivity || []).map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; }
            catch { return item; }
        });

        const socialProof = generateSocialProof(parsedActivity, formattedLeaderboard, collections);

        // Calculate enhanced funnel with drop-off %
        const funnel = funnelData || {};
        const funnelSteps = [
            { step: 'page_view', label: 'Page View', count: parseInt(funnel.page_view) || 0 },
            { step: 'wallet_connect', label: 'Wallet Connect', count: parseInt(funnel.wallet_connect) || 0 },
            { step: 'collection_view', label: 'View Collection', count: parseInt(funnel.collection_view) || 0 },
            { step: 'mint_click', label: 'Click Mint', count: parseInt(funnel.mint_click) || 0 },
            { step: 'tx_sent', label: 'Send Transaction', count: parseInt(funnel.tx_sent) || 0 },
            { step: 'mint_success', label: 'Mint Success', count: parseInt(funnel.mint_success) || 0 }
        ];

        // Calculate conversion + drop-off rates
        const firstStep = funnelSteps[0].count || 1;
        for (let i = 0; i < funnelSteps.length; i++) {
            const step = funnelSteps[i];
            // Conversion from previous step
            if (i > 0) {
                const prev = funnelSteps[i - 1].count;
                step.conversionFromPrev = prev > 0
                    ? ((step.count / prev) * 100).toFixed(1)
                    : '0.0';
                step.dropOff = prev > 0
                    ? (((prev - step.count) / prev) * 100).toFixed(1)
                    : '0.0';
            }
            // Overall conversion from first step
            step.overallConversion = ((step.count / firstStep) * 100).toFixed(1);
        }

        // Overall funnel conversion
        const overallConversion = firstStep > 0
            ? ((funnelSteps[funnelSteps.length - 1].count / firstStep) * 100).toFixed(1)
            : '0.0';

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
                totalEvents: parseInt(stats.total_events) || 0,
                uniqueWallets: uniqueWallets || 0
            },
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

/**
 * Generate social proof messages from recent activity
 */
function generateSocialProof(activity, leaderboard, collections) {
    const messages = [];

    // Whale alerts — top minters with high scores
    if (leaderboard.length > 0) {
        const top = leaderboard[0];
        if (top.score >= 5) {
            messages.push({
                type: 'whale',
                icon: '🐋',
                text: `Whale alert: ${shortenAddr(top.wallet)} minted ${top.score} NFTs`,
                timestamp: Date.now()
            });
        }
    }

    // Collection milestones
    for (const col of collections) {
        const milestones = [1000, 500, 100, 50, 10];
        for (const m of milestones) {
            if (col.mints >= m) {
                messages.push({
                    type: 'milestone',
                    icon: '🎯',
                    text: `${col.slug} just hit ${m}+ mints!`,
                    timestamp: Date.now()
                });
                break; // Only show highest milestone per collection
            }
        }
    }

    // Recent activity highlights
    if (activity.length > 0) {
        const latest = activity[0];
        if (latest && latest.wallet) {
            messages.push({
                type: 'recent',
                icon: '💎',
                text: `${shortenAddr(latest.wallet)} just minted from ${latest.collection || 'a collection'}`,
                timestamp: latest.timestamp || Date.now()
            });
        }
    }

    // Active minters count
    const uniqueRecentWallets = new Set(activity.map(a => a.wallet).filter(Boolean)).size;
    if (uniqueRecentWallets > 1) {
        messages.push({
            type: 'social',
            icon: '🔥',
            text: `${uniqueRecentWallets} wallets minting right now`,
            timestamp: Date.now()
        });
    }

    return messages;
}

function shortenAddr(addr) {
    if (!addr || addr.length < 10) return addr || 'Unknown';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Fetch top collections by mints
 */
async function getTopCollections() {
    try {
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

        collections.sort((a, b) => b.views - a.views);
        return collections;

    } catch (error) {
        console.error('Error fetching collection stats:', error);
        return [];
    }
}
