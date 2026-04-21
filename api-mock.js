import handler from './api/battle.js';

const req = { query: { action: 'challenge' }, method: 'GET', headers: {} };
const res = {
    status: (code) => { console.log("STATUS:", code); return res; },
    json: (data) => { console.log("JSON:", data); return res; },
    send: (data) => { console.log("SEND:", data); return res; }
};

try {
    await handler(req, res);
} catch (e) {
    console.error("CAUGHT UNHANDLED EXCEPTION IN CONTROLLER:");
    console.error(e);
}
