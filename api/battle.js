import challenge from './_lib/battle/challenge.js';
import fight from './_lib/battle/fight.js';
import history from './_lib/battle/history.js';
import replay from './_lib/battle/replay.js';

export default async function handler(req, res) {
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
        default:
            return res.status(404).json({ 
                error: 'Endpoint not found. Valid actions: challenge, fight, history, replay', 
                code: 'NOT_FOUND' 
            });
    }
}
