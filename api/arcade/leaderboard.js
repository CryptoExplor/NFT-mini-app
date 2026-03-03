import { kv } from '@vercel/kv';
import { REDIS_KEYS } from '../_lib/arcadeConfig.js';
import { setCors } from '../_lib/cors.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Get top 10 raiders from the sorted set
        const raiders = await kv.zrange(REDIS_KEYS.RAID_LEADERBOARD, 0, 9, {
            rev: true,
            withScores: true
        });

        const formatted = [];
        for (let i = 0; i < raiders.length; i += 2) {
            formatted.push({
                wallet: raiders[i],
                totalDamage: parseInt(raiders[i + 1])
            });
        }

        return res.status(200).json({
            success: true,
            leaderboard: formatted,
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('Failed to get raid leaderboard', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
