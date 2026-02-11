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

    const { wallet } = req.query;

    if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
        const pipe = kv.pipeline();

        // 1. Wallet profile
        pipe.hgetall(`user:${wallet}:profile`);

        // 2. Journey (last 50 events)
        pipe.lrange(`user:${wallet}:journey`, 0, 49);

        // 3. Ranks across leaderboards
        pipe.zrevrank('leaderboard:mints:all_time', wallet);
        pipe.zscore('leaderboard:mints:all_time', wallet);
        pipe.zrevrank('leaderboard:volume:all_time', wallet);
        pipe.zscore('leaderboard:volume:all_time', wallet);

        // 4. Total leaderboard size (for percentile)
        pipe.zcard('leaderboard:mints:all_time');

        const [
            profile,
            journey,
            mintRank,
            mintScore,
            volumeRank,
            volumeScore,
            totalMintersCount
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
        const successRate = totalAttempts > 0
            ? ((totalMints / totalAttempts) * 100).toFixed(1)
            : '100.0';

        // Calculate percentile
        const totalMinters = parseInt(totalMintersCount) || 0;
        const rank = mintRank !== null ? mintRank + 1 : null;
        const percentile = rank && totalMinters > 0
            ? ((1 - (rank / totalMinters)) * 100).toFixed(1)
            : null;

        // Calculate streak (from journey)
        const streak = calculateStreak(parsedJourney);

        return res.status(200).json({
            wallet,
            profile: {
                totalMints,
                totalAttempts,
                totalFailures,
                totalVolume: parseFloat(profile?.total_volume || 0).toFixed(6),
                totalGas: parseFloat(profile?.total_gas || 0).toFixed(6),
                firstSeen: new Date(firstSeen).toISOString(),
                lastActive: profile?.last_active ? new Date(parseInt(profile.last_active)).toISOString() : new Date(now).toISOString(),
                successRate,
                streak: streak.current,
                longestStreak: streak.longest
            },
            rankings: {
                mints: {
                    rank: rank || 'Unranked',
                    score: parseInt(mintScore) || 0,
                    percentile: percentile ? `Top ${(100 - parseFloat(percentile)).toFixed(1)}%` : 'N/A'
                },
                volume: {
                    rank: volumeRank !== null ? volumeRank + 1 : 'Unranked',
                    score: parseFloat(volumeScore || 0).toFixed(6)
                }
            },
            journey: parsedJourney
        });

    } catch (error) {
        console.error('User stats error:', error);
        return res.status(500).json({ error: 'Failed to fetch user stats' });
    }
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
