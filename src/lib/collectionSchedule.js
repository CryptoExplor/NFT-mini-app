const HOUR_MS = 60 * 60 * 1000;
export const DEFAULT_REVEAL_HOURS = 72;

function normalizeRevealHours(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_REVEAL_HOURS;
    return parsed;
}

function parseDateString(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Backward compatibility for existing YYYY-MM-DD fields.
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const date = new Date(`${trimmed}T00:00:00Z`);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseCollectionLaunchDate(collection) {
    if (!collection || typeof collection !== 'object') return null;
    return parseDateString(collection.launchAt) || parseDateString(collection.launched);
}

export function getCollectionTiming(collection, nowMs = Date.now()) {
    const launchDate = parseCollectionLaunchDate(collection);
    const launchTs = launchDate ? launchDate.getTime() : null;
    const revealHours = normalizeRevealHours(collection?.revealHours);
    const revealTs = launchTs !== null ? launchTs - (revealHours * HOUR_MS) : null;
    const manualStatus = String(collection?.status || 'live').toLowerCase();

    let computedStatus;
    if (manualStatus === 'paused' || manualStatus === 'sold-out') {
        computedStatus = manualStatus;
    } else if (launchTs === null) {
        computedStatus = manualStatus || 'live';
    } else if (nowMs < revealTs) {
        computedStatus = 'hidden';
    } else if (nowMs < launchTs) {
        computedStatus = 'upcoming';
    } else {
        computedStatus = 'live';
    }

    return {
        launchAtIso: launchDate ? launchDate.toISOString() : null,
        launchAtTs: launchTs,
        revealAtIso: revealTs !== null ? new Date(revealTs).toISOString() : null,
        revealAtTs: revealTs,
        revealHours,
        msUntilLaunch: launchTs !== null ? launchTs - nowMs : null,
        msUntilReveal: revealTs !== null ? revealTs - nowMs : null,
        computedStatus,
        isVisible: computedStatus !== 'hidden'
    };
}

export function withComputedCollectionState(collection, nowMs = Date.now()) {
    const timing = getCollectionTiming(collection, nowMs);
    return {
        ...collection,
        status: timing.computedStatus,
        ...timing
    };
}
