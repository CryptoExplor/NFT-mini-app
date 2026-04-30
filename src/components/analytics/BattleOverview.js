import { escapeHtml } from '../../utils/html.js';
import { renderIcon } from '../../utils/icons.js';
import { summaryCard, renderAnalyticsIcon, getTimeAgo } from './AnalyticsUtils.js';

export function buildBattleAnalytics(walletAddress, syncedHistory = []) {
    if (!walletAddress) return null;

    const normalized = (Array.isArray(syncedHistory) ? syncedHistory : [])
        .map((record) => normalizeSyncedBattleRecord(record, String(walletAddress).toLowerCase()))
        .filter(Boolean)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    const wins = normalized.filter((battle) => battle.playerWon).length;
    const total = normalized.length;
    const aiBattles = normalized.filter((battle) => battle.isAi).length;
    const pvpBattles = total - aiBattles;
    const totalDamage = normalized.reduce((sum, battle) => sum + (battle.playerDmg || 0), 0);
    const totalCrits = normalized.reduce((sum, battle) => sum + (battle.crits || 0), 0);
    const totalDodges = normalized.reduce((sum, battle) => sum + (battle.dodges || 0), 0);
    const totalRounds = normalized.reduce((sum, battle) => sum + (battle.rounds || 0), 0);
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const averageRounds = total > 0 ? (totalRounds / total).toFixed(1) : '0.0';

    let streak = 0;
    for (const battle of normalized) {
        if (!battle.playerWon) break;
        streak += 1;
    }

    const fighterWins = {};
    for (const battle of normalized) {
        if (!battle.playerWon) continue;
        fighterWins[battle.playerName] = (fighterWins[battle.playerName] || 0) + 1;
    }
    const bestFighter = Object.entries(fighterWins).sort((a, b) => b[1] - a[1])[0]?.[0] || 'No winner yet';

    return {
        total,
        wins,
        losses: Math.max(0, total - wins),
        winRate,
        aiBattles,
        pvpBattles,
        totalDamage,
        totalCrits,
        totalDodges,
        streak,
        bestFighter,
        averageRounds,
        recent: normalized.slice(0, 10)
    };
}

export function renderBattleOverview(battleAnalytics, { walletConnected = true } = {}) {
    if (!walletConnected) {
        return renderWalletGate(
            'Your History',
            'Connect your wallet to unlock synced arena stats, replays, and cross-device match history.'
        );
    }

    if (!battleAnalytics) return '';

    return `
        <section class="glass-card p-5 rounded-2xl border border-red-500/20 bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
                <div>
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        ${renderAnalyticsIcon('SWORDS', 'text-red-400')} Your History
                    </h3>
                    <p class="text-sm opacity-50 mt-1">Server-synced battle performance with replay-ready history across web and miniapps.</p>
                </div>
                <span class="text-[10px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">SYNCED</span>
            </div>

            <div class="grid grid-cols-2 lg:grid-cols-6 gap-4">
                ${summaryCard(renderAnalyticsIcon('SWORDS', 'text-red-300'), 'Battles', battleAnalytics.total, 'red')}
                ${summaryCard(renderAnalyticsIcon('TROPHY', 'text-emerald-300'), 'Wins', battleAnalytics.wins, 'emerald')}
                ${summaryCard(renderAnalyticsIcon('SKULL', 'text-rose-300'), 'Losses', battleAnalytics.losses, 'red')}
                ${summaryCard(renderAnalyticsIcon('CHART', 'text-cyan-300'), 'Win Rate', `${battleAnalytics.winRate}%`, 'cyan')}
                ${summaryCard(renderAnalyticsIcon('SKULL', 'text-orange-300'), 'AI / PvP', `${battleAnalytics.aiBattles}/${battleAnalytics.pvpBattles}`, 'yellow')}
                ${summaryCard(renderAnalyticsIcon('FLAME', 'text-pink-300'), 'Streak', battleAnalytics.streak, 'blue')}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Best Fighter</div>
                    <div class="font-semibold text-white/90 truncate">${escapeHtml(battleAnalytics.bestFighter)}</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Average Rounds</div>
                    <div class="font-semibold text-cyan-300">${battleAnalytics.averageRounds}</div>
                </div>
                <div class="bg-white/5 rounded-xl p-4 border border-white/5">
                    <div class="text-xs uppercase opacity-50 mb-1">Crits / Dodges</div>
                    <div class="font-semibold text-yellow-300">${battleAnalytics.totalCrits} / ${battleAnalytics.totalDodges}</div>
                </div>
            </div>
        </section>
    `;
}

export function renderBattleHistorySection(battleAnalytics, { walletConnected = true } = {}) {
    if (!walletConnected) {
        return renderWalletGate(
            'Your Match Log',
            'Connect your wallet to see synced replays, match summaries, and watch links.'
        );
    }

    if (!battleAnalytics) return '';

    return `
        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <div class="flex items-center justify-between gap-3 mb-4">
                <h3 class="text-lg font-bold flex items-center gap-2">
                    ${renderAnalyticsIcon('HISTORY', 'text-indigo-400')} Recent Arena Matches
                </h3>
                <span class="text-xs opacity-40">${battleAnalytics.recent.length} recent</span>
            </div>
            <div class="space-y-2">
                ${battleAnalytics.recent.length === 0
            ? '<div class="text-center py-8 text-sm opacity-40">No synced arena matches yet. Fight once and your history will appear here across devices.</div>'
            : battleAnalytics.recent.map(renderBattleHistoryRow).join('')}
            </div>
        </section>
    `;
}

export function normalizeSyncedBattleRecord(record, wallet) {
    const p1 = record?.players?.p1;
    const p2 = record?.players?.p2;
    if (!p1?.name || !p2?.name) return null;

    const isWalletP1 = wallet && String(p1.id || '').toLowerCase() === wallet;
    const side = isWalletP1 ? 'P1' : 'P2';
    const opponent = isWalletP1 ? p2 : p1;
    const logs = Array.isArray(record.logs) ? record.logs : [];

    return {
        id: record.battleId || '',
        playerName: isWalletP1 ? p1.name : p2.name,
        enemyName: opponent?.name || 'Unknown Opponent',
        playerWon: record.result?.winnerSide === side,
        isAi: Boolean(record.options?.isAiBattle),
        rounds: record.result?.rounds || logs[logs.length - 1]?.round || 0,
        playerDmg: logs.filter((log) => log.attackerSide === side).reduce((sum, log) => sum + (log.damage || 0), 0),
        enemyDmg: logs.filter((log) => log.attackerSide !== side).reduce((sum, log) => sum + (log.damage || 0), 0),
        crits: logs.filter((log) => log.attackerSide === side && log.isCrit).length,
        dodges: logs.filter((log) => log.targetSide === side && log.isDodge).length,
        timestamp: record.createdAt || Date.now(),
        canReplay: Boolean(record.battleId)
    };
}

function renderBattleHistoryRow(entry) {
    const resultBadge = entry.playerWon
        ? '<span class="text-[10px] px-2 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-bold">WIN</span>'
        : '<span class="text-[10px] px-2 py-1 rounded bg-red-500/15 text-red-300 border border-red-500/20 font-bold">LOSS</span>';
    const modeBadge = entry.isAi
        ? '<span class="text-[10px] px-2 py-1 rounded bg-orange-500/15 text-orange-300 border border-orange-500/20 font-mono">AI</span>'
        : '<span class="text-[10px] px-2 py-1 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 font-mono">PVP</span>';
    const replayLink = entry.canReplay
        ? `<a href="/battle?replay=${encodeURIComponent(entry.id)}" class="flex items-center gap-1 rounded-lg bg-indigo-500/10 px-2.5 py-1.5 text-xs font-semibold text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20 transition-colors">${renderIcon('PLAY', 'w-3.5 h-3.5')} Watch</a>`
        : '<span class="text-[10px] px-2 py-1 rounded border border-white/10 text-slate-500 font-mono">NO REPLAY</span>';

    return `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-xl border border-white/5 bg-white/5 p-3">
            <div class="flex items-center gap-2 flex-wrap">
                ${resultBadge}
                ${modeBadge}
                <span class="font-medium text-white/90">vs ${escapeHtml(entry.enemyName)}</span>
                <span class="text-xs opacity-40">${entry.rounds} rounds</span>
            </div>
            <div class="flex items-center gap-3 flex-wrap text-xs opacity-70">
                <span>${entry.playerDmg.toLocaleString()} dmg</span>
                <span>${entry.crits} crits</span>
                <span>${getTimeAgo(entry.timestamp)}</span>
                ${replayLink}
            </div>
        </div>
    `;
}

function renderWalletGate(title, description) {
    return `
        <section class="glass-card p-5 rounded-2xl border border-white/10">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                    <h3 class="text-lg font-bold flex items-center gap-2">
                        ${renderAnalyticsIcon('HISTORY', 'text-indigo-400')} ${escapeHtml(title)}
                    </h3>
                    <p class="text-sm opacity-50 mt-1">${escapeHtml(description)}</p>
                </div>
                <div class="opacity-20 text-slate-500">${renderIcon('SHIELD', 'w-10 h-10')}</div>
            </div>
        </section>
    `;
}
