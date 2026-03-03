import { kv } from '@vercel/kv';
import { normalizeFighter, normalizeItemStats, normalizeArenaStats, applyLayer, clampStats } from '../../src/lib/battle/metadataNormalizer.js';
import { simulateBattle, summarizeReplay } from '../../src/lib/game/engine.js';
import { setCors } from '../_lib/cors.js';
import { requireAuth } from '../_lib/authMiddleware.js';
import { BOSS_CONFIG, REDIS_KEYS } from '../_lib/arcadeConfig.js';
import crypto from 'crypto';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { loadout, walletAddress } = req.body;

        if (!loadout?.fighter || !walletAddress) {
            return res.status(400).json({ error: 'Missing loadout or wallet address' });
        }

        // Auth Validation (SIWE)
        const auth = await requireAuth(req);
        if (!auth || !auth.authenticated || auth.wallet.toLowerCase() !== walletAddress.toLowerCase()) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or missing wallet signature.' });
        }

        // 1. Daily Raid Lock
        const today = new Date().toISOString().split('T')[0];
        const lockKey = `${REDIS_KEYS.DAILY_RAID}:${today}:${walletAddress.toLowerCase()}`;
        const hasRaided = await kv.get(lockKey);

        if (hasRaided) {
            return res.status(429).json({ error: 'You have already raided today. Come back tomorrow!' });
        }

        // 2. Normalize Player Stats
        const { engineId, nftId, rawAttributes } = loadout.fighter;
        let pStats = normalizeFighter(engineId, nftId, rawAttributes);

        if (loadout.item) {
            const itemStats = normalizeItemStats(loadout.item.engineId, loadout.item.nftId, loadout.item.rawAttributes);
            pStats = applyLayer(pStats, itemStats);
        }
        if (loadout.arena) {
            const arenaStats = normalizeArenaStats(loadout.arena.engineId, loadout.arena.nftId, loadout.arena.rawAttributes);
            pStats = applyLayer(pStats, arenaStats);
        }
        pStats = clampStats(pStats);

        // 3. Setup Seeded Battle
        const matchSeed = crypto.randomBytes(4).toString('hex');
        let a = parseInt(matchSeed, 16);
        const prng = () => {
            let t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };

        // 4. Run Simulation vs Boss Avatar
        const bossStats = BOSS_CONFIG.stats;
        const fullLog = simulateBattle(pStats, bossStats, prng, {
            playerTeam: loadout.teamSnapshot || [],
            enemyTeam: [], // Boss has no team (for now)
            isAiBattle: true
        });

        const summary = summarizeReplay(fullLog);

        // Calculate damage dealt to Boss by P1
        const totalDamage = fullLog.logs
            .filter(l => l.attackerSide === 'P1' && l.damage)
            .reduce((sum, l) => sum + l.damage, 0);

        // 5. Update Global State Atomically
        const pipe = kv.pipeline();

        // Subtract HP (floor at 0)
        pipe.decrby(REDIS_KEYS.BOSS_HP, totalDamage);

        // Update Leaderboard (ZINCRBY for all-time contribution)
        pipe.zincrby(REDIS_KEYS.RAID_LEADERBOARD, totalDamage, walletAddress.toLowerCase());

        // Set Daily Lock
        pipe.set(lockKey, 1, { ex: 86400 }); // Expire in 24h

        await pipe.exec();

        // Ensure HP doesn't stay negative in UI view (though status endpoint handles it)
        const finalHp = await kv.get(REDIS_KEYS.BOSS_HP);
        if (finalHp < 0) await kv.set(REDIS_KEYS.BOSS_HP, 0);

        return res.status(200).json({
            success: true,
            bossName: BOSS_CONFIG.name,
            damageDealt: totalDamage,
            playerWon: summary.winner === pStats.name, // Unlikely but possible
            seed: matchSeed,
            replayLogs: fullLog.logs,
            newBossHp: Math.max(0, finalHp)
        });

    } catch (err) {
        console.error('Raid error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
