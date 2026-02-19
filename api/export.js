import { kv } from '@vercel/kv';
import { requireAdmin } from './lib/authMiddleware.js';

const BATCH_SIZE = 1000;

/**
 * Sanitize CSV cell values to prevent formula injection.
 * Wraps in double quotes and escapes existing quotes.
 */
function csvSafe(value) {
    const str = String(value ?? '');
    return '"' + str.replace(/"/g, '""') + '"';
}

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

    // Admin auth
    const auth = await requireAdmin(req);
    if (!auth) return res.status(403).json({ error: 'Unauthorized' });

    const { type } = req.query;

    try {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${type}-${new Date().toISOString().split('T')[0]}.csv"`);

        if (type === 'users') {
            await streamUsersCSV(res);
        } else if (type === 'collections') {
            await streamCollectionsCSV(res);
        } else if (type === 'mints') {
            await streamMintsCSV(res);
        } else {
            return res.status(400).json({ error: 'Invalid type' });
        }

        res.end();

    } catch (error) {
        console.error('Export error:', error);
        // If headers sent, we can't send JSON error, just end stream
        if (!res.headersSent) {
            return res.status(500).json({ error: 'Export failed' });
        }
        res.end();
    }
}

async function streamUsersCSV(res) {
    res.write('Wallet,Total Points,Total Mints,Total Volume,Streak,Badge,First Seen,Last Active\n');

    let cursor = 0;
    do {
        // Scan leaderboard:points zset
        const result = await kv.zscan('leaderboard:points', cursor, { count: BATCH_SIZE });
        cursor = result[0];
        const rawMembers = result[1]; // [member, score, member, score...]

        const wallets = [];
        for (let i = 0; i < rawMembers.length; i += 2) {
            wallets.push(rawMembers[i]);
        }

        if (wallets.length === 0) continue;

        // Fetch profiles
        const pipe = kv.pipeline();
        wallets.forEach(w => pipe.hgetall(`user:${w}:profile`));
        const profiles = await pipe.exec();

        for (let i = 0; i < wallets.length; i++) {
            const wallet = wallets[i];
            const p = profiles[i] || {};
            const streak = parseInt(p.streak) || 0;

            let badge = '';
            if (streak >= 30) badge = 'Legendary';
            else if (streak >= 14) badge = 'Streak Master';
            else if (streak >= 7) badge = 'Committed';
            else if (streak >= 3) badge = 'Rising';

            const row = [
                csvSafe(wallet),
                p.total_points || 0,
                p.total_mints || 0,
                parseFloat(p.total_volume || 0).toFixed(6),
                streak,
                csvSafe(badge),
                p.first_seen ? new Date(parseInt(p.first_seen)).toISOString() : '',
                p.last_active ? new Date(parseInt(p.last_active)).toISOString() : ''
            ].join(',');

            res.write(row + '\n');
        }
    } while (cursor !== 0 && cursor !== '0');
}

async function streamCollectionsCSV(res) {
    res.write('Slug,Views,Mints,Attempts,Failures,Volume,Unique Wallets\n');

    let cursor = 0;
    do {
        // Scan for collection stats keys
        const result = await kv.scan(cursor, { match: 'collection:*:stats', count: BATCH_SIZE });
        cursor = result[0];
        const keys = result[1];

        if (keys.length === 0) continue;

        const slugs = keys.map(k => k.split(':')[1]);
        const pipe = kv.pipeline();

        slugs.forEach(slug => {
            pipe.hgetall(`collection:${slug}:stats`);
            pipe.scard(`collection:${slug}:wallets`);
        });

        const data = await pipe.exec();

        for (let i = 0; i < slugs.length; i++) {
            const stats = data[i * 2] || {};
            const count = data[i * 2 + 1] || 0;

            const row = [
                csvSafe(slugs[i]),
                stats.views || 0,
                stats.mints || 0,
                stats.attempts || 0,
                stats.failures || 0,
                parseFloat(stats.volume || 0).toFixed(6),
                count
            ].join(',');

            res.write(row + '\n');
        }
    } while (cursor !== 0 && cursor !== '0');
}

async function streamMintsCSV(res) {
    res.write('Timestamp,TxHash,Wallet,Collection,Price,Type\n');

    const total = await kv.llen('log:mints');
    let offset = 0;

    while (offset < total) {
        const logs = await kv.lrange('log:mints', offset, offset + BATCH_SIZE - 1);
        if (!logs.length) break;

        for (const item of logs) {
            try {
                const data = JSON.parse(item);
                const type = data.price > 0 ? 'paid' : 'free';
                const row = [
                    new Date(data.timestamp).toISOString(),
                    csvSafe(data.txHash || ''),
                    csvSafe(data.wallet),
                    csvSafe(data.collection),
                    data.price || 0,
                    type
                ].join(',');

                res.write(row + '\n');
            } catch { }
        }

        offset += BATCH_SIZE;
    }
}
