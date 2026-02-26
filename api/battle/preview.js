import { normalizeFighter } from '../../src/lib/battle/metadataNormalizer.js';

// Mock DB reference
const KV = {
    challenges: new Map() // Would be injected
};

/**
 * GET /api/battle/preview/:challengeId
 * 
 * Returns the hashed stats of the defender so the client can render 
 * the Match Preview screen before committing to the fight.
 */
export async function getMatchPreview(req, res) {
    const { challengeId } = req.params;

    const challenge = KV.challenges.get(challengeId);
    if (!challenge || challenge.status !== 'OPEN') {
        return res.status(404).json({ error: 'Challenge not available.' });
    }

    // In a real DB, we could optionally re-fetch dynamic stats from the provider
    // and re-verify the snapshot here to warn the user early if it drifted.

    // For MVP, we pass the static snapshot payload back for the UI.
    return res.status(200).json({
        challengeId: challenge.id,
        defender: challenge.creator,
        collectionId: challenge.collectionId,
        tokenId: challenge.tokenId,
        stats: challenge.stats, // Needed for MatchPreview UI
        snapshotHash: challenge.snapshotHash // Passed back in /fight payload
    });
}

/**
 * POST /api/battle/preview/evaluate (Optional helper)
 * Allows client to preview what their OWN normalized stats will look like 
 * before clicking "Challenge" or "Fight".
 */
export async function evaluateMyFighter(req, res) {
    const { collectionId, tokenId, rawMetadata } = req.body;

    try {
        const stats = normalizeFighter(collectionId, tokenId, rawMetadata);
        return res.status(200).json({ stats });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }
}
