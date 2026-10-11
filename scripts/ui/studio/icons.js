/**
 * Studio Shell — SVG icon sprite (line icons, 1.8px stroke).
 * Injected once per document; referenced via <use href="#st-<name>">.
 */
const SPRITE = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
<symbol id="st-home" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.2V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.2"/></symbol>
<symbol id="st-caret" viewBox="0 0 24 24"><polyline points="6 9.5 12 15.5 18 9.5"/></symbol>
<symbol id="st-chevleft" viewBox="0 0 24 24"><polyline points="14.5 6 8.5 12 14.5 18"/></symbol>
<symbol id="st-dots" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></symbol>
<symbol id="st-layers" viewBox="0 0 24 24"><path d="M12 3.5 21 8.5 12 13.5 3 8.5 12 3.5z"/><polyline points="4.2 12.6 12 17 19.8 12.6"/><polyline points="4.2 16.4 12 20.8 19.8 16.4"/></symbol>
<symbol id="st-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="st-eyeoff" viewBox="0 0 24 24"><path d="M4 4.5 20 19.5"/><path d="M10.3 6.1a9.6 9.6 0 0 1 1.7-.3c6 0 9.5 6.2 9.5 6.2a17.3 17.3 0 0 1-2.8 3.5"/><path d="M6.6 7.1C4 8.9 2.5 12 2.5 12S6 18.2 12 18.2a9 9 0 0 0 3.5-.7"/></symbol>
<symbol id="st-sliders" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/><circle cx="9.5" cy="7" r="2.1"/><circle cx="15" cy="12" r="2.1"/><circle cx="7.5" cy="17" r="2.1"/></symbol>
<symbol id="st-section" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" opacity=".18" stroke="none"/><path d="M12 2.5v19" stroke-dasharray="3 2.4"/></symbol>
<symbol id="st-grid" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="1.6"/><path d="M3.5 9.2h17"/><path d="M3.5 14.8h17"/><path d="M9.2 3.5v17"/><path d="M14.8 3.5v17"/></symbol>
<symbol id="st-tone" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" opacity=".22" stroke="none"/></symbol>
<symbol id="st-casebox" viewBox="0 0 24 24"><path d="M12 3.2 20.5 7.6 12 12 3.5 7.6z"/><path d="M3.5 7.6V16.4L12 20.8"/><path d="M20.5 7.6V16.4L12 20.8"/><path d="M9 5.4v3.2"/><path d="M15 5.4v3.2"/></symbol>
<symbol id="st-ruler" viewBox="0 0 24 24"><path d="M3 17 17 3l4 4L7 21z"/><path d="M8 12l2 2"/><path d="M11 9l2 2"/><path d="M14 6l2 2"/></symbol>
<symbol id="st-outline" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2.5" stroke-dasharray="4 3"/><circle cx="12" cy="12" r="3"/></symbol>
<symbol id="st-boxes" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="6.8" height="6.8" rx="1.5"/><rect x="13.7" y="13.7" width="6.8" height="6.8" rx="1.5"/><path d="M14 10l4.5-4.5"/><path d="M18.5 9V5.5H15"/><path d="M10 14l-4.5 4.5"/><path d="M5.5 15v3.5H9"/></symbol>
<symbol id="st-pattern" viewBox="0 0 24 24"><circle cx="6" cy="6" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="6" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="6" r="1.7" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="6" cy="18" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="18" r="1.7" fill="currentColor" stroke="none"/><circle cx="18" cy="18" r="1.7" fill="currentColor" stroke="none"/></symbol>
<symbol id="st-hand" viewBox="0 0 24 24"><path d="M8 11.5V5.8a1.7 1.7 0 0 1 3.4 0v5"/><path d="M11.4 10.8V4.7a1.7 1.7 0 0 1 3.4 0v6.1"/><path d="M14.8 11.2V6.5a1.6 1.6 0 0 1 3.2 0v6.7"/><path d="M8 12.3 6.7 11a1.8 1.8 0 0 0-2.5 2.5l4.6 5.1a6.3 6.3 0 0 0 4.7 2.1h.8a5.7 5.7 0 0 0 5.7-5.7v-3.6a1.6 1.6 0 0 0-3.2 0"/></symbol>
<symbol id="st-expand" viewBox="0 0 24 24"><path d="M4 9V4h5"/><path d="M20 9V4h-5"/><path d="M4 15v5h5"/><path d="M20 15v5h-5"/></symbol>
<symbol id="st-collapse" viewBox="0 0 24 24"><path d="M9 4v5H4"/><path d="M15 4v5h5"/><path d="M9 20v-5H4"/><path d="M15 20v-5h5"/></symbol>
<symbol id="st-warn" viewBox="0 0 24 24"><path d="M10.3 3.9 2.1 18a2 2 0 0 0 1.7 3h16.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5"/><circle cx="12" cy="16.8" r=".4" fill="currentColor"/></symbol>
<symbol id="st-x" viewBox="0 0 24 24"><path d="M6 6l12 12"/><path d="M18 6 6 18"/></symbol>
<symbol id="st-reset" viewBox="0 0 24 24"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5"/></symbol>
</defs></svg>`;

let injected = false;

export function injectIcons() {
    if (injected || document.getElementById('st-icon-sprite')) return;
    const holder = document.createElement('div');
    holder.id = 'st-icon-sprite';
    holder.innerHTML = SPRITE;
    document.body.appendChild(holder);
    injected = true;
}

export function icon(name, cls = 'st-ic') {
    return `<svg class="${cls}"><use href="#st-${name}"/></svg>`;
}
