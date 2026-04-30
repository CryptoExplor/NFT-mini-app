import { escapeHtml } from '../../utils/html.js';
import { shortenAddress } from '../../utils/dom.js';

export function renderLeaderboard(leaderboard, walletAddress, viewerIdentity, options = {}) {
    const rows = Array.isArray(leaderboard) ? leaderboard : [];
    const viewerRow = options.viewerRow || null;

    if (rows.length === 0 && !viewerRow) {
        return '<div class="text-center py-8 opacity-30">No competitors yet. Be the first to climb the ladder.</div>';
    }

    return `
        <div class="overflow-hidden rounded-2xl border border-white/5">
            <table class="w-full text-left">
                <thead>
                    <tr class="text-[10px] opacity-40 uppercase tracking-widest border-b border-white/5 bg-white/5">
                        <th class="py-3 pl-4 font-medium">Rank</th>
                        <th class="py-3 font-medium">Competitor</th>
                        <th class="py-3 font-medium">Trend</th>
                        <th class="py-3 font-medium text-right pr-4">Value</th>
                    </tr>
                </thead>
                <tbody class="text-sm">
                    ${rows.map((user, index) => renderRow(user, walletAddress, viewerIdentity, index)).join('')}
                    ${viewerRow ? renderViewerDivider() + renderRow(viewerRow, walletAddress, viewerIdentity, rows.length, true) : ''}
                </tbody>
            </table>
        </div>
    `;
}

function renderRow(user, walletAddress, viewerIdentity, index, isAppendedViewer = false) {
    const wallet = String(user?.wallet || '').toLowerCase();
    const isMe = walletAddress && wallet === walletAddress.toLowerCase();
    const label = user.displayName || user.shortAddress || shortenAddress(wallet);
    const safeLabel = escapeHtml(label || 'Unknown');
    const primaryIdentity = isMe && viewerIdentity?.primaryLabel
        ? escapeHtml(viewerIdentity.primaryLabel)
        : safeLabel;
    const score = typeof user.score === 'number' && user.score % 1 !== 0
        ? user.score.toFixed(4)
        : Number(user.score || 0).toLocaleString();

    const rankTone = getRankTone(index);
    const rowClass = isAppendedViewer
        ? 'bg-indigo-500/12 border-t border-indigo-500/25'
        : isMe
            ? 'bg-indigo-500/10'
            : 'hover:bg-white/5 transition-colors';

    return `
        <tr class="border-b border-white/5 ${rowClass}">
            <td class="py-3 pl-4">
                <div class="flex items-center gap-2">
                    <span class="inline-flex min-w-[44px] justify-center rounded-full border px-2 py-1 text-[11px] font-semibold ${rankTone}">
                        #${user.rank || index + 1}
                    </span>
                    ${isTopThree(index) ? `<span class="text-[10px] uppercase tracking-[0.18em] opacity-60">${getTopThreeLabel(index)}</span>` : ''}
                </div>
            </td>
            <td class="py-3 font-mono">
                <div class="flex items-center gap-2">
                    <span class="truncate max-w-[180px] sm:max-w-[240px]">${primaryIdentity}</span>
                    ${isMe ? '<span class="text-[10px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded uppercase tracking-wide">YOU</span>' : ''}
                </div>
            </td>
            <td class="py-3">
                ${renderRankChange(user.rank_change)}
            </td>
            <td class="py-3 text-right pr-4 font-bold">
                ${score}
            </td>
        </tr>
    `;
}

function renderViewerDivider() {
    return `
        <tr class="bg-transparent">
            <td colspan="4" class="px-4 py-3">
                <div class="border-t border-dashed border-white/10 pt-3 text-[10px] uppercase tracking-[0.22em] opacity-40">Your position</div>
            </td>
        </tr>
    `;
}

function renderRankChange(change) {
    const tone = {
        up: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
        down: 'bg-rose-500/15 text-rose-300 border-rose-500/20',
        same: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
        new: 'bg-amber-500/15 text-amber-300 border-amber-500/20'
    };

    const label = {
        up: 'UP',
        down: 'DOWN',
        same: 'SAME',
        new: 'NEW'
    }[change] || 'NEW';

    return `<span class="inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${tone[change] || tone.new}">${label}</span>`;
}

function getRankTone(index) {
    if (index === 0) return 'border-yellow-400/30 bg-yellow-400/10 text-yellow-200';
    if (index === 1) return 'border-slate-300/25 bg-slate-300/10 text-slate-200';
    if (index === 2) return 'border-orange-400/25 bg-orange-400/10 text-orange-200';
    return 'border-white/10 bg-white/5 text-indigo-200';
}

function getTopThreeLabel(index) {
    if (index === 0) return 'Gold';
    if (index === 1) return 'Silver';
    if (index === 2) return 'Bronze';
    return '';
}

function isTopThree(index) {
    return index >= 0 && index < 3;
}
