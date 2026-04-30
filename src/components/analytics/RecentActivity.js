import { escapeHtml } from '../../utils/html.js';
import { renderIcon } from '../../utils/icons.js';
import { getTimeAgo } from './AnalyticsUtils.js';

export function renderRecentActivity(activity, walletAddress, viewerIdentity, options = {}) {
    const mode = options.mode || 'mint';

    if (!activity || activity.length === 0) {
        return mode === 'battle'
            ? '<div class="text-center py-8 opacity-30">No live fights yet. The next battle will appear here.</div>'
            : '<div class="text-center py-8 opacity-30">No activity yet. Be the first to mint.</div>';
    }

    if (mode === 'battle') {
        return activity.map((item) => renderBattleFeedItem(item, walletAddress, viewerIdentity)).join('');
    }

    return activity.map((item) => renderMintFeedItem(item, walletAddress, viewerIdentity)).join('');
}

function renderBattleFeedItem(item, walletAddress, viewerIdentity) {
    const timeAgo = getTimeAgo(item.timestamp);
    const wallet = String(item.wallet || '');
    const isMe = walletAddress && wallet.toLowerCase() === walletAddress.toLowerCase();
    const shortWallet = wallet.length >= 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown';
    const walletLabel = isMe && viewerIdentity?.primaryLabel
        ? `<span>${escapeHtml(viewerIdentity.primaryLabel)}</span>`
        : escapeHtml(shortWallet);
    const opponent = escapeHtml(item.opponent || (item.isAi ? 'Arena AI' : 'Unknown Opponent'));
    const outcome = item.won ? 'won vs' : 'fell to';
    const outcomeClass = item.won ? 'text-emerald-300' : 'text-rose-300';
    const replayLink = item.battleId
        ? `<a href="/battle?replay=${encodeURIComponent(String(item.battleId))}" class="p-1 hover:bg-white/10 rounded-lg opacity-50 hover:opacity-100 transition text-xs flex-shrink-0 inline-flex" title="Watch replay">${renderIcon('PLAY', 'w-3.5 h-3.5')}</a>`
        : '';

    return `
        <div class="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-indigo-500/20 transition-all animate-fade-in">
            <div class="w-2 h-2 rounded-full ${item.won ? 'bg-emerald-400' : 'bg-rose-400'} animate-pulse flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">
                    ${walletLabel}
                    <span class="mx-1 ${outcomeClass}">${escapeHtml(outcome)}</span>
                    <span>${opponent}</span>
                </div>
                <div class="text-[10px] opacity-50 font-mono flex items-center gap-1 flex-wrap">
                    <span>${item.isAi ? 'AI' : 'PVP'}</span>
                    <span>•</span>
                    <span>${timeAgo}</span>
                </div>
            </div>
            ${replayLink}
        </div>
    `;
}

function renderMintFeedItem(item, walletAddress, viewerIdentity) {
    const timeAgo = getTimeAgo(item.timestamp);
    const wallet = String(item.wallet || '');
    const isMe = walletAddress && wallet.toLowerCase() === walletAddress.toLowerCase();
    const shortWallet = wallet.length >= 10 ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : 'Unknown';
    const safeCollection = escapeHtml(item.collection || 'Unknown');
    const safeTxHash = encodeURIComponent(String(item.txHash || ''));
    const walletLabel = isMe && viewerIdentity?.primaryLabel
        ? `<span>${escapeHtml(viewerIdentity.primaryLabel)}</span>`
        : escapeHtml(shortWallet);

    return `
        <div class="flex items-center gap-3 p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-green-500/20 transition-all animate-fade-in">
            <div class="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0"></div>
            <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">${safeCollection}</div>
                <div class="text-[10px] opacity-50 font-mono">
                    ${walletLabel}
                    <span class="mx-1">•</span>
                    ${timeAgo}
                    ${item.price > 0 ? `<span class="mx-1">•</span> ${parseFloat(item.price).toFixed(4)} ETH` : ''}
                </div>
            </div>
            ${item.txHash ? `
                <a href="https://basescan.org/tx/${safeTxHash}" target="_blank" rel="noopener noreferrer"
                   class="p-1 hover:bg-white/10 rounded-lg opacity-40 hover:opacity-100 transition text-xs flex-shrink-0 inline-flex">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
            ` : ''}
        </div>
    `;
}
