/**
 * Generates an HTML battle share card for Farcaster sharing.
 * Returns the card HTML and a share URL.
 */
export function createShareCard({ playerName, enemyName, playerWon, rounds, playerDmg, enemyDmg, crits, dodges }) {
    const resultText = playerWon ? 'VICTORY' : 'DEFEAT';
    const resultColor = playerWon ? '#10b981' : '#ef4444';
    const resultEmoji = playerWon ? '🏆' : '💀';

    const cardHtml = `
        <div id="battle-share-card" class="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6 max-w-sm mx-auto">
            <!-- Header -->
            <div class="text-center mb-4">
                <div class="text-3xl mb-1">${resultEmoji}</div>
                <h3 class="text-2xl font-black tracking-wide" style="color: ${resultColor}">${resultText}</h3>
                <p class="text-xs text-slate-500 uppercase tracking-wider mt-1">NFT Battle Arena</p>
            </div>
            
            <!-- Matchup -->
            <div class="flex items-center justify-between bg-white/[0.03] rounded-xl p-3 border border-white/5 mb-4">
                <div class="text-center flex-1">
                    <div class="text-xs text-indigo-400 font-bold mb-0.5">YOU</div>
                    <div class="text-sm text-white font-bold truncate">${playerName}</div>
                    <div class="text-xs text-slate-500 font-mono mt-0.5">${playerDmg} dmg</div>
                </div>
                <div class="text-lg font-black text-slate-600 px-3">VS</div>
                <div class="text-center flex-1">
                    <div class="text-xs text-red-400 font-bold mb-0.5">OPP</div>
                    <div class="text-sm text-white font-bold truncate">${enemyName}</div>
                    <div class="text-xs text-slate-500 font-mono mt-0.5">${enemyDmg} dmg</div>
                </div>
            </div>

            <!-- Stats Row -->
            <div class="grid grid-cols-3 gap-2 mb-4">
                <div class="text-center bg-white/[0.03] rounded-lg p-2 border border-white/5">
                    <div class="text-sm font-black text-white">${rounds}</div>
                    <div class="text-[9px] text-slate-500 uppercase">Rounds</div>
                </div>
                <div class="text-center bg-white/[0.03] rounded-lg p-2 border border-white/5">
                    <div class="text-sm font-black text-yellow-400">${crits}</div>
                    <div class="text-[9px] text-slate-500 uppercase">Crits</div>
                </div>
                <div class="text-center bg-white/[0.03] rounded-lg p-2 border border-white/5">
                    <div class="text-sm font-black text-blue-400">${dodges}</div>
                    <div class="text-[9px] text-slate-500 uppercase">Dodges</div>
                </div>
            </div>

            <!-- Footer -->
            <div class="text-center">
                <div class="text-[9px] text-slate-600 tracking-wider">base-mintapp.vercel.app/battle</div>
            </div>
        </div>
    `;

    return cardHtml;
}

/**
 * Build a Farcaster compose URL for sharing battle results.
 */
export function getFarcasterShareUrl({ playerName, enemyName, playerWon, rounds }) {
    const result = playerWon ? '🏆 VICTORY' : '💀 DEFEAT';
    const text = `${result}! ${playerName} vs ${enemyName} — ${rounds} rounds\n\n⚔️ Battle your NFTs on @base-mintapp`;
    const url = 'https://base-mintapp.vercel.app/battle';
    return `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(url)}`;
}
