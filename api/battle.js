import { setCors } from './_lib/cors.js';
import challenge from './_lib/battle/challenge.js';
import fight from './_lib/battle/fight.js';
import history from './_lib/battle/history.js';
import replay from './_lib/battle/replay.js';
import record from './_lib/battle/record.js';

export default async function handler(req, res) {
    // Unknown actions never reached a sub-handler, so the 404 was returned
    // without CORS headers (and preflight for a bad action hung the browser).
    setCors(req, res, {
        methods: 'GET,POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });
    if (req.method === 'OPTIONS') return res.status(204).end();

    const { action } = req.query;

    switch (action) {
        case 'challenge':
            return challenge(req, res);
        case 'fight':
            return fight(req, res);
        case 'history':
            return history(req, res);
        case 'replay':
            return replay(req, res);
        case 'record':
            return record(req, res);
        default:
            return res.status(404).json({ 
                error: 'Endpoint not found. Valid actions: challenge, fight, history, replay, record', 
                code: 'NOT_FOUND' 
            });
    }
}

