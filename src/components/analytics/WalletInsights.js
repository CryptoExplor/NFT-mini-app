import { escapeHtml, sanitizeUrl } from '../../utils/html.js';
import { renderIcon } from '../../utils/icons.js';
import { shortenAddress } from '../../utils/dom.js';
import { renderAnalyticsIcon, summaryCard } from './AnalyticsUtils.js';

export function renderWalletInsights(userStats, wallet, viewerIdentity = {}, options = {}) {
    const mode = options.mode === 'nft' ? 'nft' : 'arena';

    if (!wallet?.isConnected) {
        return `
            <section class="glass-card p-5 rounded-2xl border border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h2 class="text-lg font-bold">${mode === 'nft' ? 'Connect wallet to see your NFT stats' : 'Connect wallet to see your arena stats'}</h2>
                    <p class="opacity-50 text-sm">${mode === 'nft' ? 'Track mints, volume, reputation, and points.' : 'Track battle rank, streak, points, and synced arena record.'}</p>
                </div>
                <div class="opacity-20 text-slate-500">${renderIcon('SHIELD', 'w-10 h-10')}</div>
            </section>
        `;
    }

    const profile = userStats?.profile || {};
    const rankings = userStats?.rankings || {};
    const insights = userStats?.insights || {};
    const identity = renderIdentity(wallet, viewerIdentity);
    const points = getPointBreakdown(profile, rankings);

    return mode === 'nft'
        ? renderNftInsights({ profile, rankings, insights, wallet, identity, points, userStats })
        : renderArenaInsights({ profile, rankings, insights, wallet, identity, points });
}

function renderArenaInsights({ profile, rankings, insights, wallet, identity, points }) {
    const battleRank = rankings.battleWins?.rank || 'Unranked';
    const battleRankLabel = battleRank === 'Unranked' ? 'Unranked' : `#${battleRank}`;
    const battleWins = Number(profile.battleWins || 0);
    const battleLosses = Number(profile.battleLosses || 0);
    const battleWinRate = profile.battleWinRate || '0.0';
    const battleTotal = Number(profile.battleTotal || 0);

    return `
        <section class="glass-card p-5 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 to-purple-500/5 relative overflow-hidden">
            ${renderHeaderRow({
        title: 'Your Arena Stats',
        subtitle: 'Battle performance and unified platform points from server-backed data.',
        wallet,
        identity,
        insights,
        rightLabel: 'Battle Rank',
        rightValue: battleRankLabel,
        rightMeta: `${battleWins} wins logged`
    })}

            <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
                ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-yellow-300'), 'Battle Rank', battleRankLabel, 'yellow')}
                ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-emerald-300'), 'Wins', battleWins, 'emerald')}
                ${summaryCard(renderAnalyticsIcon('SKULL', 'text-rose-300'), 'Losses', battleLosses, 'red')}
                ${summaryCard(renderAnalyticsIcon('CHART', 'text-cyan-300'), 'Win Rate', `${battleWinRate}%`, 'cyan')}
                ${summaryCard(renderAnalyticsIcon('FLAME', 'text-orange-300'), 'Streak', Number(profile.streak || 0), 'yellow')}
                ${summaryCard(renderAnalyticsIcon('COIN', 'text-amber-300'), 'Total Points', points.total.toLocaleString(), 'purple')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Battles Logged</div>
                    <div class="text-xl font-semibold text-white/90">${battleTotal.toLocaleString()}</div>
                    <div class="text-[10px] opacity-40">AI and PvP combined</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Battle Points (est.)</div>
                    <div class="text-xl font-semibold text-emerald-300">${points.battle.toLocaleString()}</div>
                    <div class="text-[10px] opacity-40">${battleWins} wins x 5</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Points Rank</div>
                    <div class="text-xl font-semibold text-indigo-200">${formatRank(rankings.points?.rank)}</div>
                    <div class="text-[10px] opacity-40">${insights.activityLevel || 'Platform competitor'}</div>
                </div>
            </div>

            ${renderPointBreakdown(points)}
        </section>
    `;
}

function renderNftInsights({ profile, rankings, insights, wallet, identity, points, userStats }) {
    const totalMints = Number(profile.totalMints || 0);
    const totalVolume = parseFloat(profile.totalVolume || 0).toFixed(4);
    const avgGas = parseFloat(profile.avgGas || 0).toFixed(4);
    const successRate = profile.successRate || '0.0';
    const reputationScore = rankings.reputation?.score || '0.00';
    const mintRank = formatRank(rankings.mints?.rank);

    return `
        <section class="glass-card p-5 rounded-2xl border border-green-500/25 bg-gradient-to-r from-green-500/10 to-cyan-500/5 relative overflow-hidden">
            ${renderHeaderRow({
        title: 'Your NFT Stats',
        subtitle: 'Mint performance, reputation, and estimated contribution to your unified points.',
        wallet,
        identity,
        insights,
        rightLabel: 'Mint Rank',
        rightValue: mintRank,
        rightMeta: `${totalMints} mints logged`
    })}

            <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
                ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-yellow-300'), 'Mint Rank', mintRank, 'yellow')}
                ${summaryCard(renderAnalyticsIcon('GEM', 'text-green-300'), 'Total Mints', totalMints, 'green')}
                ${summaryCard(renderAnalyticsIcon('TARGET', 'text-emerald-300'), 'Success Rate', `${successRate}%`, 'emerald')}
                ${summaryCard(renderAnalyticsIcon('CHART', 'text-purple-300'), 'Volume', totalVolume, 'purple')}
                ${summaryCard(renderAnalyticsIcon('CHART', 'text-cyan-300'), 'Avg Gas', avgGas, 'cyan')}
                ${summaryCard(renderAnalyticsIcon('STAR', 'text-amber-300'), 'Reputation', reputationScore, 'yellow')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Total Points</div>
                    <div class="text-xl font-semibold text-amber-300">${points.total.toLocaleString()}</div>
                    <div class="text-[10px] opacity-40">Authoritative server total</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Favorite Collection</div>
                    <div class="text-lg font-semibold text-pink-300 truncate">${profile.favoriteCollection ? escapeHtml(profile.favoriteCollection) : 'No favorite yet'}</div>
                    <div class="text-[10px] opacity-40">${profile.favoriteCollectionMints || 0} mints</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Member Since</div>
                    <div class="text-lg font-semibold text-cyan-200">${profile.firstSeen ? new Date(profile.firstSeen).toLocaleDateString() : '-'}</div>
                    <div class="text-[10px] opacity-40">${insights.memberDays || 0} days active</div>
                </div>
            </div>

            ${renderPointBreakdown(points)}
            ${renderCollectionPointEstimates(userStats)}
        </section>
    `;
}

function renderHeaderRow({ title, subtitle, wallet, identity, insights, rightLabel, rightValue, rightMeta }) {
    return `
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-3">
            <div>
                <h2 class="text-lg font-bold flex items-center gap-2 flex-wrap">
                    ${escapeHtml(title)}
                    <span class="flex items-center gap-2 bg-white/10 px-2.5 py-1 rounded-full border border-white/5 max-w-full">
                        ${identity.avatarHtml}
                        <span class="text-xs font-normal truncate max-w-[160px]">${identity.safePrimaryLabel}</span>
                        ${identity.showSecondaryWallet ? `<span class="text-[10px] opacity-50 font-mono hidden sm:inline">${identity.safeWalletLabel}</span>` : ''}
                        <a href="https://basescan.org/address/${wallet.address}" target="_blank" rel="noopener noreferrer" class="text-xs opacity-40 hover:opacity-100 transition inline-flex" title="View on Explorer">${renderIcon('EXTERNAL', 'w-3.5 h-3.5')}</a>
                    </span>
                    ${insights.badge ? `<span class="text-xs bg-gradient-to-r from-yellow-500/20 to-orange-500/20 text-yellow-200 border border-yellow-500/20 px-2 py-0.5 rounded-full shadow-sm">${escapeHtml(insights.badge)}</span>` : ''}
                    ${insights.activityLevel ? `<span class="text-xs bg-indigo-500/20 text-indigo-200 px-2 py-0.5 rounded-full">${escapeHtml(insights.activityLevel)}</span>` : ''}
                </h2>
                <p class="text-sm opacity-50 mt-2">${escapeHtml(subtitle)}</p>
            </div>
            <div class="text-right">
                <div class="text-[10px] uppercase tracking-[0.2em] opacity-40">${escapeHtml(rightLabel)}</div>
                <div class="text-3xl font-bold text-yellow-300">${escapeHtml(String(rightValue))}</div>
                <div class="text-xs opacity-40">${escapeHtml(rightMeta)}</div>
            </div>
        </div>
    `;
}

function renderPointBreakdown(points) {
    return `
        <div class="mt-4 rounded-xl border border-white/5 bg-white/5 p-4">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
                <div class="text-sm font-bold flex items-center gap-2">${renderAnalyticsIcon('COIN', 'text-amber-300', 'w-4 h-4')} Unified Points</div>
                <div class="text-[10px] uppercase tracking-[0.18em] opacity-40">Breakdown rows are estimated</div>
            </div>
            <div class="space-y-2 text-sm">
                ${renderPointRow('NFT Points (est.)', points.nft, `${points.totalMints} mints x 10`)}
                ${renderPointRow('Battle Points (est.)', points.battle, `${points.battleWins} wins x 5`)}
                ${renderPointRow('Streak / Bonus (est.)', points.bonus, 'connect, views, streak, volume, and adjustments')}
                <div class="flex justify-between border-t border-white/10 pt-2 font-bold">
                    <span>Total</span>
                    <span class="text-amber-300">${points.total.toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}

function renderPointRow(label, value, note) {
    return `
        <div class="flex items-center justify-between gap-3">
            <span class="opacity-70">${escapeHtml(label)} <span class="text-[10px] opacity-40">${escapeHtml(note)}</span></span>
            <span class="font-mono">${Number(value || 0).toLocaleString()}</span>
        </div>
    `;
}

function renderCollectionPointEstimates(userStats) {
    const counts = getCollectionMintCounts(userStats?.journey || []);
    const rows = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    if (rows.length === 0) return '';

    return `
        <div class="mt-3 rounded-xl border border-white/5 bg-white/5 p-4">
            <div class="text-sm font-bold mb-3 flex items-center gap-2">${renderAnalyticsIcon('GEM', 'text-green-300', 'w-4 h-4')} Collection NFT Points (est.)</div>
            <div class="space-y-2 text-sm">
                ${rows.map(([collection, count]) => renderPointRow(collection, count * 10, `${count} mints x 10`)).join('')}
            </div>
        </div>
    `;
}

function getCollectionMintCounts(journey) {
    const counts = {};
    for (const event of Array.isArray(journey) ? journey : []) {
        if (event?.type !== 'mint_success' || !event.collection) continue;
        counts[event.collection] = (counts[event.collection] || 0) + 1;
    }
    return counts;
}

function getPointBreakdown(profile, rankings) {
    const totalMints = Number(profile.totalMints || 0);
    const battleWins = Number(profile.battleWins || 0);
    const total = Number(profile.totalPoints ?? rankings.points?.score ?? 0) || 0;
    const nft = totalMints * 10;
    const battle = battleWins * 5;
    const bonus = Math.max(0, total - nft - battle);

    return {
        total,
        nft,
        battle,
        bonus,
        totalMints,
        battleWins
    };
}

function renderIdentity(wallet, viewerIdentity) {
    const safePrimaryLabel = escapeHtml(viewerIdentity.primaryLabel || shortenAddress(wallet.address));
    const safeWalletLabel = escapeHtml(viewerIdentity.walletLabel || shortenAddress(wallet.address));
    const safeAvatarUrl = sanitizeUrl(viewerIdentity.avatarUrl || '');
    const showSecondaryWallet = Boolean(viewerIdentity.profileLabel && viewerIdentity.walletLabel);
    const avatarHtml = safeAvatarUrl
        ? `<img src="${safeAvatarUrl}" alt="Profile avatar" class="w-5 h-5 rounded-full object-cover">`
        : `<span class="w-5 h-5 rounded-full bg-white/10 inline-flex items-center justify-center text-[10px] opacity-60">${renderIcon('USER', 'w-3 h-3')}</span>`;

    return {
        safePrimaryLabel,
        safeWalletLabel,
        showSecondaryWallet,
        avatarHtml
    };
}

function formatRank(rank) {
    return rank && rank !== 'Unranked' ? `#${rank}` : 'Unranked';
}
