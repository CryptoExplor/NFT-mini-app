#!/usr/bin/env node
/**
 * scripts/merge-all-formats.mjs
 *
 * Comprehensive KV Data Migration & Consolidation
 * ────────────────────────────────────────────────
 * Merges old format and new format data into the current schema:
 *
 *  1. Normalizes all wallet addresses across all keys to lowercase:
 *     - Merges `user:<MIXED_CASE>:profile` into `user:<lowercase>:profile`
 *     - Merges `user:<MIXED_CASE>:journey` into `user:<lowercase>:journey`
 *     - Merges `user:<MIXED_CASE>:points_log` into `user:<lowercase>:points_log`
 *     - Removes corrupted numeric keys ('0','1','2'...) from profiles
 *
 *  2. Consolidates all Leaderboard ZSETs:
 *     - Replaces mixed-case member addresses with lowercase
 *     - Merges duplicate member scores (e.g. 0x5C5a... + 0x5c5a...)
 *     - Merges legacy `global_leaderboard` into `leaderboard:battle_wins:all_time`
 *
 *  3. Consolidates Collection keys:
 *     - Merges `collection:basemoods:stats` into `collection:base-moods:stats`
 *     - Ensures all collection sets (`collection:<slug>:wallets`) use lowercase addresses
 *
 *  4. Migrates legacy Battle records:
 *     - Migrates `battle_matches:v2` matches into modern `battle:<id>` records
 *     - Appends legacy matches to `history:user:<wallet>` for participants
 *
 *  5. Reconciles global counters & profiles:
 *     - Reconciles `stats:global.battle_wins`
 *     - Reconciles `leaderboard:battle_wins:all_time` from user profiles
 *     - Reconciles `leaderboard:points` from user profiles
 *     - Reconciles `leaderboard:mints:all_time` from user profiles
 *
 * Usage:
 *   node scripts/merge-all-formats.mjs                # DRY RUN
 *   node scripts/merge-all-formats.mjs --apply        # EXECUTE WRITES
 */

import { Redis } from '@upstash/redis';
import { createHash } from 'node:crypto';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || 'https://flexible-feline-9735.upstash.io';
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || 'ASYHAAImcDFkYmZhZWM5MjQ0YmQ0NDhkODY2NzQ0MmNlYmU4OTFhYnAxOTczNQ';

const redis = new Redis({
    url: UPSTASH_URL,
    token: UPSTASH_TOKEN
});

function log(...parts) {
    console.log(...parts);
}

function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}

/** Scan all keys matching a pattern */
async function scanKeys(pattern = '*') {
    const found = [];
    let cursor = 0;
    do {
        const [next, keys] = await redis.scan(cursor, { match: pattern, count: 1000 });
        cursor = next;
        found.push(...(keys || []));
    } while (cursor !== 0 && cursor !== '0');
    return found;
}

// ── STEP 1: Normalize User Keys & Merge Profiles ────────────────────
async function mergeUserProfiles() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('1. User Profile & Journey Normalization (Mixed-Case → Lowercase)');
    log('═══════════════════════════════════════════════════════════════');

    const allUserKeys = await scanKeys('user:*');
    const mixedCaseKeys = allUserKeys.filter(k => k !== k.toLowerCase());
    log(`Found ${allUserKeys.length} total user keys (${mixedCaseKeys.length} mixed-case)`);

    // Group keys by lowercase wallet
    const wallets = new Set();
    for (const key of allUserKeys) {
        const parts = key.split(':');
        if (parts[1]) wallets.add(parts[1].toLowerCase());
    }

    log(`Total unique wallets found: ${wallets.size}`);

    let profilesMerged = 0;
    let corruptedKeysCleaned = 0;

    for (const wallet of wallets) {
        // Check all profile keys for this wallet (case variants)
        const possibleKeys = allUserKeys.filter(k => k.toLowerCase() === `user:${wallet}:profile`);
        const targetProfileKey = `user:${wallet}:profile`;

        let combinedProfile = {};
        for (const k of possibleKeys) {
            const data = await redis.hgetall(k) || {};
            for (const [field, val] of Object.entries(data)) {
                // Strip corrupted numeric character keys (e.g. '0': 'l', '1': 'a')
                if (/^\d+$/.test(field)) {
                    corruptedKeysCleaned++;
                    continue;
                }

                // If numeric counter, merge by taking max or sum appropriately
                if (['total_mints', 'total_attempts', 'total_failures', 'battle_wins', 'battle_total', 'battle_started', 'total_points', 'streak', 'longest_streak'].includes(field)) {
                    const existingNum = Number(combinedProfile[field]) || 0;
                    const newNum = Number(val) || 0;
                    // For wins/mints/points across case variants, take max
                    combinedProfile[field] = Math.max(existingNum, newNum);
                } else if (['total_volume', 'total_gas'].includes(field)) {
                    const existingFloat = parseFloat(combinedProfile[field]) || 0;
                    const newFloat = parseFloat(val) || 0;
                    combinedProfile[field] = Math.max(existingFloat, newFloat).toString();
                } else if (['last_active', 'first_seen'].includes(field)) {
                    const existingTs = Number(combinedProfile[field]) || 0;
                    const newTs = Number(val) || 0;
                    if (field === 'first_seen') {
                        combinedProfile[field] = (existingTs > 0 && newTs > 0) ? Math.min(existingTs, newTs) : (existingTs || newTs);
                    } else {
                        combinedProfile[field] = Math.max(existingTs, newTs);
                    }
                } else {
                    // String/display metadata (display_name, last_active_date, reputation_score)
                    if (!combinedProfile[field] || (val && String(val).length > String(combinedProfile[field]).length)) {
                        combinedProfile[field] = val;
                    }
                }
            }
        }

        if (Object.keys(combinedProfile).length > 0) {
            const isMixed = possibleKeys.some(k => k !== targetProfileKey);
            if (isMixed || corruptedKeysCleaned > 0) {
                profilesMerged++;
                log(`   Wallet ${wallet}: Merging profile across ${possibleKeys.length} key(s)`);
                if (APPLY) {
                    // Delete old corrupted/mixed-case keys
                    for (const k of possibleKeys) {
                        await redis.del(k);
                    }
                    // Write clean lowercase profile
                    await redis.hset(targetProfileKey, combinedProfile);
                }
            }
        }

        // Merge user journey lists
        const possibleJourneyKeys = allUserKeys.filter(k => k.toLowerCase() === `user:${wallet}:journey`);
        const targetJourneyKey = `user:${wallet}:journey`;
        if (possibleJourneyKeys.length > 1 || possibleJourneyKeys.some(k => k !== targetJourneyKey)) {
            log(`   Wallet ${wallet}: Merging journey across ${possibleJourneyKeys.length} key(s)`);
            const allItems = [];
            for (const jk of possibleJourneyKeys) {
                const items = await redis.lrange(jk, 0, 200) || [];
                allItems.push(...items);
            }

            // Deduplicate items by JSON content / txHash
            const seenHashes = new Set();
            const deduped = [];
            for (const raw of allItems) {
                try {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    const id = parsed.txHash || parsed.battleId || parsed.timestamp || JSON.stringify(parsed);
                    if (!seenHashes.has(id)) {
                        seenHashes.add(id);
                        deduped.push(typeof raw === 'string' ? raw : JSON.stringify(raw));
                    }
                } catch {
                    deduped.push(String(raw));
                }
            }

            if (APPLY) {
                for (const jk of possibleJourneyKeys) {
                    await redis.del(jk);
                }
                if (deduped.length > 0) {
                    const pipe = redis.pipeline();
                    deduped.forEach(item => pipe.rpush(targetJourneyKey, item));
                    pipe.ltrim(targetJourneyKey, 0, 199);
                    await pipe.exec();
                }
            }
        }

        // Merge points_log
        const possiblePointsLog = allUserKeys.filter(k => k.toLowerCase() === `user:${wallet}:points_log`);
        const targetPointsLog = `user:${wallet}:points_log`;
        if (possiblePointsLog.some(k => k !== targetPointsLog)) {
            log(`   Wallet ${wallet}: Merging points_log`);
            const allLogs = [];
            for (const plk of possiblePointsLog) {
                const logs = await redis.lrange(plk, 0, 200) || [];
                allLogs.push(...logs);
            }
            if (APPLY) {
                for (const plk of possiblePointsLog) {
                    await redis.del(plk);
                }
                if (allLogs.length > 0) {
                    const pipe = redis.pipeline();
                    allLogs.forEach(l => pipe.rpush(targetPointsLog, l));
                    pipe.ltrim(targetPointsLog, 0, 199);
                    await pipe.exec();
                }
            }
        }
    }

    log(`✔ User profiles processed: ${profilesMerged} normalized/merged, ${corruptedKeysCleaned} corrupted fields pruned`);
}

// ── STEP 2: Normalize All Leaderboard ZSETs ─────────────────────────
async function mergeLeaderboards() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('2. Leaderboard Normalization (Lowercase Addresses & Dedup)');
    log('═══════════════════════════════════════════════════════════════');

    const allKeys = await scanKeys('*');
    const zsetKeys = [];
    for (let i = 0; i < allKeys.length; i += 100) {
        const slice = allKeys.slice(i, i + 100);
        const pipe = redis.pipeline();
        slice.forEach(k => pipe.type(k));
        const types = await pipe.exec();
        slice.forEach((k, idx) => {
            if (types[idx] === 'zset') zsetKeys.push(k);
        });
    }

    log(`Found ${zsetKeys.length} sorted sets (leaderboards)`);

    for (const key of zsetKeys) {
        // Read with scores
        const raw = await redis.zrange(key, 0, -1, { withScores: true }) || [];
        const memberMap = new Map();
        let hadMixedCase = false;

        for (let i = 0; i < raw.length; i += 2) {
            const originalMember = String(raw[i] || '');
            const normalizedMember = originalMember.toLowerCase();
            const score = parseFloat(raw[i + 1]) || 0;

            if (originalMember !== normalizedMember) {
                hadMixedCase = true;
            }

            // If duplicate (mixed + lower), take max score
            if (memberMap.has(normalizedMember)) {
                hadMixedCase = true;
                const existing = memberMap.get(normalizedMember);
                memberMap.set(normalizedMember, Math.max(existing, score));
            } else {
                memberMap.set(normalizedMember, score);
            }
        }

        if (hadMixedCase) {
            log(`   ZSET ${key}: Normalizing ${raw.length / 2} members -> ${memberMap.size} unique lowercase members`);
            if (APPLY) {
                await redis.del(key);
                const pipe = redis.pipeline();
                for (const [member, score] of memberMap.entries()) {
                    pipe.zadd(key, { score, member });
                }
                await pipe.exec();
            }
        }
    }

    // Merge legacy `global_leaderboard` into `leaderboard:battle_wins:all_time`
    const legacyGlobal = await redis.zrange('global_leaderboard', 0, -1, { withScores: true }) || [];
    if (legacyGlobal.length > 0) {
        log(`\nMerging legacy 'global_leaderboard' (${legacyGlobal.length / 2} members) into 'leaderboard:battle_wins:all_time'`);
        for (let i = 0; i < legacyGlobal.length; i += 2) {
            const member = String(legacyGlobal[i] || '').toLowerCase();
            const score = parseFloat(legacyGlobal[i + 1]) || 0;
            log(`   + ${member}: ${score} wins from legacy global_leaderboard`);
            if (APPLY) {
                const currentScore = await redis.zscore('leaderboard:battle_wins:all_time', member) || 0;
                if (score > currentScore) {
                    await redis.zadd('leaderboard:battle_wins:all_time', { score, member });
                }
            }
        }
        if (APPLY) {
            await redis.del('global_leaderboard');
            log('   ✔ Removed legacy global_leaderboard');
        }
    }
}

// ── STEP 3: Collection Slug & Stats Consolidation ────────────────────
async function mergeCollections() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('3. Collection Key Consolidation (Slug Normalization)');
    log('═══════════════════════════════════════════════════════════════');

    // Merge basemoods -> base-moods
    const oldBaseMoodsStats = await redis.hgetall('collection:basemoods:stats');
    if (oldBaseMoodsStats && Object.keys(oldBaseMoodsStats).length > 0) {
        log(`Merging 'collection:basemoods:stats' into 'collection:base-moods:stats'`, oldBaseMoodsStats);
        const currentStats = await redis.hgetall('collection:base-moods:stats') || {};
        const mergedViews = (Number(currentStats.views) || 0) + (Number(oldBaseMoodsStats.views) || 0);

        if (APPLY) {
            await redis.hset('collection:base-moods:stats', { views: mergedViews });
            await redis.del('collection:basemoods:stats');
            log('   ✔ Merged basemoods stats and deleted legacy key');
        }
    }

    // Lowercase all members in collection:<slug>:wallets SETs
    const walletSets = await scanKeys('collection:*:wallets');
    for (const setKey of walletSets) {
        const members = await redis.smembers(setKey) || [];
        const mixed = members.filter(m => m !== m.toLowerCase());
        if (mixed.length > 0) {
            log(`   SET ${setKey}: Lowercasing ${mixed.length} mixed-case wallet members`);
            if (APPLY) {
                const lowerMembers = [...new Set(members.map(m => m.toLowerCase()))];
                await redis.del(setKey);
                const pipe = redis.pipeline();
                lowerMembers.forEach(m => pipe.sadd(setKey, m));
                await pipe.exec();
            }
        }
    }
}

// ── STEP 4: Migrate Legacy Battle Matches & Challenges ──────────────
async function migrateLegacyBattles() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('4. Legacy Battle Matches & Challenges Migration');
    log('═══════════════════════════════════════════════════════════════');

    const legacyMatches = await redis.hgetall('battle_matches:v2') || {};
    const matchCount = Object.keys(legacyMatches).length;
    log(`Found ${matchCount} matches in legacy 'battle_matches:v2'`);

    for (const [matchKey, rawMatch] of Object.entries(legacyMatches)) {
        try {
            const match = typeof rawMatch === 'string' ? JSON.parse(rawMatch) : rawMatch;
            const attacker = String(match.attacker || '').toLowerCase();
            const defender = String(match.defender || '').toLowerCase();
            const matchId = match.id || matchKey;
            const timestamp = Number(match.timestamp) || Date.now();
            const seed = match.seed || `legacy:${matchId}`;

            // Build standard modern battle record
            const modernRecord = {
                seed,
                players: {
                    p1: { id: attacker, name: 'Attacker' },
                    p2: { id: defender, name: match.winner || 'Defender' }
                },
                options: { isAiBattle: false, isLegacy: true },
                result: {
                    winnerSide: match.winnerSide || (match.winner === 'Void PFPs #34' ? 'P2' : 'P1'),
                    winnerName: match.winner || 'Winner',
                    rounds: 5
                },
                createdAt: timestamp,
                logs: []
            };

            const recordHash = sha256(JSON.stringify({
                seed: modernRecord.seed,
                p1: modernRecord.players.p1,
                p2: modernRecord.players.p2,
                result: modernRecord.result
            }));

            log(`   Match ${matchId}: converting to battle:${recordHash}`);

            if (APPLY) {
                // Save modern battle record with 30-day TTL
                await redis.set(`battle:${recordHash}`, JSON.stringify(modernRecord), { ex: 30 * 24 * 3600 });

                // Append to user histories
                if (attacker) {
                    await redis.lpush(`history:user:${attacker}`, recordHash);
                    await redis.ltrim(`history:user:${attacker}`, 0, 49);
                }
                if (defender && defender !== attacker) {
                    await redis.lpush(`history:user:${defender}`, recordHash);
                    await redis.ltrim(`history:user:${defender}`, 0, 49);
                }
            }
        } catch (err) {
            log(`   Error migrating match ${matchKey}:`, err.message);
        }
    }

    if (APPLY && matchCount > 0) {
        log('   ✔ All legacy matches converted to modern battle records and user histories');
    }
}

// ── STEP 5: Reconcile Global Leaderboards with Profiles ──────────────
async function reconcileAllLeaderboards() {
    log('\n═══════════════════════════════════════════════════════════════');
    log('5. Reconcile Global Counters & Leaderboards Against Profiles');
    log('═══════════════════════════════════════════════════════════════');

    const profileKeys = await scanKeys('user:*:profile');
    log(`Scanning ${profileKeys.length} verified user profiles for authoritative stats...`);

    let totalGlobalBattleWins = 0;
    const battleWinsMap = new Map();
    const pointsMap = new Map();
    const mintsMap = new Map();

    for (let i = 0; i < profileKeys.length; i += 100) {
        const slice = profileKeys.slice(i, i + 100);
        const pipe = redis.pipeline();
        slice.forEach(k => pipe.hgetall(k));
        const profiles = await pipe.exec();

        slice.forEach((k, idx) => {
            const wallet = k.split(':')[1].toLowerCase();
            const prof = profiles[idx] || {};

            const wins = parseInt(prof.battle_wins, 10) || 0;
            const points = parseInt(prof.total_points, 10) || 0;
            const mints = parseInt(prof.total_mints, 10) || 0;

            if (wins > 0) {
                battleWinsMap.set(wallet, wins);
                totalGlobalBattleWins += wins;
            }
            if (points > 0) pointsMap.set(wallet, points);
            if (mints > 0) mintsMap.set(wallet, mints);
        });
    }

    log(`Authoritative Profiles: ${battleWinsMap.size} with wins, ${pointsMap.size} with points, ${mintsMap.size} with mints`);
    log(`Authoritative Global Battle Wins sum: ${totalGlobalBattleWins}`);

    // Reconcile leaderboard:battle_wins:all_time
    log(`Reconciling 'leaderboard:battle_wins:all_time'...`);
    if (APPLY) {
        const pipe = redis.pipeline();
        for (const [wallet, wins] of battleWinsMap.entries()) {
            pipe.zadd('leaderboard:battle_wins:all_time', { score: wins, member: wallet });
        }
        await pipe.exec();
        // Update stats:global
        await redis.hset('stats:global', { battle_wins: totalGlobalBattleWins });
        log('   ✔ leaderboard:battle_wins:all_time and stats:global.battle_wins reconciled');
    }

    // Reconcile leaderboard:points
    log(`Reconciling 'leaderboard:points'...`);
    if (APPLY) {
        const pipe = redis.pipeline();
        for (const [wallet, points] of pointsMap.entries()) {
            pipe.zadd('leaderboard:points', { score: points, member: wallet });
        }
        await pipe.exec();
        log('   ✔ leaderboard:points reconciled');
    }

    // Reconcile leaderboard:mints:all_time
    log(`Reconciling 'leaderboard:mints:all_time'...`);
    if (APPLY) {
        const pipe = redis.pipeline();
        for (const [wallet, mints] of mintsMap.entries()) {
            pipe.zadd('leaderboard:mints:all_time', { score: mints, member: wallet });
        }
        await pipe.exec();
        log('   ✔ leaderboard:mints:all_time reconciled');
    }
}

// ── STEP 6: Execute All ─────────────────────────────────────────────
async function main() {
    log('===============================================================');
    log(APPLY
        ? '🚀 UPSTASH REDIS FORMAT MIGRATION & MERGE — APPLY MODE'
        : '🔍 UPSTASH REDIS FORMAT MIGRATION & MERGE — DRY RUN (no writes)');
    log('===============================================================');

    await mergeUserProfiles();
    await mergeLeaderboards();
    await mergeCollections();
    await migrateLegacyBattles();
    await reconcileAllLeaderboards();

    log('\n═══════════════════════════════════════════════════════════════');
    if (APPLY) {
        log('🎉 ALL OLD AND NEW FORMAT DATA SUCCESSFULLY MERGED & RECONCILED!');
    } else {
        log('🔍 Dry run complete. To execute writes, re-run with:');
        log('   node scripts/merge-all-formats.mjs --apply');
    }
    log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('Fatal error during migration:', err);
    process.exit(1);
});
