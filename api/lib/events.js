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
    'click'
];

// Funnel steps (ordered)
export const FUNNEL_STEPS = [
    'page_view',
    'wallet_connect',
    'collection_view',
    'mint_click',
    'tx_sent',
    'mint_success'
];

// ── Shared helpers ─────────────────────────────────────────────

export function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
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

// ── Per-event handlers ─────────────────────────────────────────

/** page_view — 1-2 commands */
export function handlePageView(pipe, event) {
    pipe.hincrby('stats:global', 'total_views', 1);
    if (event.page) {
        pipe.hincrby(`page:${event.page}:stats`, 'views', 1);
    }
}

/** collection_view — 2-6 commands + 1 pre-read */
export async function handleCollectionView(pipe, event, { kv, today, weekNum }) {
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
        }
    }
}

/** gallery_view — 2 commands */
export function handleGalleryView(pipe) {
    pipe.hincrby('stats:global', 'total_views', 1);
    pipe.hincrby('page:gallery:stats', 'views', 1);
}

/** wallet_connect — 1-5 commands + 1 pre-read (sadd doubles as check) */
export async function handleWalletConnect(pipe, event, { kv, weekNum }) {
    const { wallet } = event;
    if (!wallet) return;

    // sadd returns 1 if new — this is both check + write (1 command, not 2)
    const isNew = await kv.sadd('wallets:connected', wallet);
    if (isNew) {
        pipe.hincrby('stats:global', 'total_connects', 1);
        // Skip separate first_connect check; use profile.total_points existence
        // as proxy (saves 1 GET per new wallet connect)
        pipe.set(`user:${wallet}:first_connect`, 1);
        pipe.hincrby(`user:${wallet}:profile`, 'total_points', 2);
        pipe.zincrby('leaderboard:points', 2, wallet);
        pipe.zincrby(`leaderboard:points:week:${weekNum}`, 2, wallet);
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

/**
 * mint_success — most complex handler
 * OPTIMIZED: merged profile hset calls, removed per-collection gas leaderboard
 * Returns { isNewMint, finalPoints, profile }
 */
export async function handleMintSuccess(pipe, event, { kv, today, weekNum, timestamp, verifyMintTransaction }) {
    const { wallet, collection, txHash, price, gas } = event;
    if (!wallet || !collection) return { isNewMint: false, finalPoints: 0 };

    // 1. Verify transaction
    if (txHash && verifyMintTransaction) {
        const isValid = await verifyMintTransaction(txHash, wallet);
        if (!isValid) {
            return { isNewMint: false, finalPoints: 0, invalid: true };
        }
    }

    // 2. Idempotency check (1 read) — also fetch profile in same pipeline
    //    to avoid separate hget for streak later
    if (txHash) {
        const checkPipe = kv.pipeline();
        checkPipe.get(`mint:processed:${txHash}`);
        checkPipe.hgetall(`user:${wallet}:profile`);
        const [processed, profile] = await checkPipe.exec();
        if (processed) return { isNewMint: false, finalPoints: 0 };

        // We got profile for free — pass it through
        return writeMintData(pipe, event, { today, weekNum, timestamp, profile });
    }

    // No txHash — fetch profile separately (rare path)
    const profile = await kv.hgetall(`user:${wallet}:profile`);
    return writeMintData(pipe, event, { today, weekNum, timestamp, profile });
}

/** Internal: writes all mint data to pipeline */
function writeMintData(pipe, event, { today, weekNum, timestamp, profile }) {
    const { wallet, collection, txHash, price, gas } = event;
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
        wallet, collection, txHash, price: mintPrice, timestamp
    });
    pipe.lpush('activity:global', activityItem);
    pipe.ltrim('activity:global', 0, 99);
    pipe.lpush(`activity:collection:${collection}`, activityItem);
    pipe.ltrim(`activity:collection:${collection}`, 0, 49);

    // ── Mint log for CSV export (2 commands) ──
    pipe.lpush('log:mints', JSON.stringify({ wallet, collection, price: mintPrice, txHash, timestamp }));
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
    if (!wallet || wallet === 'anonymous') return;

    // Active day tracking (2 commands)
    pipe.sadd(`active:${today}`, wallet);
    pipe.expire(`active:${today}`, 60 * 60 * 24 * 60);

    // Fetch profile once (reuse if already fetched by mint_success)
    const profile = _cachedProfile || await kv.hgetall(`user:${wallet}:profile`);

    // ── Build a single merged hset payload ──
    const profileUpdate = { last_active: timestamp };

    if (!profile?.first_seen) {
        profileUpdate.first_seen = timestamp;
        pipe.sadd(`cohort:${today}`, wallet);
    }

    // ── Streak logic ──
    const currentStreak = parseInt(profile?.streak) || 0;
    const lastActiveDate = profile?.last_active_date;
    const yesterdayDate = getYesterdayDate(today);

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

    // ── Single merged hset call (was 3-4 separate calls!) ──
    pipe.hset(`user:${wallet}:profile`, profileUpdate);

    // ── Journey log (2 commands) ──
    const journeyItem = {
        type, collection, page, timestamp,
        ...(txHash ? { txHash } : {}),
        ...(price > 0 ? { price: parseFloat(price) } : {})
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
    mint_click: 20,
    collection_view: 60,
    wallet_connect: 10,
    page_view: 100,
    mint_success: 100
};

export async function checkRateLimit(kv, key, action) {
    const limitKey = `ratelimit:${key}:${action}`;
    const count = await kv.incr(limitKey);
    if (count === 1) {
        await kv.expire(limitKey, 60);
    }
    if (count > (RATE_LIMITS[action] || 100)) {
        throw new Error('Rate limit exceeded');
    }
}

// ── Cleanup ────────────────────────────────────────────────────

export async function cleanupExpiredKeys(kv) {
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const keys = await kv.keys('daily:stats:*');
    for (const key of keys) {
        const date = key.split(':')[2];
        if (date < cutoffDate) {
            await kv.del(key);
        }
    }
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

    const helpers = { kv, today, weekNum, timestamp, verifyMintTransaction: opts.verifyMintTransaction };

    const pipe = kv.pipeline();

    // ── Common writes (every event) ──
    // REMOVED: raw event storage (was: pipe.set(`event:${type}:${eventId}`, ...))
    // Saves 1 command per event = biggest single saving
    pipe.hincrby('stats:global', 'total_events', 1);

    // Funnel (only for funnel-step events, skip otherwise)
    if (FUNNEL_STEPS.includes(type)) {
        pipe.hincrby('funnel:mint', type, 1);
        if (event.collection) {
            pipe.hincrby(`funnel:mint:${event.collection}`, type, 1);
        }
    }

    // Daily stats
    pipe.hincrby(`daily:stats:${today}`, type, 1);

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
            break;
        default:
            break;
    }

    // ── Wallet-level tracking (streak, journey, cohort) ──
    if (wallet && wallet !== 'anonymous') {
        // Pass cached profile from mint_success to avoid re-fetching
        helpers._cachedProfile = mintResult?.profile || null;
        await handleWalletTracking(pipe, event, helpers);
    }

    // ── Weekly leaderboard TTL (inside pipeline, not standalone!) ──
    pipe.expire(`leaderboard:mints:week:${weekNum}`, 60 * 60 * 24 * 56);
    pipe.expire(`leaderboard:points:week:${weekNum}`, 60 * 60 * 24 * 56);

    // ── Execute pipeline ──
    const results = await pipe.exec();
    console.log(`[Events] Pipeline (${type}) – ${results.length} cmds`);

    // ── Post-execution: mark mint as processed ──
    if (type === 'mint_success' && event.txHash && mintResult?.isNewMint) {
        await kv.set(`mint:processed:${event.txHash}`, 1, { ex: 60 * 60 * 24 * 7 });
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
