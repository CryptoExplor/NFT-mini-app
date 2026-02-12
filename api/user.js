import { kv } from '@vercel/kv';
import { requireAuth } from './lib/authMiddleware.js';

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

    // Auth: JWT preferred, query param fallback
    const auth = await requireAuth(req);
    const wallet = auth?.wallet || req.query?.wallet;

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/i.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
        const pipe = kv.pipeline();

        // 1. Wallet profile
        pipe.hgetall(`user:${wallet}:profile`);

        // 2. Journey (last 200 events)
        pipe.lrange(`user:${wallet}:journey`, 0, 199);

        // 3. Ranks across leaderboards
        pipe.zrevrank('leaderboard:mints:all_time', wallet);
        pipe.zscore('leaderboard:mints:all_time', wallet);
        pipe.zrevrank('leaderboard:volume:all_time', wallet);
        pipe.zscore('leaderboard:volume:all_time', wallet);

        // 4. Total leaderboard size (for percentile)
        pipe.zcard('leaderboard:mints:all_time');

        // 5. Global stats (for contribution %)
        pipe.hgetall('stats:global');

        // 6. Reputation rank
        pipe.zrevrank('leaderboard:reputation', wallet);
        pipe.zscore('leaderboard:reputation', wallet);

        // 7. Points rank
        pipe.zrevrank('leaderboard:points', wallet);
        pipe.zscore('leaderboard:points', wallet);

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

        // Parse journey events
        const parsedJourney = (journey || []).map(item => {
            try { return typeof item === 'string' ? JSON.parse(item) : item; }
            catch { return item; }
        });

        // Auto-initialize first_seen if missing
        const now = Date.now();
        let firstSeen = profile?.first_seen ? parseInt(profile.first_seen) : null;
        if (!firstSeen) {
            firstSeen = now;
            await kv.hset(`user:${wallet}:profile`, {
                first_seen: now,
                last_active: now
            });
        }

        // Calculate derived stats
        const totalMints = parseInt(profile?.total_mints) || 0;
        const totalAttempts = parseInt(profile?.total_attempts) || 0;
        const totalFailures = parseInt(profile?.total_failures) || 0;
        const totalVolume = parseFloat(profile?.total_volume || 0);
        const totalGas = parseFloat(profile?.total_gas || 0);
        const successRate = totalAttempts > 0
            ? ((totalMints / totalAttempts) * 100).toFixed(1)
            : '100.0';

        // Average gas per mint
        const avgGas = totalMints > 0
            ? (totalGas / totalMints).toFixed(6)
            : '0.000000';

        // Contribution % (user mints vs global mints)
        const globalMints = parseInt(globalStats?.total_mints) || 1;
        const globalVolume = parseFloat(globalStats?.total_volume) || 1;
        const mintContribution = ((totalMints / globalMints) * 100).toFixed(2);
        const volumeContribution = ((totalVolume / globalVolume) * 100).toFixed(2);

        // Calculate percentile
        const totalMinters = parseInt(totalMintersCount) || 0;
        const rank = mintRank !== null ? mintRank + 1 : null;
        const percentile = rank && totalMinters > 0
            ? ((1 - (rank / totalMinters)) * 100).toFixed(1)
            : null;

        // Get streak from profile (computed in track.js)
        const currentStreak = parseInt(profile?.streak) || 0;
        const longestStreak = parseInt(profile?.longest_streak) || currentStreak;

        // Derive badge
        let badge = null;
        if (currentStreak >= 30) badge = '👑 Legendary Minter';
        else if (currentStreak >= 14) badge = '🔥 Streak Master';
        else if (currentStreak >= 7) badge = '💎 Committed Collector';
        else if (currentStreak >= 3) badge = '🌟 Rising Minter';

        // Find favorite collection (most minted)
        const favorite = findFavoriteCollection(parsedJourney);

        return res.status(200).json({
            wallet,
            profile: {
                totalMints,
                totalAttempts,
                totalFailures,
                totalVolume: totalVolume.toFixed(6),
                totalGas: totalGas.toFixed(6),
                avgGas,
                firstSeen: new Date(firstSeen).toISOString(),
                lastActive: profile?.last_active ? new Date(parseInt(profile.last_active)).toISOString() : new Date(now).toISOString(),
                successRate,
                streak: currentStreak,
                longestStreak: longestStreak,
                favoriteCollection: favorite.collection,
                favoriteCollectionMints: favorite.count,
                mintContribution,
                volumeContribution
            },
            rankings: {
                mints: {
                    rank: rank || 'Unranked',
                    score: parseInt(mintScore) || 0,
                    percentile: percentile ? `Top ${(100 - parseFloat(percentile)).toFixed(1)}%` : 'N/A',
                    totalMinters
                },
                volume: {
                    rank: volumeRank !== null ? volumeRank + 1 : 'Unranked',
                    score: parseFloat(volumeScore || 0).toFixed(6)
                },
                reputation: {
                    rank: reputationRank !== null ? reputationRank + 1 : 'Unranked',
                    score: parseFloat(reputationScore || profile?.reputation_score || 0).toFixed(2)
                },
                points: {
                    rank: pointsRank !== null ? pointsRank + 1 : 'Unranked',
                    score: parseInt(pointsScore || profile?.total_points || 0)
                }
            },
            insights: {
                badge,
                points: parseInt(pointsScore || profile?.total_points || 0),
                mintContribution: `${mintContribution}%`,
                volumeContribution: `${volumeContribution}%`,
                avgGasPerMint: `${avgGas} ETH`,
                favoriteCollection: favorite.collection,
                favoriteCollectionMints: favorite.count,
                memberDays: Math.floor((now - firstSeen) / (1000 * 60 * 60 * 24)),
                memberDays: Math.floor((now - firstSeen) / (1000 * 60 * 60 * 24)),
                activityLevel: getActivityLevel(totalMints, currentStreak)
            },
            journey: parsedJourney
        });

    } catch (error) {
        console.error('User stats error:', error);
        return res.status(500).json({ error: 'Failed to fetch user stats' });
    }
}

/**
 * Find the user's most-minted collection from journey
 */
function findFavoriteCollection(journey) {
    const counts = {};
    for (const event of journey) {
        if (event.type === 'mint_success' && event.collection) {
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

/**
 * Get activity level label based on mints and streak
 */
function getActivityLevel(totalMints, currentStreak) {
    if (totalMints >= 50 || currentStreak >= 7) return 'Power Minter 🔥';
    if (totalMints >= 20 || currentStreak >= 3) return 'Active Collector 💎';
    if (totalMints >= 5) return 'Rising Minter ⭐';
    if (totalMints >= 1) return 'Newcomer 🌱';
    return 'Visitor 👀';
}

/**
 * Calculate mint streak from journey events
 */
function calculateStreak(journey) {
    const mintDays = new Set();
    for (const event of journey) {
        if (event.type === 'mint_success' && event.timestamp) {
            const day = new Date(event.timestamp).toISOString().split('T')[0];
            mintDays.add(day);
        }
    }

    if (mintDays.size === 0) return { current: 0, longest: 0 };

    const sortedDays = [...mintDays].sort().reverse();
    const today = new Date().toISOString().split('T')[0];

    let current = 0;
    let longest = 0;
    let streak = 0;
    let expectedDate = new Date(today);

    for (const day of sortedDays) {
        const dayDate = new Date(day);
        const expected = expectedDate.toISOString().split('T')[0];

        if (day === expected) {
            streak++;
            expectedDate.setDate(expectedDate.getDate() - 1);
        } else {
            if (current === 0) current = streak;
            longest = Math.max(longest, streak);
            streak = 1;
            expectedDate = new Date(dayDate);
            expectedDate.setDate(expectedDate.getDate() - 1);
        }
    }

    if (current === 0) current = streak;
    longest = Math.max(longest, streak);

    return { current, longest };
}
