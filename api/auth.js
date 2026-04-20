import nonce from './_lib/auth/nonce.js';
import verify from './_lib/auth/verify.js';

export default async function handler(req, res) {
    const { action } = req.query;

    switch (action) {
        case 'nonce':
            return nonce(req, res);
        case 'verify':
            return verify(req, res);
        default:
            return res.status(404).json({ 
                error: 'Endpoint not found. Valid actions: nonce, verify', 
                code: 'NOT_FOUND' 
            });
    }
}
