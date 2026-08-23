import { escapeHtml, sanitizeUrl } from '../../utils/html.js';
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
    const collectionLabel = String(item.collectionName || item.collection || 'Unknown').replace(/-/g, ' ');
    const safeCollection = escapeHtml(collectionLabel);
    const safeTokenId = escapeHtml(String(item.tokenId || ''));
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const safeTxHash = encodeURIComponent(String(item.txHash || ''));
    const imageUrl = sanitizeUrl(item.imageUrl || '');
    const openSeaUrl = sanitizeUrl(item.openseaUrl || '');
    const walletLabel = isMe && viewerIdentity?.primaryLabel
        ? `<span>${escapeHtml(viewerIdentity.primaryLabel)}</span>`
        : escapeHtml(shortWallet);

    return `
        <div class="flex items-center gap-3 p-2.5 bg-white/5 rounded-xl border border-white/5 hover:border-green-500/20 transition-all animate-fade-in">
            <div class="relative w-11 h-11 rounded-lg overflow-hidden bg-emerald-500/10 border border-emerald-500/15 flex-shrink-0 flex items-center justify-center text-emerald-300">
                ${imageUrl
                    ? `<img src="${escapeHtml(imageUrl)}" alt="" class="w-full h-full object-cover" loading="lazy" decoding="async">`
                    : renderIcon('GEM', 'w-5 h-5')}
                <span class="absolute right-1 bottom-1 w-2 h-2 rounded-full bg-green-400 ring-2 ring-slate-900"></span>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                    <div class="text-sm font-semibold truncate capitalize">${safeCollection}</div>
                    ${safeTokenId ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 flex-shrink-0">#${safeTokenId}${quantity > 1 ? ` ×${quantity}` : ''}</span>` : ''}
                </div>
                <div class="text-[10px] opacity-50 font-mono flex items-center gap-1 flex-wrap mt-0.5">
                    ${walletLabel}
                    <span>•</span>
                    <span>${escapeHtml(timeAgo)}</span>
                    ${item.price > 0 ? `<span>•</span><span>${parseFloat(item.price).toFixed(4)} ETH</span>` : ''}
                    ${item.reconciled ? '<span class="text-cyan-300">• history sync</span>' : ''}
                </div>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                ${openSeaUrl ? `
                    <a href="${escapeHtml(openSeaUrl)}" target="_blank" rel="noopener noreferrer"
                       class="p-1.5 hover:bg-white/10 rounded-lg opacity-50 hover:opacity-100 transition inline-flex" title="View NFT on OpenSea">${renderIcon('EYE', 'w-3.5 h-3.5')}</a>
                ` : ''}
                ${item.txHash ? `
                    <a href="https://basescan.org/tx/${safeTxHash}" target="_blank" rel="noopener noreferrer"
                       class="p-1.5 hover:bg-white/10 rounded-lg opacity-50 hover:opacity-100 transition inline-flex" title="View transaction">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
                ` : ''}
            </div>
        </div>
    `;
}
