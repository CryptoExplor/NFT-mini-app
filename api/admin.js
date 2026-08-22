import { kv } from './_lib/kv.js';
import { requireAdmin } from './_lib/authMiddleware.js';
import { setCors } from './_lib/cors.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type, Authorization, X-Admin-Wallet'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Auth bypass must be opted into explicitly. `NODE_ENV === 'development'`
    // is set by `vercel dev`, which exposed the whole admin surface locally.
    if (process.env.ALLOW_INSECURE_ADMIN === 'true' && process.env.NODE_ENV !== 'production') {
        console.warn('[Admin] ALLOW_INSECURE_ADMIN is enabled — auth bypassed');
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
                rank: rank != null ? rank + 1 : 'Unranked',
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
            // Cohort/active keys are UTC dates — offsets must be UTC too, or a
            // non-UTC runtime intersects the cohort with the wrong day.
            const day1 = addUtcDays(target, 1);
            const day7 = addUtcDays(target, 7);
            const day30 = addUtcDays(target, 30);

            if (!day1 || !day7 || !day30) {
                return res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD.' });
            }

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

        // Action: one-time cleanup of corrupted numeric fields from profile
        if (action === 'cleanup_profile' && target) {
            const corruptFields = Array.from({ length: 20 }, (_, i) => String(i));
            await kv.hdel(`user:${target}:profile`, ...corruptFields);
            return res.status(200).json({ cleaned: corruptFields });
        }

        // Action: reconcile counters that historical double-writes corrupted.
        // ?action=reconcile&target=dry-run (default) or target=apply
        if (action === 'reconcile') {
            const apply = target === 'apply';
            const report = await reconcileBattleCounters({ apply });
            return res.status(200).json(report);
        }

        return res.status(400).json({ error: 'Invalid action. Use: overview, user, collection, cohort, daily, retention, reconcile, cleanup_profile' });

    } catch (error) {
        console.error('Admin API error:', error);
        return res.status(500).json({ error: 'Failed to fetch admin data' });
    }
}

function addUtcDays(dateStr, days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return null;
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().split('T')[0];
}

/**
 * Rebuild the arena ladder + global win counter from the per-user profiles,
 * which are the single-counted source of truth.
 *
 * Why: AI victories used to be written to `leaderboard:battle_wins:all_time`
 * twice (record endpoint + battle_result_v2), and PvP attacker wins were never
 * added to `stats:global.battle_wins`. Existing rows are preserved — they are
 * corrected in place, never deleted.
 */
async function reconcileBattleCounters({ apply = false } = {}) {
    const ladderKey = 'leaderboard:battle_wins:all_time';
    const raw = await kv.zrange(ladderKey, 0, -1, { rev: true, withScores: true });

    const ladder = new Map();
    if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i += 2) {
            const wallet = String(raw[i] || '').toLowerCase();
            if (wallet) ladder.set(wallet, parseFloat(raw[i + 1]) || 0);
        }
    }

    const wallets = [...ladder.keys()];
    const profiles = [];
    const CHUNK = 100;
    for (let i = 0; i < wallets.length; i += CHUNK) {
        const slice = wallets.slice(i, i + CHUNK);
        const pipe = kv.pipeline();
        slice.forEach(w => pipe.hgetall(`user:${w}:profile`));
        profiles.push(...await pipe.exec());
    }

    const changes = [];
    let globalWins = 0;

    for (let i = 0; i < wallets.length; i++) {
        const wallet = wallets[i];
        const profileWins = parseInt(profiles[i]?.battle_wins, 10) || 0;
        globalWins += profileWins;
        const ladderWins = ladder.get(wallet) || 0;
        if (ladderWins !== profileWins) {
            changes.push({ wallet, from: ladderWins, to: profileWins });
        }
    }

    if (apply && changes.length > 0) {
        for (let i = 0; i < changes.length; i += CHUNK) {
            const pipe = kv.pipeline();
            for (const change of changes.slice(i, i + CHUNK)) {
                // Profiles with 0 wins keep a 0-score row rather than vanishing.
                pipe.zadd(ladderKey, { score: change.to, member: change.wallet });
            }
            await pipe.exec();
        }
        await kv.hset('stats:global', { battle_wins: globalWins });
    }

    return {
        action: 'reconcile',
        applied: apply,
        walletsScanned: wallets.length,
        mismatches: changes.length,
        globalBattleWins: globalWins,
        sample: changes.slice(0, 25)
    };
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
