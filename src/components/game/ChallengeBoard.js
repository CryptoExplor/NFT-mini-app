import { $, shortenAddress } from '../../utils/dom.js';
import { normalizeFighter } from '../../lib/battle/metadataNormalizer.js';
import { getActiveChallenges } from '../../lib/game/matchmaking.js';
import { renderIcon } from '../../utils/icons.js';
import { escapeHtml, sanitizeUrl } from '../../utils/html.js';
import { getDailyBoss, checkBossVictory } from '../../lib/game/dailyBoss.js';
import { getGlobalLeaderboard, getPlayerPoints } from '../../lib/game/points.js';
import { getRankByPoints, formatRankBadge } from '../../lib/game/rankSystem.js';
import { getAccount } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';
import { getPlayerTournamentStatus } from '../../lib/game/tournament.js';

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

        const account = getAccount(wagmiAdapter.wagmiConfig);
        const playerPoints = getPlayerPoints(account?.address);
        const playerRank = getRankByPoints(playerPoints);
        
        // Async fetch for leaderboard - we can use the mock for now
        const leaderboard = JSON.parse(localStorage.getItem('arena_leaderboard_mock') || '[]');
        const topPlayer = leaderboard[0];

        this.container.innerHTML = `
            <!-- Hero Section -->
            <div class="relative py-10 mb-6 overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 backdrop-blur-md">
                <div class="absolute inset-0 bg-gradient-to-b from-indigo-500/10 to-transparent"></div>
                
                <div class="relative flex flex-col md:flex-row items-center justify-between px-8 gap-8">
                    <!-- Left: Main Title -->
                    <div class="text-center md:text-left">
                        <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] uppercase tracking-[0.2em] font-bold mb-4">
                            <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                            Live Arena
                        </div>
                        <h2 class="text-4xl md:text-5xl font-black mb-2 bg-clip-text text-transparent bg-gradient-to-r from-white via-indigo-200 to-indigo-400 italic tracking-tighter">
                            BATTLE ARENA
                        </h2>
                        <div class="flex items-center justify-center md:justify-start gap-4 text-xs text-slate-500 font-medium">
                            <span class="flex items-center gap-1.5">${renderIcon('SWORDS', 'w-3.5 h-3.5')} ${totalChallenges} ACTIVE</span>
                            <span class="w-1 h-1 rounded-full bg-slate-800"></span>
                            <span class="flex items-center gap-1.5">${renderIcon('USER', 'w-3.5 h-3.5')} ${pvpCount} PLAYERS</span>
                        </div>
                    </div>

                    <!-- Right: Competitive Stats -->
                    <div class="flex flex-wrap justify-center gap-4">
                        <!-- Next Goal (Retention Hook) -->
                        <div class="px-5 py-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center gap-2 group min-w-[140px]">
                            <div class="text-[10px] text-slate-500 uppercase font-black tracking-widest">Next Goal</div>
                            <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5">
                                <div class="h-full bg-indigo-400 rounded-full shadow-[0_0_10px_rgba(129,140,248,0.5)]" style="width: ${Math.min(95, (playerPoints % 100))}%;"></div>
                            </div>
                            <div class="text-[10px] font-bold text-white/60 tracking-tight">${100 - (playerPoints % 100)} pts to next tier</div>
                        </div>

                        <!-- My Status -->
                        <div class="px-5 py-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center gap-4">
                            <div class="text-right">
                                <div class="text-[10px] text-indigo-400 uppercase font-black tracking-widest mb-1">Your Rank</div>
                                ${formatRankBadge(playerRank)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Tournament Banner (Urgency Layer) -->
            ${this.renderTournamentBanner()}

            <!-- Featured Highlights (Social Layer) -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                ${this.renderFeaturedBattle()}
                ${this.renderTopPlayerShowcase()}
            </div>

            <!-- Daily Boss Banner (Retention Layer) -->
            ${this.renderDailyBossBanner()}

            <!-- Just One More? (Session Hook) -->
            <div class="flex flex-col items-center mb-10 text-center">
                <div class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mb-3 opacity-50">Master the Arena</div>
                <h3 class="text-xl font-bold text-white mb-6">Forge your legacy in combat</h3>
                <div class="w-24 h-1 bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent mb-8"></div>
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

        // Daily Boss Event
        const boss = getDailyBoss();
        const bossBtn = $(`#fight-boss-btn-${boss.id}`);
        if (bossBtn) {
            bossBtn.addEventListener('click', () => this.onPreviewRequested(boss));
        }

        this.challenges.forEach((challenge) => {
            const btn = $(`#challenge-btn-${challenge.id}`);
            if (btn) {
                btn.addEventListener('click', () => this.onPreviewRequested(challenge));
            }
        });

        // Tournament Banner Event
        const tourneyBanner = $('#tournament-banner-cta');
        if (tourneyBanner) {
            tourneyBanner.addEventListener('click', () => {
                document.dispatchEvent(new CustomEvent('SWITCH_TAB', { detail: { tab: 'leaderboard', subTab: 'tournament' } }));
            });
        }
    }

    renderCard(challenge, index) {
        const isAi = challenge.isAi;
        const colors = getColors(challenge.collectionName);
        const stats = challenge.stats || {};
        const delay = index * 0.08;
        const safeCollectionName = escapeHtml(challenge.collectionName || challenge.collectionId || 'Unknown');
        const safeTokenId = escapeHtml(challenge.nftId || challenge.tokenId || '?');
        const safeTrait = escapeHtml(challenge.trait || 'Unknown');
        const safeDifficulty = escapeHtml(challenge.difficulty || '');
        const safePlayerAddress = escapeHtml(challenge.player || challenge.creator || '');
        const safeShortAddress = escapeHtml(shortenAddress(challenge.player || challenge.creator || ''));
        const safeImageUrl = sanitizeUrl(challenge.imageUrl || '');

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
                ? `<img src="${safeImageUrl}" class="w-full h-full object-cover" alt="NFT" />`
                : `<span class="text-xl font-black ${isAi ? 'text-red-400/50' : 'text-indigo-400/50'}">${isAi ? 'AI' : '#'}</span>`
            }
                    </div>
                    <div class="min-w-0 flex-1">
                        <h3 class="font-bold text-sm truncate text-white/90">${safeCollectionName} #${safeTokenId}</h3>
                        ${isAi
                ? `<p class="text-[11px] text-red-400/60 font-semibold uppercase tracking-wider">AI Opponent</p>`
                : `<p class="text-[11px] text-slate-500 font-mono truncate" title="${safePlayerAddress}">${safeShortAddress}</p>`
            }
                    </div>
                </div>

                <!-- Trait + Difficulty + Loadout Badges -->
                <div class="flex items-center gap-2 mb-4 flex-wrap">
                    <span class="text-[10px] px-2 py-0.5 rounded-md ${colors.badge} font-medium tracking-tight">${safeTrait}</span>
                    ${isAi && challenge.difficulty ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-white/5 text-slate-400 border border-white/10 font-medium">${safeDifficulty}</span>` : ''}
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

    renderDailyBossBanner() {
        const boss = getDailyBoss();
        const account = getAccount(wagmiAdapter.wagmiConfig);
        const won = checkBossVictory(boss.id, account?.address || 'guest');
        
        return `
            <div class="relative mb-8 p-6 md:p-8 rounded-3xl overflow-hidden border border-orange-500/30 shadow-[0_0_50px_rgba(249,115,22,0.1)] group">
                <!-- Background FX -->
                <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-md z-0"></div>
                <div class="absolute inset-0 bg-gradient-to-r from-orange-600/20 via-red-600/10 to-transparent z-0"></div>
                <div class="absolute top-0 right-0 w-64 h-64 bg-orange-500/10 blur-[80px] -mr-32 -mt-32 rounded-full animate-pulse z-0"></div>
                
                <div class="relative z-10 flex flex-col md:flex-row items-center gap-6 md:gap-10">
                    <!-- Boss Avatar -->
                    <div class="relative">
                        <div class="w-32 h-32 md:w-40 md:h-40 rounded-2xl border-4 border-orange-500/40 overflow-hidden shadow-2xl rotate-3 group-hover:rotate-0 transition-transform duration-500">
                            <img src="${boss.imageUrl}" class="w-full h-full object-cover grayscale-[0.2] group-hover:grayscale-0 transition-all" alt="Boss" />
                        </div>
                        <div class="absolute -bottom-3 -right-3 px-3 py-1 bg-red-600 text-white text-[10px] font-black rounded-lg shadow-lg uppercase tracking-tighter">
                            World Boss
                        </div>
                    </div>

                    <!-- Info -->
                    <div class="flex-1 text-center md:text-left">
                        <div class="flex items-center justify-center md:justify-start gap-2 mb-2">
                            <span class="text-orange-500">${renderIcon('FLAME', 'w-5 h-5')}</span>
                            <span class="text-orange-400 text-xs font-black uppercase tracking-widest">Active Challenge</span>
                        </div>
                        <h3 class="text-3xl md:text-5xl font-black text-white mb-2 leading-tight uppercase italic tracking-tighter">
                            ${boss.name}
                        </h3>
                        <p class="text-slate-400 text-sm md:text-base max-w-lg mb-6 leading-relaxed">
                            A legendary force has entered the arena. Defeat them to claim 50 Arena Points and exclusive bragging rights. Only <span class="text-orange-400 font-bold">${100 - boss.dominancePercentile}%</span> have managed to win today.
                        </p>
                        
                        <div class="flex flex-wrap justify-center md:justify-start gap-3">
                            <button id="fight-boss-btn-${boss.id}" 
                                    class="px-8 py-4 ${won ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-400' : 'bg-orange-600 hover:bg-orange-500 text-white'} rounded-2xl font-black transition-all hover:scale-105 active:scale-95 flex items-center gap-3 shadow-xl">
                                ${won ? renderIcon('CHECK', 'w-5 h-5') : renderIcon('SWORDS', 'w-5 h-5')}
                                ${won ? 'BOSS DEFEATED' : 'CHALLENGE BOSS'}
                            </button>
                            <div class="px-5 py-4 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm flex items-center gap-3">
                                <div class="flex flex-col">
                                    <span class="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Reward</span>
                                    <span class="text-sm font-black text-white">+50 Points</span>
                                </div>
                                <div class="w-px h-6 bg-white/10"></div>
                                <div class="flex flex-col">
                                    <span class="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Difficulty</span>
                                    <span class="text-sm font-black text-orange-400 uppercase">Mythic</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
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

    renderTournamentBanner() {
        const account = getAccount(wagmiAdapter.wagmiConfig);
        const status = getPlayerTournamentStatus(account?.address);
        if (!status) return '';

        const { tournament, rank } = status;
        const timeLeft = this._getTimeLeft(tournament.end);

        return `
            <div class="mb-6 animate-fade-in">
                <div id="tournament-banner-cta" class="relative p-6 rounded-2xl overflow-hidden border-2 border-yellow-500/20 bg-gradient-to-r from-yellow-500/20 via-slate-900/60 to-slate-900 cursor-pointer group hover:border-yellow-500/50 transition-all shadow-xl">
                    <div class="absolute -right-12 -top-12 w-48 h-48 bg-yellow-500/5 blur-3xl rounded-full group-hover:bg-yellow-500/15 transition-all"></div>
                    <div class="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div class="flex items-center gap-5">
                            <div class="w-14 h-14 rounded-2xl bg-yellow-500/20 border border-yellow-500/40 flex items-center justify-center text-3xl shadow-lg shadow-yellow-500/10 group-hover:scale-110 transition-transform">${renderIcon('TROPHY', 'w-6 h-6 text-yellow-500')}</div>
                            <div>
                                <h3 class="text-base font-black text-white uppercase italic tracking-tight mb-1">Weekly Tournament LIVE</h3>
                                <div class="flex items-center gap-3">
                                    <span class="flex items-center gap-1.5 text-[10px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-2.5 py-1 rounded-lg">
                                        ${renderIcon('CLOCK', 'w-3 h-3')} ${timeLeft}
                                    </span>
                                    ${rank ? `<span class="text-[10px] font-black text-slate-400 uppercase tracking-widest border border-white/10 px-2.5 py-1 rounded-lg">Rank: #${rank}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="text-[10px] font-black text-slate-500 uppercase tracking-widest hidden lg:block">Climb the Ranks</span>
                            <div class="px-8 py-3 rounded-xl bg-yellow-500 text-slate-950 text-xs font-black uppercase tracking-widest group-hover:bg-yellow-400 transition-all shadow-xl shadow-yellow-500/20">
                                Enter Arena
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    _getTimeLeft(endTs) {
        const diff = endTs - Date.now();
        if (diff <= 0) return 'EXPIRED';
        const hours = Math.floor(diff / (60 * 60 * 1000));
        if (hours < 24) return `${hours}h left`;
        return `${Math.floor(hours / 24)}d left`;
    }

    renderFeaturedBattle() {
        const history = JSON.parse(localStorage.getItem('battle_history') || '[]');
        const featured = history.find(b => b.playerWon && b.rounds > 5) || history[0];

        if (!featured) return '';

        return `
            <div class="relative p-5 rounded-2xl border border-indigo-500/20 bg-slate-900/40 backdrop-blur-md overflow-hidden group hover:border-indigo-500/40 transition-all cursor-pointer" 
                 onclick="document.dispatchEvent(new CustomEvent('BATTLE_REPLAY_REQUEST', { detail: { battleId: '${featured.id}' } }))">
                <div class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent"></div>
                <div class="flex items-center justify-between mb-3">
                    <span class="text-[9px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-500/10 px-2 py-0.5 rounded">Featured Replay</span>
                    <span class="text-[9px] text-slate-500 font-mono">${featured.rounds} Rounds</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                        ${renderIcon('PLAY', 'w-5 h-5')}
                    </div>
                    <div>
                        <div class="text-sm font-black text-white italic truncate w-32">${featured.playerName} vs ${featured.enemyName}</div>
                        <div class="text-[10px] text-slate-500 font-bold uppercase tracking-tight">Watch Masterful Combat</div>
                    </div>
                </div>
            </div>
        `;
    }

    renderTopPlayerShowcase() {
        const leaderboard = JSON.parse(localStorage.getItem('arena_leaderboard_mock') || '[]');
        const top = leaderboard[0];

        if (!top) return '';

        return `
            <div class="relative p-5 rounded-2xl border border-yellow-500/20 bg-slate-900/40 backdrop-blur-md overflow-hidden group hover:border-yellow-500/40 transition-all">
                <div class="absolute inset-0 bg-gradient-to-br from-yellow-500/5 to-transparent"></div>
                <div class="flex items-center justify-between mb-3">
                    <span class="text-[9px] font-black text-yellow-500 uppercase tracking-widest bg-yellow-500/10 px-2 py-0.5 rounded">Top Contender</span>
                    <span class="text-[9px] text-slate-500 font-mono">#1 Global</span>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center text-xl shadow-lg shadow-yellow-500/10">${renderIcon('STAR', 'w-5 h-5 text-yellow-400')}</div>
                    <div>
                        <div class="text-sm font-black text-white italic">${shortenAddress(top.address)}</div>
                        <div class="text-[10px] text-yellow-500/60 font-bold uppercase tracking-tight">${top.score.toLocaleString()} Points</div>
                    </div>
                </div>
            </div>
        `;
    }
}
