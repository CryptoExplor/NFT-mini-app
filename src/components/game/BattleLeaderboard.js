import { $ } from '../../utils/dom.js';

const HISTORY_KEY = 'battle_history';
const MAX_HISTORY = 50;

/**
 * Save a battle result to localStorage.
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
        // Keep only the last N entries
        if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (_) { /* quota or private mode */ }
}

/**
 * Get battle stats from localStorage.
 */
export function getBattleStats() {
    try {
        const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
        const wins = history.filter(b => b.playerWon).length;
        const losses = history.filter(b => !b.playerWon).length;
        const total = history.length;
        const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
        const totalDmg = history.reduce((s, b) => s + (b.playerDmg || 0), 0);
        const totalCrits = history.reduce((s, b) => s + (b.crits || 0), 0);

        // Best fighter (most frequent winner)
        const winnerCounts = {};
        history.filter(b => b.playerWon).forEach(b => {
            winnerCounts[b.playerName] = (winnerCounts[b.playerName] || 0) + 1;
        });
        const bestFighter = Object.entries(winnerCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None';

        return { wins, losses, total, winRate, totalDmg, totalCrits, bestFighter, history };
    } catch (_) {
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

    render() {
        const container = $(`#${this.containerId}`);
        if (!container) return;

        const stats = getBattleStats();

        container.innerHTML = `
            <div class="mt-8 mb-6">
                <!-- Stats Cards -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    ${this._statCard('⚔️', 'Battles', stats.total, 'indigo')}
                    ${this._statCard('🏆', 'Wins', stats.wins, 'emerald')}
                    ${this._statCard('💀', 'Losses', stats.losses, 'red')}
                    ${this._statCard('📊', 'Win Rate', `${stats.winRate}%`, stats.winRate >= 50 ? 'emerald' : 'orange')}
                </div>

                <!-- Extra Stats Row -->
                <div class="grid grid-cols-3 gap-3 mb-6">
                    ${this._statCard('💥', 'Total Dmg', stats.totalDmg.toLocaleString(), 'orange')}
                    ${this._statCard('🎯', 'Crits', stats.totalCrits, 'yellow')}
                    ${this._statCard('🥇', 'Best Fighter', stats.bestFighter, 'purple')}
                </div>

                <!-- Recent Battles -->
                <div class="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/10 p-4">
                    <h3 class="text-xs uppercase tracking-[0.2em] text-slate-400 mb-3 font-bold">Recent Battles</h3>
                    <div class="space-y-2 max-h-[280px] overflow-y-auto custom-scrollbar">
                        ${stats.history.length === 0
                ? '<div class="text-slate-600 text-sm text-center py-6">No battles yet. Challenge an opponent!</div>'
                : stats.history.slice(0, 15).map(b => this._battleRow(b)).join('')
            }
                    </div>
                </div>
            </div>
        `;
    }

    _statCard(icon, label, value, color) {
        return `
            <div class="bg-white/[0.03] backdrop-blur-sm rounded-xl border border-${color}-500/20 p-3 text-center">
                <div class="text-lg mb-0.5">${icon}</div>
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
        const aiTag = battle.isAi ? '<span class="text-[9px] px-1 py-0.5 rounded bg-orange-500/15 text-orange-400 ml-1">AI</span>' : '';
        const timeAgo = this._timeAgo(battle.timestamp);

        return `
            <div class="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/[0.03] transition-colors">
                <div class="flex items-center gap-2 min-w-0">
                    ${badge}${aiTag}
                    <span class="text-sm text-slate-300 truncate">${battle.playerName} <span class="text-slate-600">vs</span> ${battle.enemyName}</span>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0">
                    <span class="text-[10px] text-slate-500 font-mono">${battle.rounds}R</span>
                    <span class="text-[10px] text-slate-600">${timeAgo}</span>
                </div>
            </div>
        `;
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
