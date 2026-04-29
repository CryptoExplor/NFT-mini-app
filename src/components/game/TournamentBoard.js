import { $ } from '../../utils/dom.js';
import { getAccount } from '@wagmi/core';
import { wagmiAdapter } from '../../wallet.js';
import { renderIcon } from '../../utils/icons.js';
import { getPlayerTournamentStatus, getTournamentLeaderboard } from '../../lib/game/tournament.js';
import { formatRankBadge, getRankByPoints } from '../../lib/game/rankSystem.js';
import { shortenAddress } from '../../utils/dom.js';

/**
 * TournamentBoard UI Component
 * Displays the current weekly tournament status and leaderboard.
 */
export class TournamentBoard {
    constructor(containerId) {
        this.containerId = containerId;
    }

    async render() {
        const container = $(`#${this.containerId}`);
        if (!container) return;

        const account = getAccount(wagmiAdapter.wagmiConfig);
        const status = getPlayerTournamentStatus(account?.address);
        
        if (!status) {
            container.innerHTML = '<div class="text-center py-12 opacity-50 italic">Tournament system offline.</div>';
            return;
        }

        const { tournament, score, rank } = status;
        const timeLeft = this._getTimeLeft(tournament.end);

        container.innerHTML = `
            <div class="mt-8 mb-6 animate-fade-in">
                <!-- Tournament Hero Header -->
                <div class="relative p-8 rounded-[2rem] overflow-hidden border-2 border-yellow-500/20 bg-gradient-to-br from-yellow-500/10 via-slate-900/60 to-slate-950 shadow-2xl mb-8 group">
                    <div class="absolute -top-24 -right-24 w-64 h-64 bg-yellow-500/10 blur-[100px] rounded-full"></div>
                    
                    <div class="relative flex flex-col md:flex-row items-center justify-between gap-8">
                        <div class="flex items-center gap-6">
                            <div class="w-20 h-20 rounded-3xl bg-yellow-500/20 border-2 border-yellow-500/40 flex items-center justify-center text-4xl shadow-[0_0_40px_rgba(234,179,8,0.2)] animate-pulse">
                                ${renderIcon('TROPHY', 'w-10 h-10 text-yellow-500')}
                            </div>
                            <div class="text-center md:text-left">
                                <div class="flex items-center justify-center md:justify-start gap-3 mb-2">
                                    <h2 class="text-2xl font-black text-white tracking-tighter uppercase italic">Arena Weekly Clash</h2>
                                    <span class="px-2 py-0.5 rounded-full bg-yellow-500 text-slate-950 text-[10px] font-black uppercase tracking-widest">LIVE</span>
                                </div>
                                <div class="flex items-center justify-center md:justify-start gap-4 text-slate-400 font-bold text-xs uppercase tracking-widest">
                                    <span class="flex items-center gap-1.5 text-yellow-500/80">${renderIcon('CLOCK', 'w-4 h-4')} Ends in: ${timeLeft}</span>
                                    <span class="w-1 h-1 bg-slate-700 rounded-full"></span>
                                    <span>ID: ${tournament.id}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div class="flex items-center gap-10 bg-white/5 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-inner">
                            <div class="text-center">
                                <div class="text-3xl font-black text-white tabular-nums">${score}</div>
                                <div class="text-[10px] uppercase tracking-[0.2em] text-yellow-500/60 font-black mt-1">Tourney Pts</div>
                            </div>
                            <div class="w-px h-12 bg-white/10"></div>
                            <div class="text-center">
                                <div class="text-3xl font-black ${rank ? 'text-yellow-400' : 'text-slate-600'} tabular-nums">#${rank || '--'}</div>
                                <div class="text-[10px] uppercase tracking-[0.2em] text-yellow-500/60 font-black mt-1">Your Rank</div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Tournament Leaderboard -->
                <div class="bg-slate-900/40 backdrop-blur-md rounded-[2rem] border border-white/10 overflow-hidden shadow-2xl">
                    <div class="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-xl bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                                ${renderIcon('TROPHY', 'w-4 h-4')}
                            </div>
                            <h3 class="text-sm font-black uppercase tracking-[0.2em] text-white">Top Contenders</h3>
                        </div>
                        <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Updated Real-Time</span>
                    </div>
                    
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="text-[10px] uppercase tracking-[0.2em] text-slate-500 border-b border-white/5">
                                    <th class="px-8 py-5 font-black">Rank</th>
                                    <th class="px-8 py-5 font-black">Challenger</th>
                                    <th class="px-8 py-5 font-black">Power Level</th>
                                    <th class="px-8 py-5 font-black text-right">Points</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-white/[0.03]">
                                ${this._renderLeaderboardRows()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    _renderLeaderboardRows() {
        const board = getTournamentLeaderboard();
        
        if (board.length === 0) {
            return `
                <tr>
                    <td colspan="4" class="px-8 py-20 text-center">
                        <div class="flex flex-col items-center gap-4 opacity-30">
                            <div class="text-5xl">${renderIcon('SWORDS', 'w-12 h-12 text-slate-700')}</div>
                            <p class="text-sm font-bold uppercase tracking-widest italic">The tournament has just begun. Be the first to claim glory!</p>
                        </div>
                    </td>
                </tr>
            `;
        }

        return board.map((entry, idx) => {
            const isTop3 = idx < 3;
            const rankColors = ['text-yellow-400', 'text-slate-300', 'text-amber-600'];
            const rank = getRankByPoints(entry.score);
            
            return `
                <tr class="hover:bg-white/[0.04] transition-all group cursor-default">
                    <td class="px-8 py-5">
                        <div class="flex items-center gap-4">
                            <span class="text-base font-mono ${isTop3 ? rankColors[idx] + ' font-black' : 'text-slate-600 font-bold'}">
                                ${isTop3 ? '0' + (idx + 1) : (idx + 1)}
                            </span>
                            ${idx === 0 ? `<span class="animate-bounce-slow text-yellow-400">${renderIcon('STAR', 'w-4 h-4')}</span>` : ''}
                        </div>
                    </td>
                    <td class="px-8 py-5">
                        <div class="flex flex-col">
                            <span class="text-sm font-black text-slate-200 group-hover:text-white transition-colors tracking-tight italic">${shortenAddress(entry.address)}</span>
                            <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Fighter</span>
                        </div>
                    </td>
                    <td class="px-8 py-5">
                        ${formatRankBadge(rank, 'sm')}
                    </td>
                    <td class="px-8 py-5 text-right">
                        <div class="flex flex-col items-end">
                            <span class="text-lg font-black text-yellow-500 tracking-tighter">${entry.score.toLocaleString()}</span>
                            <span class="text-[9px] font-black text-yellow-500/40 uppercase tracking-widest">PTS</span>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    _getTimeLeft(endTs) {
        const diff = endTs - Date.now();
        if (diff <= 0) return 'EXPIRED';

        const days = Math.floor(diff / (24 * 60 * 60 * 1000));
        const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
        const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));

        return `${days}d ${hours}h ${minutes}m`;
    }

    show() { this.render(); }
}
