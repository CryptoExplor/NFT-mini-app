/**
 * CORS helper.
 *
 * Access-Control-Allow-Credentials is set to true so browsers send cookies /
 * Authorization headers on cross-origin requests.  The spec forbids pairing
 * credentials with a wildcard origin, so we must echo back an *exact* origin
 * string — but only for origins we explicitly trust.  Reflecting an arbitrary
 * Origin header (the previous behaviour) is equivalent to a wildcard and lets
 * any site make credentialed requests to every API endpoint.
 */

const PRODUCTION_ORIGIN = 'https://base-mintapp.vercel.app';

/**
 * Explicit set of origins that may send credentialed cross-origin requests.
 * Add preview / staging URLs here as needed; never use a pattern match or
 * startsWith('http') check.
 */
const ALLOWED_ORIGINS = new Set([
    PRODUCTION_ORIGIN,
    // Local development
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
]);

/**
 * Return the origin to echo in Access-Control-Allow-Origin.
 * If the request origin is not on the allowlist, fall back to the production
 * origin — the browser will then block the credentialed request, which is the
 * correct outcome.
 */
function resolveAllowedOrigin(requestOrigin) {
    if (typeof requestOrigin === 'string' && ALLOWED_ORIGINS.has(requestOrigin)) {
        return requestOrigin;
    }
    return PRODUCTION_ORIGIN;
}

export function setCors(req, res, options = {}) {
    const methods = options.methods || 'GET,OPTIONS';
    const headers = options.headers || 'Content-Type,Authorization';

    // Use caller-supplied origin only if it is already a known-safe value;
    // otherwise derive it from the request.
    const origin = (options.origin && ALLOWED_ORIGINS.has(options.origin))
        ? options.origin
        : resolveAllowedOrigin(req?.headers?.origin);

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
