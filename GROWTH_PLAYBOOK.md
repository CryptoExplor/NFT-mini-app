# Growth Playbook — 0 → 1K Users

> **Purpose:** Operational execution plan to scale the NFT Battle Arena from 0 to 1,000 active users.
> This is not about building features — it's about **relentless distribution** using the AI Growth Engine.
> Consolidated from `1K_USER_EXECUTION.md` and `WHALE_TARGETING_ENGINE.md`.

---

## Weekly Target Metrics

| Metric | Target |
|--------|--------|
| New Unique Users | **300** / week |
| Total Battles Fought | **1,000** / week |
| Daily Active Players (DAU) | **50** |
| Play → Share Conversion | **>15%** |

---

## The Core System Loop

The AI Growth Engine operates on a continuous feedback loop:

```
1. PLAY     → User fights in the arena.
2. ANALYZE  → Engine detects outcome (Near Loss, Comeback, Rank Up).
3. GENERATE → Gemini API writes a contextual, viral Farcaster post.
4. DISTRIBUTE → User shares to Farcaster with 1-click.
5. ACQUIRE  → Feed spectators click the Replay/Challenge link.
6. REPEAT.
```

**Technical systems powering this loop:**
- `src/lib/game/conversion.js` — Streak detection, share prompt logic
- `src/lib/game/distributionEngine.js` — 7-day content calendar, template generation
- `api/_lib/generatePost.js` — Gemini AI post generation
- `src/utils/social.js` — Farcaster/Twitter/Web Share integration
- `src/components/game/BattleShareCard.js` — Post-battle share cards
- `/api/track` — Tracks `social_share` and `replay_conversion` events

---

## Daily Execution Tasks

### 1. Content Distribution (AI Assisted)
- **Volume:** 3 Posts / Day minimum.
- **Mix:**
  - 2 Challenge Posts (e.g., "Think you can beat my squad?")
  - 1 Replay Post (e.g., "Insane comeback, won with 1 HP.")
- **Rule:** Always include `@base` and a specific CTA.
- **Rule:** Do NOT tag `@dwr.eth` or `@v.eth` — spam-filter trigger.

### 2. Community Engagement (Manual/AI Assisted)
- **Volume:** 20 Replies / Day.
- **Channels:** `/#base`, `/#nft`, `/#onchain-games`.
- **Template:** "Turn your NFT into a fighter — Try it: [Link]"

### 3. Whale Targeting (Manual Outreach)
- **Volume:** 5 DMs / Day + 2 Public Challenges.
- **Timing:** Engage when the target is actively posting on Farcaster (highest chance of immediate click).
- **Follow-up:** If they play and rank up, reply to their score on the timeline to amplify their flex.

---

## Whale Target Profiles

### Who to Target

1. **Top NFT Collectors (Base Ecosystem)**
   - Holders of high-value or highly active Base NFTs (e.g., Base Gods, Onchain Summer passes, Jesse Pollak NFTs).
   - *Why:* They have the assets and are emotionally invested in the ecosystem.

2. **Farcaster Trending Users**
   - Users frequently appearing on the trending feed or with high engagement rates.
   - *Why:* Their replies and quotes generate massive impressions.

3. **GameFi Enthusiasts**
   - Users who frequently post about or play other on-chain games (e.g., Pixels, Pirate Nation).
   - *Why:* They understand the meta and are likely to grind the leaderboard.

### DM Templates

Use these short, punchy templates for direct outreach. **Do not use long, formal paragraphs.**

#### The "Collector" Hook
> "Saw your Base Gods NFT
> You can actually battle with it here
> Want to try?"
> *[Link to Arena]*

#### The "Competitor" Hook
> "I see you grinding the leaderboard on [Other Game].
> I just launched a fast-paced NFT Arena on Base.
> Think you can hit Top 10 by Sunday?"
> *[Link to Arena]*

#### The "Ecosystem" Hook
> "Hey [Name], noticed you're active on Base.
> We built a way to fight using your wallet's NFTs.
> My squad is waiting for a real challenge. Let's go."
> *[Challenge Link]*

### Public Callout Strategy (High ROI)

Public callouts generate curiosity from the target *and* their followers.

**Format:**
1. Tag the user directly.
2. State a bold claim or challenge.
3. Drop the specific `[challenge link]`.

**Example:**
> @[WhaleUsername]
> Think your NFT collection is actually strong?
> Prove it in the Arena.
> Fight my squad
> [Challenge Link]

---

## Weekend Event: The Catalyst

To drive urgency and spike traffic, run a dedicated weekend event.

**Event:** "Weekend Warrior Tournament"
**Timing:** Friday 12:00 PM EST to Sunday 11:59 PM EST.

**Incentive:**
- Top 3 players receive a "Champion" Discord role or featured spot on the Farcaster feed.
- Bragging rights (Status).

**Promotion Strategy:**
- **Wednesday:** Tease the tournament ("Get your squad ready").
- **Friday:** Launch post with leaderboard link.
- **Saturday:** Mid-point update highlighting the Top 5 players to incite competition.
- **Sunday:** "4 Hours Left" urgency post.

**Technical:** The tournament system (`src/lib/game/tournament.js`) already handles 7-day rolling windows with standings. The `TournamentBoard.js` component renders the countdown and standings UI.

---

## Success Metrics (Monitor Daily)

Track these metrics via the analytics dashboard (`/analytics`) and `/api/track`:

| Metric | How to Measure | Goal |
|--------|---------------|------|
| **Replay → Play Conversion** | % of users who click a shared replay and then play a match | Track via `replay_conversion` event |
| **Play → Share Conversion** | % of users who hit "Share Victory" after a battle | >15%, track via `social_share` event |
| **Retention (Daily Boss)** | How many users come back to fight the Daily Boss? | Monitor via `battle_result_v2` events with boss metadata |
| **Whale Conversion** | How many DM'd whales actually play? | Manual tracking |
| **DAU** | Unique wallets per day from `/api/admin` | Target: 50 |

---

## Execution Rules

1. **Consistency > Volume.** 3 posts/day, every day, is better than 10 one day and 0 the next.
2. **Always include a link.** Every post must have a direct link to the Arena or a specific challenge.
3. **Always tag `@base`.** This is the ecosystem. Own it.
4. **Never spam individuals.** 5 DMs/day max. Wait for engagement before following up.
5. **Amplify organic wins.** When someone posts about their battle, quote-reply and amplify.
6. **Track everything.** The `/api/track` pipeline and analytics dashboard exist for a reason. Use them daily.
