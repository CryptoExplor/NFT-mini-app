import { $ } from '../utils/dom.js';
import { state, EVENTS } from '../state.js';
import { connectWallet, disconnectWallet } from '../wallet.js';
import { applyMiniAppAvatar, getWalletIdentityLabel } from '../utils/profile.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';
import { setThemePreference } from '../utils/theme.js';
import { renderBottomNav, bindBottomNavEvents } from '../components/BottomNav.js';
import { ChallengeBoard } from '../components/game/ChallengeBoard.js';
import { MatchPreviewModal } from '../components/game/MatchPreviewModal.js';
import { NFTSelectorModal } from '../components/game/NFTSelectorModal.js';
import { renderCombatArena } from '../lib/game/arenaRenderer.js';
import { applyLayer } from '../lib/battle/metadataNormalizer.js';
import { postChallenge, recordAiBattle, getChallengeById } from '../lib/game/matchmaking.js';
import {
    getCurrentBattleLoadout,
    getCurrentBattleSelection,
    restoreLastBattleSelection,
    saveLastBattleSelection,
} from '../lib/battle/loadoutSession.js';
import { BattleLeaderboard, saveBattleResult } from '../components/game/BattleLeaderboard.js';
import { getPlayerPoints, addPlayerPoints } from '../lib/game/points.js';
import { getRankByPoints } from '../lib/game/rankSystem.js';
import { getBattleReplay, trackBattleLoadout, trackBattleStarted, trackBattleResult, trackReplayConversion } from '../lib/api.js';
import { renderIcon } from '../utils/icons.js';
import { escapeHtml } from '../utils/html.js';
import { isFarcasterFollower } from '../utils/social.js';

/** Inline toast for Farcaster miniapp (no browser alert) */
function showBattleToast(message, type = 'error') {
    const existing = document.getElementById('battle-toast');
    if (existing) existing.remove();
    const bg = type === 'error' ? 'rgba(239,68,68,0.92)' : 'rgba(16,185,129,0.92)';
    const border = type === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)';
    const safeMessage = escapeHtml(String(message || ''));
    document.body.insertAdjacentHTML('beforeend', `
        <div id="battle-toast" style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:200;padding:12px 20px;border-radius:12px;background:${bg};border:1px solid ${border};color:#fff;font-size:14px;font-weight:500;text-align:center;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.4);backdrop-filter:blur(8px);">
            ${safeMessage}
        </div>
    `);
    setTimeout(() => document.getElementById('battle-toast')?.remove(), 3500);
}

let walletHandler = null;

function getReplayIdFromUrl() {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('replay') || '';
}

function getChallengeIdFromUrl() {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('challenge') || '';
}

function setReplayIdInUrl(battleId) {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (battleId) {
        url.searchParams.set('replay', battleId);
    } else {
        url.searchParams.delete('replay');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
}

function buildReplayShareUrl(battleId) {
    if (typeof window === 'undefined') return '/battle';
    const origin = window.location.origin || 'https://base-mintapp.vercel.app';
    return battleId ? `${origin}/battle?replay=${encodeURIComponent(battleId)}` : `${origin}/battle`;
}

export async function renderBattlePage() {
    // Force dark mode on battle arena entry
    setThemePreference('dark');

    // Load live balance patches from CDN (fire-and-forget, falls back to bundled)
    import('../lib/battle/balanceConfig.js').then(({ loadBalanceOverrides }) => loadBalanceOverrides()).catch(() => { });

    const app = $('#app');

    app.innerHTML = `
        <div class="page-container min-h-screen pb-24 relative overflow-x-hidden app-text bg-slate-900 transition-colors duration-300">
            <header class="glass-header sticky top-0 z-40 border-b border-white/5 safe-pt">
                <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <span class="text-red-500">${renderIcon('SWORDS', 'w-6 h-6')}</span>
                        <h1 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-400">
                            Battle Arena
                        </h1>
                    </div>
                    <div class="flex items-center gap-3">
                        <div id="battle-streak-badge" class="hidden glass-card px-3 py-1 rounded-full flex items-center gap-1.5 border-orange-500/30 text-orange-400">
                            ${renderIcon('FLAME', 'w-3.5 h-3.5')}
                            <span class="text-[10px] font-black uppercase tracking-widest"><span id="streak-count">0</span> STREAK</span>
                        </div>
                        ${renderThemeToggleButton('theme-toggle-battle')}
                        <button id="guest-play-btn" class="hidden glass-card px-4 py-2 rounded-full flex items-center gap-2 hover:scale-105 transition-all text-xs font-bold text-indigo-400 border-indigo-500/30">
                            ${renderIcon('BOLT', 'w-4 h-4')}
                            Play as Guest
                        </button>
                        <button id="battle-connect-btn" class="glass-card px-4 py-2 rounded-full flex items-center space-x-2 hover:scale-105 transition-transform text-sm font-medium">
                            <div class="status-glow" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
                            <img id="battle-connect-avatar" class="w-5 h-5 rounded-full object-cover hidden" alt="Profile avatar">
                            <span id="battle-connect-text">${getWalletIdentityLabel(state.wallet)}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main class="max-w-6xl mx-auto px-4 pt-6 page-transition relative" id="battle-container">
                <!-- Tab Toggle -->
                <div class="flex gap-2 mb-4" id="battle-tabs">
                    <button id="tab-arena" class="px-4 py-2 rounded-xl text-sm font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 transition-all">Arena</button>
                    <button id="tab-stats" class="px-4 py-2 rounded-xl text-sm font-bold bg-white/[0.03] text-slate-400 border border-white/10 hover:bg-white/[0.06] transition-all">My Stats</button>
                </div>
                <div id="challenge-board-view"></div>
                <div id="match-preview-view" class="hidden"></div>
                <div id="arena-view" class="hidden"></div>
                <div id="leaderboard-view" class="hidden"></div>
                
                <!-- Modal Mount -->
                <div id="nft-selector-modal" class="hidden"></div>
            </main>

            ${renderBottomNav('battle')}
        </div>
    `;

    bindThemeToggleEvents();
    bindBottomNavEvents();
    attachBattleEvents();
    updateBattleHeader(state.wallet);

    const previewModal = new MatchPreviewModal(
        'match-preview-view',
        () => {
            previewModal.hide();
            board.show();
        },
        async (playerCombatStats, enemyCombatStats) => {
            previewModal.hide();

            // Show loading state while calculating the match
            app.insertAdjacentHTML('beforeend', `
                <div id="battle-loading-overlay" class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md">
                    <div class="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <h2 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-400 animate-pulse">Calculating Match...</h2>
                </div>
            `);

            try {
                setReplayIdInUrl('');
                const selectedLoadout = getCurrentBattleLoadout();
                if (!selectedLoadout) {
                    $('#battle-loading-overlay')?.remove();
                    showBattleToast('Pick your fighter first!');
                    previewModal.show(previewModal.enemyData);
                    selectorModal.show();
                    return;
                }

                const isAi = !!previewModal.enemyData?.isAi;
                let replayLogs, winner, winnerSide, battleSeed;
                let persistedBattleId = null;
                let persistedBattlePromise = null;

                // V2 Analytics: track battle start
                trackBattleStarted(state.wallet?.address, {
                    isAi,
                    challengeId: previewModal.enemyData?.id || null,
                    opponent: enemyCombatStats.name || null,
                });

                // Check social synergy (Farcaster follow)
                const isFollower = await isFarcasterFollower();
                if (isFollower && selectedLoadout) {
                    if (!selectedLoadout.teamSnapshot) selectedLoadout.teamSnapshot = [];
                    // WARN-05 fix: guard against stacking synergy on rematch
                    const alreadyInjected = selectedLoadout.teamSnapshot.some(t => t.collectionName === 'farcaster-synergy');
                    if (!alreadyInjected) {
                        selectedLoadout.teamSnapshot.push({
                            collectionName: 'farcaster-synergy',
                            isFarcasterFollower: true,
                            trait: 'Follower'
                        });
                        console.log('[SocialSynergy] Farcaster follow detected! ATK boost active.');
                    }
                }

                if (isAi) {
                    // ── AI Battles: resolve locally with V2 engine ──
                    const { simulateBattleV2 } = await import('../lib/battle/engineV2.js');
                    const { summarizeReplay } = await import('../lib/game/engine.js');

                    if (!simulateBattleV2) {
                        throw new Error('V2 ERROR: engineV2.js failed to load');
                    }

                    // Generate deterministic AI seed
                    const walletAddress = state.wallet?.address || 'Anonymous';
                    const fighterId = `${selectedLoadout?.fighter?.collectionSlug || 'unknown'}_${selectedLoadout?.fighter?.tokenId || '0'}`;
                    const enemyId = `ai:${previewModal.enemyData.name}`;
                    battleSeed = `ai:${walletAddress}:${fighterId}:${enemyId}`;

                    // Pass full V2 loadout context
                    const loadout = selectedLoadout || {};
                    const battleResult = simulateBattleV2(playerCombatStats, enemyCombatStats, {
                        seed: battleSeed,
                        isAiBattle: true,
                        aiWinRate: previewModal.enemyData.aiWinRate || 0.6,
                        playerItem: loadout.item?.stats || null,
                        environment: loadout.arena?.stats || null,
                        playerTeam: loadout.teamSnapshot || [],
                    });

                    const summary = summarizeReplay(battleResult);
                    replayLogs = battleResult.logs;
                    winner = summary.winner;
                    winnerSide = summary.winnerSide || battleResult.winnerSide || null;
                } else {

                    // ── PvP Battles: resolve via secure server API ──
                    const walletAddress = state.wallet?.address || 'Anonymous';
                    const { resolveFight } = await import('../lib/game/matchmaking.js');
                    const result = await resolveFight(
                        previewModal.enemyData.id,
                        walletAddress,
                        selectedLoadout // now the full loadout object
                    );
                    replayLogs = result.logs; // Server returns `logs`, not `replayLogs`
                    winner = result.summary?.winner || result.winner;
                    winnerSide = result.summary?.winnerSide || result.winnerSide || null;
                    persistedBattleId = result.battleId || null;
                }

                $('#battle-loading-overlay')?.remove();

                // Inject rank/points for arena rendering
                const pPoints = getPlayerPoints(state.wallet?.address);
                const pRank = getRankByPoints(pPoints);
                playerCombatStats.points = pPoints;
                playerCombatStats.rank = pRank;

                window._lastBattleStats = { pStats: playerCombatStats, eStats: enemyCombatStats };

                renderCombatArena(playerCombatStats, enemyCombatStats, async (battleData) => {
                    console.log("Match concluded! Winner:", winner);
                    // Save battle result to localStorage for leaderboard
                    const logs = replayLogs || [];
                    const p1Dmg = logs.filter(l => l.attackerSide === 'P1').reduce((s, l) => s + (l.damage || 0), 0);
                    const p2Dmg = logs.filter(l => l.attackerSide === 'P2').reduce((s, l) => s + (l.damage || 0), 0);
                    const expectedPlayerSide = isAi ? 'P1' : 'P2';
                    const playerDmg = expectedPlayerSide === 'P1' ? p1Dmg : p2Dmg;
                    const enemyDmg = expectedPlayerSide === 'P1' ? p2Dmg : p1Dmg;
                    const playerCrits = logs.filter(l => l.attackerSide === expectedPlayerSide && l.isCrit).length;
                    const playerWon = winnerSide ? winnerSide === expectedPlayerSide : winner === playerCombatStats.name;
                    const totalRounds = logs[logs.length - 1]?.round || 1;
                    saveBattleResult({
                        playerName: playerCombatStats.name,
                        enemyName: enemyCombatStats.name,
                        playerWon,
                        isAi: isAi,
                        rounds: totalRounds,
                        playerDmg,
                        enemyDmg,
                        crits: playerCrits,
                        dodges: logs.filter(l => l.isDodge).length
                    });

                    if (isAi && state.wallet?.address) {
                        const loadout = getCurrentBattleLoadout();
                        persistedBattlePromise = recordAiBattle(state.wallet.address, {
                            seed: battleSeed,
                            playerStats: playerCombatStats,
                            enemyStats: enemyCombatStats,
                            result: {
                                winnerSide,
                                winner,
                                totalRounds,
                            },
                            loadout,
                            extras: {
                                p1Dmg,
                                p2Dmg,
                                crits: logs.filter(l => l.isCrit).length,
                            },
                            logs,
                        }).then((payload) => {
                            persistedBattleId = payload?.battleId || null;
                            return persistedBattleId;
                        }).catch(() => null);
                    }

                    // Progression & Points Logic
                    if (playerWon && state.wallet?.address) {
                        const { addTournamentPoints } = await import('../lib/game/tournament.js');
                        // NOTE: getNextRank is removed — it was imported but never used (BUG-01 fix)
                        const { recordBattleResult, shouldShowSharePrompt } = await import('../lib/game/conversion.js');
                        const { analyzeOutcome, getGrowthCycleDay } = await import('../lib/game/distributionEngine.js');

                        const pointsToAdd = previewModal.enemyData?.isBoss ? 50 : 10;
                        const battleId = `battle_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

                        // 1. Global Progression (BUG-03 fix: use statically-imported addPlayerPoints/getRankByPoints)
                        const result = addPlayerPoints(state.wallet.address, pointsToAdd, battleId);

                        if (result) {
                            const currentRank = getRankByPoints(result.updated);
                            const prevRank = getRankByPoints(result.previous);

                            // 2. Tournament Progression
                            addTournamentPoints(state.wallet.address, pointsToAdd);

                            // 3. Conversion & Retension Tracking
                            const conversionState = recordBattleResult(state.wallet.address, true);

                            if (currentRank.id !== prevRank.id) {
                                showRankUpCelebration(prevRank, currentRank);
                            } else {
                                let toastMsg = `+${pointsToAdd} Arena Points!`;
                                if (conversionState.streak > 1) {
                                    toastMsg += ` ${conversionState.streak} WIN STREAK!`;
                                }
                                showBattleToast(toastMsg, 'success');
                            }

                            // 4. Distribution Engine: Auto-share prompt
                            const outcome = analyzeOutcome({ playerWon: true }, logs);
                            const cycleDay = getGrowthCycleDay(state.wallet.address);

                            if (shouldShowSharePrompt(state.wallet.address) || outcome) {
                                setTimeout(() => {
                                    showSharePrompt(
                                        state.wallet.address,
                                        conversionState,
                                        outcome,
                                        cycleDay,
                                        persistedBattlePromise || buildReplayShareUrl(persistedBattleId)
                                    );
                                }, 1500);
                            }
                        }
                    } else if (!playerWon && state.wallet?.address) {
                        // Track loss for streak reset
                        const { recordBattleResult } = await import('../lib/game/conversion.js');
                        const conversionState = recordBattleResult(state.wallet.address, false);

                        // Distribution Engine: Near Loss Detection
                        const { analyzeOutcome, getGrowthCycleDay } = await import('../lib/game/distributionEngine.js');
                        const outcome = analyzeOutcome({ playerWon: false }, logs);
                        const cycleDay = getGrowthCycleDay(state.wallet.address);

                        if (outcome && outcome.type === 'NEAR_LOSS') {
                            setTimeout(() => {
                                showSharePrompt(
                                    state.wallet.address,
                                    conversionState,
                                    outcome,
                                    cycleDay,
                                    persistedBattlePromise || buildReplayShareUrl(persistedBattleId)
                                );
                            }, 1500);
                        }
                    }

                    // Boss Victory Logic
                    if (playerWon && previewModal.enemyData?.isBoss) {
                        const { recordBossVictory } = await import('../lib/game/dailyBoss.js');
                        recordBossVictory(previewModal.enemyData.id, state.wallet?.address || 'guest');
                    }

                    // V2 Analytics: track battle result
                    trackBattleResult(state.wallet?.address, {
                        won: playerWon,
                        isAi,
                        rounds: totalRounds,
                        opponent: enemyCombatStats.name || null,
                    });
                    // Refresh leaderboard if visible
                    leaderboard.render();
                }, {
                    environment: previewModal.enemyData?.loadout?.arena || selectedLoadout?.arena,
                    playerTeam: selectedLoadout?.teamSnapshot || selectorModal.inventory || [],
                    precomputedLogs: replayLogs,
                    winner
                });

            } catch (err) {
                console.error("Match error:", err);
                $('#battle-loading-overlay')?.remove();
                showBattleToast('Battle failed to start. Try again.');
                board.show();
            }
        },
        () => {
            // on Select Fighter clicked inside Match Preview
            selectorModal.show();
        }
    );

    const selectorModal = new NFTSelectorModal(
        'nft-selector-modal',
        (loadout) => {
            const selectedNft = loadout.fighter;

            // V2: Apply item buff at 100% scale, arena modifier at 80% (diminishing returns)
            let finalStats = selectedNft.stats;
            if (loadout.item?.stats) {
                finalStats = applyLayer(finalStats, loadout.item.stats, 1.0);
            }
            if (loadout.arena?.stats) {
                finalStats = applyLayer(finalStats, loadout.arena.stats, 0.8);
            }

            const pData = {
                name: `${selectedNft.collectionName} #${selectedNft.nftId}`,
                stats: finalStats,
                trait: selectedNft.trait,
                imageUrl: selectedNft.imageUrl || '',
                loadout: loadout // pass full loadout schema for reference
            };

            saveLastBattleSelection(loadout, pData);

            // V2 Analytics: track loadout built
            trackBattleLoadout(state.wallet?.address, loadout);

            // If we have an active enemy preview, we update the player slot
            if (previewModal.enemyData) {
                previewModal.playerData = pData;
                previewModal.render(); // Re-render preview with new player stats
            } else {
                // Otherwise user was posting a new challenge from the board
                const walletAddress = state.wallet?.address || 'Anonymous';

                // Show temporary feedback
                const btn = $('#post-challenge-btn');
                if (btn) btn.textContent = 'Posting...';

                // Pass the complete V2 schema payload
                postChallenge(walletAddress, loadout)
                    .then(() => {
                        board.show(); // Refresh board and reload challenges from KV
                    })
                    .catch(err => {
                        console.error('Failed to post challenge:', err);
                        showBattleToast('Failed to post challenge. Try again.');
                        board.show();
                    });
            }
        },
        () => {
            // on closed
        }
    );

    const board = new ChallengeBoard(
        'challenge-board-view',
        (challengeData) => {
            window._lastBattleChallenge = challengeData;
            board.hide();
            const saved = getCurrentBattleSelection().loadout
                ? getCurrentBattleSelection()
                : restoreLastBattleSelection();
            if (saved) {
                previewModal.playerData = saved.previewData;
            } else {
                previewModal.playerData = null;
            }
            previewModal.show(challengeData);
        },
        () => {
            // "Post Challenge" clicked
            previewModal.enemyData = null; // Clear context
            selectorModal.show();
        }
    );

    const leaderboard = new BattleLeaderboard('leaderboard-view');

    board.show();

    // Tab Toggle Logic
    const tabArena = $('#tab-arena');
    const tabStats = $('#tab-stats');
    const activeTabClass = 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
    const inactiveTabClass = 'bg-white/[0.03] text-slate-400 border-white/10';

    function switchTab(tab) {
        const boardEl = $('#challenge-board-view');
        const lbEl = $('#leaderboard-view');
        if (tab === 'arena') {
            setReplayIdInUrl('');
            boardEl?.classList.remove('hidden');
            lbEl?.classList.add('hidden');
            tabArena.className = `px-4 py-2 rounded-xl text-sm font-bold ${activeTabClass} transition-all`;
            tabStats.className = `px-4 py-2 rounded-xl text-sm font-bold ${inactiveTabClass} hover:bg-white/[0.06] transition-all`;
        } else {
            boardEl?.classList.add('hidden');
            lbEl?.classList.remove('hidden');
            leaderboard.render();
            tabStats.className = `px-4 py-2 rounded-xl text-sm font-bold ${activeTabClass} transition-all`;
            tabArena.className = `px-4 py-2 rounded-xl text-sm font-bold ${inactiveTabClass} hover:bg-white/[0.06] transition-all`;
        }
    }

    tabArena?.addEventListener('click', () => switchTab('arena'));
    tabStats?.addEventListener('click', () => switchTab('stats'));

    const replayHandler = async (e) => {
        const { battleId } = e.detail;
        if (!battleId) return;

        // Show loading overlay
        const app = $('#app');
        app.insertAdjacentHTML('beforeend', `
            <div id="battle-loading-overlay" class="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md">
                <div class="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <h2 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-400 animate-pulse">Fetching Replay...</h2>
                <div class="text-[10px] font-mono text-slate-400 mt-2">ID: ${battleId.slice(0, 8)}...</div>
            </div>
        `);

        try {
            const data = await getBattleReplay(battleId);
            setReplayIdInUrl(battleId);

            // Transition to Arena View
            $('#battle-loading-overlay')?.remove();

            $('#challenge-board-view')?.classList.add('hidden');
            $('#leaderboard-view')?.classList.add('hidden');
            const arenaView = $('#arena-view');
            arenaView?.classList.remove('hidden');

            renderCombatArena(data.p1, data.p2, () => {
                // Return to stats on close
                arenaView?.classList.add('hidden');
                switchTab('stats');
            }, {
                environment: data.options?.environment || null,
                playerTeam: data.options?.playerTeam || [],
                enemyTeam: data.options?.enemyTeam || [],
                precomputedLogs: data.logs,
                winner: data.result?.winner,
                isReplay: true
            });

            const replayIsAi = Boolean(data.options?.isAiBattle);
            const replayCtaLabel = replayIsAi ? 'FIGHT THIS OPPONENT' : 'ENTER ARENA';
            const replayCtaHint = replayIsAi ? 'Convinced? Run it back with your fighter.' : 'Jump back into the arena and pick your next match.';

            // Add Replay -> Play CTA
            if (arenaView && !arenaView.querySelector('#replay-play-cta')) {
                arenaView.insertAdjacentHTML('beforeend', `
                    <div id="replay-play-cta" class="absolute bottom-32 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center animate-bounce">
                        <button id="replay-fight-btn" class="px-8 py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-2xl font-black shadow-2xl border-2 border-white/20 hover:scale-110 transition-transform flex items-center gap-2">
                            ${replayCtaLabel} ${renderIcon('SWORDS', 'w-6 h-6')}
                        </button>
                        <div class="mt-2 text-[10px] font-bold text-white uppercase tracking-widest text-shadow-sm">${replayCtaHint}</div>
                    </div>
                `);

                $('#replay-fight-btn')?.addEventListener('click', () => {
                    trackReplayConversion(state.wallet?.address, battleId, replayIsAi ? 'fight_this_opponent' : 'enter_arena');
                    $('#replay-play-cta')?.remove();
                    arenaView?.classList.add('hidden');

                    if (!replayIsAi) {
                        document.dispatchEvent(new CustomEvent('REPLAY_FIGHT_REQUEST'));
                        return;
                    }

                    const saved = getCurrentBattleSelection().loadout
                        ? getCurrentBattleSelection()
                        : restoreLastBattleSelection();
                    if (saved) {
                        previewModal.playerData = saved.previewData;
                    } else {
                        previewModal.playerData = null;
                    }

                    previewModal.show({
                        id: `replay_ai_${battleId}`,
                        isAi: true,
                        name: data.p2?.name || 'AI Opponent',
                        collectionName: data.p2?.name || 'AI Opponent',
                        nftId: data.p2?.nftId || data.p2?.tokenId || '?',
                        stats: data.p2?.stats || {},
                        imageUrl: data.p2?.imageUrl || data.p2?.image || '',
                        loadout: {
                            fighter: {
                                collectionName: data.p2?.name || 'AI Opponent',
                                nftId: data.p2?.nftId || data.p2?.tokenId || '?',
                                stats: data.p2?.stats || {},
                            },
                            item: data.p2?.item ? { stats: data.p2.item } : null,
                            arena: data.p2?.arena ? { stats: data.p2.arena } : null,
                            teamSnapshot: data.p2?.team || [],
                            schemaVersion: 'battle-loadout-v1',
                        },
                        aiWinRate: data.options?.aiWinRate || 0.6,
                    });
                });
            }
        } catch (err) {
            console.error('Replay error:', err);
            $('#battle-loading-overlay')?.remove();
            showBattleToast('Failed to load replay.');
            switchTab('stats');
        }
    };

    document.addEventListener('BATTLE_REPLAY_REQUEST', replayHandler);
    window._battleReplayHandler = replayHandler;

    const replayId = getReplayIdFromUrl();
    if (replayId) {
        switchTab('stats');
        setTimeout(() => replayHandler({ detail: { battleId: replayId } }), 0);
    }

    const challengeId = getChallengeIdFromUrl();
    if (challengeId) {
        setTimeout(async () => {
            const challenge = await getChallengeById(challengeId);
            if (challenge) {
                board.hide();
                const saved = getCurrentBattleSelection().loadout
                    ? getCurrentBattleSelection()
                    : restoreLastBattleSelection();
                if (saved) {
                    previewModal.playerData = saved.previewData;
                }
                previewModal.show(challenge);
            }
        }, 100);
    }

    const guestPlayHandler = () => {
        document.querySelector('#arena-view')?.classList.add('hidden');
        selectorModal.show();
    };

    const openPreviewHandler = (e) => {
        const challenge = e.detail;
        if (challenge) {
            window._lastBattleChallenge = challenge;
            board.hide();
            const saved = getCurrentBattleSelection().loadout
                ? getCurrentBattleSelection()
                : restoreLastBattleSelection();
            if (saved) {
                previewModal.playerData = saved.previewData;
            }
            previewModal.show(challenge);
        }
    };

    document.addEventListener('GUEST_PLAY_REQUEST', guestPlayHandler);
    document.addEventListener('OPEN_PREVIEW_MODAL', openPreviewHandler);
    window._battleGuestPlayHandler = guestPlayHandler;
    window._battleOpenPreviewHandler = openPreviewHandler;

    // BUG-07 fix: move module-scope listeners inside renderBattlePage so they
    // can be tracked and cleaned up in cleanup(), preventing listener stacking.
    const rematchHandler = () => {
        const arenaView = document.querySelector('#arena-view');
        if (arenaView) arenaView.classList.add('hidden');

        if (window._lastBattleStats && window._lastBattleChallenge) {
            const boardEl = document.querySelector('#challenge-board-view');
            if (boardEl) boardEl.classList.add('hidden');
            document.dispatchEvent(new CustomEvent('OPEN_PREVIEW_MODAL', { detail: window._lastBattleChallenge }));
        } else {
            const boardEl = document.querySelector('#challenge-board-view');
            if (boardEl) boardEl.classList.remove('hidden');
        }
    };

    const replayFightHandler = () => {
        document.querySelector('#arena-view')?.classList.add('hidden');
        const tabArenaEl = document.querySelector('#tab-arena');
        if (tabArenaEl) tabArenaEl.click();
        showBattleToast('Opponent challenged! Select your fighter.', 'success');
    };

    document.addEventListener('BATTLE_REMATCH_REQUEST', rematchHandler);
    document.addEventListener('REPLAY_FIGHT_REQUEST', replayFightHandler);
    window._battleRematchHandler = rematchHandler;
    window._battleReplayFightHandler = replayFightHandler;
}

function attachBattleEvents() {
    if (walletHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletHandler);
    }

    walletHandler = (e) => {
        const account = e.detail;
        updateBattleHeader(account);
    };
    document.addEventListener(EVENTS.WALLET_UPDATE, walletHandler);

    const connectBtn = document.getElementById('battle-connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            if (state.wallet?.isConnected) {
                await disconnectWallet();
            } else {
                await connectWallet();
            }
        });
    }

    const guestBtn = document.getElementById('guest-play-btn');
    if (guestBtn) {
        guestBtn.addEventListener('click', () => {
            // Force selector modal open (will use Trial Armory)
            const selectorModal = document.querySelector('#nft-selector-modal');
            if (selectorModal) {
                // Find the instance - we might need to expose it or trigger an event
                document.dispatchEvent(new CustomEvent('GUEST_PLAY_REQUEST'));
            }
        });
    }
}

function updateBattleHeader(account) {
    const connectBtn = document.getElementById('battle-connect-btn');
    if (connectBtn) {
        const glow = connectBtn.querySelector('.status-glow');
        const avatar = document.getElementById('battle-connect-avatar');
        const text = document.getElementById('battle-connect-text');
        const streakBadge = document.getElementById('battle-streak-badge');
        const streakCount = document.getElementById('streak-count');

        applyMiniAppAvatar(avatar);

        if (account?.isConnected) {
            if (glow) { glow.style.background = '#10B981'; glow.style.boxShadow = '0 0 10px #10B981'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
            document.getElementById('guest-play-btn')?.classList.add('hidden');

            // Update streak visibility
            import('../lib/game/conversion.js').then(({ getConversionState }) => {
                const conv = getConversionState(account.address);
                if (conv && conv.streak >= 2) {
                    if (streakBadge) streakBadge.classList.remove('hidden');
                    if (streakCount) streakCount.textContent = conv.streak;
                } else {
                    if (streakBadge) streakBadge.classList.add('hidden');
                }
            });
        } else {
            if (glow) { glow.style.background = '#EF4444'; glow.style.boxShadow = '0 0 10px #EF4444'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
            document.getElementById('guest-play-btn')?.classList.remove('hidden');
        }
    }
}

export function cleanup() {
    if (walletHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletHandler);
        walletHandler = null;
    }
    if (window._battleReplayHandler) {
        document.removeEventListener('BATTLE_REPLAY_REQUEST', window._battleReplayHandler);
        delete window._battleReplayHandler;
    }
    // BUG-07 fix: clean up the rematch/replay-fight handlers
    if (window._battleRematchHandler) {
        document.removeEventListener('BATTLE_REMATCH_REQUEST', window._battleRematchHandler);
        delete window._battleRematchHandler;
    }
    if (window._battleReplayFightHandler) {
        document.removeEventListener('REPLAY_FIGHT_REQUEST', window._battleReplayFightHandler);
        delete window._battleReplayFightHandler;
    }
    if (window._battleGuestPlayHandler) {
        document.removeEventListener('GUEST_PLAY_REQUEST', window._battleGuestPlayHandler);
        delete window._battleGuestPlayHandler;
    }
    if (window._battleOpenPreviewHandler) {
        document.removeEventListener('OPEN_PREVIEW_MODAL', window._battleOpenPreviewHandler);
        delete window._battleOpenPreviewHandler;
    }
}
async function showRankUpCelebration(oldRank, newRank) {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-fade-in';
    overlay.innerHTML = `
        <div class="max-w-sm w-full text-center animate-scale-up">
            <div class="relative mb-8">
                <div class="absolute inset-0 bg-indigo-500/20 blur-[100px] rounded-full animate-pulse"></div>
                <div class="flex justify-center mb-4">${renderIcon('STAR', 'w-10 h-10 text-yellow-400')}</div>
                <h2 class="text-4xl font-black text-white uppercase italic tracking-tighter mb-2">Rank Up!</h2>
                <p class="text-slate-400 text-sm">Your legend grows in the arena.</p>
            </div>
            
            <div class="flex items-center justify-center gap-6 mb-10">
                <div class="flex flex-col items-center gap-2 opacity-50 grayscale scale-90">
                    <div class="px-4 py-1.5 rounded-lg border border-current bg-white/5 ${oldRank.textClass} text-xs font-black uppercase tracking-widest">${oldRank.label}</div>
                </div>
                <div class="text-slate-600">${renderIcon('CHEVRON_RIGHT', 'w-6 h-6')}</div>
                <div class="flex flex-col items-center gap-2 scale-125">
                    <div class="px-5 py-2 rounded-xl border-2 border-current bg-white/10 ${newRank.textClass} text-sm font-black uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(255,255,255,0.1)]">${newRank.label}</div>
                </div>
            </div>
            
            <button id="close-rank-up" class="w-full py-4 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95 shadow-xl">
                Enter Next Tier
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Add particle effects if possible

    $('#close-rank-up').addEventListener('click', () => {
        overlay.classList.add('animate-fade-out');
        setTimeout(() => overlay.remove(), 400);
    });
}

async function showSharePrompt(address, conversion, outcome, cycleDay, shareUrlSource = null) {
    const { recordShare } = await import('../lib/game/conversion.js');
    const { getRankByPoints } = await import('../lib/game/rankSystem.js');
    const { getPlayerPoints } = await import('../lib/game/points.js');
    const { generateGrowthPost } = await import('../lib/game/distributionEngine.js');
    const { getPlayerTournamentStatus } = await import('../lib/game/tournament.js');

    const points = getPlayerPoints(address);
    const rank = getRankByPoints(points);
    const tourney = getPlayerTournamentStatus(address);

    const isNearLoss = outcome?.type === 'NEAR_LOSS';
    const isComeback = outcome?.type === 'COMEBACK';

    // Build context for post generation
    const resolvedShareUrl = typeof shareUrlSource?.then === 'function'
        ? await shareUrlSource
        : shareUrlSource;
    const shareUrl = resolvedShareUrl || buildReplayShareUrl(null);
    const growthPost = await generateGrowthPost(outcome?.type || `DAY_${cycleDay}`, {
        rank: rank.label,
        value: outcome?.value || 0,
        pos: tourney?.rank || 18,
        url: shareUrl,
        wallet: address,
    });

    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in';
    overlay.innerHTML = `
        <div class="max-w-sm w-full bg-slate-900 rounded-[2.5rem] border border-white/10 p-8 text-center animate-scale-up shadow-2xl">
            <div class="relative w-20 h-20 ${isNearLoss ? 'bg-red-500/20' : 'bg-yellow-500/20'} rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg">
                ${renderIcon(isNearLoss ? 'SWORDS' : 'TROPHY', 'w-10 h-10 ' + (isNearLoss ? 'text-red-500' : 'text-yellow-500'))}
                ${conversion.streak > 1 ? `<div class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-red-600 border-2 border-slate-900 flex items-center justify-center text-[10px] font-black text-white">#${conversion.streak}</div>` : ''}
            </div>
            <h2 class="text-2xl font-black text-white uppercase italic tracking-tighter mb-2">
                ${isNearLoss ? 'So Close!' : (isComeback ? 'Insane Comeback!' : 'Legendary Progress!')}
            </h2>
            <p class="text-slate-400 text-sm mb-8">
                ${isNearLoss ? `You lost by only ${outcome.value} HP. Rematch already queued?` : `Share your dominance to the arena feed and climb ranks faster!`}
            </p>
            
            <div class="space-y-3">
                <button id="confirm-share" class="w-full py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-2xl font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-red-500/20">
                    Share Victory
                </button>
                <button id="skip-share" class="w-full py-4 bg-white/5 text-slate-500 rounded-2xl font-bold uppercase tracking-widest hover:text-slate-300 transition-all">
                    Maybe Later
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    $('#confirm-share').onclick = async () => {
        const { shareCustomToFeed } = await import('../utils/social.js');
        const { trackShare } = await import('../lib/api.js');

        await shareCustomToFeed(growthPost.text, growthPost.url);

        trackShare(address, 'farcaster', { type: outcome?.type || 'growth', cycleDay });
        recordShare(address);
        overlay.remove();
        showBattleToast('Shared to Arena Feed!', 'success');
    };

    $('#skip-share').onclick = () => overlay.remove();
}


// NOTE: BUG-07 — the BATTLE_REMATCH_REQUEST and REPLAY_FIGHT_REQUEST listeners
// have been moved into renderBattlePage() and wired to cleanup() above.
// They no longer exist at module scope to prevent listener stacking.
