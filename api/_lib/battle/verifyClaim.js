/**
 * Battle claim verification
 * ─────────────────────────
 * The arena ladder (wins, points, rank) must only ever move for a battle the
 * SERVER produced and stored:
 *
 *   - PvP  → resolved in fight.js, server-simulated, stored via saveBattleRecord
 *   - AI   → re-simulated and verified in record.js before being stored
 *
 * Without this, `POST /api/track {type:'battle_result_v2', metadata:{won:true}}`
 * was enough for any authenticated wallet to mint unlimited wins and points.
 *
 * verifyBattleClaim() ties a tracking event to a stored battle record:
 *   1. the battleId must exist
 *   2. the claiming wallet must be a participant
 *   3. the outcome is taken FROM THE RECORD (a lying `won` flag is overridden)
 *   4. each (battleId, wallet) pair can only ever be counted once
 */

const COUNTED_TTL_SECONDS = 30 * 24 * 60 * 60; // matches the replay record TTL

const BATTLE_ID_RE = /^[a-f0-9]{64}$/i;

export function isValidBattleId(value) {
    return typeof value === 'string' && BATTLE_ID_RE.test(value);
}

export function countedKey(battleId, wallet) {
    return `battle:counted:${battleId}:${String(wallet).toLowerCase()}`;
}

/**
 * Reserve the (battleId, wallet) pair. Returns true when this call won the
 * race (i.e. the battle had not been counted for that wallet yet).
 */
export async function reserveBattleCount(kv, battleId, wallet) {
    const result = await kv.set(countedKey(battleId, wallet), 1, {
        ex: COUNTED_TTL_SECONDS,
        nx: true
    });
    // Upstash returns 'OK' when the key was set, null when NX rejected it.
    return result === 'OK' || result === true;
}

/**
 * @returns {Promise<{verified: boolean, won?: boolean, isAi?: boolean,
 *                    opponent?: string|null, reason?: string}>}
 */
export async function verifyBattleClaim(kv, wallet, metadata = {}) {
    const battleId = metadata?.battleId;
    const claimant = String(wallet || '').toLowerCase();

    if (!claimant || claimant === 'anonymous') {
        return { verified: false, reason: 'no_wallet' };
    }

    if (!isValidBattleId(battleId)) {
        return { verified: false, reason: 'missing_battle_id' };
    }

    let record;
    try {
        const raw = await kv.get(`battle:${battleId}`);
        record = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
        return { verified: false, reason: 'record_unreadable' };
    }

    if (!record?.players) {
        return { verified: false, reason: 'record_not_found' };
    }

    const p1Id = String(record.players.p1?.id || '').toLowerCase();
    const p2Id = String(record.players.p2?.id || '').toLowerCase();

    let side = null;
    if (p1Id === claimant) side = 'P1';
    else if (p2Id === claimant) side = 'P2';

    if (!side) {
        return { verified: false, reason: 'not_a_participant' };
    }

    // Outcome comes from the stored record, never from the client.
    const won = record.result?.winnerSide === side;
    const isAi = Boolean(record.options?.isAiBattle);
    const opponentName = side === 'P1'
        ? (record.players.p2?.name || null)
        : (record.players.p1?.name || null);

    const reserved = await reserveBattleCount(kv, battleId, claimant);
    if (!reserved) {
        return { verified: false, reason: 'already_counted', won, isAi };
    }

    return {
        verified: true,
        won,
        isAi,
        opponent: opponentName,
        rounds: Number(record.result?.rounds) || 0
    };
}
