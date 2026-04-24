/**
 * NFT Detail Modal
 * Full-screen overlay showing NFT metadata, traits, and external links
 */

import { getExplorerUrl } from '../utils/chain.js';
import { escapeHtml, sanitizeUrl } from '../utils/html.js';
import { renderIcon } from '../utils/icons.js';

/**
 * Show the NFT detail modal
 * @param {Object} nft - Normalized NFT object from opensea.js
 * @param {string} chain - Chain identifier (e.g. 'base')
 */
export function showNFTDetailModal(nft, chain = 'base') {
    // Remove existing modal if present
    closeNFTDetailModal();

    const chainId = chain === 'base' ? 8453 : 1;
    const explorerBase = getExplorerUrl(chainId);
    const contractUrl = nft.contract ? `${explorerBase}/token/${encodeURIComponent(nft.contract)}` : '#';
    const tokenUrl = nft.contract ? `${explorerBase}/token/${encodeURIComponent(nft.contract)}?a=${encodeURIComponent(nft.identifier)}` : '#';
    const shortenedContract = nft.contract
        ? `${nft.contract.slice(0, 6)}...${nft.contract.slice(-4)}`
        : 'N/A';

    const safeName = escapeHtml(nft.name || 'Unnamed');
    const safeCollection = escapeHtml(nft.collection || 'Unknown Collection');
    const safeDescription = escapeHtml(nft.description || '');
    const safeIdentifier = escapeHtml(nft.identifier || '');
    const safeStandard = escapeHtml(nft.token_standard || 'erc721');
    const safeContract = escapeHtml(shortenedContract);
    const safeChain = escapeHtml(chain);
    const safeContractTitle = escapeHtml(nft.contract || '');
    const safeAnimationUrl = sanitizeUrl(nft.animation_url || '');
    const safeImageUrl = sanitizeUrl(nft.image_url || '/placeholder.png') || '/placeholder.png';
    const safeOpenSeaUrl = sanitizeUrl(nft.opensea_url || '');

    const overlay = document.createElement('div');
    overlay.id = 'nft-detail-modal';
    overlay.className = 'nft-modal-overlay';
    overlay.innerHTML = `
        <div class="nft-modal-backdrop" id="nft-modal-backdrop"></div>
        <div class="nft-modal-content">
            <!-- Close Button -->
            <button id="nft-modal-close" class="nft-modal-close" aria-label="Close">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-6 h-6">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>

            <div class="nft-modal-body">
                <!-- Left: Image -->
                <div class="nft-modal-image-section">
                    <div class="nft-modal-image-container">
                        ${safeAnimationUrl
            ? `<video src="${safeAnimationUrl}" poster="${safeImageUrl}" autoplay loop muted playsinline class="nft-modal-image"></video>`
            : `<img src="${safeImageUrl}"
                                    alt="${safeName}"
                                    class="nft-modal-image"
                                    onerror="this.src='/placeholder.png'" />`
        }
                    </div>
                </div>

                <!-- Right: Details -->
                <div class="nft-modal-details-section">
                    <!-- Collection -->
                    <div class="text-xs uppercase tracking-wider opacity-60 mb-1">${safeCollection}</div>

                    <!-- Name -->
                    <h2 class="text-2xl md:text-3xl font-bold mb-3">${safeName}</h2>

                    <!-- Description -->
                    ${nft.description ? `
                        <div class="nft-modal-description">
                            <p class="text-sm opacity-70 leading-relaxed">${safeDescription}</p>
                        </div>
                    ` : ''}

                    <!-- Traits -->
                    ${nft.traits && nft.traits.length > 0 ? `
                        <div class="mt-5">
                            <h3 class="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Traits</h3>
                            <div class="nft-traits-grid">
                                ${nft.traits.map(t => `
                                    <div class="trait-badge">
                                        <div class="trait-type">${escapeHtml(t.trait_type)}</div>
                                        <div class="trait-value">${escapeHtml(String(t.value))}</div>
                                        ${t.trait_count ? `<div class="trait-rarity">${escapeHtml(String(t.trait_count))} have this</div>` : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Contract Details -->
                    <div class="mt-5">
                        <h3 class="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Details</h3>
                        <div class="nft-detail-rows">
                            <div class="nft-detail-row">
                                <span class="opacity-50">Contract</span>
                                <a href="${contractUrl}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline font-mono text-sm" title="${safeContractTitle}">${safeContract}</a>
                            </div>
                            <div class="nft-detail-row">
                                <span class="opacity-50">Token ID</span>
                                <span class="font-mono text-sm">${safeIdentifier}</span>
                            </div>
                            <div class="nft-detail-row">
                                <span class="opacity-50">Standard</span>
                                <span class="text-sm uppercase">${safeStandard}</span>
                            </div>
                            <div class="nft-detail-row">
                                <span class="opacity-50">Chain</span>
                                <span class="text-sm capitalize">${safeChain}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="nft-modal-actions">
                        ${safeOpenSeaUrl ? `
                            <a href="${safeOpenSeaUrl}" target="_blank" rel="noopener noreferrer" class="nft-action-btn nft-action-primary">
                                <span>${renderIcon('EXTERNAL', 'w-4 h-4')}</span> View on OpenSea
                            </a>
                        ` : ''}
                        <a href="${tokenUrl}" target="_blank" rel="noopener noreferrer" class="nft-action-btn nft-action-secondary">
                            <span>${renderIcon('EYE', 'w-4 h-4')}</span> Block Explorer
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
        overlay.classList.add('nft-modal-active');
    });

    // Event Listeners
    document.getElementById('nft-modal-close').addEventListener('click', closeNFTDetailModal);
    document.getElementById('nft-modal-backdrop').addEventListener('click', closeNFTDetailModal);

    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeNFTDetailModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Close the NFT detail modal
 */
export function closeNFTDetailModal() {
    const modal = document.getElementById('nft-detail-modal');
    if (!modal) return;

    modal.classList.remove('nft-modal-active');
    document.body.style.overflow = '';

    setTimeout(() => modal.remove(), 300);
}
