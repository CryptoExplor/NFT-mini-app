import { escapeHtml } from '../../utils/html.js';
import { renderIcon } from '../../utils/icons.js';

/**
 * Renders the interactive conversion funnel visualization.
 */
export function renderEnhancedFunnel(funnel) {
    if (!funnel || funnel.length === 0) {
        return '<div class="text-center py-8 opacity-30">No funnel data yet</div>';
    }

    const maxCount = Math.max(...funnel.map(s => s.count), 1);
    const icons = {
        page_view: 'EYE',
        wallet_connect: 'LINK',
        collection_view: 'FOLDER',
        mint_click: 'CURSOR',
        tx_sent: 'EXTERNAL',
        mint_success: 'CHECK'
    };

    // Horizontal funnel flow
    return `
        <div class="space-y-1">
            <div class="flex flex-col gap-3">
                ${funnel.map((step, i) => {
                    const width = Math.max((step.count / maxCount) * 100, 12);
                    const icon = icons[step.step] || 'CHART';
                    const safeStepLabel = escapeHtml(step.label || step.step.replace(/_/g, ' '));

                    return `
                        <div class="relative">
                            <div class="flex items-center gap-3">
                                <div class="w-8 text-center flex-shrink-0 text-indigo-300 inline-flex justify-center">${renderIcon(icon, 'w-4 h-4')}</div>
                                <div class="flex-1 min-w-0">
                                    <div class="flex justify-between text-xs mb-1">
                                        <span class="font-medium opacity-80">${safeStepLabel}</span>
                                        <span class="font-bold">${step.count.toLocaleString()}</span>
                                    </div>
                                    <div class="h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                                        <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000" style="width: ${width}%"></div>
                                    </div>
                                </div>
                                <div class="w-16 text-right flex-shrink-0">
                                    <div class="text-[10px] opacity-40 uppercase">Conv.</div>
                                    <div class="text-xs font-bold text-indigo-400">${step.conversion || '100'}%</div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}
