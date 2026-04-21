import { $, shortenAddress } from '../../utils/dom.js';
import { normalizeFighter } from '../../lib/battle/metadataNormalizer.js';
import { getActiveChallenges } from '../../lib/game/matchmaking.js';
import { renderIcon } from '../../utils/icons.js';

/**
 * Premium Challenge Board Component
 * Shows AI-driven challenges and player-posted challenges with animated cards.
 */

// ── AI Fighter Pool (expanded for V2) ────────────────────────────
const AI_MINTED_POOL = [
    // BASE_INVADERS
    { collectionId: 'BASE_INVADERS', collectionName: 'BASE_INVADERS', nftId: '402', trait: 'Glitched',
        rawAttributes: [{ trait_type: 'Faction', value: 'GLITCHED' }, { trait_type: 'Body', value: 'Slim' }] },
    { collectionId: 'BASE_INVADERS', collectionName: 'BASE_INVADERS', nftId: '1087', trait: 'Corrupted',
        rawAttributes: [{ trait_type: 'Faction', value: 'CORRUPTED' }, { trait_type: 'Body', value: 'Heavy' }] },
    { collectionId: 'BASE_INVADERS', collectionName: 'BASE_INVADERS', nftId: '733', trait: 'OG',
        rawAttributes: [{ trait_type: 'Faction', value: 'OG' }, { trait_type: 'Body', value: 'Cracked' }] },
    // BASEHEADS_404
    { collectionId: 'BASEHEADS_404', collectionName: 'BASEHEADS_404', nftId: '99', trait: 'Overload',
        rawAttributes: [{ trait_type: 'Mood', value: 'OVERLOAD' }, { trait_type: 'Noise', value: 'MAX' }] },
    { collectionId: 'BASEHEADS_404', collectionName: 'BASEHEADS_404', nftId: '256', trait: 'Rage',
        rawAttributes: [{ trait_type: 'Mood', value: 'RAGE' }, { trait_type: 'Error', value: '404' }] },
    { collectionId: 'BASEHEADS_404', collectionName: 'BASEHEADS_404', nftId: '512', trait: 'Idle',
        rawAttributes: [{ trait_type: 'Mood', value: 'IDLE' }, { trait_type: 'Noise', value: 'HIGH' }] },
    // BaseMoods
    { collectionId: 'BaseMoods', collectionName: 'BaseMoods', nftId: '55', trait: 'Zen',
        rawAttributes: [{ trait_type: 'Mood', value: 'Zen' }, { trait_type: 'Blush', value: 'Yes' }] },
    { collectionId: 'BaseMoods', collectionName: 'BaseMoods', nftId: '128', trait: 'Happy',
        rawAttributes: [{ trait_type: 'Mood', value: 'Happy' }] },
    { collectionId: 'BaseMoods', collectionName: 'BaseMoods', nftId: '200', trait: 'Angry',
        rawAttributes: [{ trait_type: 'Mood', value: 'Angry' }] },
    // VOID_PFPS
    { collectionId: 'VOID_PFPS', collectionName: 'VOID_PFPS', nftId: '12', trait: 'Distortion',
        rawAttributes: [{ trait_type: 'Type', value: 'Distortion' }] },
    { collectionId: 'VOID_PFPS', collectionName: 'VOID_PFPS', nftId: '77', trait: 'Phantom',
        rawAttributes: [{ trait_type: 'Type', value: 'Phantom' }] },
    // QuantumQuills
    { collectionId: 'quantum-quills', collectionName: 'QuantumQuills', nftId: '31', trait: 'Sustain',
        rawAttributes: [] },
    { collectionId: 'quantum-quills', collectionName: 'QuantumQuills', nftId: '88', trait: 'Sustain',
        rawAttributes: [] },
    // BaseFortunes
    { collectionId: 'base-fortunes', collectionName: 'BaseFortunes', nftId: '7', trait: 'Legendary',
        rawAttributes: [{ trait_type: 'Rarity', value: 'Legendary' }] },
    { collectionId: 'base-fortunes', collectionName: 'BaseFortunes', nftId: '42', trait: 'Rare',
        rawAttributes: [{ trait_type: 'Rarity', value: 'Rare' }] },
    { collectionId: 'base-fortunes', collectionName: 'BaseFortunes', nftId: '100', trait: 'Standard',
        rawAttributes: [] },
];

// V2: Item/Arena buff pools for AI loadouts
const AI_ITEM_POOL = [
    { name: 'Neon Rune', collectionSlug: 'neon-runes', stats: { atk: 10, crit: 0.05 } },
    { name: 'Byte Beat', collectionSlug: 'bytebeats', stats: { spd: 10, dodge: 0.03 } },
    { name: 'Neon Shape', collectionSlug: 'neon-shapes', stats: { def: 10, hp: 15 } },
    null, // Some AI don't have items
    null,
];

const AI_ARENA_POOL = [
    { name: 'Mini World', collectionSlug: 'mini-worlds', stats: { hp: 25 } },
    null, // Some AI don't have arenas
    null,
];

// Difficulty tiers: controls AI win rate and whether they get items/arenas
const AI_DIFFICULTY = [
    { label: 'Rookie', aiWinRate: 0.35, canHaveItem: false, canHaveArena: false },
    { label: 'Fighter', aiWinRate: 0.50, canHaveItem: true, canHaveArena: false },
    { label: 'Veteran', aiWinRate: 0.60, canHaveItem: true, canHaveArena: true },
    { label: 'Champion', aiWinRate: 0.75, canHaveItem: true, canHaveArena: true },
];

const COLLECTION_COLORS = {
    'BASE_INVADERS': { border: 'border-emerald-500/40', glow: 'shadow-emerald-500/20', badge: 'bg-emerald-500/20 text-emerald-300', gradient: 'from-emerald-900/30 to-transparent' },
    'BASEHEADS_404': { border: 'border-orange-500/40', glow: 'shadow-orange-500/20', badge: 'bg-orange-500/20 text-orange-300', gradient: 'from-orange-900/30 to-transparent' },
    'BaseMoods': { border: 'border-pink-500/40', glow: 'shadow-pink-500/20', badge: 'bg-pink-500/20 text-pink-300', gradient: 'from-pink-900/30 to-transparent' },
    'VOID_PFPS': { border: 'border-purple-500/40', glow: 'shadow-purple-500/20', badge: 'bg-purple-500/20 text-purple-300', gradient: 'from-purple-900/30 to-transparent' },
    'QuantumQuills': { border: 'border-rose-500/40', glow: 'shadow-rose-500/20', badge: 'bg-rose-500/20 text-rose-300', gradient: 'from-rose-900/30 to-transparent' },
    'BaseFortunes': { border: 'border-amber-500/40', glow: 'shadow-amber-500/20', badge: 'bg-amber-500/20 text-amber-300', gradient: 'from-amber-900/30 to-transparent' },
    'NeonRunes': { border: 'border-cyan-500/40', glow: 'shadow-cyan-500/20', badge: 'bg-cyan-500/20 text-cyan-300', gradient: 'from-cyan-900/30 to-transparent' },
    'ByteBeats': { border: 'border-violet-500/40', glow: 'shadow-violet-500/20', badge: 'bg-violet-500/20 text-violet-300', gradient: 'from-violet-900/30 to-transparent' },
    'NeonShapes': { border: 'border-teal-500/40', glow: 'shadow-teal-500/20', badge: 'bg-teal-500/20 text-teal-300', gradient: 'from-teal-900/30 to-transparent' },
    'MiniWorlds': { border: 'border-sky-500/40', glow: 'shadow-sky-500/20', badge: 'bg-sky-500/20 text-sky-300', gradient: 'from-sky-900/30 to-transparent' },
    '_default': { border: 'border-indigo-500/40', glow: 'shadow-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-300', gradient: 'from-indigo-900/30 to-transparent' }
};

function getColors(collectionName) {
    return COLLECTION_COLORS[collectionName] || COLLECTION_COLORS['_default'];
}

function shuffle(list) {
    return [...list].sort(() => Math.random() - 0.5);
}

function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function buildAiChallenges() {
    const now = Date.now();
    const picked = shuffle(AI_MINTED_POOL).slice(0, 6);
    const results = [];
    for (const entry of picked) {
        try {
            const difficulty = pickRandom(AI_DIFFICULTY);
            const fighterStats = normalizeFighter(entry.collectionId, entry.nftId, entry.rawAttributes);

            // V2: Optionally equip item and arena based on difficulty
            const item = difficulty.canHaveItem ? pickRandom(AI_ITEM_POOL) : null;
            const arena = difficulty.canHaveArena ? pickRandom(AI_ARENA_POOL) : null;

            results.push({
                id: `ai_${entry.collectionId}_${entry.nftId}_${results.length}_${now}`,
                collectionName: entry.collectionName,
                nftId: entry.nftId,
                stats: fighterStats,
                trait: entry.trait,
                isAi: true,
                mintedToken: true,
                aiWinRate: difficulty.aiWinRate,
                difficulty: difficulty.label,
                // V2 loadout schema
                loadout: {
                    fighter: {
                        collectionSlug: entry.collectionId,
                        collectionName: entry.collectionName,
                        tokenId: entry.nftId,
                        nftId: entry.nftId,
                        stats: fighterStats,
                        role: 'FIGHTER',
                    },
                    item: item,
                    arena: arena,
                    teamSnapshot: [],
                    schemaVersion: 'battle-loadout-v1',
                },
            });
        } catch (e) {
            console.warn(`[AI Pool] Skipped ${entry.collectionId} #${entry.nftId}:`, e.message);
        }
    }
    return results;
}

function formatTimestamp(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

export class ChallengeBoard {
    constructor(containerId, onPreviewRequested, onPostRequested) {
        this.container = $(`#${containerId}`);
        this.onPreviewRequested = onPreviewRequested;
        this.onPostRequested = onPostRequested;
        this.challenges = [];
    }

    async loadChallenges() {
        const userChallenges = await getActiveChallenges();
        const aiChallenges = buildAiChallenges();
        this.challenges = [...userChallenges, ...aiChallenges];
        this.render();
    }

    render() {
        const totalChallenges = this.challenges.length;
        const aiCount = this.challenges.filter(c => c.isAi).length;
        const pvpCount = totalChallenges - aiCount;

        this.container.innerHTML = `
            <!-- Hero Section -->
            <div class="text-center py-8 mb-4 relative">
                <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent rounded-3xl"></div>
                <div class="relative">
                    <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] uppercase tracking-[0.2em] font-bold mb-4">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                        Live Arena
                    </div>
                    <h2 class="text-3xl md:text-4xl font-black mb-3 bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400">
                        Battle Arena
                    </h2>
                    <p class="text-slate-400 text-sm max-w-md mx-auto">
                        Choose your opponent. Pick your fighter. Enter the arena.
                    </p>
                    <div class="flex justify-center gap-4 mt-4 text-xs text-slate-500">
                        <span>${aiCount} AI</span>
                        <span class="text-slate-700">·</span>
                        <span>${pvpCount} PvP</span>
                        <span class="text-slate-700">·</span>
                        <span>${totalChallenges} Total</span>
                    </div>
                </div>
            </div>

            <!-- Post Challenge CTA -->
            <div class="flex justify-center mb-8">
                <button id="post-challenge-btn" class="group relative px-8 py-3.5 rounded-2xl font-bold transition-all active:scale-95 overflow-hidden">
                    <div class="absolute inset-0 bg-gradient-to-r from-red-500 to-orange-500 group-hover:from-red-600 group-hover:to-orange-600 transition-all"></div>
                    <div class="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-red-400/20 to-orange-400/20 blur-xl"></div>
                    <span class="relative flex items-center gap-2 text-white">
                        ${renderIcon('SWORDS', 'w-5 h-5')}
                        Post New Challenge
                    </span>
                </button>
            </div>

            <!-- Challenges Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="challenges-grid">
                ${this.challenges.map((challenge, idx) => this.renderCard(challenge, idx)).join('')}
            </div>
        `;

        $('#post-challenge-btn').addEventListener('click', () => this.onPostRequested());

        this.challenges.forEach((challenge) => {
            const btn = $(`#challenge-btn-${challenge.id}`);
            if (btn) {
                btn.addEventListener('click', () => this.onPreviewRequested(challenge));
            }
        });
    }

    renderCard(challenge, index) {
        const isAi = challenge.isAi;
        const colors = getColors(challenge.collectionName);
        const stats = challenge.stats || {};
        const delay = index * 0.08;

        return `
            <div class="group p-5 rounded-2xl bg-gradient-to-b ${colors.gradient} backdrop-blur-sm border ${colors.border} hover:shadow-lg hover:${colors.glow} transition-all duration-300 relative overflow-hidden animate-fade-in"
                 style="animation-delay: ${delay}s">

                <!-- Subtle corner glow -->
                <div class="absolute -top-12 -right-12 w-24 h-24 rounded-full bg-white/[0.03] blur-2xl group-hover:bg-white/[0.06] transition-all"></div>

                <!-- Header: Type Badge + Time -->
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] font-black uppercase tracking-[0.15em] px-2.5 py-1 rounded-lg flex items-center gap-1.5 ${isAi ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'}">
                            ${isAi ? `${renderIcon('SKULL', 'w-3 h-3')} AI` : `${renderIcon('SWORDS', 'w-3 h-3')} PvP`}
                        </span>
                        ${challenge.mintedToken ? `<span class="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">${renderIcon('TROPHY', 'w-3 h-3')} On-chain</span>` : ''}
                    </div>
                    <span class="text-[10px] text-slate-600">${formatTimestamp(challenge.timestamp)}</span>
                </div>

                <!-- Fighter Info -->
                <div class="flex items-center gap-4 mb-4">
                    <div class="w-14 h-14 rounded-xl bg-slate-800/80 border border-white/5 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        ${challenge.imageUrl
                ? `<img src="${challenge.imageUrl}" class="w-full h-full object-cover" alt="NFT" />`
                : `<span class="text-xl font-black ${isAi ? 'text-red-400/50' : 'text-indigo-400/50'}">${isAi ? 'AI' : '#'}</span>`
            }
                    </div>
                    <div class="min-w-0 flex-1">
                        <h3 class="font-bold text-sm truncate text-white/90">${challenge.collectionName || challenge.collectionId || 'Unknown'} #${challenge.nftId || challenge.tokenId || '?'}</h3>
                        ${isAi
                ? `<p class="text-[11px] text-red-400/60 font-semibold uppercase tracking-wider">AI Opponent</p>`
                : `<p class="text-[11px] text-slate-500 font-mono truncate" title="${challenge.player || challenge.creator}">${shortenAddress(challenge.player || challenge.creator)}</p>`
            }
                    </div>
                </div>

                <!-- Trait + Difficulty + Loadout Badges -->
                <div class="flex items-center gap-2 mb-4 flex-wrap">
                    <span class="text-[10px] px-2 py-0.5 rounded-md ${colors.badge} font-medium tracking-tight">${challenge.trait}</span>
                    ${isAi && challenge.difficulty ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10 font-medium">${challenge.difficulty}</span>` : ''}
                    ${challenge.loadout?.item ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/20 font-bold flex items-center gap-1">${renderIcon('MAGIC', 'w-2.5 h-2.5')} ITEM</span>` : ''}
                    ${challenge.loadout?.arena ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/20 font-bold flex items-center gap-1">${renderIcon('MAP', 'w-2.5 h-2.5')} ARENA</span>` : ''}
                </div>

                <!-- Stat Bars Preview -->
                <div class="grid grid-cols-4 gap-1.5 mb-4">
                    ${this.renderMiniStat('HP', stats.hp, 250, '#10b981')}
                    ${this.renderMiniStat('ATK', stats.atk, 50, '#ef4444')}
                    ${this.renderMiniStat('DEF', stats.def, 50, '#3b82f6')}
                    ${this.renderMiniStat('SPD', stats.spd, 50, '#f59e0b')}
                </div>

                <!-- Fight Button -->
                <button id="challenge-btn-${challenge.id}"
                    class="w-full py-2.5 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]
                    ${isAi
                ? 'bg-red-500/10 hover:bg-red-500/25 text-red-300 border border-red-500/20 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/10'
                : 'bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/20 hover:border-indigo-500/40 hover:shadow-lg hover:shadow-indigo-500/10'
            } flex items-center justify-center gap-2">
                    ${isAi ? `${renderIcon('SKULL', 'w-3.5 h-3.5')} FIGHT AI` : `${renderIcon('SWORDS', 'w-3.5 h-3.5')} ACCEPT CHALLENGE`}
                </button>
            </div>
        `;
    }

    renderMiniStat(label, value, max, color) {
        const pct = Math.min(100, Math.max(5, ((value || 0) / max) * 100));
        return `
            <div class="text-center">
                <div class="text-[9px] text-slate-500 font-medium mb-0.5">${label}</div>
                <div class="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-500" style="width: ${pct}%; background: ${color}"></div>
                </div>
                <div class="text-[10px] font-mono text-slate-400 mt-0.5">${value || '?'}</div>
            </div>
        `;
    }

    hide() {
        this.container.classList.add('hidden');
    }

    show() {
        this.container.classList.remove('hidden');
        this.loadChallenges();
    }
}
