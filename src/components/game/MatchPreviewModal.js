import { $, shortenAddress } from '../../utils/dom.js';

/**
 * Premium Match Preview Modal
 * Dramatic VS split-screen with animated stat comparison bars.
 */

const STAT_CONFIG = [
    { key: 'hp', label: 'HP', max: 250, color: '#10b981', icon: '❤️' },
    { key: 'atk', label: 'ATK', max: 50, color: '#ef4444', icon: '⚔️' },
    { key: 'def', label: 'DEF', max: 50, color: '#3b82f6', icon: '🛡️' },
    { key: 'spd', label: 'SPD', max: 50, color: '#f59e0b', icon: '⚡' },
    { key: 'crit', label: 'CRIT', max: 0.75, color: '#fbbf24', icon: '💥', isPercent: true },
    { key: 'dodge', label: 'DODGE', max: 0.75, color: '#8b5cf6', icon: '💨', isPercent: true },
];

function formatStat(value, isPercent = false) {
    if (value == null || value === undefined) return '--';
    if (isPercent) return `${Math.round(value * 100)}%`;
    return Math.round(value);
}

export class MatchPreviewModal {
    constructor(containerId, onBack, onFightCommit, onSelectFighter) {
        this.container = $(`#${containerId}`);
        this.onBack = onBack;
        this.onFightCommit = onFightCommit;
        this.onSelectFighter = onSelectFighter;
        this.enemyData = null;
        this.playerData = null;
    }

    async loadPreview(challengeData) {
        this.enemyData = challengeData;

        // Mock player data for UI visual test until wallet sync is done
        this.playerData = {
            name: 'BaseHead #404',
            stats: { hp: 120, atk: 18, def: 8, spd: 15, crit: 0.15, dodge: 0.05 },
            trait: 'Angry'
        };

        this.render();
    }

    render() {
        if (!this.enemyData) return;

        const pStats = this.playerData ? this.playerData.stats : null;
        const eStats = this.enemyData.stats;

        this.container.innerHTML = `
            <!-- Header -->
            <div class="flex items-center justify-between mb-6">
                <button id="back-to-board-btn" class="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors group">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5 group-hover:-translate-x-0.5 transition-transform">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                    <span class="text-sm text-slate-400">Back</span>
                </button>
                <div class="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Match Preview</div>
            </div>

            <!-- VS Split Layout -->
            <div class="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-0 items-stretch max-w-5xl mx-auto">

                <!-- Player Side -->
                <div class="relative p-6 rounded-2xl md:rounded-r-none bg-gradient-to-br from-indigo-950/40 to-slate-900/60 border border-indigo-500/20 backdrop-blur-sm flex flex-col items-center cursor-pointer group hover:border-indigo-400/40 transition-all" id="select-fighter-btn">
                    <div class="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-bold mb-4">Your Fighter</div>

                    <!-- Avatar -->
                    <div class="w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-indigo-900/30 mb-4 flex items-center justify-center border-2 border-indigo-500/30 group-hover:border-indigo-400/50 transition-all overflow-hidden shadow-[0_0_30px_rgba(99,102,241,0.15)]">
                        ${this.playerData?.imageUrl
                ? `<img src="${this.playerData.imageUrl}" class="w-full h-full object-contain" alt="Your Fighter" />`
                : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-indigo-400 group-hover:scale-110 transition-transform">
                                <path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                               </svg>`
            }
                    </div>

                    <h3 class="text-lg font-bold text-indigo-100 mb-1">${this.playerData ? this.playerData.name : 'Select Fighter'}</h3>
                    <p class="text-xs text-indigo-400/70 mb-4">${this.playerData ? 'Tap to change' : 'Choose from your wallet'}</p>

                    ${this.playerData?.trait ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 mb-4">${this.playerData.trait}</span>` : ''}

                    <!-- Player Stats -->
                    <div class="w-full space-y-2.5 mt-auto">
                        ${STAT_CONFIG.map(s => this.renderStatRow(s, pStats?.[s.key], 'player')).join('')}
                    </div>
                </div>

                <!-- VS Divider -->
                <div class="hidden md:flex flex-col items-center justify-center px-6 relative">
                    <div class="w-px h-full bg-gradient-to-b from-transparent via-white/10 to-transparent absolute"></div>
                    <div class="relative z-10 w-16 h-16 rounded-full bg-slate-900 border-2 border-white/10 flex items-center justify-center shadow-[0_0_40px_rgba(99,102,241,0.2)]">
                        <span class="text-xl font-black bg-clip-text text-transparent bg-gradient-to-br from-red-500 to-orange-500 italic">VS</span>
                    </div>
                </div>
                <!-- Mobile VS -->
                <div class="md:hidden flex justify-center py-2">
                    <div class="w-12 h-12 rounded-full bg-slate-900 border-2 border-white/10 flex items-center justify-center">
                        <span class="text-lg font-black bg-clip-text text-transparent bg-gradient-to-br from-red-500 to-orange-500 italic">VS</span>
                    </div>
                </div>

                <!-- Enemy Side -->
                <div class="relative p-6 rounded-2xl md:rounded-l-none bg-gradient-to-bl from-red-950/30 to-slate-900/60 border border-red-500/20 backdrop-blur-sm flex flex-col items-center">
                    <!-- Opponent badge -->
                    <div class="text-[10px] uppercase tracking-[0.2em] font-bold mb-4 ${this.enemyData.isAi ? 'text-red-400' : 'text-orange-400'}">
                        ${this.enemyData.isAi ? '🤖 AI Opponent' : '⚔️ Opponent'}
                    </div>

                    <!-- Avatar -->
                    <div class="w-28 h-28 md:w-32 md:h-32 rounded-2xl bg-red-900/30 mb-4 flex items-center justify-center border-2 border-red-500/30 overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.15)]">
                        ${this.enemyData?.imageUrl
                ? `<img src="${this.enemyData.imageUrl}" class="w-full h-full object-contain" alt="Opponent" />`
                : `<span class="text-3xl font-black ${this.enemyData?.isAi ? 'text-red-500/60' : 'text-red-500/60'}">${this.enemyData?.isAi ? 'AI' : 'P2'}</span>`
            }
                    </div>

                    <h3 class="text-lg font-bold text-red-100 mb-1">${this.enemyData.collectionName} #${this.enemyData.nftId}</h3>
                    <p class="text-xs font-mono text-red-400/60 truncate max-w-[180px] mb-4" title="${this.enemyData.player}">${shortenAddress(this.enemyData.player)}</p>

                    ${this.enemyData?.trait ? `<span class="text-[10px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/20 mb-4">${this.enemyData.trait}</span>` : ''}

                    <!-- Enemy Stats -->
                    <div class="w-full space-y-2.5 mt-auto">
                        ${STAT_CONFIG.map(s => this.renderStatRow(s, eStats?.[s.key], 'enemy')).join('')}
                    </div>
                </div>
            </div>

            <!-- Stat Comparison Summary -->
            ${pStats ? this.renderComparisonSummary(pStats, eStats) : ''}

            <!-- Fight Button -->
            <div class="flex justify-center mt-8">
                <button id="start-battle-btn"
                    class="${this.playerData
                ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white hover:scale-[1.03] hover:shadow-[0_0_40px_rgba(239,68,68,0.4)] active:scale-[0.97]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            } px-14 py-4 rounded-2xl font-black text-xl transition-all duration-200">
                    ${this.playerData ? (this.enemyData.isAi ? '⚔️ START AI BATTLE' : '⚔️ START BATTLE') : 'SELECT FIGHTER TO BATTLE'}
                </button>
            </div>
        `;

        // Bind events
        $('#back-to-board-btn').addEventListener('click', () => this.onBack());

        $('#select-fighter-btn').addEventListener('click', () => {
            if (this.onSelectFighter) this.onSelectFighter();
        });

        if (this.playerData) {
            $('#start-battle-btn').addEventListener('click', () => {
                const pCombat = { name: this.playerData.name, ...this.playerData.stats, image: this.playerData.imageUrl || '' };
                const eCombat = {
                    name: `${this.enemyData.collectionName} #${this.enemyData.nftId}`,
                    ...this.enemyData.stats,
                    image: this.enemyData.imageUrl || '',
                    isAi: !!this.enemyData.isAi,
                    aiWinRate: this.enemyData.aiWinRate || 0.6
                };

                this.onFightCommit(pCombat, eCombat, {
                    isAiBattle: !!this.enemyData.isAi,
                    aiWinRate: this.enemyData.aiWinRate || 0.6
                });
            });
        }

        // Animate stat bars after render
        requestAnimationFrame(() => {
            this.container.querySelectorAll('.stat-bar-fill').forEach(bar => {
                const target = bar.dataset.target;
                bar.style.width = `${target}%`;
            });
        });
    }

    renderStatRow(config, value, side) {
        const pct = value != null ? Math.min(100, (value / config.max) * 100) : 0;
        const display = formatStat(value, config.isPercent);
        const barColor = side === 'player' ? config.color : config.color;

        return `
            <div class="flex items-center gap-2">
                <span class="text-[10px] w-10 text-right text-slate-500 font-medium">${config.label}</span>
                <div class="flex-1 h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                    <div class="stat-bar-fill h-full rounded-full transition-all duration-700 ease-out" 
                         style="width: 0%; background: ${barColor};" 
                         data-target="${pct}"></div>
                </div>
                <span class="text-[11px] w-8 text-right font-mono ${side === 'player' ? 'text-indigo-300' : 'text-red-300'}">${display}</span>
            </div>
        `;
    }

    renderComparisonSummary(pStats, eStats) {
        let advantages = 0;
        let disadvantages = 0;

        STAT_CONFIG.forEach(s => {
            const pVal = pStats[s.key] || 0;
            const eVal = eStats[s.key] || 0;
            if (pVal > eVal) advantages++;
            else if (eVal > pVal) disadvantages++;
        });

        const verdict = advantages > disadvantages ? 'Favorable' : advantages < disadvantages ? 'Tough' : 'Even';
        const verdictColor = advantages > disadvantages ? 'text-emerald-400' : advantages < disadvantages ? 'text-red-400' : 'text-yellow-400';

        return `
            <div class="flex justify-center gap-6 mt-6 text-xs">
                <span class="text-emerald-400">${advantages} advantages</span>
                <span class="text-slate-600">·</span>
                <span class="text-red-400">${disadvantages} disadvantages</span>
                <span class="text-slate-600">·</span>
                <span class="${verdictColor} font-bold">${verdict} matchup</span>
            </div>
        `;
    }

    hide() {
        this.container.classList.add('hidden');
    }

    show(challengeData) {
        this.container.classList.remove('hidden');
        if (challengeData) {
            this.loadPreview(challengeData);
        }
    }
}
