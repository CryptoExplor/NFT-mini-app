/**
 * Battle Arena growth system.
 * Generates short social copy and lightweight outcome analysis.
 */

const TAG_BASE = '@base';
// NOTE: Do NOT hardcode individual user tags. Tagging the same users on every
// generated post will trigger Farcaster spam filters. Use channel tags only.
const TAG_USERS = [];

const GROWTH_TEMPLATES = {
    DAY_1: {
        title: 'Status Flex',
        copy: (rank) => `Just entered the Arena.\n\nAlready climbed to **${rank} rank**.\n\nThink your NFT is stronger?\n\nFight me.`,
        cta: 'Can you beat me?'
    },
    DAY_2: {
        title: 'Near Loss',
        copy: (hp) => `Lost by **${hp} HP**.\n\nRematch already queued.\n\nThis one hurt.\n\nTry this fight.`,
        cta: 'Try it here'
    },
    DAY_3: {
        title: 'Tournament Push',
        copy: (pos) => `48h left in tournament.\n\nI'm sitting at **#${pos}**.\n\nTop 10 is within reach.\n\nClimb with me.`,
        cta: 'Try it here'
    },
    DAY_4: {
        title: 'Replay Viral',
        copy: () => `This comeback was insane.\n\nRound 3 -> 1 HP -> win.\n\nWatch it.`,
        cta: 'Can you beat me?'
    },
    DAY_5: {
        title: 'Daily Boss',
        copy: (percent = 12) => `Only **${percent}% beat today's boss**.\n\nTook me 3 tries.\n\nWorth it.\n\nTry your luck.`,
        cta: 'Try it here'
    },
    DAY_6: {
        title: 'Meta Strategy',
        copy: () => `Small tip.\n\nDEF > ATK in mid-game.\n\nSaved me twice today.\n\nTest your build.`,
        cta: 'Try it here'
    },
    DAY_7: {
        title: 'Weekly Reset',
        copy: (pos = 18) => `Tournament ended.\n\nFinished **#${pos}**.\n\nNot good enough.\n\nNew week starts now.\n\nFresh grind.`,
        cta: 'Try it here'
    }
};

const BONUS_TEMPLATES = {
    CHALLENGE: {
        copy: (rank) => `I'm climbing fast.\n\nCurrent rank: ${rank}.\n\nCan you beat me?`
    },
    LEADERBOARD: {
        copy: (topPlayers) => `Top players today.\n\n${topPlayers.map((p, i) => `${i + 1}. ${p.name} - ${p.rank}`).join('\n')}\n\nEnter arena.`
    }
};

export function analyzeOutcome(result, logs) {
    if (!result || !logs || logs.length === 0) return null;

    const lastLog = logs[logs.length - 1];
    const totalRounds = lastLog.round;
    const playerWon = result.playerWon;

    if (!playerWon && lastLog.defenderHp > 0 && lastLog.defenderHp < 5) {
        return { type: 'NEAR_LOSS', value: Math.ceil(lastLog.defenderHp) };
    }

    if (playerWon && totalRounds >= 10) {
        const playerCritical = logs.some((log) => log.attackerHp < 10 || log.defenderHp < 10);
        if (playerCritical) return { type: 'COMEBACK' };
    }

    const initialHp = logs[0].attackerHp + logs[0].damage;
    if (playerWon && lastLog.attackerHp > initialHp * 0.7) {
        return { type: 'BIG_WIN' };
    }

    return null;
}

export async function generateGrowthPost(type, context = {}) {
    let content = '';
    let usedTemplate = null;

    try {
        const response = await fetch('/api/generate-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
                rank: context.rank || 'Warrior',
                position: context.pos,
                hp_diff: context.value,
                wallet: context.wallet || window.ethereum?.selectedAddress || 'anonymous'
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && data.text) {
                content = data.text;
            }
        }
    } catch (error) {
        console.warn('Failed to fetch AI post, falling back to static templates', error);
    }

    if (!content) {
        if (type.startsWith('DAY_')) {
            usedTemplate = GROWTH_TEMPLATES[type] || GROWTH_TEMPLATES.DAY_1;
            content = usedTemplate.copy(context.value || context.rank || 'Warrior');
        } else if (type === 'NEAR_LOSS') {
            usedTemplate = GROWTH_TEMPLATES.DAY_2;
            content = usedTemplate.copy(context.value || 5);
        } else if (type === 'COMEBACK') {
            usedTemplate = GROWTH_TEMPLATES.DAY_4;
            content = usedTemplate.copy();
        } else if (type === 'DAILY_BOSS') {
            usedTemplate = GROWTH_TEMPLATES.DAY_5;
            content = usedTemplate.copy(context.percent || 12);
        } else if (type === 'LEADERBOARD') {
            usedTemplate = BONUS_TEMPLATES.LEADERBOARD;
            content = usedTemplate.copy(context.topPlayers || []);
        } else {
            usedTemplate = BONUS_TEMPLATES.CHALLENGE;
            content = usedTemplate.copy(context.rank || 'Elite');
        }
    }

    const endText = usedTemplate
        ? (usedTemplate.cta ? `\n\n${usedTemplate.cta}` : '\n\nCan you beat me?')
        : '';
    const tags = TAG_USERS.length
        ? `\n\n${TAG_BASE} ${TAG_USERS.join(' ')}`
        : `\n\n${TAG_BASE}`;

    return {
        text: content + endText + tags,
        url: context.url
    };
}

export function getGrowthCycleDay(address) {
    if (!address) return 1;
    const key = `growth_cycle_${address}`;
    const stored = localStorage.getItem(key);
    const now = Date.now();

    if (!stored) {
        localStorage.setItem(key, JSON.stringify({ day: 1, lastUpdate: now }));
        return 1;
    }

    const data = JSON.parse(stored);
    const daysSinceLast = Math.floor((now - data.lastUpdate) / (24 * 60 * 60 * 1000));

    if (daysSinceLast >= 1) {
        // BUG-05 fix: advance by actual days elapsed (capped at 7) so the cycle
        // stays aligned with the calendar when the user returns after an absence.
        const daysToAdvance = Math.min(daysSinceLast, 7);
        data.day = ((data.day - 1 + daysToAdvance) % 7) + 1;
        data.lastUpdate = now;
        localStorage.setItem(key, JSON.stringify(data));
    }

    return data.day;
}
