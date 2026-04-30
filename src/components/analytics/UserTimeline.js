import { escapeHtml } from '../../utils/html.js';
import { renderIcon } from '../../utils/icons.js';
import { renderAnalyticsIcon } from './AnalyticsUtils.js';

export function renderMintHistory(userStats) {
    if (!userStats?.journey || userStats.journey.length === 0) return '';

    const mints = userStats.journey.filter(e => e.type === 'mint_success');
    if (mints.length === 0) return '';

    return `
        <div class="glass-card p-5 rounded-2xl border border-green-500/20 bg-gradient-to-r from-green-500/5 to-emerald-500/5">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                ${renderAnalyticsIcon('GEM', 'text-green-400')} Your Mint History
                <span class="text-xs font-normal opacity-40 ml-auto">${mints.length} mints</span>
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                ${mints.map(mint => {
        const safeCollection = escapeHtml(mint.collection || 'Unknown Collection');
        const safeTxHash = encodeURIComponent(String(mint.txHash || ''));
        return `
                    <div class="p-3 bg-white/5 rounded-xl border border-white/5 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center text-green-300 flex-shrink-0">${renderIcon('GEM', 'w-5 h-5')}</div>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-bold truncate">${safeCollection}</div>
                            <div class="text-[10px] opacity-50 font-mono">
                                ${mint.timestamp ? new Date(mint.timestamp).toLocaleDateString() : ''}
                                ${mint.txHash ? ` • ${mint.txHash.slice(0, 10)}...` : ''}
                            </div>
                        </div>
                        ${mint.txHash ? `
                            <a href="https://basescan.org/tx/${safeTxHash}" target="_blank" rel="noopener noreferrer"
                               class="p-1 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0 inline-flex">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
                        ` : ''}
                    </div>
                `;
    }).join('')}
            </div>
        </div>
    `;
}

export function renderJourneyTimeline(userStats) {
    if (!userStats?.journey || userStats.journey.length === 0) return '';

    const journey = userStats.journey;
    const eventIcons = {
        page_view: 'EYE', collection_view: 'FOLDER', mint_click: 'CURSOR',
        mint_attempt: 'HISTORY', tx_sent: 'EXTERNAL', mint_success: 'CHECK',
        mint_failure: 'XMARK', wallet_connect: 'LINK', gallery_view: 'IMAGE', click: 'CURSOR'
    };

    return `
        <div class="glass-card p-5 rounded-2xl border border-white/10">
            <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
                ${renderAnalyticsIcon('HISTORY', 'text-blue-400')} Your Journey
                <span class="text-xs font-normal opacity-40 ml-auto">Last ${journey.length} events</span>
            </h3>
            <div class="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                ${journey.map((event) => {
        const eventType = typeof event?.type === 'string' ? event.type : 'unknown';
        const safeTimestamp = event?.timestamp ? new Date(event.timestamp).toLocaleTimeString() : 'unknown';
        const safeEventType = escapeHtml(eventType.replace(/_/g, ' '));
        const safeCollection = event.collection ? escapeHtml(event.collection) : '';
        const safePage = event.page ? escapeHtml(event.page) : '';
        return `
                    <div class="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                        <div class="text-base flex-shrink-0 text-indigo-300 inline-flex">${renderIcon(eventIcons[eventType] || 'CHART', 'w-4 h-4')}</div>
                        <div class="flex-1 min-w-0">
                            <span class="text-sm font-medium">${safeEventType}</span>
                            ${safeCollection ? `<span class="text-xs opacity-50 ml-2">${safeCollection}</span>` : ''}
                            ${safePage ? `<span class="text-xs opacity-50 ml-2">${safePage}</span>` : ''}
                        </div>
                        <div class="text-[10px] opacity-40 font-mono flex-shrink-0">
                            ${safeTimestamp}
                        </div>
                    </div>
                `;
    }).join('')}
            </div>
        </div>
    `;
}
