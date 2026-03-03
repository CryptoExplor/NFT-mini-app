import { kv } from '@vercel/kv';
import { BOSS_CONFIG, REDIS_KEYS } from '../_lib/arcadeConfig.js';
import { setCors } from '../_lib/cors.js';

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'GET,OPTIONS',
        headers: 'Content-Type'
    });
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        let currentHp = await kv.get(REDIS_KEYS.BOSS_HP);

        // Initialize if not set
        if (currentHp === null) {
            currentHp = BOSS_CONFIG.maxHp;
            await kv.set(REDIS_KEYS.BOSS_HP, currentHp);
        }

        return res.status(200).json({
            success: true,
            boss: {
                ...BOSS_CONFIG,
                currentHp: parseInt(currentHp)
            },
            timestamp: Date.now()
        });
    } catch (err) {
        console.error('Failed to get boss status', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
