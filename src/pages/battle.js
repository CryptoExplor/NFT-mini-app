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
import { postChallenge, recordAiBattle } from '../lib/game/matchmaking.js';
import {
    getCurrentBattleLoadout,
    getCurrentBattleSelection,
    restoreLastBattleSelection,
    saveLastBattleSelection,
} from '../lib/battle/loadoutSession.js';
import { BattleLeaderboard, saveBattleResult } from '../components/game/BattleLeaderboard.js';
import { trackBattleLoadout, trackBattleStarted, trackBattleResult } from '../lib/api.js';
import { renderIcon } from '../utils/icons.js';

/** Inline toast for Farcaster miniapp (no browser alert) */
function showBattleToast(message, type = 'error') {
    const existing = document.getElementById('battle-toast');
    if (existing) existing.remove();
    const bg = type === 'error' ? 'rgba(239,68,68,0.92)' : 'rgba(16,185,129,0.92)';
    const border = type === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)';
    document.body.insertAdjacentHTML('beforeend', `
        <div id="battle-toast" style="position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:200;padding:12px 20px;border-radius:12px;background:${bg};border:1px solid ${border};color:#fff;font-size:14px;font-weight:500;text-align:center;max-width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.4);backdrop-filter:blur(8px);">
            ${message}
        </div>
    `);
    setTimeout(() => document.getElementById('battle-toast')?.remove(), 3500);
}

let walletHandler = null;

export async function renderBattlePage() {
    // Force dark mode on battle arena entry
    setThemePreference('dark');

    // Load live balance patches from CDN (fire-and-forget, falls back to bundled)
    import('../lib/battle/balanceConfig.js').then(({ loadBalanceOverrides }) => loadBalanceOverrides()).catch(() => {});

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
                        ${renderThemeToggleButton('theme-toggle-battle')}
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

                // V2 Analytics: track battle start
                trackBattleStarted(state.wallet?.address, {
                    isAi,
                    challengeId: previewModal.enemyData?.id || null,
                    opponent: enemyCombatStats.name || null,
                });

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
                }

                $('#battle-loading-overlay')?.remove();

                renderCombatArena(playerCombatStats, enemyCombatStats, (battleData) => {
                    console.log("Match concluded! Winner:", winner);
                    // Save battle result to localStorage for leaderboard
                    const logs = replayLogs || [];
                    const p1Dmg = logs.filter(l => l.attackerSide === 'P1').reduce((s, l) => s + (l.damage || 0), 0);
                    const p2Dmg = logs.filter(l => l.attackerSide === 'P2').reduce((s, l) => s + (l.damage || 0), 0);
                    const expectedPlayerSide = isAi ? 'P1' : 'P2';
                    const playerWon = winnerSide ? winnerSide === expectedPlayerSide : winner === playerCombatStats.name;
                    const totalRounds = logs[logs.length - 1]?.round || 1;
                    saveBattleResult({
                        playerName: playerCombatStats.name,
                        enemyName: enemyCombatStats.name,
                        playerWon,
                        isAi: isAi,
                        rounds: totalRounds,
                        playerDmg: p1Dmg,
                        enemyDmg: p2Dmg,
                        crits: logs.filter(l => l.isCrit).length,
                        dodges: logs.filter(l => l.isDodge).length
                    });

                    // Persist AI battle to server so it appears in verifiable history
                    if (isAi && state.wallet?.address) {
                        const loadout = getCurrentBattleLoadout();
                        recordAiBattle(state.wallet.address, {
                            seed: battleSeed,
                            playerStats: playerCombatStats,
                            enemyStats: enemyCombatStats,
                            result: {
                                winnerSide,
                                winner,
                                totalRounds,
                            },
                            loadout,
                            // Pre-computed stats stored so leaderboard doesn't need to re-simulate
                            extras: {
                                p1Dmg,
                                p2Dmg,
                                crits: logs.filter(l => l.isCrit).length,
                            },
                            // Store logs for replays
                            logs: logs,
                        }).catch(() => {}); // fire-and-forget
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
            const res = await fetch(`/api/battle?action=replay&id=${battleId}`);
            if (!res.ok) throw new Error('Replay not found');
            const data = await res.json();

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
        } catch (err) {
            console.error('Replay error:', err);
            $('#battle-loading-overlay')?.remove();
            showBattleToast('Failed to load replay.');
            switchTab('stats');
        }
    };

    document.addEventListener('BATTLE_REPLAY_REQUEST', replayHandler);
    window._battleReplayHandler = replayHandler;
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
}

function updateBattleHeader(account) {
    const connectBtn = document.getElementById('battle-connect-btn');
    if (connectBtn) {
        const glow = connectBtn.querySelector('.status-glow');
        const avatar = document.getElementById('battle-connect-avatar');
        const text = document.getElementById('battle-connect-text');

        applyMiniAppAvatar(avatar);

        if (account?.isConnected) {
            if (glow) { glow.style.background = '#10B981'; glow.style.boxShadow = '0 0 10px #10B981'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
        } else {
            if (glow) { glow.style.background = '#EF4444'; glow.style.boxShadow = '0 0 10px #EF4444'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
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
}
