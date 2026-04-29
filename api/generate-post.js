import { GoogleGenerativeAI } from '@google/generative-ai';
import { setCors } from './_lib/cors.js';
import { kv } from './_lib/kv.js';
import { checkRateLimit } from './_lib/events.js';

const genAI = process.env.GEMINI_API_KEY
    ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    : null;
const KNOWN_RANKS = ['Rookie', 'Warrior', 'Elite', 'Legend', 'Mythic'];

function sanitizeRank(rank) {
    return KNOWN_RANKS.includes(rank) ? rank : 'Warrior';
}

export default async function handler(req, res) {
    setCors(req, res, {
        methods: 'POST,OPTIONS',
        headers: 'Content-Type, Authorization'
    });

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { type, rank, position, hp_diff, wallet } = req.body || {};

        if (!type || !rank) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const normalizedWallet = (wallet && wallet !== 'anonymous') ? String(wallet).toLowerCase() : 'anonymous';
        const clientIp = req.headers['x-forwarded-for'] || 'unknown_ip';
        const rateLimitKey = `ai_gen_${normalizedWallet !== 'anonymous' ? normalizedWallet : clientIp}`;

        try {
            await checkRateLimit(kv, rateLimitKey, 'ai_post', 5, 3600);
        } catch {
            return res.status(429).json({ error: 'Rate limit exceeded for AI generation' });
        }

        // WARN-01 fix: validate rank against known values to prevent prompt injection
        const safeRank = sanitizeRank(rank);

        let battleContext = '';
        if (type === 'NEAR_LOSS') battleContext = `Lost the fight by only ${hp_diff || 5} HP. Very close match.`;
        else if (type === 'COMEBACK') battleContext = 'Insane clutch! Dropped to critical HP but managed to win in the final rounds.';
        else if (type === 'BIG_WIN') battleContext = 'Total domination. Won with almost full health remaining.';
        else battleContext = 'Standard arena battle.';

        const prompt = `
Generate a short Farcaster post (max 2 lines) for an NFT Battle Arena game.

Battle Context: ${battleContext}
Player's Current Rank: ${safeRank}
Tournament Position: ${position ? '#' + position : 'Unranked'}

Rules:
- Tone: competitive, short, viral, web3 native.
- Do NOT use emojis excessively (max 1-2).
- MUST end with: "Can you beat me?" or "Try it here"
- Do NOT include any links or URLs in your response, I will append them later.
- Do NOT use hashtags.

Output ONLY the text of the post.
`;

        let text = '';
        if (genAI) {
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
            const result = await model.generateContent(prompt);
            text = result.response.text().trim();
        }

        if (!text) {
            throw new Error('AI generation unavailable');
        }

        return res.status(200).json({ success: true, text });
    } catch (error) {
        console.error('Gemini API Error:', error);

        const fallbackRank = sanitizeRank(req.body?.rank);
        const fallbackText = `I just fought an intense battle in the Arena.\n\nCurrent rank: ${fallbackRank}\n\nCan you beat me?`;

        return res.status(200).json({
            success: false,
            text: fallbackText,
            error: 'AI generation failed, using fallback'
        });
    }
}
