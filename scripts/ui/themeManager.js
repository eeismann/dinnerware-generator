/**
 * Theme Manager
 * Handles light/dark mode and accent color
 */

const STORAGE_KEY_MODE = 'playground-ceramics-mode';
const STORAGE_KEY_ZOOM = 'playground-ceramics-zoom';
const STORAGE_KEY_FONT = 'playground-ceramics-font';

const DEFAULT_MODE = 'dark';
const DEFAULT_ZOOM = 'medium';
const DEFAULT_FONT = 'inter';

// Fixed accent colors per app
const ACCENT_COLORS = {
    'dashboard': '#1ABCFE',  // Light blue for dashboard
    'dinnerware': '#1ABCFE', // Light blue for dinnerware designer
    'handle': '#FF2AD4',      // Fuschia for handle designer
    'vessel': '#A259FF'       // Purple for vessel designer
};

// Font family definitions
const FONT_FAMILIES = {
    'system': '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
    'inter': '"Inter", -apple-system, sans-serif',
    'lato': '"Lato", -apple-system, sans-serif',
    'dm-sans': '"DM Sans", -apple-system, sans-serif',
    'source-sans': '"Source Sans 3", -apple-system, sans-serif'
};

/**
 * Get current mode from localStorage
 */
export function getMode() {
    return localStorage.getItem(STORAGE_KEY_MODE) || DEFAULT_MODE;
}

/**
 * Get current accent color based on the app
 */
export function getAccentColor() {
    // Determine which app we're in based on the current path
    const path = window.location.pathname;
    if (path.includes('handle-generator') || path.includes('handle')) {
        return ACCENT_COLORS.handle;
    } else if (path.includes('vessel-generator') || path.includes('vessel')) {
        return ACCENT_COLORS.vessel;
    } else if (path.includes('dashboard')) {
        return ACCENT_COLORS.dashboard;
    } else {
        // Default to dinnerware (main app)
        return ACCENT_COLORS.dinnerware;
    }
}

/**
 * Get current zoom level from localStorage
 */
export function getZoomLevel() {
    return localStorage.getItem(STORAGE_KEY_ZOOM) || DEFAULT_ZOOM;
}

/**
 * Get current font from localStorage
 */
export function getFont() {
    return localStorage.getItem(STORAGE_KEY_FONT) || DEFAULT_FONT;
}

/**
 * Set mode (light/dark)
 */
export function setMode(mode) {
    document.documentElement.setAttribute('data-mode', mode);
    localStorage.setItem(STORAGE_KEY_MODE, mode);
    updateModeToggle(mode);
}

/**
 * Set accent color (now uses fixed colors per app)
 */
export function setAccentColor(color) {
    document.documentElement.style.setProperty('--th-accent', color);
    document.documentElement.style.setProperty('--th-accent-light', lightenColor(color, 20));
    document.documentElement.style.setProperty('--th-accent-dark', darkenColor(color, 15));
    document.documentElement.style.setProperty('--th-accent-glow', hexToRgba(color, 0.25));
}

/**
 * Set zoom level for thumbnails
 */
export function setZoomLevel(zoom) {
    const projectsGrid = document.getElementById('projectsGrid');
    if (projectsGrid) {
        projectsGrid.setAttribute('data-zoom', zoom);
    }
    localStorage.setItem(STORAGE_KEY_ZOOM, zoom);
    updateZoomSelection(zoom);
}

/**
 * Set font family
 */
export function setFont(fontKey) {
    const fontFamily = FONT_FAMILIES[fontKey] || FONT_FAMILIES[DEFAULT_FONT];
    document.documentElement.style.setProperty('--th-font-primary', fontFamily);
    document.documentElement.style.setProperty('--th-font-display', fontFamily);
    localStorage.setItem(STORAGE_KEY_FONT, fontKey);
    updateFontSelection(fontKey);
}

/**
 * Toggle between light and dark mode
 */
export function toggleMode() {
    const current = getMode();
    setMode(current === 'dark' ? 'light' : 'dark');
}

/**
 * Initialize theme on page load
 */
export function initTheme() {
    const mode = getMode();
    const accent = getAccentColor();
    const font = getFont();
    
    document.documentElement.setAttribute('data-mode', mode);
    setAccentColor(accent);
    
    // Apply font immediately (without updating UI since it may not exist yet)
    const fontFamily = FONT_FAMILIES[font] || FONT_FAMILIES[DEFAULT_FONT];
    document.documentElement.style.setProperty('--th-font-primary', fontFamily);
    document.documentElement.style.setProperty('--th-font-display', fontFamily);
}

/**
 * Update mode toggle UI
 */
function updateModeToggle(mode) {
    const toggle = document.getElementById('modeToggle');
    if (toggle) {
        toggle.classList.toggle('active', mode === 'light');
    }
    const icon = document.getElementById('modeIcon');
    if (icon) {
        icon.innerHTML = mode === 'dark' 
            ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
            : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
}

/**
 * Update accent color selection UI (no longer needed, but kept for compatibility)
 */
function updateAccentSelection(color) {
    // Accent color is now fixed per app, no UI updates needed
}

/**
 * Update zoom level selection UI
 */
function updateZoomSelection(zoom) {
    const buttons = document.querySelectorAll('.zoom-option');
    buttons.forEach(btn => {
        const btnZoom = btn.dataset.zoom;
        btn.classList.toggle('active', btnZoom === zoom);
    });
}

/**
 * Update font selection UI
 */
function updateFontSelection(fontKey) {
    const select = document.getElementById('fontSelect');
    if (select) {
        select.value = fontKey;
    }
}

/**
 * Initialize settings menu
 */
export function initSettingsMenu() {
    const container = document.getElementById('settingsMenuContainer');
    const btn = document.getElementById('btnSettings');
    
    if (!container || !btn) return;
    
    // Toggle menu
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.classList.toggle('open');
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            container.classList.remove('open');
        }
    });
    
    // Mode toggle
    const modeToggleBtn = document.getElementById('btnModeToggle');
    if (modeToggleBtn) {
        modeToggleBtn.addEventListener('click', toggleMode);
    }
    
    // Accent color buttons removed - now using fixed colors per app
    
    // Zoom level buttons
    document.querySelectorAll('.zoom-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const zoom = btn.dataset.zoom;
            if (zoom) setZoomLevel(zoom);
        });
    });
    
    // Font selection dropdown
    const fontSelect = document.getElementById('fontSelect');
    if (fontSelect) {
        fontSelect.addEventListener('change', (e) => {
            setFont(e.target.value);
        });
    }
    
    // Set initial states
    updateModeToggle(getMode());
    
    // Apply initial zoom level
    const savedZoom = getZoomLevel();
    setZoomLevel(savedZoom);
    
    // Apply initial font
    const savedFont = getFont();
    setFont(savedFont);
}

/**
 * Initialize everything
 */
export function init() {
    initTheme();
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettingsMenu);
    } else {
        initSettingsMenu();
    }
}

// Color utility functions
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

function darkenColor(hex, percent) {
    const num = parseInt(hex.slice(1), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
}

// Auto-init theme immediately
initTheme();

