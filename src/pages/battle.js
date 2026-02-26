import { $ } from '../utils/dom.js';
import { state, EVENTS } from '../state.js';
import { connectWallet, disconnectWallet } from '../wallet.js';
import { applyMiniAppAvatar, getWalletIdentityLabel } from '../utils/profile.js';
import { bindThemeToggleEvents, renderThemeToggleButton } from '../components/ThemeToggle.js';
import { renderBottomNav, bindBottomNavEvents } from '../components/BottomNav.js';
import { ChallengeBoard } from '../components/game/ChallengeBoard.js';
import { MatchPreviewModal } from '../components/game/MatchPreviewModal.js';
import { NFTSelectorModal } from '../components/game/NFTSelectorModal.js';
import { renderCombatArena } from '../lib/game/arenaRenderer.js';
import { normalizeFighter } from '../lib/game/metadataNormalizer.js';
import { postChallenge } from '../lib/game/matchmaking.js';

let walletHandler = null;

export async function renderBattlePage() {
    const app = $('#app');

    app.innerHTML = `
        <div class="page-container min-h-screen pb-24 relative overflow-x-hidden app-text bg-slate-900 transition-colors duration-300">
            <header class="glass-header sticky top-0 z-40 border-b border-white/5 safe-pt">
                <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <h1 class="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-400 to-orange-400">
                        Battle Arena
                    </h1>
                    <div class="flex items-center gap-3">
                        ${renderThemeToggleButton('theme-toggle-battle')}
                        <button id="battle-connect-btn" class="glass-card px-4 py-2 rounded-full flex items-center space-x-2 hover:scale-105 transition-transform text-sm font-medium">
                            <div class="status-glow" style="background: ${state.wallet?.isConnected ? '#10B981' : '#EF4444'}; box-shadow: 0 0 10px ${state.wallet?.isConnected ? '#10B981' : '#EF4444'};"></div>
                            <img id="battle-connect-avatar" class="w-5 h-5 rounded-full object-cover hidden" alt="Profile avatar">
                            <span id="battle-connect-text">${getWalletIdentityLabel(state.wallet)}</span>
                        </button>
                    </div>
                </div>
            </header>

            <main class="max-w-6xl mx-auto px-4 pt-6 page-transition relative" id="battle-container">
                <div id="challenge-board-view"></div>
                <div id="match-preview-view" class="hidden"></div>
                <div id="arena-view" class="hidden"></div>
                
                <!-- Modal Mount -->
                <div id="nft-selector-modal" class="hidden"></div>
            </main>

            ${renderBottomNav('battle')}
        </div>
    `;

    bindThemeToggleEvents();
    bindBottomNavEvents();
    attachBattleEvents();
    updateBattleHeader(state.wallet);

    const previewModal = new MatchPreviewModal(
        'match-preview-view',
        () => {
            previewModal.hide();
            board.show();
        },
        (playerCombatStats, enemyCombatStats) => {
            previewModal.hide();

            // Inject the player's overall wallet team so synergies apply
            const battleOptions = {
                playerTeam: selectorModal.inventory || []
            };

            // Trigger Visual Battle
            renderCombatArena(playerCombatStats, enemyCombatStats, () => {
                console.log("Battle concluded");
            }, battleOptions);
        },
        () => {
            // on Select Fighter clicked inside Match Preview
            selectorModal.show();
        }
    );

    const selectorModal = new NFTSelectorModal(
        'nft-selector-modal',
        (selectedNft) => {
            // When user picks an NFT, normalize its real stats
            let stats;
            try {
                stats = normalizeFighter(selectedNft.engineId, selectedNft.nftId, selectedNft.rawAttributes);
            } catch (e) {
                console.error("Failed to parse fighter stats:", e);
                // Fallback if structure is unexpected
                stats = { hp: 100, atk: 10, def: 10, spd: 10, crit: 0.05, dodge: 0, magicResist: 0, lifesteal: 0, regen: 0 };
            }

            const pData = {
                name: `${selectedNft.collectionName} #${selectedNft.nftId}`,
                stats: stats,
                trait: selectedNft.trait,
                imageUrl: selectedNft.imageUrl || ''
            };

            // If we have an active enemy preview, we update the player slot
            if (previewModal.enemyData) {
                previewModal.playerData = pData;
                previewModal.render(); // Re-render preview with new player stats
            } else {
                // Otherwise user was posting a new challenge from the board
                const walletAddress = state.wallet?.address || 'Anonymous';

                // Show temporary feedback
                const btn = $('#post-challenge-btn');
                if (btn) btn.textContent = 'Posting...';

                postChallenge(walletAddress, selectedNft, selectorModal.inventory || [])
                    .then(() => {
                        board.show(); // Refresh board and reload challenges from KV
                    })
                    .catch(err => {
                        console.error('Failed to post challenge:', err);
                        alert('Failed to post challenge. Try again.');
                        board.show();
                    });
            }
        },
        () => {
            // on closed
        }
    );

    const board = new ChallengeBoard(
        'challenge-board-view',
        (challengeData) => {
            board.hide();
            // Clear player data when looking at a new enemy
            previewModal.playerData = null;
            previewModal.show(challengeData);
        },
        () => {
            // "Post Challenge" clicked
            previewModal.enemyData = null; // Clear context
            selectorModal.show();
        }
    );

    board.show();
}

function attachBattleEvents() {
    if (walletHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletHandler);
    }

    walletHandler = (e) => {
        const account = e.detail;
        updateBattleHeader(account);
    };
    document.addEventListener(EVENTS.WALLET_UPDATE, walletHandler);

    const connectBtn = document.getElementById('battle-connect-btn');
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            if (state.wallet?.isConnected) {
                await disconnectWallet();
            } else {
                await connectWallet();
            }
        });
    }
}

function updateBattleHeader(account) {
    const connectBtn = document.getElementById('battle-connect-btn');
    if (connectBtn) {
        const glow = connectBtn.querySelector('.status-glow');
        const avatar = document.getElementById('battle-connect-avatar');
        const text = document.getElementById('battle-connect-text');

        applyMiniAppAvatar(avatar);

        if (account?.isConnected) {
            if (glow) { glow.style.background = '#10B981'; glow.style.boxShadow = '0 0 10px #10B981'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
        } else {
            if (glow) { glow.style.background = '#EF4444'; glow.style.boxShadow = '0 0 10px #EF4444'; }
            if (text) text.textContent = getWalletIdentityLabel(account);
        }
    }
}

export function cleanup() {
    if (walletHandler) {
        document.removeEventListener(EVENTS.WALLET_UPDATE, walletHandler);
        walletHandler = null;
    }
}
