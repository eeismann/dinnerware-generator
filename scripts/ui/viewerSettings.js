/**
 * Viewer settings shared by every generator (set from the view dock):
 * background light/dark, X/Y/Z axis lines and line-art rendering. The
 * interface's own light/dark mode stays in themeManager (`data-mode`); the
 * background follows it until the background is set explicitly.
 *
 * Safe to import headlessly (Node gates import the viewports): storage and
 * DOM access are guarded.
 */

const KEYS = {
    background: 'dk-viewer-background',
    axes: 'dk-viewer-axes',
    lineArt: 'dk-viewer-line-art'
};
const EVENT = 'dk-viewer-settings';

function read(key) {
    try {
        return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
        return null;
    }
}

function interfaceMode() {
    return globalThis.document?.documentElement?.dataset.mode === 'light' ? 'light' : 'dark';
}

/** @returns {{ background: 'light'|'dark', axes: boolean, lineArt: boolean }} */
export function getViewerSettings() {
    const background = read(KEYS.background);
    return {
        background: background === 'light' || background === 'dark' ? background : interfaceMode(),
        axes: read(KEYS.axes) !== '0',
        lineArt: read(KEYS.lineArt) === '1'
    };
}

/**
 * @param {'background'|'axes'|'lineArt'} key
 * @param {string|boolean} value
 */
export function setViewerSetting(key, value) {
    const stored = key === 'background' ? value : (value ? '1' : '0');
    try {
        globalThis.localStorage?.setItem(KEYS[key], stored);
    } catch {
        // Storage unavailable: still applies for this page
    }
    globalThis.dispatchEvent?.(new CustomEvent(EVENT));
}

/**
 * Call `listener(settings)` whenever a viewer setting changes: from the dock,
 * from another tab, or through the interface mode while the background
 * still follows it. Returns an unsubscribe function.
 */
export function onViewerSettings(listener) {
    if (typeof window === 'undefined') return () => {};
    const notify = () => listener(getViewerSettings());
    const onStorage = (event) => {
        if (Object.values(KEYS).includes(event.key)) notify();
    };
    window.addEventListener(EVENT, notify);
    window.addEventListener('storage', onStorage);
    const observer = new MutationObserver(notify);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    return () => {
        window.removeEventListener(EVENT, notify);
        window.removeEventListener('storage', onStorage);
        observer.disconnect();
    };
}

/**
 * Floor grid height (mm). Objects stand on y = 0; a grid in that same plane
 * z-fights with every flat base, so grids sit just below it.
 */
export const FLOOR_GRID_Y = -0.5;

/** Ink and paper for line art on the given background. */
export function lineArtPalette(background) {
    return background === 'light'
        ? { ink: 0x111111, paper: 0xffffff }
        : { ink: 0xf2f2f2, paper: 0x141414 };
}

/** Shaded-render background and grid colours (the generators' shared palette). */
export function shadedPalette(background) {
    return background === 'light'
        ? { background: 0xf5f5f5, grid: 0xcccccc, gridCenter: 0xdddddd }
        : { background: 0x1e1e1e, grid: 0x444444, gridCenter: 0x333333 };
}
