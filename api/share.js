import { getCollectionBySlug } from '../src/lib/loadCollections.js';

const APP_NAME = 'Base Mint App';
const DEFAULT_DESCRIPTION = 'Multi-collection minting on Farcaster and Base App.';
const DEFAULT_IMAGE = '/image.png';
const DEFAULT_SHARE_PREVIEW_IMAGE = '/image1.png';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function normalizeHeaderValue(value) {
    if (Array.isArray(value)) return value[0];
    return value;
}

function getOrigin(req) {
    const forwardedProto = normalizeHeaderValue(req.headers['x-forwarded-proto']);
    const forwardedHost = normalizeHeaderValue(req.headers['x-forwarded-host']);
    const host = normalizeHeaderValue(req.headers.host);

    const protocol = typeof forwardedProto === 'string' && forwardedProto.length > 0 ? forwardedProto : 'https';
    const domain = typeof forwardedHost === 'string' && forwardedHost.length > 0
        ? forwardedHost
        : (typeof host === 'string' && host.length > 0 ? host : 'base-mintapp.vercel.app');

    return `${protocol}://${domain}`;
}

function absoluteUrl(pathOrUrl, origin) {
    if (typeof pathOrUrl !== 'string' || !pathOrUrl.trim()) return null;
    try {
        return new URL(pathOrUrl, origin).toString();
    } catch {
        return null;
    }
}

function buildMiniAppMeta({ imageUrl, targetUrl, buttonTitle, splashImageUrl }) {
    return JSON.stringify({
        version: '1',
        imageUrl,
        button: {
            title: buttonTitle,
            action: {
                type: 'launch_miniapp',
                name: APP_NAME,
                url: targetUrl,
                splashImageUrl,
                splashBackgroundColor: '#1A1F3A'
            }
        }
    });
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const origin = getOrigin(req);
    const rawSlug = typeof req.query?.slug === 'string' ? req.query.slug.trim() : '';
    const collection = rawSlug ? getCollectionBySlug(rawSlug) : null;

    const slug = collection?.slug || null;
    const pageUrl = (slug ? absoluteUrl(`/share/${slug}`, origin) : absoluteUrl('/share', origin)) || 'https://base-mintapp.vercel.app/share';
    const targetUrl = (slug ? absoluteUrl(`/mint/${slug}`, origin) : absoluteUrl('/', origin)) || 'https://base-mintapp.vercel.app/';
    const miniAppImageUrl = absoluteUrl(collection?.shareImageUrl || collection?.imageUrl || DEFAULT_IMAGE, origin) || 'https://base-mintapp.vercel.app/image.png';
    const previewImageUrl = absoluteUrl(
        collection
            ? (collection.shareImageUrl || collection.imageUrl || DEFAULT_IMAGE)
            : DEFAULT_SHARE_PREVIEW_IMAGE,
        origin
    ) || miniAppImageUrl;
    const splashImageUrl = absoluteUrl('/splash.png', origin) || 'https://base-mintapp.vercel.app/splash.png';

    const title = collection ? `${collection.name} | Base Mint App` : 'Mint NFTs on Base | Base Mint App';
    const description = collection?.description || DEFAULT_DESCRIPTION;
    const buttonTitle = collection ? `Mint ${collection.name}` : 'Open Mint App';

    const miniAppMeta = buildMiniAppMeta({
        imageUrl: miniAppImageUrl,
        targetUrl,
        buttonTitle,
        splashImageUrl
    });

    const escapedTitle = escapeHtml(title);
    const escapedDescription = escapeHtml(description);
    const escapedPreviewImageUrl = escapeHtml(previewImageUrl);
    const escapedPageUrl = escapeHtml(pageUrl);
    const escapedMiniAppMeta = escapeHtml(miniAppMeta);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapedTitle}</title>
  <meta name="description" content="${escapedDescription}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapedTitle}">
  <meta property="og:description" content="${escapedDescription}">
  <meta property="og:image" content="${escapedPreviewImageUrl}">
  <meta property="og:url" content="${escapedPageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapedTitle}">
  <meta name="twitter:description" content="${escapedDescription}">
  <meta name="twitter:image" content="${escapedPreviewImageUrl}">
  <meta name="fc:miniapp" content='${escapedMiniAppMeta}'>
</head>
<body>
  <script>
    window.location.replace(${JSON.stringify(targetUrl)});
  </script>
  <noscript>
    <a href="${escapeHtml(targetUrl)}">Open app</a>
  </noscript>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).send(html);
}
