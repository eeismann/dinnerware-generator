/**
 * DialKit chrome behaviour shared by every generator: the header's dropdown
 * menus (File) and the icon that hides/shows the right-hand parameter card.
 * Styles live in styles/dialkit-chrome.css.
 */

/**
 * Wire a `.dk-menu` dropdown: the `[aria-haspopup]` trigger toggles the
 * `.dk-menu-list`, arrow keys move between `[role="menuitem"]`s, Escape and
 * outside clicks close it. Items keep their own click handlers; the menu
 * closes first (capture phase) so dialogs they open return focus to the
 * trigger rather than a hidden item.
 */
export function initDkMenu(menu) {
    const button = menu?.querySelector('[aria-haspopup]');
    const list = menu?.querySelector('.dk-menu-list');
    if (!button || !list) return null;
    const items = () => [...list.querySelectorAll('[role="menuitem"]')];

    const setOpen = (open, { focus = false } = {}) => {
        list.hidden = !open;
        menu.classList.toggle('open', open);
        button.setAttribute('aria-expanded', String(open));
        if (open && focus) items()[0]?.focus();
    };

    button.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(list.hidden);
    });
    button.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true, { focus: true });
        }
    });
    list.addEventListener('click', (event) => {
        if (!event.target.closest('[role="menuitem"]')) return;
        setOpen(false);
        button.focus();
    }, true);
    list.addEventListener('keydown', (event) => {
        const all = items();
        const index = all.indexOf(document.activeElement);
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const step = event.key === 'ArrowDown' ? 1 : -1;
            all[(index + step + all.length) % all.length]?.focus();
        } else if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
            button.focus();
        }
    });
    document.addEventListener('click', (event) => {
        if (!menu.contains(event.target)) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && !list.hidden) setOpen(false);
    });
    return { setOpen };
}

/**
 * Hide/show the parameter card via `params-hidden` on <html>, remembered in
 * localStorage. Pages apply the stored state before first paint with an
 * inline <head> script reading the same key.
 */
export function initPanelToggle(button, storageKey) {
    const setVisible = (visible) => {
        document.documentElement.classList.toggle('params-hidden', !visible);
        button?.setAttribute('aria-pressed', String(visible));
        button?.setAttribute('title', visible ? 'Hide parameters' : 'Show parameters');
        try {
            localStorage.setItem(storageKey, visible ? '1' : '0');
        } catch {
            // Storage unavailable: the toggle still works for this visit
        }
    };
    let stored = null;
    try {
        stored = localStorage.getItem(storageKey);
    } catch {
        stored = null;
    }
    setVisible(stored !== '0');
    button?.addEventListener('click', () => {
        setVisible(document.documentElement.classList.contains('params-hidden'));
    });
    return { setVisible };
}
