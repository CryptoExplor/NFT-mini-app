const BATTLE_SELECTION_STORAGE_KEY = 'battle_last_fighter';

let currentSelection = {
    loadout: null,
    previewData: null,
};

function normalizeSelection(data) {
    if (!data || typeof data !== 'object') return null;

    const loadout = data.loadout || data.selectedNft || null;
    const previewData = data.previewData || data.pData || null;

    if (!loadout || !previewData) return null;

    return { loadout, previewData };
}

export function getCurrentBattleSelection() {
    return currentSelection;
}

export function getCurrentBattleLoadout() {
    return currentSelection.loadout;
}

export function setCurrentBattleSelection(loadout, previewData) {
    currentSelection = {
        loadout: loadout || null,
        previewData: previewData || null,
    };

    return currentSelection;
}

export function clearCurrentBattleSelection() {
    currentSelection = { loadout: null, previewData: null };
}

export function saveLastBattleSelection(loadout, previewData) {
    const selection = setCurrentBattleSelection(loadout, previewData);

    try {
        localStorage.setItem(BATTLE_SELECTION_STORAGE_KEY, JSON.stringify({
            loadout: selection.loadout,
            previewData: selection.previewData,
            // Preserve legacy keys for compatibility with older stored data readers.
            selectedNft: selection.loadout,
            pData: selection.previewData,
        }));
    } catch (_) {
        // Ignore quota/private mode failures and keep the in-memory session.
    }

    return selection;
}

export function loadLastBattleSelection() {
    try {
        const raw = localStorage.getItem(BATTLE_SELECTION_STORAGE_KEY);
        if (!raw) return null;

        return normalizeSelection(JSON.parse(raw));
    } catch (_) {
        return null;
    }
}

export function restoreLastBattleSelection() {
    const selection = loadLastBattleSelection();
    if (!selection) return null;

    return setCurrentBattleSelection(selection.loadout, selection.previewData);
}
