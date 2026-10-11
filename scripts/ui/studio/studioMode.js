/**
 * Studio Shell — UI mode resolution.
 * Order: ?ui= param → localStorage → 'classic'.
 * The inline <head> snippet in each page mirrors this logic pre-paint.
 */
const STORAGE_KEY = 'playground-ceramics-ui';

export function getUIMode() {
    const param = new URLSearchParams(window.location.search).get('ui');
    if (param === 'studio' || param === 'classic') {
        try { localStorage.setItem(STORAGE_KEY, param); } catch (e) { /* private mode */ }
        return param;
    }
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'studio' || stored === 'classic') return stored;
    } catch (e) { /* private mode */ }
    return 'classic';
}

export function isStudio() {
    return getUIMode() === 'studio';
}

/**
 * Persist the mode and reload. Reload (rather than live un-reparenting)
 * keeps the classic DOM pristine; app state survives via autosave.
 */
export function setUIMode(mode) {
    try { localStorage.setItem(STORAGE_KEY, mode); } catch (e) { /* private mode */ }
    const url = new URL(window.location.href);
    url.searchParams.delete('ui');
    window.location.href = url.toString();
}
