import { escapeHtml } from '../../utils/html.js';
import { renderIcon } from '../../utils/icons.js';

/**
 * Renders small cards for individual collection performance.
 */
export function renderCollectionStats(collections) {
    if (!collections || collections.length === 0) {
        return '<div class="text-center py-8 opacity-30 col-span-full">No collection data yet</div>';
    }

    return collections.map(col => {
        const maxViews = Math.max(...collections.map(c => c.views), 1);
        const barWidth = Math.max((col.views / maxViews) * 100, 5);
        const safeSlug = escapeHtml(col.slug || 'unknown');

        return `
            <div class="p-3 bg-white/5 rounded-xl border border-white/5 hover:border-indigo-500/20 transition-all cursor-pointer" data-slug="${safeSlug}">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-bold text-sm truncate flex-1">${safeSlug}</span>
                    <span class="text-xs opacity-50 ml-2">${col.successRate || 0}% success</span>
                </div>
                <div class="w-full bg-white/5 rounded-full h-2 mb-2 overflow-hidden">
                    <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style="width: ${barWidth}%"></div>
                </div>
                <div class="flex gap-4 text-xs opacity-60">
                    <span class="inline-flex items-center gap-1">${renderIcon('EYE', 'w-3.5 h-3.5')} ${col.views || 0} views</span>
                    <span class="inline-flex items-center gap-1">${renderIcon('GEM', 'w-3.5 h-3.5')} ${col.mints || 0} mints</span>
                    ${col.volume > 0 ? `<span class="inline-flex items-center gap-1">${renderIcon('CHART', 'w-3.5 h-3.5')} ${col.volume.toFixed(4)} ETH</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}
