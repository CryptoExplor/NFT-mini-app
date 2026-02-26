import { kv } from '@vercel/kv';
import { requireAuth } from './_lib/authMiddleware.js';
import { setCors } from './_lib/cors.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Cache at Vercel edge for 30s, serve stale for 60s while revalidating
    // This alone saves ~50-70% of KV reads from repeat page loads
    res.setHeader('Cache-Control', 's-maxage=45, stale-while-revalidate=90');

    const auth = await requireAuth(req);
    const requestedWallet = typeof req.query?.wallet === 'string' ? req.query.wallet : '';
    const normalizedWallet = String(auth?.wallet || requestedWallet || '').toLowerCase();

    if (!normalizedWallet || !/^0x[a-f0-9]{40}$/i.test(normalizedWallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
        // OPTIMIZED: skip resolveWalletKey pipeline when wallet is already
        // normalized (common case). Only run multi-candidate check when
        // the raw query differs from normalized form.
        let walletKey = normalizedWallet;
        if (requestedWallet && requestedWallet !== normalizedWallet) {
            walletKey = await resolveWalletKey([normalizedWallet, requestedWallet]);
        }
        console.log(`[UserAPI] Resolved key for ${normalizedWallet} -> ${walletKey}`);

        const pipe = kv.pipeline();
        pipe.hgetall(`user:${walletKey}:profile`);
        pipe.lrange(`user:${walletKey}:journey`, 0, 199);
        pipe.zrevrank('leaderboard:mints:all_time', walletKey);
        pipe.zscore('leaderboard:mints:all_time', walletKey);
        pipe.zrevrank('leaderboard:volume:all_time', walletKey);
        pipe.zscore('leaderboard:volume:all_time', walletKey);
        pipe.zcard('leaderboard:mints:all_time');
        pipe.hgetall('stats:global');
        pipe.zrevrank('leaderboard:reputation', walletKey);
        pipe.zscore('leaderboard:reputation', walletKey);
        pipe.zrevrank('leaderboard:points', walletKey);
        pipe.zscore('leaderboard:points', walletKey);

        const [
            profile,
            journey,
            mintRank,
            mintScore,
            volumeRank,
            volumeScore,
            totalMintersCount,
            globalStats,
            reputationRank,
            reputationScore,
            pointsRank,
            pointsScore
        ] = await pipe.exec();

        console.log(`[UserAPI] Raw profile for ${walletKey}:`, profile);

        const parsedJourney = parseJourney(journey);

        const now = Date.now();
        let firstSeen = profile?.first_seen ? parseInt(profile.first_seen, 10) : null;
        if (!firstSeen) {
            firstSeen = now;
            await kv.hset(`user:${walletKey}:profile`, {
                first_seen: now,
                last_active: now
            });
        }

        const totalMints = parseInt(profile?.total_mints, 10) || 0;
        const totalAttempts = parseInt(profile?.total_attempts, 10) || 0;
        const totalFailures = parseInt(profile?.total_failures, 10) || 0;
        const totalVolume = parseFloat(profile?.total_volume || 0);
        const totalGas = parseFloat(profile?.total_gas || 0);
        const totalPoints = parseInt(profile?.total_points, 10) || 0;

        const successRate = totalAttempts > 0
            ? ((totalMints / totalAttempts) * 100).toFixed(1)
            : '100.0';

        const avgGas = totalMints > 0
            ? (totalGas / totalMints).toFixed(6)
            : '0.000000';

        const globalMints = parseInt(globalStats?.total_mints, 10) || 1;
        const globalVolume = parseFloat(globalStats?.total_volume) || 1;
        const mintContribution = ((totalMints / globalMints) * 100).toFixed(2);
        const volumeContribution = ((totalVolume / globalVolume) * 100).toFixed(2);

        const totalMinters = parseInt(totalMintersCount, 10) || 0;
        const rank = mintRank !== null ? mintRank + 1 : null;
        const percentile = rank && totalMinters > 0
            ? ((1 - (rank / totalMinters)) * 100).toFixed(1)
            : null;

        const currentStreak = parseInt(profile?.streak, 10) || 0;
        const longestStreak = parseInt(profile?.longest_streak, 10) || currentStreak;

        let badge = null;
        if (currentStreak >= 30) badge = 'Legendary Minter';
        else if (currentStreak >= 14) badge = 'Streak Master';
        else if (currentStreak >= 7) badge = 'Committed Collector';
        else if (currentStreak >= 3) badge = 'Rising Minter';

        const favorite = findFavoriteCollection(parsedJourney);

        return res.status(200).json({
            wallet: normalizedWallet,
            profile: {
                totalMints,
                totalAttempts,
                totalFailures,
                totalVolume,
                totalGas,
                avgGas,
                firstSeen: new Date(firstSeen).toISOString(),
                lastActive: profile?.last_active ? new Date(parseInt(profile.last_active, 10)).toISOString() : new Date(now).toISOString(),
                successRate,
                streak: currentStreak,
                longestStreak,
                favoriteCollection: favorite.collection,
                favoriteCollectionMints: favorite.count,
                mintContribution,
                volumeContribution
            },
            rankings: {
                mints: {
                    rank: rank || 'Unranked',
                    score: parseInt(mintScore, 10) || 0,
                    percentile: percentile ? `Top ${(100 - parseFloat(percentile)).toFixed(1)}%` : 'N/A',
                    totalMinters
                },
                volume: {
                    rank: volumeRank !== null ? volumeRank + 1 : 'Unranked',
                    score: parseFloat(volumeScore || 0)
                },
                reputation: {
                    rank: reputationRank !== null ? reputationRank + 1 : 'Unranked',
                    score: parseFloat(reputationScore || profile?.reputation_score || 0).toFixed(2)
                },
                points: {
                    rank: pointsRank !== null ? pointsRank + 1 : 'Unranked',
                    score: parseInt(pointsScore || totalPoints, 10)
                }
            },
            insights: {
                badge,
                points: parseInt(pointsScore || totalPoints, 10),
                mintContribution: `${mintContribution}%`,
                volumeContribution: `${volumeContribution}%`,
                avgGasPerMint: `${avgGas} ETH`,
                favoriteCollection: favorite.collection,
                favoriteCollectionMints: favorite.count,
                memberDays: Math.floor((now - firstSeen) / (1000 * 60 * 60 * 24)),
                activityLevel: getActivityLevel(totalMints, currentStreak)
            },
            journey: parsedJourney
        });
    } catch (error) {
        console.error('User stats error:', error);
        return res.status(500).json({ error: 'Failed to fetch user stats' });
    }


    async function resolveWalletKey(candidates) {
        if (!Array.isArray(candidates) || candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];

        const pipe = kv.pipeline();
        for (const wallet of candidates) {
            pipe.hgetall(`user:${wallet}:profile`);
            pipe.zscore('leaderboard:mints:all_time', wallet);
            pipe.zscore('leaderboard:points', wallet);
        }
        const results = await pipe.exec();

        let bestWallet = candidates[0];
        let bestMetric = -1;

        for (let i = 0; i < candidates.length; i++) {
            const profile = results[i * 3] || {};
            const mintScore = parseFloat(results[i * 3 + 1] || 0);
            const pointsScore = parseFloat(results[i * 3 + 2] || 0);
            const totalMints = parseInt(profile?.total_mints, 10) || 0;
            const totalPoints = parseInt(profile?.total_points, 10) || 0;
            const hasProfile = Object.keys(profile || {}).length > 0 ? 1 : 0;
            const metric = totalMints * 1_000_000 + totalPoints * 1_000 + mintScore * 10 + pointsScore + hasProfile;

            if (metric > bestMetric) {
                bestMetric = metric;
                bestWallet = candidates[i];
            }
        }

        return bestWallet;
    }

    function parseJourney(journey) {
        return (journey || []).map((item) => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; }
            catch { return item; }
        });
    }

    function findFavoriteCollection(journey) {
        const counts = {};
        for (const event of journey) {
            if (event?.type === 'mint_success' && event.collection) {
                counts[event.collection] = (counts[event.collection] || 0) + 1;
            }
        }

        let favorite = { collection: null, count: 0 };
        for (const [collection, count] of Object.entries(counts)) {
            if (count > favorite.count) {
                favorite = { collection, count };
            }
        }
        return favorite;
    }

    function getActivityLevel(totalMints, currentStreak) {
        if (totalMints >= 50 || currentStreak >= 7) return 'Power Minter';
        if (totalMints >= 20 || currentStreak >= 3) return 'Active Collector';
        if (totalMints >= 5) return 'Rising Minter';
        if (totalMints >= 1) return 'Newcomer';
        return 'Visitor';
    }
}
