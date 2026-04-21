import { $ } from '../../utils/dom.js';
import { getAccount } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';

const HISTORY_KEY = 'battle_history';

/**
 * Save a battle result to localStorage (legacy - kept for quick optimistic UI, though server is source of truth)
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
 * Get Verifiable battle stats from API and recreate logs using deterministic engine.
 */
export async function getBattleStats(walletAddress) {
    try {
        // Fallback to empty if no wallet is connected
        if (!walletAddress) {
            return { wins: 0, losses: 0, total: 0, winRate: 0, totalDmg: 0, totalCrits: 0, bestFighter: 'None', history: [] };
        }

        const { getBattleHistory } = await import('../../lib/game/matchmaking.js');
        const rawHistory = await getBattleHistory(walletAddress);

        // If backend fails or is empty, we fall back to empty
        if (!rawHistory || !rawHistory.length) {
             return { wins: 0, losses: 0, total: 0, winRate: 0, totalDmg: 0, totalCrits: 0, bestFighter: 'None', history: [] };
        }

        const { simulateBattle } = await import('../../lib/game/engine.js');
        const { createPRNG } = await import('../../lib/battle/prng.js');

        let wins = 0, losses = 0, total = rawHistory.length, totalDmg = 0, totalCrits = 0;
        const winnerCounts = {};
        const history = [];

        for (const record of rawHistory) {
            if (!record.seed || !record.players) continue;

            const prng = createPRNG(record.seed);
            const p1 = record.players.p1;
            const p2 = record.players.p2;

            const battleResult = simulateBattle(
                { name: p1.name, ...p1.stats },
                { name: p2.name, ...p2.stats },
                prng,
                {
                    playerItem: p1.item,
                    enemyItem: p2.item,
                    environment: p1.arena,
                    playerTeam: p1.team || [],
                    enemyTeam: p2.team || [],
                    isAiBattle: record.options?.isAiBattle || false
                }
            );

            // Verifiability check warning
            if (battleResult.winnerSide !== record.result?.winnerSide) {
                console.warn(`[Verifiability] Check Failed! Battle ${record.battleId} server winner ${record.result?.winnerSide} mismatches simulation ${battleResult.winnerSide}`);
            }

            // Figure out if current wallet won
            const isWalletP1 = p1.id?.toLowerCase() === walletAddress.toLowerCase();
            const walletWon = (isWalletP1 && battleResult.winnerSide === 'P1') || (!isWalletP1 && battleResult.winnerSide === 'P2');
            
            if (walletWon) wins++; else losses++;

            // Recreate damage stats via deterministic logs
            const myName = isWalletP1 ? p1.name : p2.name;
            const myLogs = battleResult.logs.filter(l => l.attacker === myName);
            
            const battleDmg = myLogs.reduce((s, l) => s + (l.damage || 0), 0);
            const battleCrits = myLogs.filter(l => l.isCrit).length;

            totalDmg += battleDmg;
            totalCrits += battleCrits;

            if (walletWon) {
                winnerCounts[myName] = (winnerCounts[myName] || 0) + 1;
            }

            history.push({
                id: record.battleId,
                playerName: myName,
                enemyName: isWalletP1 ? p2.name : p1.name,
                playerWon: walletWon,
                isAi: record.options?.isAiBattle || false,
                rounds: battleResult.totalRounds,
                playerDmg: battleDmg,
                crits: battleCrits,
                timestamp: record.createdAt || Date.now()
            });
        }

        // Sort descending by timestamp
        history.sort((a, b) => b.timestamp - a.timestamp);

        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const bestFighter = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

        return { wins, losses, total, winRate, totalDmg, totalCrits, bestFighter, history };
    } catch (err) {
        console.error("Leaderboard Stats Error:", err);
        return { wins: 0, losses: 0, total: 0, winRate: 0, totalDmg: 0, totalCrits: 0, bestFighter: 'None', history: [] };
    }
}

/**
 * BattleLeaderboard UI Component
 */
export class BattleLeaderboard {
    constructor(containerId) {
        this.containerId = containerId;
    }

    async render() {
        const container = $(`#${this.containerId}`);
        if (!container) return;

        // Start loading state
        container.innerHTML = `
            <div class="mt-8 mb-6 text-center py-12">
                <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-4"></div>
                <div class="text-sm font-mono text-slate-400">SYNCING VERIFIABLE HISTORY...</div>
            </div>
        `;

        const account = getAccount(wagmiAdapter.wagmiConfig);
        const stats = await getBattleStats(account?.address);

        container.innerHTML = `
            <div class="mt-8 mb-6">
                <!-- Stats Cards -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    ${this._statCard(renderIcon('SWORDS', 'w-5 h-5'), 'Battles', stats.total, 'indigo')}
                    ${this._statCard(renderIcon('TROPHY', 'w-5 h-5'), 'Wins', stats.wins, 'emerald')}
                    ${this._statCard(renderIcon('SKULL', 'w-5 h-5'), 'Losses', stats.losses, 'red')}
                    ${this._statCard(renderIcon('CHART', 'w-5 h-5'), 'Win Rate', `${stats.winRate}%`, stats.winRate >= 50 ? 'emerald' : 'orange')}
                </div>

                <!-- Extra Stats Row -->
                <div class="grid grid-cols-3 gap-3 mb-6">
                    ${this._statCard(renderIcon('DAMAGE', 'w-5 h-5'), 'Total Dmg', stats.totalDmg.toLocaleString(), 'orange')}
                    ${this._statCard(renderIcon('CRIT', 'w-5 h-5'), 'Crits', stats.totalCrits, 'yellow')}
                    ${this._statCard(renderIcon('FLAME', 'w-5 h-5'), 'Best Fighter', stats.bestFighter, 'purple')}
                </div>

                <!-- Recent Battles -->
                <div class="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Verifiable History</h3>
                        <span class="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">SERVER SYNCED</span>
                    </div>
                    <div class="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
                        ${stats.history.length === 0
                ? '<div class="text-slate-600 text-sm text-center py-6">No battles yet. Challenge an opponent!</div>'
                : stats.history.slice(0, 15).map(b => this._battleRow(b)).join('')
            }
                    </div>
                </div>
            </div>
        `;
        this._attachReplayEvents(stats.history);
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
                    <span class="text-sm text-slate-300 truncate font-medium">vs ${battle.enemyName}</span>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                    <span class="text-[10px] text-slate-500 font-mono hidden md:inline-block">${battle.rounds} ROUNDS</span>
                    ${this.renderReplayButton(battle.id)}
                    <span class="text-[10px] text-slate-600 font-mono min-w-[30px] text-right">${timeAgo}</span>
                </div>
            </div>
        `;
    }

    renderReplayButton(battleId) {
        return `
            <button class="replay-btn flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 text-xs font-bold transition-all active:scale-95 group" data-battle-id="${battleId}">
                ${renderIcon('PLAY', 'w-3.5 h-3.5 group-hover:scale-110 transition-transform')}
                WATCH
            </button>
        `;
    }

    _attachReplayEvents(history) {
        document.querySelectorAll('.replay-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const battleId = btn.getAttribute('data-battle-id');
                const battle = history.find(h => h.id === battleId);
                if (!battle) return;

                // Fire custom event to battle page to show replay
                document.dispatchEvent(new CustomEvent('BATTLE_REPLAY_REQUEST', {
                    detail: { battleId: battle.id }
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
