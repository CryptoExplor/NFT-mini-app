import { $ } from '../../utils/dom.js';
import { simulateBattle } from './engine.js';
import { createShareCard, getFarcasterShareUrl } from '../../components/game/BattleShareCard.js';

/**
 * Premium Combat Arena Renderer
 * Full-screen immersive battle experience with particle effects,
 * floating damage numbers, crit bursts, dodge ghosts, and cinematic transitions.
 */

// ── Particle System ──────────────────────────────────────────────
function spawnParticles(container, count = 20) {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];
    const wrap = document.createElement('div');
    wrap.className = 'battle-particles';

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'battle-particle';
        p.style.left = `${Math.random() * 100}%`;
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        p.style.animationDuration = `${4 + Math.random() * 8}s`;
        p.style.animationDelay = `${Math.random() * 6}s`;
        p.style.width = `${2 + Math.random() * 4}px`;
        p.style.height = p.style.width;
        wrap.appendChild(p);
    }
    container.appendChild(wrap);
}

// ── Floating Damage Number ───────────────────────────────────────
function showDamageNumber(targetSelector, damage, type = 'normal') {
    const target = $(targetSelector);
    if (!target) return;

    const el = document.createElement('div');
    const typeClass = {
        normal: 'dmg-normal',
        crit: 'dmg-crit',
        heal: 'dmg-heal',
        miss: 'dmg-miss'
    }[type] || 'dmg-normal';

    el.className = `dmg-number ${typeClass}`;
    el.textContent = type === 'miss' ? 'MISS' : (type === 'heal' ? `+${damage}` : `-${damage}`);

    // Randomise horizontal position slightly
    const offsetX = -20 + Math.random() * 40;
    el.style.left = `calc(50% + ${offsetX}px)`;
    el.style.top = '20%';

    target.style.position = 'relative';
    target.appendChild(el);
    setTimeout(() => el.remove(), 1100);
}

// ── Crit Burst Effect ────────────────────────────────────────────
function showCritBurst(targetSelector) {
    const target = $(targetSelector);
    if (!target) return;

    const burst = document.createElement('div');
    burst.className = 'crit-burst';
    burst.style.left = 'calc(50% - 40px)';
    burst.style.top = 'calc(50% - 40px)';

    target.style.position = 'relative';
    target.appendChild(burst);
    setTimeout(() => burst.remove(), 700);
}

// ── Slash Trail Effect ───────────────────────────────────────────
function showSlashTrail(targetSelector, fromLeft = true) {
    const target = $(targetSelector);
    if (!target) return;

    const slash = document.createElement('div');
    slash.className = 'slash-trail';
    slash.style.top = '45%';
    slash.style.left = fromLeft ? '10%' : '50%';
    if (!fromLeft) slash.style.transform = 'scaleX(-1) rotate(-15deg)';

    target.style.position = 'relative';
    target.appendChild(slash);
    setTimeout(() => slash.remove(), 400);
}

// ── Round Splash Overlay ─────────────────────────────────────────
function showRoundSplash(container, roundNumber) {
    const splash = document.createElement('div');
    splash.className = 'round-splash';
    splash.textContent = `Round ${roundNumber}`;

    // Position absolutely relative to the battlefield, not the viewport
    const rect = container.getBoundingClientRect();
    splash.style.position = 'absolute';
    splash.style.top = `${rect.top + rect.height / 2 + window.scrollY}px`;
    splash.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;

    document.body.appendChild(splash);
    setTimeout(() => splash.remove(), 1300);
}

// ── Screen Shake ─────────────────────────────────────────────────
function screenShake(selector) {
    const el = $(selector);
    if (!el) return;
    el.classList.remove('battle-shake');
    void el.offsetWidth; // force reflow
    el.classList.add('battle-shake');
    setTimeout(() => el.classList.remove('battle-shake'), 500);
}

// ── Biome Class Helper ───────────────────────────────────────────
function getBiomeClass(environmentStats) {
    if (!environmentStats) return 'biome-default';
    const biome = typeof environmentStats === 'string'
        ? environmentStats
        : environmentStats?.biome || environmentStats?.environment?.biome || '';

    const b = String(biome).toLowerCase();
    if (b.includes('desert') || b.includes('dune')) return 'biome-desert';
    if (b.includes('ocean') || b.includes('coast') || b.includes('water')) return 'biome-ocean';
    if (b.includes('forest') || b.includes('valley')) return 'biome-forest';
    if (b.includes('snow') || b.includes('tundra') || b.includes('mountain')) return 'biome-tundra';
    if (b.includes('neon') || b.includes('city') || b.includes('sunset')) return 'biome-neon';
    return 'biome-default';
}

// ══════════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════════

export function renderCombatArena(playerData, enemyData, onBattleComplete, options = {}) {
    const preview = $('#match-preview-view');
    const arena = $('#arena-view');
    const container = $('#battle-container');

    preview.classList.add('hidden');
    arena.classList.remove('hidden');

    container.classList.add('bg-black/50', 'backdrop-blur-md', 'rounded-t-3xl', 'min-h-[80vh]');

    const biomeClass = getBiomeClass(options.environment);

    arena.innerHTML = `
        <!-- Round Header -->
        <div class="flex justify-between items-center bg-black/60 backdrop-blur-sm p-3 md:p-4 rounded-xl border border-white/5 mb-4 md:mb-6 mt-2 md:mt-4">
           <div class="flex items-center gap-3">
               <div class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
               <div class="text-sm font-bold text-indigo-300 tracking-wider">ROUND <span id="round-counter" class="text-white text-lg">1</span></div>
           </div>
           <div class="text-xs tracking-[0.3em] text-slate-400 uppercase">Auto-Battle</div>
           <div class="flex items-center gap-2">
               <div class="h-1.5 w-8 rounded-full bg-indigo-500/30 overflow-hidden">
                   <div id="battle-progress" class="h-full bg-indigo-400 transition-all duration-300" style="width: 0%"></div>
               </div>
           </div>
        </div>

        <!-- Battlefield -->
        <div class="relative w-full min-h-[300px] flex items-center justify-between px-3 md:px-16 ${biomeClass} rounded-2xl border border-white/10 overflow-hidden" id="battlefield">

            <!-- Player Fighter (Left) -->
            <div class="flex flex-col items-center w-2/5 z-10 fighter-enter-left" id="player-sprite-container">
                <!-- HP Bar -->
                <div class="w-full max-w-[180px] mb-3">
                    <div class="flex justify-between text-[10px] mb-1">
                        <span class="text-indigo-300 font-bold tracking-wider">HP</span>
                        <span class="text-indigo-400 font-mono" id="player-hp-text">${playerData.hp} / ${playerData.hp}</span>
                    </div>
                    <div class="w-full h-3 bg-slate-800/80 rounded-full overflow-hidden border border-white/10" id="player-hp-wrap">
                        <div id="player-hp-bar" class="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 transition-all duration-500 ease-out rounded-full" style="width: 100%"></div>
                    </div>
                </div>
                <!-- Avatar -->
                <div class="w-28 h-28 md:w-36 md:h-36 rounded-xl md:rounded-2xl border-2 border-indigo-500/50 shadow-[0_0_20px_rgba(99,102,241,0.3)] md:shadow-[0_0_40px_rgba(99,102,241,0.3)] flex items-center justify-center transition-all duration-300 overflow-hidden bg-indigo-950/50" id="player-avatar">
                   ${playerData.image ? `<img src="${playerData.image}" class="w-full h-full object-contain" alt="Player Fighter" />` : `<div class="text-2xl md:text-4xl font-black text-indigo-400/60">P1</div>`}
                </div>
                <!-- Name + Stats -->
                <div class="mt-2 md:mt-3 text-center">
                    <div class="text-indigo-100 font-bold text-sm truncate max-w-[160px]">${playerData.name}</div>
                    <div class="flex gap-2 mt-1 justify-center">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">${playerData.atk || '?'} ATK</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">${playerData.def || '?'} DEF</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-mono">${playerData.spd || '?'} SPD</span>
                    </div>
                </div>
            </div>

            <!-- VS Indicator -->
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-5">
                <div class="text-4xl md:text-7xl font-black italic text-white/10 select-none" style="text-shadow: 0 0 60px rgba(99,102,241,0.2);">VS</div>
            </div>

            <!-- Enemy Fighter (Right) -->
            <div class="flex flex-col items-center w-2/5 z-10 fighter-enter-right" id="enemy-sprite-container">
                <!-- HP Bar -->
                <div class="w-full max-w-[180px] mb-3">
                    <div class="flex justify-between text-[10px] mb-1">
                        <span class="text-red-300 font-bold tracking-wider">HP</span>
                        <span class="text-red-400 font-mono" id="enemy-hp-text">${enemyData.hp} / ${enemyData.hp}</span>
                    </div>
                    <div class="w-full h-3 bg-slate-800/80 rounded-full overflow-hidden border border-white/10" id="enemy-hp-wrap">
                        <div id="enemy-hp-bar" class="h-full bg-gradient-to-r from-red-500 via-red-400 to-orange-400 transition-all duration-500 ease-out rounded-full" style="width: 100%"></div>
                    </div>
                </div>
                <!-- Avatar -->
                <div class="w-28 h-28 md:w-36 md:h-36 rounded-xl md:rounded-2xl border-2 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)] md:shadow-[0_0_40px_rgba(239,68,68,0.2)] flex items-center justify-center transition-all duration-300 overflow-hidden bg-red-950/40" id="enemy-avatar">
                   ${enemyData.image ? `<img src="${enemyData.image}" class="w-full h-full object-contain" alt="Enemy Fighter" />` : `<div class="text-2xl md:text-4xl font-black ${enemyData.isAi ? 'text-red-400/60' : 'text-red-400/60'}">${enemyData.isAi ? 'AI' : 'P2'}</div>`}
                </div>
                <!-- Name + Stats -->
                <div class="mt-2 md:mt-3 text-center">
                    <div class="text-red-100 font-bold text-sm truncate max-w-[160px]">${enemyData.name}</div>
                    <div class="flex gap-2 mt-1 justify-center">
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-mono">${enemyData.atk || '?'} ATK</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono">${enemyData.def || '?'} DEF</span>
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-300 font-mono">${enemyData.spd || '?'} SPD</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Combat Log -->
        <div class="mt-6 mx-auto max-w-2xl">
            <div class="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2 px-1">Combat Log</div>
            <div class="h-36 overflow-y-auto rounded-xl bg-black/60 backdrop-blur-sm border border-white/5 p-4 text-sm font-mono space-y-1.5 custom-scrollbar" id="combat-log">
                 <div class="text-slate-600 flex items-center gap-2">
                     <span class="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></span>
                     Initialising battle simulation...
                 </div>
            </div>
        </div>

        <!-- Results Overlay -->
        <div id="battle-results" class="hidden mt-6 md:mt-8 flex flex-col items-center justify-center p-5 md:p-8 bg-slate-900/90 backdrop-blur-lg rounded-2xl border border-indigo-500/20 shadow-[0_0_80px_rgba(99,102,241,0.15)]">
            <h2 class="text-3xl md:text-5xl font-black mb-2 md:mb-3" id="victory-text">VICTORY</h2>
            <p class="text-slate-400 mb-2 text-center text-sm md:text-base" id="victory-sub">Your fighter proved superior in combat.</p>
            <div class="text-[10px] md:text-xs text-slate-500 mb-4 md:mb-6 font-mono text-center" id="battle-stats-line"></div>
            <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
                <button id="return-board-btn" class="px-6 md:px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all hover:scale-105 active:scale-95 border border-indigo-400/30 shadow-lg shadow-indigo-500/20">Return to Board</button>
                <button id="share-battle-btn" class="px-6 md:px-8 py-3 bg-white/10 hover:bg-white/20 text-slate-200 rounded-xl font-bold transition-all hover:scale-105 active:scale-95 border border-white/10">Share</button>
            </div>
            <div id="share-card-container" class="hidden mt-4 w-full"></div>
        </div>
    `;

    // Spawn background particles
    const battlefield = $('#battlefield');
    if (battlefield) spawnParticles(battlefield, 25);

    // Start Simulation Process with dramatic intro
    setTimeout(() => {
        showRoundSplash(battlefield, 1);
    }, 600);

    setTimeout(() => {
        let battleData;
        if (options.precomputedLogs && options.precomputedLogs.length > 0) {
            // Use precomputed logs from battle.js (AI local or PvP server)
            battleData = {
                logs: options.precomputedLogs,
                winner: options.winner || playerData.name,
                totalRounds: options.precomputedLogs[options.precomputedLogs.length - 1]?.round || 1
            };
        } else {
            // Fallback: simulate locally (shouldn't normally happen)
            battleData = simulateBattle(playerData, enemyData, Math.random, {
                ...options,
                isAiBattle: !!enemyData.isAi,
                aiWinRate: 0.6
            });
        }
        animateBattle(battleData, playerData.hp, enemyData.hp, playerData.name, enemyData.name, onBattleComplete);
    }, 1800);
}

// ══════════════════════════════════════════════════════════════════
// BATTLE ANIMATION LOOP
// ══════════════════════════════════════════════════════════════════

function animateBattle(battleData, pInitialHp, eInitialHp, playerName, enemyName, onComplete) {
    const logContainer = $('#combat-log');
    const totalLogs = battleData.logs.length;
    let i = 0;
    let lastRound = 0;

    const interval = setInterval(() => {
        if (i >= totalLogs) {
            clearInterval(interval);
            // Update progress to 100%
            const progress = $('#battle-progress');
            if (progress) progress.style.width = '100%';

            setTimeout(() => {
                showResults(battleData, playerName, enemyName, totalLogs);
                if (typeof onComplete === 'function') onComplete(battleData);
            }, 600);
            return;
        }

        const log = battleData.logs[i];

        // Update progress bar
        const progress = $('#battle-progress');
        if (progress) progress.style.width = `${((i + 1) / totalLogs) * 100}%`;

        // Round splash on new round
        if (log.round !== lastRound) {
            lastRound = log.round;
            const roundCounter = $('#round-counter');
            if (roundCounter) roundCounter.innerText = log.round;

            if (log.round > 1) {
                const battlefield = $('#battlefield');
                if (battlefield) showRoundSplash(battlefield, log.round);
            }
        }

        // Determine targets
        const isPlayerAttacking = log.attackerSide === 'P1';
        const attackerContainer = isPlayerAttacking ? '#player-sprite-container' : '#enemy-sprite-container';
        const defenderContainer = isPlayerAttacking ? '#enemy-sprite-container' : '#player-sprite-container';
        const defenderAvatar = isPlayerAttacking ? '#enemy-avatar' : '#player-avatar';

        if (log.isDodge) {
            // ── DODGE ──
            const defEl = $(defenderContainer);
            if (defEl) defEl.classList.add('dodge-ghost');
            setTimeout(() => { if (defEl) defEl.classList.remove('dodge-ghost'); }, 600);

            showDamageNumber(defenderContainer, 0, 'miss');

            // Log entry
            if (logContainer) {
                logContainer.innerHTML += `<div class="text-slate-500 flex items-center gap-2">
                    <span class="text-blue-400">⟡</span>
                    <span>${log.target} <span class="text-blue-400 font-bold">DODGED</span> ${log.attacker}'s attack!</span>
                </div>`;
            }
        } else {
            // ── HIT ──
            // Screen shake
            screenShake('#battlefield');

            // Slash trail
            showSlashTrail('#battlefield', isPlayerAttacking);

            // Bump attacker forward
            bumpEntity(isPlayerAttacking ? '#player-avatar' : '#enemy-avatar', isPlayerAttacking ? 30 : -30);

            // Flash defender
            flashDamage(defenderContainer);

            // Damage number
            if (log.isCrit) {
                showCritBurst(defenderContainer);
                showDamageNumber(defenderContainer, log.damage, 'crit');
            } else {
                showDamageNumber(defenderContainer, log.damage, 'normal');
            }

            // Healing number
            if (log.healing > 0) {
                setTimeout(() => showDamageNumber(attackerContainer, log.healing, 'heal'), 300);
            }

            // Update HP
            if (isPlayerAttacking) {
                updateHp(log.defenderRemainingHp, eInitialHp, 'enemy');
            } else {
                updateHp(log.defenderRemainingHp, pInitialHp, 'player');
            }

            // Combat log entry
            const color = log.isCrit ? 'text-yellow-400' : 'text-slate-300';
            const critBadge = log.isCrit ? '<span class="text-[10px] px-1 py-0.5 rounded bg-yellow-500/20 text-yellow-300 ml-1">CRIT</span>' : '';
            const healText = log.healing > 0 ? ` <span class="text-emerald-400">(+${log.healing} HP)</span>` : '';
            const icon = isPlayerAttacking ? '⚔️' : '🗡️';

            if (logContainer) {
                logContainer.innerHTML += `<div class="${color} flex items-start gap-2">
                    <span class="flex-shrink-0">${icon}</span>
                    <span>${log.attacker} dealt <b>${log.damage}</b> dmg to ${log.target}${critBadge}${healText}</span>
                </div>`;
            }
        }

        // Auto-scroll log
        if (logContainer) logContainer.scrollTop = logContainer.scrollHeight;

        i++;
    }, 1000);
}

// ── HP Bar Update ────────────────────────────────────────────────
function updateHp(current, max, target) {
    const pct = Math.max(0, (current / max) * 100);
    const hpBar = $(`#${target}-hp-bar`);
    const hpText = $(`#${target}-hp-text`);
    const hpWrap = $(`#${target}-hp-wrap`);

    if (hpBar) {
        hpBar.style.width = `${pct}%`;

        // Change color gradient as HP drops
        if (pct < 25) {
            hpBar.className = hpBar.className.replace(/from-\S+\s+via-\S+\s+to-\S+/g, '');
            hpBar.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
        } else if (pct < 50) {
            hpBar.style.background = 'linear-gradient(90deg, #f59e0b, #ef4444)';
        }
    }

    if (hpText) hpText.innerText = `${Math.max(0, current)} / ${max}`;

    // Pulse effect when critically low
    if (hpWrap) {
        if (pct < 20) {
            hpWrap.classList.add('hp-critical');
        } else {
            hpWrap.classList.remove('hp-critical');
        }
    }
}

// ── Entity Bump ──────────────────────────────────────────────────
function bumpEntity(selector, xOffset) {
    const el = $(selector);
    if (!el) return;
    el.style.transition = 'transform 0.15s ease-out';
    el.style.transform = `translateX(${xOffset}px) scale(1.05)`;
    setTimeout(() => {
        if (el) {
            el.style.transition = 'transform 0.3s ease-in';
            el.style.transform = 'translateX(0) scale(1)';
        }
    }, 200);
}

// ── Damage Flash ─────────────────────────────────────────────────
function flashDamage(selector) {
    const el = $(selector);
    if (!el) return;
    el.style.transition = 'filter 0.1s ease-out';
    el.style.filter = 'brightness(2) saturate(0.5)';
    setTimeout(() => {
        if (el) {
            el.style.transition = 'filter 0.4s ease-in';
            el.style.filter = 'none';
        }
    }, 150);
}

// ── Results Screen ───────────────────────────────────────────────
function showResults(battleData, playerName, enemyName, totalRounds) {
    const res = $('#battle-results');
    res.classList.remove('hidden');

    const title = $('#victory-text');
    const sub = $('#victory-sub');
    const statsLine = $('#battle-stats-line');

    const playerWon = battleData.winner === playerName;

    // Calculate stats
    const p1Dmg = battleData.logs.filter(l => l.attackerSide === 'P1').reduce((s, l) => s + (l.damage || 0), 0);
    const p2Dmg = battleData.logs.filter(l => l.attackerSide === 'P2').reduce((s, l) => s + (l.damage || 0), 0);
    const crits = battleData.logs.filter(l => l.isCrit).length;
    const dodges = battleData.logs.filter(l => l.isDodge).length;

    if (playerWon) {
        title.innerText = 'VICTORY';
        title.className = 'text-5xl font-black mb-3 text-emerald-400 victory-text';
        sub.innerText = 'Excellent command of the arena.';
    } else {
        title.innerText = 'DEFEAT';
        title.className = 'text-5xl font-black mb-3 text-red-500 defeat-text';
        sub.innerText = 'Your fighter was overpowered.';
    }

    if (statsLine) {
        statsLine.innerHTML = `${totalRounds} rounds · ${p1Dmg} P1 dmg · ${p2Dmg} P2 dmg · ${crits} crits · ${dodges} dodges`;
    }

    // Import confetti if available
    try {
        if (playerWon && typeof window !== 'undefined') {
            import('canvas-confetti').then(mod => {
                const confetti = mod.default || mod;
                confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.5, x: 0.3 } }), 300);
                setTimeout(() => confetti({ particleCount: 80, spread: 60, origin: { y: 0.5, x: 0.7 } }), 500);
            }).catch(() => { /* confetti not available, no-op */ });
        }
    } catch (_) { /* no-op */ }

    $('#return-board-btn').addEventListener('click', () => {
        $('#arena-view').classList.add('hidden');
        $('#challenge-board-view').classList.remove('hidden');
        $('#battle-container').classList.remove('bg-black/50', 'backdrop-blur-md', 'rounded-t-3xl', 'min-h-[80vh]');
    });

    // Share button
    const shareBtn = $('#share-battle-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const cardContainer = $('#share-card-container');
            if (cardContainer?.classList.contains('hidden')) {
                // Show the share card
                const cardHtml = createShareCard({
                    playerName, enemyName,
                    playerWon,
                    rounds: totalRounds,
                    playerDmg: p1Dmg,
                    enemyDmg: p2Dmg,
                    crits, dodges
                });
                cardContainer.innerHTML = cardHtml;
                cardContainer.classList.remove('hidden');
                shareBtn.textContent = 'Open Warpcast';
            } else {
                // Open Farcaster share
                const url = getFarcasterShareUrl({ playerName, enemyName, playerWon, rounds: totalRounds });
                window.open(url, '_blank');
            }
        });
    }
}
