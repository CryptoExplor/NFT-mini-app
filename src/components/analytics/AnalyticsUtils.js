import { renderIcon } from '../../utils/icons.js';

/**
 * Common Summary Card Template
 */
export function summaryCard(icon, label, value, color) {
    const colors = {
        indigo: 'from-indigo-500/20 to-indigo-600/5 border-indigo-500/20',
        green: 'from-green-500/20 to-green-600/5 border-green-500/20',
        yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20',
        purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/20',
        cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20',
        blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
        emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20',
        red: 'from-red-500/20 to-red-600/5 border-red-500/20',
    };

    return `
        <div class="glass-card p-4 rounded-xl border ${colors[color] || colors.indigo} bg-gradient-to-br ${colors[color] || colors.indigo}">
            <div class="text-lg mb-1">${icon}</div>
            <div class="text-xs opacity-50 uppercase tracking-wide mb-1">${label}</div>
            <div class="text-xl md:text-2xl font-bold">${typeof value === 'number' ? value.toLocaleString() : value}</div>
        </div>
    `;
}

/**
 * Standard Analytics Icon Wrapper
 */
export function renderAnalyticsIcon(iconName, colorClass = 'text-indigo-300', size = 'w-5 h-5') {
    return `<span class="${colorClass} inline-flex">${renderIcon(iconName, size)}</span>`;
}

/**
 * Time formatting utility
 */
export function getTimeAgo(timestamp) {
    if (!timestamp) return '';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
