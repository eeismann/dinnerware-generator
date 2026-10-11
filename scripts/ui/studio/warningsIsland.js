/**
 * Studio Shell — lower-left warnings chip + popover.
 *
 * Zero-coupling design: instead of subscribing to each app's internal
 * validation system, it observes the classic warnings list element that
 * every app already keeps up to date (hidden in studio mode). Rows are
 * derived from that DOM; the chip disappears at zero warnings.
 */
import { icon } from './icons.js';

export function createWarningsIsland({ listSel }) {
    const el = document.createElement('div');
    el.className = 'st-isl st-warnings';
    el.dataset.hide = 'down';
    el.innerHTML = `
      <button class="st-warn-btn">${icon('warn')}<span class="st-warn-count"></span></button>
      <div class="st-warn-pop"><div class="st-warn-rows"></div></div>`;

    const countEl = el.querySelector('.st-warn-count');
    const rowsEl = el.querySelector('.st-warn-rows');
    const btn = el.querySelector('.st-warn-btn');

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        el.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        if (!el.contains(e.target)) el.classList.remove('open');
    });

    let source = null;
    let observer = null;

    function sync() {
        if (!source) { el.style.display = 'none'; return; }
        const items = Array.from(source.children)
            .map(c => (c.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        if (!items.length) {
            el.style.display = 'none';
            el.classList.remove('open');
            return;
        }
        el.style.display = '';
        countEl.textContent = `${items.length} warning${items.length === 1 ? '' : 's'}`;
        rowsEl.innerHTML = items.map(t => `
          <div class="st-warn-row">${icon('warn')}<span>${t}</span></div>`).join('');
    }

    function attach() {
        source = document.querySelector(listSel);
        if (!source) { el.style.display = 'none'; return; }
        observer = new MutationObserver(sync);
        observer.observe(source, { childList: true, subtree: true, characterData: true });
        sync();
    }
    attach();

    return {
        el,
        sync,
        destroy() { observer && observer.disconnect(); el.remove(); }
    };
}
