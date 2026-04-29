/**
 * Elite Rank & Progression System
 * Maps points to social status and visual tiering.
 */

export const RANKS = [
    { id: 'mythic', label: 'Mythic', minPoints: 1500, color: '#f59e0b', textClass: 'text-orange-400', bgClass: 'bg-orange-500/10', glowClass: 'shadow-orange-500/20' },
    { id: 'legend', label: 'Legend', minPoints: 700, color: '#fcd34d', textClass: 'text-yellow-400', bgClass: 'bg-yellow-500/10', glowClass: 'shadow-yellow-500/20' },
    { id: 'elite', label: 'Elite', minPoints: 300, color: '#a855f7', textClass: 'text-purple-400', bgClass: 'bg-purple-500/10', glowClass: 'shadow-purple-500/20' },
    { id: 'warrior', label: 'Warrior', minPoints: 100, color: '#3b82f6', textClass: 'text-blue-400', bgClass: 'bg-blue-500/10', glowClass: 'shadow-blue-500/20' },
    { id: 'rookie', label: 'Rookie', minPoints: 0, color: '#94a3b8', textClass: 'text-slate-400', bgClass: 'bg-slate-500/10', glowClass: 'shadow-slate-500/20' }
];

export function getRankByPoints(points) {
    return RANKS.find(r => points >= r.minPoints) || RANKS[RANKS.length - 1];
}

export function getNextRank(points) {
    const current = getRankByPoints(points);
    const currentIndex = RANKS.findIndex(r => r.id === current.id);
    if (currentIndex === 0) return null; // Already mythic
    return RANKS[currentIndex - 1];
}

export function formatRankBadge(rank, size = 'sm') {
    const sizeClasses = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';
    return `
        <span class="${sizeClasses} font-black uppercase tracking-widest rounded-lg border border-current ${rank.bgClass} ${rank.textClass} flex items-center gap-1.5 shadow-lg ${rank.glowClass}">
            <span class="w-1.5 h-1.5 rounded-full bg-current animate-pulse"></span>
            ${rank.label}
        </span>
    `;
}
