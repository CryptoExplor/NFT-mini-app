import { $ } from '../../utils/dom.js';
import { getAccount } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';
import { renderIcon } from '../../utils/icons.js';
import { getPlayerPoints, getGlobalLeaderboard } from '../../lib/game/points.js';
import { getRankByPoints, formatRankBadge } from '../../lib/game/rankSystem.js';
import { shortenAddress } from '../../utils/dom.js';
import { escapeHtml } from '../../utils/html.js';
import { TournamentBoard } from './TournamentBoard.js';

const HISTORY_KEY = 'battle_history';

export function getReplayHref(battleId) {
    return `/battle?replay=${encodeURIComponent(battleId)}`;
}

/**
 * Save a battle result to localStorage (legacy - kept for quick optimistic UI)
 */
export function saveBattleResult(result) {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        history.unshift({
            id: `battle_${Date.now()}`,
            playerName: result.playerName,
            enemyName: result.enemyName,
            playerWon: result.playerWon,
            isAi: result.isAi || false,
            rounds: result.rounds || 0,
            playerDmg: result.playerDmg || 0,
            enemyDmg: result.enemyDmg || 0,
            crits: result.crits || 0,
            dodges: result.dodges || 0,
            timestamp: Date.now()
        });
        if (history.length > 50) history.length = 50;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (_) { }
}

/**
 * Read the legacy local history for optimistic UI / offline fallback.
 */
function getLegacyBattleStats() {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').map((battle) => ({
            ...battle,
            canReplay: false,
        }));
        const wins = history.filter((battle) => battle.playerWon).length;
        const losses = history.filter((battle) => !battle.playerWon).length;
        const total = history.length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const totalDmg = history.reduce((sum, battle) => sum + (battle.playerDmg || 0), 0);
        const totalCrits = history.reduce((sum, battle) => sum + (battle.crits || 0), 0);

        const winnerCounts = {};
        history.filter((battle) => battle.playerWon).forEach((battle) => {
            winnerCounts[battle.playerName] = (winnerCounts[battle.playerName] || 0) + 1;
        });

        const bestFighter = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';
        return { wins, losses, total, winRate, totalDmg, totalCrits, bestFighter, history, source: 'local' };
    } catch (_) {
        return { wins: 0, losses: 0, total: 0, winRate: 0, totalDmg: 0, totalCrits: 0, bestFighter: 'None', history: [], source: 'local' };
    }
}

/**
 * Get verifiable battle stats from API
 */
export async function getBattleStats(walletAddress) {
    try {
        if (!walletAddress) return getLegacyBattleStats();

        const { getBattleHistory } = await import('../../lib/game/matchmaking.js');
        const rawHistory = await getBattleHistory(walletAddress);

        if (!rawHistory || !rawHistory.length) return getLegacyBattleStats();
        const normalizedWallet = String(walletAddress).toLowerCase();
        const history = rawHistory.map((record) => {
            const p1 = record?.players?.p1;
            const p2 = record?.players?.p2;
            if (!p1?.name || !p2?.name) return null;

            const isWalletP1 = String(p1.id || '').toLowerCase() === normalizedWallet;
            const side = isWalletP1 ? 'P1' : 'P2';
            const opponent = isWalletP1 ? p2 : p1;
            const logs = Array.isArray(record.logs) ? record.logs : [];
            const fallbackPlayerDmg = logs
                .filter((log) => log.attackerSide === side)
                .reduce((sum, log) => sum + (log.damage || 0), 0);
            const fallbackEnemyDmg = logs
                .filter((log) => log.attackerSide !== side)
                .reduce((sum, log) => sum + (log.damage || 0), 0);

            return {
                id: record.battleId,
                playerName: isWalletP1 ? p1.name : p2.name,
                enemyName: opponent?.name || 'Unknown',
                playerWon: record.result?.winnerSide === side,
                isAi: Boolean(record.options?.isAiBattle),
                rounds: record.result?.rounds || logs[logs.length - 1]?.round || 0,
                playerDmg: side === 'P1' ? (record.extras?.p1Dmg ?? fallbackPlayerDmg) : (record.extras?.p2Dmg ?? fallbackPlayerDmg),
                enemyDmg: side === 'P1' ? (record.extras?.p2Dmg ?? fallbackEnemyDmg) : (record.extras?.p1Dmg ?? fallbackEnemyDmg),
                crits: logs.filter((log) => log.attackerSide === side && log.isCrit).length,
                dodges: logs.filter((log) => log.targetSide === side && log.isDodge).length,
                timestamp: record.createdAt || Date.now(),
                canReplay: Boolean(record.battleId)
            };
        }).filter(Boolean);

        const wins = history.filter(h => h.playerWon).length;
        const total = history.length;

        return { 
            wins, 
            losses: total - wins, 
            total, 
            winRate: total > 0 ? Math.round((wins/total)*100) : 0, 
            totalDmg: history.reduce((s, h) => s + h.playerDmg, 0),
            totalCrits: history.reduce((s, h) => s + h.crits, 0),
            bestFighter: 'Various',
            history, 
            source: 'synced' 
        };
    } catch (err) {
        return getLegacyBattleStats();
    }
}

/**
 * BattleLeaderboard UI Component
 */
export class BattleLeaderboard {
    constructor(containerId) {
        this.containerId = containerId;
        this.currentView = 'leaderboard';
        this.boardType = 'global'; // global, daily, tournament
        this.historyData = [];
        this.tournamentBoard = new TournamentBoard(null); // will be used to render partials
    }

    async render() {
        const container = $(`#${this.containerId}`);
        if (!container) return;

        const account = getAccount(wagmiAdapter.wagmiConfig);
        const playerPoints = getPlayerPoints(account?.address);
        const playerRank = getRankByPoints(playerPoints);
        
        // Calculate Global Rank from leaderboard
        const board = await getGlobalLeaderboard();
        const globalRankIdx = board.findIndex(e => e.address === account?.address);
        const globalRankText = globalRankIdx !== -1 ? `#${globalRankIdx + 1}` : (account?.address ? '#50+' : '#--');

        container.innerHTML = `
            <div class="mt-8 mb-6">
                <!-- Player Status Card -->
                <div class="relative p-6 rounded-3xl overflow-hidden border border-white/10 bg-slate-900/40 backdrop-blur-md mb-8 group">
                    <div class="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-transparent"></div>
                    <div class="relative flex flex-col md:flex-row items-center justify-between gap-6">
                        <div class="flex items-center gap-5">
                            <div class="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl shadow-xl">
                                ${renderIcon('USER', 'w-8 h-8 ' + playerRank.textClass)}
                            </div>
                            <div class="text-center md:text-left">
                                <div class="flex items-center justify-center md:justify-start gap-2 mb-1">
                                    <h2 class="text-xl font-black text-white">${account?.address ? shortenAddress(account.address) : 'Guest Player'}</h2>
                                    ${formatRankBadge(playerRank, 'lg')}
                                </div>
                                <p class="text-slate-500 text-sm font-medium">Global Ranking Status</p>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-8">
                            <div class="text-center">
                                <div class="text-2xl font-black text-white">${playerPoints}</div>
                                <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Arena Points</div>
                            </div>
                            <div class="w-px h-10 bg-white/10"></div>
                            <div class="text-center">
                                <div class="text-2xl font-black text-indigo-400">${globalRankText}</div>
                                <div class="text-[10px] uppercase tracking-widest text-slate-500 font-bold">Global Rank</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- View Toggle -->
                <div class="flex items-center justify-center gap-2 mb-8 p-1.5 bg-white/5 border border-white/10 rounded-2xl w-fit mx-auto">
                    <button id="lb-view-board" class="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${this.currentView === 'leaderboard' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}">Leaderboard</button>
                    <button id="lb-view-history" class="px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${this.currentView === 'history' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}">My History</button>
                </div>

                <div id="lb-content-area">
                    ${this.currentView === 'leaderboard' ? await this.renderLeaderboardView() : await this.renderHistoryView()}
                </div>
            </div>
        `;

        this._attachEvents();
    }

    async renderLeaderboardView() {
        if (this.boardType === 'tournament') {
            const tempDiv = document.createElement('div');
            tempDiv.id = 'temp-tournament-container';
            this.tournamentBoard.containerId = tempDiv.id;
            await this.tournamentBoard.render();
            return tempDiv.innerHTML;
        }

        const board = await getGlobalLeaderboard();
        
        return `
            <div class="bg-white/[0.03] backdrop-blur-sm rounded-3xl border border-white/10 overflow-hidden">
                <div class="p-5 border-b border-white/5 flex items-center justify-between">
                    <h3 class="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Elite Standings</h3>
                    <div class="flex items-center gap-2 px-2 py-1 bg-white/5 rounded-lg border border-white/5">
                        <button id="lb-type-global" class="text-[9px] font-bold px-2 py-0.5 rounded transition-all ${this.boardType === 'global' ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:text-slate-300'}">GLOBAL</button>
                        <button id="lb-type-tournament" class="text-[9px] font-bold px-2 py-0.5 rounded transition-all ${this.boardType === 'tournament' ? 'bg-yellow-500 text-slate-950' : 'text-slate-500 hover:text-slate-300'}">TOURNAMENT</button>
                    </div>
                </div>
                
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                                <th class="px-6 py-4 font-bold">Rank</th>
                                <th class="px-6 py-4 font-bold">Fighter</th>
                                <th class="px-6 py-4 font-bold">Status</th>
                                <th class="px-6 py-4 font-bold text-right">Points</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/[0.03]">
                            ${board.length === 0 ? `
                                <tr><td colspan="4" class="px-6 py-12 text-center text-slate-600 text-sm italic">The arena is empty... for now.</td></tr>
                            ` : board.map((entry, idx) => {
                                const rank = getRankByPoints(entry.score);
                                return `
                                    <tr class="hover:bg-white/[0.02] transition-colors group">
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-3">
                                                <span class="text-sm font-mono ${idx < 3 ? 'text-indigo-400 font-black' : 'text-slate-500'}">#${idx + 1}</span>
                                                ${idx === 0 ? `<span class="text-yellow-400">${renderIcon('STAR', 'w-5 h-5')}</span>` : ''}
                                            </div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">${shortenAddress(entry.address)}</span>
                                        </td>
                                        <td class="px-6 py-4">
                                            ${formatRankBadge(rank)}
                                        </td>
                                        <td class="px-6 py-4 text-right">
                                            <span class="text-sm font-black text-indigo-400">${entry.score}</span>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    async renderHistoryView() {
        const account = getAccount(wagmiAdapter.wagmiConfig);
        const stats = await getBattleStats(account?.address);
        this.historyData = stats.history;

        const sourceBadge = stats.source === 'synced'
            ? '<span class="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">SERVER SYNCED</span>'
            : '<span class="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">LOCAL FALLBACK</span>';

        return `
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                ${this._statCard(renderIcon('SWORDS', 'w-5 h-5'), 'Battles', stats.total, 'indigo')}
                ${this._statCard(renderIcon('TROPHY', 'w-5 h-5'), 'Wins', stats.wins, 'emerald')}
                ${this._statCard(renderIcon('SKULL', 'w-5 h-5'), 'Losses', stats.losses, 'red')}
                ${this._statCard(renderIcon('CHART', 'w-5 h-5'), 'Win Rate', `${stats.winRate}%`, stats.winRate >= 50 ? 'emerald' : 'orange')}
            </div>

            <div class="bg-white/[0.03] backdrop-blur-sm rounded-3xl border border-white/10 p-5">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Recent Encounters</h3>
                    ${sourceBadge}
                </div>
                <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                    ${stats.history.length === 0
                        ? '<div class="text-slate-600 text-sm text-center py-12 italic">No battles documented. Enter the arena to start your legacy.</div>'
                        : stats.history.slice(0, 30).map(b => this._battleRow(b)).join('')
                    }
                </div>
            </div>
        `;
    }

    _statCard(iconHtml, label, value, color) {
        return `
            <div class="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-${color}-500/20 p-3 text-center group hover:border-${color}-500/40 transition-colors">
                <div class="flex justify-center text-${color}-400 mb-1 group-hover:scale-110 transition-transform">${iconHtml}</div>
                <div class="text-lg font-black text-${color}-400">${value}</div>
                <div class="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">${label}</div>
            </div>
        `;
    }

    _battleRow(battle) {
        const won = battle.playerWon;
        const badge = won
            ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-bold">WIN</span>'
            : '<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 border border-red-500/20 font-bold">LOSS</span>';
        const aiTag = battle.isAi ? '<span class="text-[9px] px-1 py-0.5 rounded bg-orange-500/15 text-orange-400 ml-1 font-mono">AI</span>' : '';
        const timeAgo = this._timeAgo(battle.timestamp);

        return `
            <div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] group transition-colors">
                <div class="flex items-center gap-2 min-w-0">
                    ${badge}${aiTag}
                    <span class="text-sm text-slate-300 truncate font-medium">vs ${escapeHtml(battle.enemyName)}</span>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                    <span class="text-[10px] text-slate-500 font-mono hidden md:inline-block">${battle.rounds} ROUNDS</span>
                    ${battle.canReplay ? this.renderReplayButton(battle.id) : '<span class="text-[9px] px-2 py-1 rounded border border-white/10 text-slate-500 font-mono">LOCAL</span>'}
                    <span class="text-[10px] text-slate-600 font-mono min-w-[30px] text-right">${timeAgo}</span>
                </div>
            </div>
        `;
    }

    renderReplayButton(battleId) {
        return `
            <div class="flex items-center gap-1.5">
                <button class="replay-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-xs font-bold transition-all active:scale-95 group" data-battle-id="${battleId}">
                    ${renderIcon('PLAY', 'w-3.5 h-3.5 group-hover:scale-110 transition-transform')}
                    WATCH
                </button>
            </div>
        `;
    }

    _attachEvents() {
        $('#lb-view-board')?.addEventListener('click', () => {
            this.currentView = 'leaderboard';
            this.render();
        });
        $('#lb-view-history')?.addEventListener('click', () => {
            this.currentView = 'history';
            this.render();
        });

        $('#lb-type-global')?.addEventListener('click', () => {
            this.boardType = 'global';
            this.render();
        });

        $('#lb-type-tournament')?.addEventListener('click', () => {
            this.boardType = 'tournament';
            this.render();
        });

        this._attachReplayEvents();
        this._attachGlobalEvents();
    }

    _attachGlobalEvents() {
        // Listen for external tab switches (e.g. from Tournament Banner)
        if (!window._leaderboardEventAttached) {
            document.addEventListener('SWITCH_TAB', (e) => {
                if (e.detail.tab === 'leaderboard') {
                    this.currentView = 'leaderboard';
                    if (e.detail.subTab === 'tournament') {
                        this.boardType = 'tournament';
                    }
                    this.render();
                }
            });
            window._leaderboardEventAttached = true;
        }
    }

    _attachReplayEvents() {
        document.querySelectorAll('.replay-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const battleId = btn.getAttribute('data-battle-id');
                document.dispatchEvent(new CustomEvent('BATTLE_REPLAY_REQUEST', {
                    detail: { battleId }
                }));
            });
        });
    }

    _timeAgo(ts) {
        const diff = Date.now() - ts;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h`;
        return `${Math.floor(hrs / 24)}d`;
    }

    show() { this.render(); }
}
