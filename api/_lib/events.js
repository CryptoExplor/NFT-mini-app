/**
 * Modular Event Handlers for KV Analytics
 * ─────────────────────────────────────────
 * OPTIMIZED for minimal KV commands.
 *
 * Key savings vs original:
 *  - Removed raw event storage (was 1 SET per event)
 *  - Merged multiple hset calls to same key into single calls
 *  - Removed separate expire calls by using pipeline
 *  - Combined streak + profile reads into single hgetall
 *  - Moved weekly TTL into pipeline instead of standalone calls
 *  - Rate-limit uses pipeline for expire (saves 1 command when count=1)
 */

// ── Valid event types ──────────────────────────────────────────
export const VALID_EVENTS = [
    'page_view',
    'wallet_connect',
    'collection_view',
    'mint_click',
    'mint_attempt',
    'tx_sent',
    'mint_success',
    'mint_failure',
    'gallery_view',
    'click',
    'battle_challenge_posted',
    'battle_previewed',
    'battle_started',
    'battle_started_v2',      // V2: fired when a battle begins (AI or PvP)
    'battle_loadout_built',   // V2: fired when fighter + item + arena selected
    'battle_won',
    'battle_lost',
    'battle_result_v2',
    'social_share',
    'replay_conversion'
];

// Funnel steps (ordered)
export const FUNNEL_STEPS = [
    'page_view',
    'collection_view',
    'wallet_connect',
    'mint_click',
    'tx_sent',
    'mint_success'
];

// ── Shared helpers ─────────────────────────────────────────────

export function getWeekNumber(date) {
    // NOTE: must use UTC getters — the rest of the pipeline (getUTCDate) is UTC.
    // Using local getters here bucketed points into the wrong ISO week on any
    // non-UTC runtime (and TTL'd a different key than the one incremented).
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function getUTCDate() {
    return new Date().toISOString().split('T')[0];
}

export function getYesterdayDate(todayStr) {
    const date = new Date(todayStr);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().split('T')[0];
}

/**
 * Record that this event actually wrote to a weekly (TTL-managed) key.
 * processEvent only issues EXPIRE for keys that were touched, instead of
 * firing 3 no-op EXPIREs on every single event.
 */
export function touchWeekly(helpers, key) {
    if (!helpers) return;
    if (!helpers.weeklyKeys) helpers.weeklyKeys = new Set();
    helpers.weeklyKeys.add(key);
}

// ── Per-event handlers ─────────────────────────────────────────

/** page_view — 1-2 commands */
export function handlePageView(pipe, event) {
    pipe.hincrby('stats:global', 'total_views', 1);
    if (event.page) {
        pipe.hincrby(`page:${event.page}:stats`, 'views', 1);
    }
}

/** collection_view — 2-6 commands + 1 pre-read */
export async function handleCollectionView(pipe, event, helpers) {
    const { kv, today, weekNum } = helpers;
    const { collection, wallet } = event;
    if (collection) {
        pipe.hincrby(`collection:${collection}:stats`, 'views', 1);
        pipe.hincrby('stats:global', 'total_views', 1);
    }

    // Points: daily unique view +1 (1 pre-read to check dedup)
    if (wallet && wallet !== 'anonymous' && collection) {
        const viewKey = `user:${wallet}:daily_view:${today}`;
        const seenToday = await kv.get(viewKey);
        if (!seenToday) {
            pipe.set(viewKey, 1, { ex: 90000 }); // 25h TTL
            pipe.hincrby(`user:${wallet}:profile`, 'total_points', 1);
            pipe.zincrby('leaderboard:points', 1, wallet);
            pipe.zincrby(`leaderboard:points:week:${weekNum}`, 1, wallet);
            touchWeekly(helpers, `leaderboard:points:week:${weekNum}`);
        }
    }
}

/** gallery_view — 2 commands */
export function handleGalleryView(pipe) {
    pipe.hincrby('stats:global', 'total_views', 1);
    pipe.hincrby('page:gallery:stats', 'views', 1);
}

/** wallet_connect — 1-5 commands + 1 pre-read (sadd doubles as check) */
export async function handleWalletConnect(pipe, event, helpers) {
    const { kv, weekNum } = helpers;
    const { wallet, metadata } = event;
    if (!wallet) return;

    // Save display name from Farcaster/Base profile if provided
    // This writes on EVERY wallet_connect (not just new), so profile names stay current
    const displayName = metadata?.displayName || metadata?.username || null;
    if (displayName && typeof displayName === 'string') {
        pipe.hset(`user:${wallet}:profile`, { display_name: displayName.slice(0, 50) });
    }

    // sadd returns 1 if new — this is both check + write (1 command, not 2)
    const isNew = await kv.sadd('wallets:connected', wallet);
    if (isNew) {
        pipe.hincrby('stats:global', 'total_connects', 1);
        // Skip separate first_connect check; use profile.total_points existence
        // as proxy (saves 1 GET per new wallet connect)
        // Kept for backwards compatibility with historical data, but bounded:
        // this key is never read and previously grew forever.
        pipe.set(`user:${wallet}:first_connect`, 1, { ex: 60 * 60 * 24 * 365 });
        pipe.hincrby(`user:${wallet}:profile`, 'total_points', 2);
        pipe.zincrby('leaderboard:points', 2, wallet);
        pipe.zincrby(`leaderboard:points:week:${weekNum}`, 2, wallet);
        touchWeekly(helpers, `leaderboard:points:week:${weekNum}`);
    }
}

/** mint_attempt — 2-3 commands */
export function handleMintAttempt(pipe, event) {
    const { wallet, collection } = event;
    pipe.hincrby('stats:global', 'total_attempts', 1);
    if (collection) {
        pipe.hincrby(`collection:${collection}:stats`, 'attempts', 1);
    }
    if (wallet && wallet !== 'anonymous') {
        pipe.hincrby(`user:${wallet}:profile`, 'total_attempts', 1);
    }
}

/** mint_failure — 2-3 commands */
export function handleMintFailure(pipe, event) {
    const { wallet, collection } = event;
    pipe.hincrby('stats:global', 'total_failures', 1);
    if (collection) {
        pipe.hincrby(`collection:${collection}:stats`, 'failures', 1);
    }
    if (wallet && wallet !== 'anonymous') {
        pipe.hincrby(`user:${wallet}:profile`, 'total_failures', 1);
    }
}

/** battle_won — updates battle leaderboard */
export function handleBattleWon(pipe, event, helpers) {
    const { weekNum } = helpers;
    const { wallet } = event;
    if (wallet && wallet !== 'anonymous') {
        pipe.hincrby(`user:${wallet}:profile`, 'battle_wins', 1);
        pipe.zincrby('leaderboard:battle_wins:all_time', 1, wallet);
        pipe.zincrby(`leaderboard:battle_wins:week:${weekNum}`, 1, wallet);
        touchWeekly(helpers, `leaderboard:battle_wins:week:${weekNum}`);
    }
}

/**
 * battle_result_v2 — modern V2 battle tracker
 *
 * Flags on metadata:
 *  - affectsGlobal  : count this event in global battle volume + the live feed.
 *                     PvP emits two events (one per player); only one carries
 *                     affectsGlobal so a match counts once.
 *  - countsGlobalWin: count a win in stats:global.battle_wins. Defaults to
 *                     affectsGlobal for older/legacy callers, but PvP sets it on
 *                     BOTH sides so an attacker victory is not lost (previously
 *                     the global win rate only ever saw defender wins).
 *  - ladderCounted  : the caller already wrote to leaderboard:battle_wins:*
 *                     (legacy AI path did this via incrementBattleWins). When
 *                     true we skip the zincrby so wins are not double counted.
 *  - ladderVerified : the outcome was proven against a server-stored battle
 *                     record (see api/_lib/battle/verifyClaim.js). Wallet-level
 *                     wins, points and the ladder are ONLY written when this is
 *                     true — otherwise any authenticated client could mint wins
 *                     by POSTing {won:true} to /api/track.
 */
export function handleBattleResultV2(pipe, event, helpers) {
    const { weekNum, timestamp } = helpers;
    const { wallet, metadata } = event;
    const isAi = metadata?.isAi ?? true;
    const won = metadata?.won ?? false;
    const battleId = metadata?.battleId || null;
    const opponent = metadata?.opponent || null;
    const affectsGlobal = metadata?.affectsGlobal !== false;
    const countsGlobalWin = metadata?.countsGlobalWin ?? affectsGlobal;
    const ladderCounted = metadata?.ladderCounted === true;
    const ladderVerified = metadata?.ladderVerified === true;

    if (affectsGlobal) {
        pipe.hincrby('stats:global', 'battle_total', 1);
        pipe.incr('global:battle_count');

        const activityItem = JSON.stringify({
            battleId,
            wallet: wallet || 'anonymous',
            opponent,
            won,
            isAi,
            timestamp: timestamp || Date.now()
        });
        pipe.lpush('activity:battles:global', activityItem);
        pipe.ltrim('activity:battles:global', 0, 99);
    }

    // Global win counter is independent of affectsGlobal: exactly one side of a
    // match wins, so this stays consistent with battle_total.
    if (won && countsGlobalWin) {
        pipe.hincrby('stats:global', 'battle_wins', 1);
    }

    // Wallet-scoped progression requires a verified battle record.
    if (wallet && wallet !== 'anonymous' && ladderVerified) {
        pipe.hincrby(`user:${wallet}:profile`, 'battle_total', 1);
        if (won) {
            pipe.hincrby(`user:${wallet}:profile`, 'battle_wins', 1);
            if (!ladderCounted) {
                pipe.zincrby('leaderboard:battle_wins:all_time', 1, wallet);
                pipe.zincrby(`leaderboard:battle_wins:week:${weekNum}`, 1, wallet);
                touchWeekly(helpers, `leaderboard:battle_wins:week:${weekNum}`);
            }
            // Battle points bonus (all-time AND weekly — weekly was missing)
            pipe.hincrby(`user:${wallet}:profile`, 'total_points', 5);
            pipe.zincrby('leaderboard:points', 5, wallet);
            pipe.zincrby(`leaderboard:points:week:${weekNum}`, 5, wallet);
            touchWeekly(helpers, `leaderboard:points:week:${weekNum}`);
        }
    }
}

/**
 * mint_success — most complex handler
 * OPTIMIZED: merged profile hset calls, removed per-collection gas leaderboard
 * Returns { isNewMint, finalPoints, profile }
 */
export async function handleMintSuccess(pipe, event, helpers) {
    const { kv, verifyMintTransaction } = helpers;
    const { wallet, collection, txHash } = event;
    if (!wallet || !collection) return { isNewMint: false, finalPoints: 0 };

    // 1. Verify transaction
    if (txHash && verifyMintTransaction) {
        const verification = await verifyMintTransaction(txHash, wallet, collection);
        const isValid = verification === true || verification?.valid === true;
        if (!isValid) {
            return { isNewMint: false, finalPoints: 0, invalid: true };
        }

        if (verification && typeof verification === 'object') {
            event.mintDetails = verification;
            // Server-derived gas replaces the untrusted client estimate.
            if (Number(verification.gas) > 0) event.gas = Number(verification.gas);

            const mintedAt = Number(verification.mintedAt);
            if (Number.isFinite(mintedAt) && mintedAt > 0 && mintedAt <= Date.now() + 5 * 60_000) {
                event.timestamp = mintedAt;
                helpers.timestamp = mintedAt;
                helpers.today = new Date(mintedAt).toISOString().split('T')[0];
                helpers.weekNum = getWeekNumber(new Date(mintedAt));
            }
        }
    }

    // 2. Idempotency check. The persistent hash protects historical replay;
    //    the old 7-day key is retained as a fast/backwards-compatible marker.
    //    Journey fallback prevents pre-migration mints from being counted again.
    if (txHash) {
        const checkPipe = kv.pipeline();
        checkPipe.get(`mint:processed:${txHash}`);
        checkPipe.hget('mint:processed:all', txHash);
        checkPipe.hgetall(`user:${wallet}:profile`);
        checkPipe.lrange(`user:${wallet}:journey`, 0, 199);
        const [processed, persistentProcessed, profile, journey] = await checkPipe.exec();
        const seenInJourney = (journey || []).some((item) => {
            try {
                const parsed = typeof item === 'string' ? JSON.parse(item) : item;
                return String(parsed?.txHash || '').toLowerCase() === String(txHash).toLowerCase();
            } catch {
                return false;
            }
        });

        if (processed || persistentProcessed || seenInJourney) {
            if (!persistentProcessed) {
                await kv.hset('mint:processed:all', { [txHash]: 1 });
            }
            return { isNewMint: false, finalPoints: 0, duplicate: true };
        }

        // We got profile for free — pass it through
        return writeMintData(pipe, event, { ...helpers, profile });
    }

    // No txHash — fetch profile separately (rare path)
    const profile = await kv.hgetall(`user:${wallet}:profile`);
    return writeMintData(pipe, event, { ...helpers, profile });
}

/** Internal: writes all mint data to pipeline */
function writeMintData(pipe, event, helpers) {
    const { today, weekNum, timestamp, profile } = helpers;
    const { wallet, collection, txHash, price, gas } = event;
    const mintDetails = event.mintDetails || {};
    const mintPrice = parseFloat(price) || 0;
    const gasUsed = parseFloat(gas) || 0;

    // ── Global stats (3 commands → could merge but hincrby/hincrbyfloat differ) ──
    pipe.hincrby('stats:global', 'total_mints', 1);
    if (mintPrice > 0) pipe.hincrbyfloat('stats:global', 'total_volume', mintPrice);
    if (gasUsed > 0) pipe.hincrbyfloat('stats:global', 'total_gas', gasUsed);

    // ── Collection stats (2-3 commands) ──
    pipe.hincrby(`collection:${collection}:stats`, 'mints', 1);
    if (mintPrice > 0) pipe.hincrbyfloat(`collection:${collection}:stats`, 'volume', mintPrice);
    pipe.sadd(`collection:${collection}:wallets`, wallet);

    // ── Leaderboards — REDUCED: skip per-collection gas/volume boards ──
    // (saves 2-4 commands per mint, these boards are rarely queried)
    pipe.zincrby('leaderboard:mints:all_time', 1, wallet);
    pipe.zincrby(`leaderboard:mints:all_time:${collection}`, 1, wallet);
    if (mintPrice > 0) {
        pipe.zincrby('leaderboard:volume:all_time', mintPrice, wallet);
    }
    if (gasUsed > 0) {
        pipe.zincrby('leaderboard:gas:all_time', gasUsed, wallet);
    }

    // ── Weekly leaderboard (1 command) ──
    pipe.zincrby(`leaderboard:mints:week:${weekNum}`, 1, wallet);
    touchWeekly(helpers, `leaderboard:mints:week:${weekNum}`);

    // ── User profile — MERGED into single hset where possible ──
    // hincrby/hincrbyfloat must stay separate, but last_active goes into a batch
    pipe.hincrby(`user:${wallet}:profile`, 'total_mints', 1);
    if (mintPrice > 0) pipe.hincrbyfloat(`user:${wallet}:profile`, 'total_volume', mintPrice);
    if (gasUsed > 0) pipe.hincrbyfloat(`user:${wallet}:profile`, 'total_gas', gasUsed);

    // ── Daily stats (1-2 commands, skip if zero) ──
    pipe.hincrby(`daily:stats:${today}`, 'mints', 1);
    if (mintPrice > 0) pipe.hincrbyfloat(`daily:stats:${today}`, 'volume', mintPrice);

    // ── Activity feed (4 commands — push+trim for global & collection) ──
    const activityItem = JSON.stringify({
        wallet,
        collection,
        collectionName: mintDetails.collectionName || collection,
        txHash,
        price: mintPrice,
        gas: gasUsed,
        timestamp,
        chain: mintDetails.chain || 'base',
        chainId: mintDetails.chainId || 8453,
        contract: mintDetails.contract || '',
        tokenId: mintDetails.tokenId || '',
        tokenIds: mintDetails.tokenIds || [],
        quantity: mintDetails.quantity || 1,
        imageUrl: mintDetails.imageUrl || '',
        openseaUrl: mintDetails.openseaUrl || '',
        reconciled: timestamp < Date.now() - 5 * 60_000
    });
    pipe.lpush('activity:global', activityItem);
    pipe.ltrim('activity:global', 0, 99);
    pipe.lpush(`activity:collection:${collection}`, activityItem);
    pipe.ltrim(`activity:collection:${collection}`, 0, 49);

    // ── Mint log for CSV export (2 commands) ──
    pipe.lpush('log:mints', JSON.stringify({
        wallet,
        collection,
        collectionName: mintDetails.collectionName || collection,
        price: mintPrice,
        gas: gasUsed,
        txHash,
        tokenId: mintDetails.tokenId || '',
        quantity: mintDetails.quantity || 1,
        contract: mintDetails.contract || '',
        timestamp
    }));
    pipe.ltrim('log:mints', 0, 9999);

    // ── Points — use profile we already fetched (0 extra reads!) ──
    let points = 10;
    if (mintPrice > 0) {
        points += Math.min(mintPrice * 50, 500);
    }
    const streak = parseInt(profile?.streak) || 0;
    if (streak >= 3) {
        points += (streak * 3);
    }

    const finalPoints = Math.round(points);
    pipe.hincrby(`user:${wallet}:profile`, 'total_points', finalPoints);
    pipe.zincrby('leaderboard:points', finalPoints, wallet);
    pipe.zincrby(`leaderboard:points:week:${weekNum}`, finalPoints, wallet);
    touchWeekly(helpers, `leaderboard:points:week:${weekNum}`);

    // ── Points audit (2 commands) ──
    const logEntry = JSON.stringify({
        action: 'mint_success',
        points: finalPoints,
        reason: { collection, price: mintPrice, streak, type: 'mint_bonus' },
        timestamp,
        txHash
    });
    pipe.lpush(`user:${wallet}:points_log`, logEntry);
    pipe.ltrim(`user:${wallet}:points_log`, 0, 499);

    return { isNewMint: true, finalPoints, profile };
}

// ── Wallet-level tracking (streak, journey) ────────────────────
// OPTIMIZED: reuses profile from mint_success, merges hset calls

export async function handleWalletTracking(pipe, event, { kv, today, timestamp, _cachedProfile }) {
    const { wallet, type, collection, page, txHash, price } = event;
    const mintDetails = event.mintDetails || {};
    if (!wallet || wallet === 'anonymous') return;

    // Active day tracking (2 commands)
    pipe.sadd(`active:${today}`, wallet);
    pipe.expire(`active:${today}`, 60 * 60 * 24 * 60);

    // Fetch profile once (reuse if already fetched by mint_success)
    const profile = _cachedProfile || await kv.hgetall(`user:${wallet}:profile`);

    // ── Build a single merged hset payload ──
    const previousLastActive = Number(profile?.last_active) || 0;
    const previousFirstSeen = Number(profile?.first_seen) || 0;
    const profileUpdate = { last_active: Math.max(previousLastActive, timestamp) };

    if (!previousFirstSeen || timestamp < previousFirstSeen) {
        profileUpdate.first_seen = timestamp;
        pipe.sadd(`cohort:${today}`, wallet);
    }

    // Historical reconciliation must not reset today's engagement streak.
    const isHistoricalMint = type === 'mint_success' && today !== getUTCDate();

    // ── Streak logic ──
    const currentStreak = parseInt(profile?.streak) || 0;
    const lastActiveDate = profile?.last_active_date;
    const yesterdayDate = getYesterdayDate(today);

    if (!isHistoricalMint) {
        if (!lastActiveDate) {
            profileUpdate.streak = 1;
            profileUpdate.last_active_date = today;
        } else if (lastActiveDate !== today) {
            if (lastActiveDate === yesterdayDate) {
                // Consecutive day — use hincrby for streak (can't merge into hset)
                pipe.hincrby(`user:${wallet}:profile`, 'streak', 1);
                const newStreak = currentStreak + 1;
                const longest = parseInt(profile?.longest_streak) || 0;
                if (newStreak > longest) {
                    profileUpdate.longest_streak = newStreak;
                }
            } else {
                profileUpdate.streak = 1; // Reset
            }
            profileUpdate.last_active_date = today;
        }
    }

    // ── Single merged hset call (was 3-4 separate calls) ──
    // Guard: only call hset if profileUpdate has actual string keys
    const hasValidFields = Object.keys(profileUpdate).some(k => isNaN(Number(k)));
    if (hasValidFields) {
        pipe.hset(`user:${wallet}:profile`, profileUpdate);
    } else {
        console.error('[WalletTracking] profileUpdate was empty or corrupted, skipping hset');
    }

    // ── Journey log (2 commands) ──
    const journeyItem = {
        type, collection, page, timestamp,
        ...(txHash ? { txHash } : {}),
        ...(price > 0 ? { price: parseFloat(price) } : {}),
        ...(mintDetails.tokenId ? { tokenId: mintDetails.tokenId } : {}),
        ...(mintDetails.quantity ? { quantity: mintDetails.quantity } : {}),
        ...(mintDetails.collectionName ? { collectionName: mintDetails.collectionName } : {}),
        ...(mintDetails.imageUrl ? { imageUrl: mintDetails.imageUrl } : {}),
        ...(mintDetails.openseaUrl ? { openseaUrl: mintDetails.openseaUrl } : {})
    };
    pipe.lpush(`user:${wallet}:journey`, JSON.stringify(journeyItem));
    pipe.ltrim(`user:${wallet}:journey`, 0, 199);
}

// ── Reputation (post-execution, 3 commands) ────────────────────

export async function updateReputation(kv, wallet) {
    const profile = await kv.hgetall(`user:${wallet}:profile`);
    if (!profile) return;

    const mints = parseInt(profile.total_mints) || 0;
    const volume = parseFloat(profile.total_volume) || 0;
    const attempts = parseInt(profile.total_attempts) || 1;
    const failures = parseInt(profile.total_failures) || 0;
    const successRate = attempts > 0 ? (mints / attempts) : 1;
    const failRate = attempts > 0 ? (failures / attempts) : 0;

    const reputation = Math.max(0,
        (mints * 2) +
        (volume > 0 ? Math.log(volume + 1) * 10 : 0) +
        (parseInt(profile.streak) || 0) * 5 +
        (successRate * 20) -
        (failRate * 10)
    );

    const reputationScore = Math.round(reputation * 100) / 100;
    // Use pipeline to batch these 2 writes
    const p = kv.pipeline();
    p.hset(`user:${wallet}:profile`, { reputation_score: reputationScore });
    p.zadd('leaderboard:reputation', { score: reputationScore, member: wallet });
    await p.exec();
}

// ── Rate limiting ──────────────────────────────────────────────

const RATE_LIMITS = {
    mint_click: 60,
    collection_view: 120,
    wallet_connect: 30,
    page_view: 200,
    gallery_view: 120,
    mint_attempt: 60,
    tx_sent: 60,
    mint_failure: 60,
    // Client-side historical reconciliation flushes receipt-proven
    // mints in bounded batches. Wallet+IP scoping in track.js limits abuse.
    mint_success: 120,
    social_share: 60,
    battle_result_v2: 60,
    battle_started_v2: 60,
    battle_loadout_built: 60,
    replay_conversion: 120,
    ai_post: 10
};

export class RateLimitError extends Error {
    constructor(retryAfterSeconds = 10) {
        super('Rate limit exceeded');
        this.name = 'RateLimitError';
        this.code = 'RATE_LIMITED';
        this.retryAfter = retryAfterSeconds;
    }
}

export async function checkRateLimit(kv, key, action, limitOverride = null, windowSeconds = 60) {
    const limitKey = `ratelimit:${key}:${action}`;
    const limit = Number.isFinite(limitOverride) ? limitOverride : (RATE_LIMITS[action] || 100);
    const ttlSeconds = Number.isFinite(windowSeconds) ? windowSeconds : 60;
    // Atomic: SET NX with TTL ensures the key always has an expiry
    await kv.set(limitKey, 0, { ex: ttlSeconds, nx: true });
    const count = await kv.incr(limitKey);
    if (count > limit) {
        // Typed error so callers can answer 429 (not 500) with a Retry-After hint
        throw new RateLimitError(ttlSeconds);
    }
}

export function handleSocialShare(pipe, event) {
    pipe.hincrby('stats:global', 'social_shares', 1);
    if (event.wallet && event.wallet !== 'anonymous') {
        pipe.hincrby(`user:${event.wallet}:profile`, 'social_shares', 1);
    }
}

export function handleReplayConversion(pipe, event) {
    pipe.hincrby('stats:global', 'replay_conversions', 1);
    if (event.wallet && event.wallet !== 'anonymous') {
        pipe.hincrby(`user:${event.wallet}:profile`, 'replay_conversions', 1);
    }
}

// ── Cleanup ────────────────────────────────────────────────────

export async function cleanupExpiredKeys(kv) {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    let cursor = 0;
    do {
        const result = await kv.scan(cursor, { match: 'daily:stats:*', count: 100 });
        cursor = result[0];
        const keys = result[1] || [];
        for (const key of keys) {
            const date = key.split(':')[2];
            if (date < cutoffDate) {
                await kv.del(key);
            }
        }
    } while (cursor !== 0 && cursor !== '0');
}

// ── Orchestrator ───────────────────────────────────────────────

/**
 * processEvent — single entry point called by track.js
 *
 * OPTIMIZED:
 *  - Removed raw event storage (saves 1 SET per event)
 *  - Weekly TTL set inside pipeline (saves 2 standalone commands)
 *  - Passes cached profile to handleWalletTracking (saves 1 hgetall)
 *  - Skips funnel write for non-funnel events
 */
export async function processEvent(kv, event, opts = {}) {
    const { type, wallet } = event;
    const timestamp = event.timestamp || Date.now();
    const eventId = `${timestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const today = getUTCDate();
    const weekNum = getWeekNumber(new Date());

    const helpers = {
        kv,
        today,
        weekNum,
        timestamp,
        verifyMintTransaction: opts.verifyMintTransaction,
        weeklyKeys: new Set()
    };

    const pipe = kv.pipeline();

    // ── Dispatch to event handler ──
    let mintResult = null;

    switch (type) {
        case 'page_view':
            handlePageView(pipe, event);
            break;
        case 'collection_view':
            await handleCollectionView(pipe, event, helpers);
            break;
        case 'gallery_view':
            handleGalleryView(pipe);
            break;
        case 'wallet_connect':
            await handleWalletConnect(pipe, event, helpers);
            break;
        case 'mint_attempt':
            handleMintAttempt(pipe, event);
            break;
        case 'mint_failure':
            handleMintFailure(pipe, event);
            break;
        case 'mint_success':
            mintResult = await handleMintSuccess(pipe, event, helpers);
            if (mintResult?.invalid) {
                return { success: false, eventId, error: 'Invalid transaction' };
            }
            // Already-processed txHash: abandon the pipeline instead of executing it.
            // Previously the global/daily counters queued above were still written,
            // so a retried mint inflated total_events and daily stats.
            if (mintResult?.duplicate) {
                return { success: true, eventId, duplicate: true };
            }
            break;
        case 'battle_won':
            handleBattleWon(pipe, event, helpers);
            break;
        case 'battle_result_v2':
            handleBattleResultV2(pipe, event, helpers);
            break;
        case 'battle_started_v2': {
            // Track battle starts globally and per-user
            pipe.hincrby('stats:global', 'battle_started', 1);
            if (event.wallet && event.wallet !== 'anonymous') {
                pipe.hincrby(`user:${event.wallet}:profile`, 'battle_started', 1);
            }
            break;
        }
        case 'battle_loadout_built': {
            // Track how many loadouts are assembled (engagement metric)
            pipe.hincrby('stats:global', 'battle_loadouts_built', 1);
            break;
        }
        case 'social_share':
            handleSocialShare(pipe, event);
            break;
        case 'replay_conversion':
            handleReplayConversion(pipe, event);
            break;
        default:
            break;
    }

    // ── Common writes ──
    // These run after dispatch so receipt verification can replace a reconciled
    // mint's timestamp/day before it is bucketed. Invalid/duplicate mints return
    // above and never touch counters.
    pipe.hincrby('stats:global', 'total_events', 1);
    if (FUNNEL_STEPS.includes(type)) {
        pipe.hincrby('funnel:mint', type, 1);
        if (event.collection) {
            pipe.hincrby(`funnel:mint:${event.collection}`, type, 1);
        }
    }
    pipe.hincrby(`daily:stats:${helpers.today}`, type, 1);

    // ── Wallet-level tracking (streak, journey, cohort) ──
    if (wallet && wallet !== 'anonymous') {
        // Pass cached profile from mint_success to avoid re-fetching
        helpers._cachedProfile = mintResult?.profile || null;
        await handleWalletTracking(pipe, event, helpers);
    }

    // ── Weekly leaderboard TTL ──
    // Only for keys this event actually wrote to (was: 3 no-op EXPIREs per event).
    for (const weeklyKey of helpers.weeklyKeys) {
        pipe.expire(weeklyKey, 60 * 60 * 24 * 56);
    }

    // ── Execute pipeline ──
    const results = await pipe.exec();
    console.log(`[Events] Pipeline (${type}) – ${results.length} cmds`);

    // ── Post-execution: mark mint as processed ──
    if (type === 'mint_success' && event.txHash && mintResult?.isNewMint) {
        const markPipe = kv.pipeline();
        markPipe.set(`mint:processed:${event.txHash}`, 1, { ex: 60 * 60 * 24 * 7 });
        // Persistent marker is required because historical reconciliation can
        // replay transactions older than the legacy seven-day TTL.
        markPipe.hset('mint:processed:all', { [event.txHash]: 1 });
        await markPipe.exec();
    }

    // ── Reputation update (only on new mint) ──
    if (type === 'mint_success' && wallet && mintResult?.isNewMint) {
        try {
            await updateReputation(kv, wallet);
        } catch (repError) {
            console.warn('Reputation calc error (non-fatal):', repError);
        }
    }

    return { success: true, eventId };
}
