const DEFAULT_ALLOWED_ORIGIN = 'https://base-mintapp.vercel.app';

function normalizeOrigin(originHeaderValue) {
    if (Array.isArray(originHeaderValue)) {
        return normalizeOrigin(originHeaderValue[0]);
    }
    if (typeof originHeaderValue === 'string' && originHeaderValue.startsWith('http')) {
        return originHeaderValue;
    }
    return DEFAULT_ALLOWED_ORIGIN;
}

export function setCors(req, res, options = {}) {
    const methods = options.methods || 'GET,OPTIONS';
    const headers = options.headers || 'Content-Type,Authorization';
    const origin = options.origin || normalizeOrigin(req?.headers?.origin);

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
}

/**
 * Higher-order function that wraps an API handler with CORS.
 * Handles OPTIONS preflight automatically.
 */
export function withCors(handler, options = {}) {
    return async function (req, res) {
        setCors(req, res, {
            methods: 'GET,POST,OPTIONS',
            headers: 'Content-Type,Authorization',
            ...options,
        });

        // Handle preflight
        if (req.method === 'OPTIONS') {
            return res.status(204).end();
        }

        return handler(req, res);
    };
}
