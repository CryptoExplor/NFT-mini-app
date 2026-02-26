import { $ } from '../../utils/dom.js';

/**
 * NFT Selector Modal (Vanilla JS)
 * Handles showing the user's wallet inventory and letting them 
 * pick a valid character for battle.
 */
export class NFTSelectorModal {
    constructor(containerId, onSelected, onClose) {
        this.container = $(`#${containerId}`);
        this.onSelected = onSelected;
        this.onClose = onClose;
        this.inventory = [];
    }

    async loadInventory() {
        const { getCurrentAccount, fetchOwnedBattleNFTs } = await import('../../wallet.js');
        const account = getCurrentAccount();

        if (!account?.address) {
            this.container.innerHTML = `<div class="p-8 text-center text-red-400 bg-slate-900 rounded-2xl w-full max-w-sm absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-2xl">Please connect your wallet first.</div>`;
            setTimeout(() => this.hide(), 2000);
            return;
        }

        // Show Loading State
        this.container.innerHTML = `<div class="p-8 text-center text-white bg-slate-900 rounded-2xl w-full max-w-sm absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 shadow-2xl">Scanning wallet for Battle NFTs...</div>`;

        // Fetch real inventory
        this.inventory = await fetchOwnedBattleNFTs(account.address);
        this.render();
    }

    render() {
        this.container.innerHTML = `
            <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <div class="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
                    <div class="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
                        <h2 class="text-xl font-bold">Select Fighter</h2>
                        <button id="close-selector-btn" class="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    <div class="p-4 overflow-y-auto flex-1 grid grid-cols-2 sm:grid-cols-3 gap-4" id="nft-inventory-grid">
                        ${this.inventory.map(nft => this.renderNFTCard(nft)).join('')}
                    </div>
                </div>
            </div>
        `;

        $('#close-selector-btn').addEventListener('click', () => this.hide());

        this.inventory.forEach(nft => {
            const btn = $(`#select-nft-${nft.id}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.onSelected(nft);
                    this.hide();
                });
            }
        });
    }

    renderNFTCard(nft) {
        const imageElement = nft.imageUrl
            ? `<img src="${nft.imageUrl}" alt="${nft.collectionName} #${nft.nftId}" class="w-full h-full object-contain group-hover:scale-105 transition-transform" />`
            : `<div class="w-full h-full flex items-center justify-center text-3xl group-hover:scale-105 transition-transform">👾</div>`;

        return `
            <div id="select-nft-${nft.id}" class="rounded-2xl border border-white/10 bg-white/5 overflow-hidden cursor-pointer hover:border-indigo-500 hover:bg-indigo-900/20 transition-all group">
                <div class="h-32 bg-slate-800 relative">
                    ${imageElement}
                </div>
                <div class="p-3">
                    <div class="font-bold text-sm truncate">${nft.collectionName}</div>
                    <div class="text-xs text-slate-400">#${nft.nftId}</div>
                    <div class="mt-2 text-[10px] uppercase font-bold text-indigo-400 tracking-wider">${nft.trait}</div>
                </div>
            </div>
        `;
    }

    show() {
        this.container.classList.remove('hidden');
        this.loadInventory();
    }

    hide() {
        this.container.classList.add('hidden');
        this.container.innerHTML = ''; // Clean up DOM
        this.onClose();
    }
}
