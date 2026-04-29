/**
 * Tournament Engine
 * Manages weekly tournament state, enrollment, and points.
 */

const TOURNAMENT_META_KEY = 'arena_tournament_current';
const TOURNAMENT_POINTS_KEY = 'arena_tournament_points';
const TOURNAMENT_HISTORY_KEY = 'arena_tournament_history';

/**
 * Gets or initializes the current weekly tournament
 */
export function getCurrentTournament() {
    const now = Date.now();
    let tournament = JSON.parse(localStorage.getItem(TOURNAMENT_META_KEY));

    // If no tournament or current one expired, rotate
    if (!tournament || now > tournament.end) {
        tournament = rotateTournament(tournament);
    }

    return tournament;
}

/**
 * Rotates to a new tournament period (7 days)
 */
function rotateTournament(previous) {
    const now = Date.now();
    
    // Archive previous tournament if it exists
    if (previous) {
        archiveTournament(previous);
    }

    // Create new tournament ID based on week start
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const weekId = `week-${startOfToday.getFullYear()}-${(startOfToday.getMonth() + 1).toString().padStart(2, '0')}-${startOfToday.getDate().toString().padStart(2, '0')}`;
    
    const newTournament = {
        id: weekId,
        start: startOfToday.getTime(), // BUG-06 fix: use midnight not Date.now()
        end: startOfToday.getTime() + (7 * 24 * 60 * 60 * 1000), // 7 days from midnight
        status: 'active'
    };

    localStorage.setItem(TOURNAMENT_META_KEY, JSON.stringify(newTournament));
    
    // Clear current points for the new tournament
    localStorage.removeItem(`${TOURNAMENT_POINTS_KEY}_${newTournament.id}`);
    
    console.log(`[Tournament] Rotated to new tournament: ${weekId}`);
    return newTournament;
}

/**
 * Archives completed tournament data
 */
function archiveTournament(tournament) {
    const history = JSON.parse(localStorage.getItem(TOURNAMENT_HISTORY_KEY) || '[]');
    const points = JSON.parse(localStorage.getItem(`${TOURNAMENT_POINTS_KEY}_${tournament.id}`) || '[]');
    
    const winner = points.length > 0 ? points[0] : null;
    
    history.push({
        ...tournament,
        winner,
        totalParticipants: points.length,
        status: 'completed'
    });
    
    // Keep last 10 tournaments in history
    localStorage.setItem(TOURNAMENT_HISTORY_KEY, JSON.stringify(history.slice(-10)));
}

/**
 * Adds points to a user for the current tournament
 */
export function addTournamentPoints(address, pointsToAdd) {
    const tournament = getCurrentTournament();
    if (!tournament || tournament.status !== 'active') return null;

    const key = `${TOURNAMENT_POINTS_KEY}_${tournament.id}`;
    let board = JSON.parse(localStorage.getItem(key) || '[]');
    
    const index = board.findIndex(entry => entry.address === address);
    let newScore = pointsToAdd;

    if (index !== -1) {
        board[index].score += pointsToAdd;
        newScore = board[index].score;
    } else {
        board.push({ address, score: pointsToAdd });
    }

    // Sort and keep top 100
    board.sort((a, b) => b.score - a.score);
    board = board.slice(0, 100);
    
    localStorage.setItem(key, JSON.stringify(board));

    const rank = board.findIndex(entry => entry.address === address) + 1;
    
    return {
        tournamentId: tournament.id,
        newScore,
        rank,
        totalParticipants: board.length
    };
}

/**
 * Gets the tournament leaderboard
 */
export function getTournamentLeaderboard(tournamentId) {
    const id = tournamentId || getCurrentTournament()?.id;
    if (!id) return [];
    
    return JSON.parse(localStorage.getItem(`${TOURNAMENT_POINTS_KEY}_${id}`) || '[]');
}

/**
 * Gets a player's current tournament rank and score
 */
export function getPlayerTournamentStatus(address) {
    const tournament = getCurrentTournament();
    if (!tournament) return null;

    const board = getTournamentLeaderboard(tournament.id);
    const index = board.findIndex(entry => entry.address === address);
    
    if (index === -1) return { tournament, score: 0, rank: null };
    
    return {
        tournament,
        score: board[index].score,
        rank: index + 1
    };
}
