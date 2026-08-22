/**
 * NFT Detail Modal
 *
 * Gallery cards use OpenSea display media only. Opening this modal is the
 * explicit user action that fetches the detailed NFT response and upgrades the
 * preview to original-resolution media. Potentially very large animation media
 * is never downloaded until the user presses Play.
 */

import { getExplorerUrl } from '../utils/chain.js';
import { escapeHtml, sanitizeUrl } from '../utils/html.js';
import { renderIcon } from '../utils/icons.js';
import { fetchNFTDetails } from '../lib/opensea.js';
import { getAnimationKind, getNFTMedia, toBrowserMediaUrl } from '../lib/nftMedia.js';

const CHAIN_IDS = {
    ethereum: 1,
    base: 8453,
    base_sepolia: 84532
};

let activeSession = 0;
let activeEscHandler = null;
let previouslyFocused = null;
let removalTimer = null;

function formatCollectionName(value) {
    return String(value || 'Unknown Collection').replace(/-/g, ' ');
}

function formatUsd(value) {
    if (value === null || value === undefined || value === '') return '';
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: amount < 1 ? 2 : 0
    }).format(amount);
}

function formatTraitValue(trait) {
    if (trait?.display_type === 'date') {
        const timestamp = Number(trait.value);
        if (Number.isFinite(timestamp)) {
            return new Date(timestamp * 1000).toLocaleDateString();
        }
    }
    return String(trait?.value ?? '');
}

function buildTrustBadges(nft) {
    const badges = [];
    if (nft.is_suspicious) badges.push('<span class="nft-trust-badge nft-trust-warning">Suspicious item</span>');
    if (nft.is_nsfw) badges.push('<span class="nft-trust-badge nft-trust-warning">Sensitive media</span>');
    if (nft.is_disabled) badges.push('<span class="nft-trust-badge nft-trust-disabled">Disabled on OpenSea</span>');
    return badges.length ? `<div class="nft-trust-badges">${badges.join('')}</div>` : '';
}

function buildMetrics(nft) {
    const metrics = [];
    const value = formatUsd(nft.estimated_value_usd);
    const rank = Number(nft.rarity?.rank);
    const owners = Array.isArray(nft.owners) ? nft.owners.length : 0;

    if (value) {
        metrics.push(`
            <div class="nft-metric-card">
                <span class="nft-metric-label">Estimated value</span>
                <strong>${escapeHtml(value)}</strong>
            </div>
        `);
    }
    if (Number.isFinite(rank) && rank > 0) {
        metrics.push(`
            <div class="nft-metric-card">
                <span class="nft-metric-label">Rarity rank</span>
                <strong>#${escapeHtml(rank.toLocaleString())}</strong>
            </div>
        `);
    }
    if (owners > 0) {
        metrics.push(`
            <div class="nft-metric-card">
                <span class="nft-metric-label">Owner${owners === 1 ? '' : 's'}</span>
                <strong>${escapeHtml(owners.toLocaleString())}</strong>
            </div>
        `);
    }

    return metrics.length ? `<div class="nft-metrics-grid">${metrics.join('')}</div>` : '';
}

function buildTraits(nft) {
    if (!Array.isArray(nft.traits) || nft.traits.length === 0) return '';

    return `
        <div class="mt-5">
            <h3 class="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Traits</h3>
            <div class="nft-traits-grid">
                ${nft.traits.map((trait) => {
                    const value = formatTraitValue(trait);
                    const max = trait.max_value !== null && trait.max_value !== undefined
                        ? ` / ${escapeHtml(String(trait.max_value))}`
                        : '';
                    return `
                        <div class="trait-badge" title="${escapeHtml(value)}">
                            <div class="trait-type">${escapeHtml(trait.trait_type || 'Trait')}</div>
                            <div class="trait-value">${escapeHtml(value)}${max}</div>
                            ${trait.trait_count ? `<div class="trait-rarity">${escapeHtml(String(trait.trait_count))} have this</div>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function buildMetadata(nft, chain, detailState = 'loading') {
    const chainId = CHAIN_IDS[chain] || CHAIN_IDS.base;
    const explorerBase = getExplorerUrl(chainId);
    const identifier = String(nft.identifier ?? '');
    const contract = String(nft.contract || '');
    const contractUrl = contract ? `${explorerBase}/token/${encodeURIComponent(contract)}` : '';
    const tokenUrl = contract ? `${contractUrl}?a=${encodeURIComponent(identifier)}` : '';
    const shortenedContract = contract ? `${contract.slice(0, 6)}...${contract.slice(-4)}` : 'N/A';
    const openSeaUrl = sanitizeUrl(nft.opensea_url || '');
    const detailStatus = detailState === 'loaded'
        ? 'Detailed metadata from OpenSea'
        : detailState === 'error'
            ? 'Showing cached wallet metadata'
            : 'Loading rarity and ownership from OpenSea…';

    return `
        <div class="text-xs uppercase tracking-wider opacity-60 mb-1 capitalize">${escapeHtml(formatCollectionName(nft.collection))}</div>
        <h2 id="nft-modal-title" class="text-2xl md:text-3xl font-bold mb-3">${escapeHtml(nft.name || 'Unnamed')}</h2>
        ${buildTrustBadges(nft)}
        <div class="nft-detail-source ${detailState === 'loading' ? 'nft-detail-source-loading' : ''}" aria-live="polite">
            ${escapeHtml(detailStatus)}
        </div>

        ${nft.description ? `
            <div class="nft-modal-description">
                <p class="text-sm opacity-70 leading-relaxed">${escapeHtml(nft.description)}</p>
            </div>
        ` : ''}

        ${buildMetrics(nft)}
        ${buildTraits(nft)}

        <div class="mt-5">
            <h3 class="text-sm font-bold uppercase tracking-wider opacity-60 mb-3">Details</h3>
            <div class="nft-detail-rows">
                <div class="nft-detail-row">
                    <span class="opacity-50">Contract</span>
                    ${contractUrl
                        ? `<a href="${contractUrl}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:underline font-mono text-sm" title="${escapeHtml(contract)}">${escapeHtml(shortenedContract)}</a>`
                        : `<span class="font-mono text-sm">N/A</span>`}
                </div>
                <div class="nft-detail-row">
                    <span class="opacity-50">Token ID</span>
                    <span class="font-mono text-sm nft-token-id" title="${escapeHtml(identifier)}">${escapeHtml(identifier)}</span>
                </div>
                <div class="nft-detail-row">
                    <span class="opacity-50">Standard</span>
                    <span class="text-sm uppercase">${escapeHtml(nft.token_standard || 'erc721')}</span>
                </div>
                <div class="nft-detail-row">
                    <span class="opacity-50">Chain</span>
                    <span class="text-sm capitalize">${escapeHtml(chain.replace(/_/g, ' '))}</span>
                </div>
            </div>
        </div>

        <div class="nft-modal-actions">
            ${openSeaUrl ? `
                <a href="${openSeaUrl}" target="_blank" rel="noopener noreferrer" class="nft-action-btn nft-action-primary">
                    <span>${renderIcon('EXTERNAL', 'w-4 h-4')}</span> View on OpenSea
                </a>
            ` : ''}
            ${tokenUrl ? `
                <a href="${tokenUrl}" target="_blank" rel="noopener noreferrer" class="nft-action-btn nft-action-secondary">
                    <span>${renderIcon('EYE', 'w-4 h-4')}</span> Block Explorer
                </a>
            ` : ''}
        </div>
    `;
}

function mergeNFTDetails(summary, details) {
    const merged = { ...summary, ...details };
    // A detailed response should enrich the summary, not erase a populated
    // summary field with an empty value from an intermittently indexed item.
    for (const key of ['name', 'description', 'collection', 'contract', 'opensea_url']) {
        if (!merged[key] && summary[key]) merged[key] = summary[key];
    }
    if ((!merged.traits || merged.traits.length === 0) && summary.traits?.length) merged.traits = summary.traits;
    return merged;
}

/**
 * Show an NFT detail modal. The summary preview renders immediately; detailed
 * metadata and original media are loaded progressively after opening.
 */
export function showNFTDetailModal(nft, chain = 'base') {
    closeNFTDetailModal(true);
    const session = ++activeSession;
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    let resolvedNFT = nft;
    let animationUrl = sanitizeUrl(toBrowserMediaUrl(getNFTMedia(nft).fullAnimationUrl));
    let showingAnimation = false;
    const requestedFullImages = new Set();

    const initialMedia = getNFTMedia(nft);
    const previewImageUrl = sanitizeUrl(toBrowserMediaUrl(initialMedia.previewImageUrl)) || '/placeholder.png';

    const overlay = document.createElement('div');
    overlay.id = 'nft-detail-modal';
    overlay.className = 'nft-modal-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'nft-modal-title');
    overlay.innerHTML = `
        <div class="nft-modal-backdrop" id="nft-modal-backdrop"></div>
        <div class="nft-modal-content" tabindex="-1">
            <button id="nft-modal-close" class="nft-modal-close" aria-label="Close NFT details">
                ${renderIcon('CLOSE', 'w-5 h-5')}
            </button>

            <div class="nft-modal-body">
                <div class="nft-modal-image-section">
                    <div class="nft-modal-image-container" id="nft-modal-image-container">
                        <img id="nft-modal-image" src="${escapeHtml(previewImageUrl)}"
                            alt="${escapeHtml(nft.name || 'NFT preview')}"
                            class="nft-modal-image"
                            decoding="async" fetchpriority="high" />
                    </div>
                    <div class="nft-media-toolbar">
                        <span id="nft-media-quality" class="nft-media-quality" aria-live="polite">Preview</span>
                        <div class="nft-media-toolbar-actions">
                            <button id="nft-modal-play-media" type="button" class="nft-media-button hidden">
                                ${renderIcon('PLAY', 'w-3.5 h-3.5')} <span>Play media</span>
                            </button>
                            <a id="nft-modal-original-link" class="nft-media-button hidden" target="_blank" rel="noopener noreferrer">
                                ${renderIcon('EXTERNAL', 'w-3.5 h-3.5')} <span>Original</span>
                            </a>
                        </div>
                    </div>
                    <p class="nft-media-note">Previews save data. Full image loads only after opening; animation loads only when played.</p>
                </div>

                <div id="nft-modal-metadata" class="nft-modal-details-section">
                    ${buildMetadata(nft, chain, 'loading')}
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    const modalImage = overlay.querySelector('#nft-modal-image');
    const mediaContainer = overlay.querySelector('#nft-modal-image-container');
    const qualityLabel = overlay.querySelector('#nft-media-quality');
    const originalLink = overlay.querySelector('#nft-modal-original-link');
    const playButton = overlay.querySelector('#nft-modal-play-media');

    const isCurrent = () => activeSession === session && overlay.isConnected;

    const setAnimationUrl = (url) => {
        animationUrl = sanitizeUrl(toBrowserMediaUrl(url));
        playButton?.classList.toggle('hidden', !animationUrl);
        if (playButton && animationUrl) {
            const label = playButton.querySelector('span');
            if (label) label.textContent = getAnimationKind(animationUrl) === 'interactive' ? 'Open media' : 'Play media';
        }
    };

    const upgradeToFullImage = (url) => {
        const fullUrl = sanitizeUrl(toBrowserMediaUrl(url));
        if (!fullUrl || requestedFullImages.has(fullUrl) || !modalImage) return;

        originalLink?.classList.remove('hidden');
        if (originalLink) originalLink.href = fullUrl;

        if (fullUrl === previewImageUrl) {
            if (qualityLabel) qualityLabel.textContent = 'Best available quality';
            return;
        }

        requestedFullImages.add(fullUrl);
        if (qualityLabel) qualityLabel.textContent = 'Loading full resolution…';
        mediaContainer?.classList.add('nft-media-is-loading');

        const loader = new Image();
        loader.onload = () => {
            if (!isCurrent() || !modalImage) return;
            modalImage.src = fullUrl;
            modalImage.classList.add('nft-modal-image-upgraded');
            mediaContainer?.classList.remove('nft-media-is-loading');
            if (qualityLabel) qualityLabel.textContent = 'Full resolution';
        };
        loader.onerror = () => {
            if (!isCurrent()) return;
            mediaContainer?.classList.remove('nft-media-is-loading');
            if (qualityLabel) qualityLabel.textContent = 'Preview · original unavailable';
        };
        loader.src = fullUrl;
    };

    const showStaticImage = () => {
        const video = mediaContainer?.querySelector('video');
        if (video) {
            video.pause();
            video.removeAttribute('src');
            video.load();
            video.remove();
        }
        if (modalImage) modalImage.classList.remove('hidden');
        showingAnimation = false;
        const label = playButton?.querySelector('span');
        if (label) label.textContent = getAnimationKind(animationUrl) === 'interactive' ? 'Open media' : 'Play media';
    };

    playButton?.addEventListener('click', () => {
        if (!animationUrl) return;
        if (getAnimationKind(animationUrl) === 'interactive') {
            const opened = window.open(animationUrl, '_blank', 'noopener,noreferrer');
            if (opened) opened.opener = null;
            return;
        }
        if (showingAnimation) {
            showStaticImage();
            return;
        }

        const video = document.createElement('video');
        video.className = 'nft-modal-image';
        video.controls = true;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.poster = modalImage?.src || previewImageUrl;
        video.src = animationUrl;
        modalImage?.classList.add('hidden');
        mediaContainer?.appendChild(video);
        showingAnimation = true;
        const label = playButton.querySelector('span');
        if (label) label.textContent = 'Show image';
    });

    setAnimationUrl(initialMedia.fullAnimationUrl);
    upgradeToFullImage(initialMedia.fullImageUrl);

    requestAnimationFrame(() => {
        if (!isCurrent()) return;
        overlay.classList.add('nft-modal-active');
        overlay.querySelector('#nft-modal-close')?.focus({ preventScroll: true });
    });

    overlay.querySelector('#nft-modal-close')?.addEventListener('click', () => closeNFTDetailModal());
    overlay.querySelector('#nft-modal-backdrop')?.addEventListener('click', () => closeNFTDetailModal());

    activeEscHandler = (event) => {
        if (event.key === 'Escape') closeNFTDetailModal();
    };
    document.addEventListener('keydown', activeEscHandler);

    // The single-NFT endpoint adds rarity, owners and trust flags. Fetch it only
    // after opening so gallery browsing costs one account request, not N+1.
    if (nft.contract && nft.identifier !== undefined && nft.identifier !== null && nft.identifier !== '') {
        fetchNFTDetails(chain, nft.contract, nft.identifier)
            .then((details) => {
                if (!isCurrent()) return;
                resolvedNFT = mergeNFTDetails(nft, details);
                const metadata = overlay.querySelector('#nft-modal-metadata');
                if (metadata) metadata.innerHTML = buildMetadata(resolvedNFT, chain, 'loaded');

                const detailedMedia = getNFTMedia(resolvedNFT);
                setAnimationUrl(detailedMedia.fullAnimationUrl);
                upgradeToFullImage(detailedMedia.fullImageUrl);
            })
            .catch(() => {
                if (!isCurrent()) return;
                const metadata = overlay.querySelector('#nft-modal-metadata');
                if (metadata) metadata.innerHTML = buildMetadata(resolvedNFT, chain, 'error');
            });
    } else {
        const metadata = overlay.querySelector('#nft-modal-metadata');
        if (metadata) metadata.innerHTML = buildMetadata(resolvedNFT, chain, 'error');
    }
}

/** Close the active NFT detail modal and cancel pending progressive updates. */
export function closeNFTDetailModal(immediate = false) {
    activeSession += 1;
    const modal = document.getElementById('nft-detail-modal');

    if (activeEscHandler) {
        document.removeEventListener('keydown', activeEscHandler);
        activeEscHandler = null;
    }

    document.body.style.overflow = '';
    if (!modal) return;

    const video = modal.querySelector('video');
    if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
    }

    modal.classList.remove('nft-modal-active');
    if (removalTimer) clearTimeout(removalTimer);
    if (immediate) {
        modal.remove();
    } else {
        removalTimer = setTimeout(() => modal.remove(), 300);
    }

    if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    previouslyFocused = null;
}
