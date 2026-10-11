/**
 * Line interface theme: one ink on paper, Positive or Negative, shared by
 * every page (and remembered across them).
 */

export const LINE_THEMES = {
    positive: { ink: '#141414', paper: '#f2f1ec' },
    negative: { ink: '#e9e8e2', paper: '#101010' }
};

const THEME_KEY = 'ceramics-line-theme';

export function getLineTheme() {
    return localStorage.getItem(THEME_KEY) === 'negative' ? 'negative' : 'positive';
}

/**
 * Apply and remember a theme. Returns its ink/paper colours.
 */
export function applyLineTheme(theme) {
    const name = theme === 'negative' ? 'negative' : 'positive';
    const colors = LINE_THEMES[name];
    const root = document.documentElement;
    root.style.setProperty('--ln-ink', colors.ink);
    root.style.setProperty('--ln-paper', colors.paper);
    // The theme manager sets each app's accent inline; one ink replaces it
    root.style.setProperty('--th-accent', 'var(--ln-ink)');
    root.style.setProperty('--th-accent-light', 'var(--ln-ink)');
    root.style.setProperty('--th-accent-dark', 'var(--ln-ink)');
    root.style.setProperty('--th-accent-glow', 'color-mix(in srgb, var(--ln-ink) 12%, transparent)');
    root.dataset.lnTheme = name;
    localStorage.setItem(THEME_KEY, name);
    return colors;
}

/**
 * Load the Line typeface once per page.
 */
export function loadLineFonts() {
    if (document.querySelector('link[data-line-fonts]')) return;
    const fonts = document.createElement('link');
    fonts.rel = 'stylesheet';
    fonts.href = 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@300;400;500&display=swap';
    fonts.dataset.lineFonts = 'true';
    document.head.appendChild(fonts);
}

/**
 * Leave the Line interface for the classic one on this page.
 */
export function switchToClassic() {
    localStorage.setItem('playground-ceramics-ui', 'classic');
    const url = new URL(window.location.href);
    url.searchParams.set('ui', 'classic');
    window.location.href = url.toString();
}
