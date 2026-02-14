import { kv } from '@vercel/kv';

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { wallet } = req.query;
    if (!wallet) return res.status(400).json({ error: 'Wallet required' });

    const lowerWallet = wallet.toLowerCase();

    // Check if user has Mixed Case data
    // We can't know the exact mixed case without guessing, but let's assume the user provided it?
    // Actually, let's just use the provided wallet as "Source" and lowerWallet as "Target".

    if (wallet === lowerWallet) {
        return res.status(400).json({ error: 'Please provide the Mixed Case wallet address to migrate FROM.' });
    }

    try {
        const sourceKey = wallet;
        const targetKey = lowerWallet;

        // Fetch data
        const [sourceProfile, targetProfile, sourceJourney, targetJourney] = await Promise.all([
            kv.hgetall(`user:${sourceKey}:profile`),
            kv.hgetall(`user:${targetKey}:profile`),
            kv.lrange(`user:${sourceKey}:journey`, 0, -1),
            kv.lrange(`user:${targetKey}:journey`, 0, -1)
        ]);

        if (!sourceProfile) {
            return res.status(404).json({ error: `No profile found for source: ${sourceKey}` });
        }

        // Merge logic
        const mergedProfile = { ...sourceProfile, ...(targetProfile || {}) };

        // Sum numeric fields
        const numericFields = ['total_mints', 'total_attempts', 'total_failures', 'total_points'];
        const floatFields = ['total_volume', 'total_gas'];

        numericFields.forEach(field => {
            const v1 = parseInt(sourceProfile[field] || 0);
            const v2 = parseInt(targetProfile?.[field] || 0);
            mergedProfile[field] = v1 + v2;
        });

        floatFields.forEach(field => {
            const v1 = parseFloat(sourceProfile[field] || 0);
            const v2 = parseFloat(targetProfile?.[field] || 0);
            mergedProfile[field] = v1 + v2;
        });

        // Max fields
        const maxFields = ['longest_streak', 'streak', 'reputation_score'];
        maxFields.forEach(field => {
            const v1 = parseFloat(sourceProfile[field] || 0);
            const v2 = parseFloat(targetProfile?.[field] || 0);
            mergedProfile[field] = Math.max(v1, v2);
        });

        // Min fields
        if (sourceProfile.first_seen && targetProfile?.first_seen) {
            mergedProfile.first_seen = Math.min(parseInt(sourceProfile.first_seen), parseInt(targetProfile.first_seen));
        }

        // Merge Journey (Dedup by txHash if present, or timestamp/type)
        const combinedJourney = [...(sourceJourney || []), ...(targetJourney || [])];
        // Parse if strings
        const parsedJourney = combinedJourney.map(item => typeof item === 'string' ? JSON.parse(item) : item);

        // Dedup logic: filter out items with same txHash
        const seenTx = new Set();
        const uniqueJourney = [];
        for (const item of parsedJourney) {
            if (item.txHash) {
                if (seenTx.has(item.txHash)) continue;
                seenTx.add(item.txHash);
            }
            uniqueJourney.push(item);
        }

        // Sort by timestamp desc
        uniqueJourney.sort((a, b) => b.timestamp - a.timestamp);

        // Save merged data to Target
        const pipe = kv.pipeline();
        pipe.hset(`user:${targetKey}:profile`, mergedProfile);
        pipe.del(`user:${targetKey}:journey`); // Clear existing to overwrite with merged

        // Push in reverse order to maintain list
        for (let i = uniqueJourney.length - 1; i >= 0; i--) {
            pipe.lpush(`user:${targetKey}:journey`, JSON.stringify(uniqueJourney[i]));
        }

        // Delete Source
        pipe.del(`user:${sourceKey}:profile`);
        pipe.del(`user:${sourceKey}:journey`);

        await pipe.exec();

        return res.status(200).json({
            success: true,
            merged: {
                wallet: targetKey,
                profile: mergedProfile,
                journeyCount: uniqueJourney.length
            }
        });

    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({ error: error.message });
    }
}
