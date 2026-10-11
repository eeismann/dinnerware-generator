/**
 * Studio Shell — Items/Parts panel (right, 272px).
 * Rows with visibility eyes; All/None; live count.
 * The adapter supplies the row source and the visibility setter so the
 * panel drives the app's real state (e.g. classic checkboxes, mesh.visible).
 */
import { icon } from './icons.js';

export function createItemsPanel({ title, rows, setVisible, subscribe, footNote }) {
    const el = document.createElement('div');
    el.className = 'st-isl st-items';
    el.innerHTML = `
      <div class="st-pan-head">
        <span class="st-ph-t">${title}</span>
        <button class="st-ib st-items-close" title="Collapse">${icon('x')}</button>
      </div>
      <div class="st-items-list"></div>
      <div class="st-items-foot">
        <span class="st-count"></span>
        <span class="st-foot-sp"></span>
        <button class="st-if-link" data-all="1">All</button>
        <button class="st-if-link" data-all="0">None</button>
      </div>`;

    const list = el.querySelector('.st-items-list');
    const countEl = el.querySelector('.st-count');

    function render() {
        const data = rows() || [];
        list.innerHTML = data.map(r => `
          <div class="st-item-row${r.visible === false ? ' is-off' : ''}" data-id="${r.id}">
            <span class="st-item-dot" style="${r.color ? `background:${r.color}` : ''}"></span>
            <span class="st-item-name">${r.name}</span>
            ${r.hasEye === false ? '' : `<button class="st-eye" title="Show / hide">
              <span class="st-e-on">${icon('eye')}</span><span class="st-e-off">${icon('eyeoff')}</span>
            </button>`}
          </div>`).join('');
        const shown = data.filter(r => r.visible !== false).length;
        countEl.textContent = `${shown} of ${data.length} shown${footNote ? ' · ' + footNote : ''}`;
    }

    list.addEventListener('click', (e) => {
        const eye = e.target.closest('.st-eye');
        if (!eye) return;
        const row = eye.closest('.st-item-row');
        const isOff = row.classList.contains('is-off');
        setVisible(row.dataset.id, isOff);
        render();
    });

    el.querySelectorAll('.st-if-link').forEach(btn => {
        btn.addEventListener('click', () => {
            const show = btn.dataset.all === '1';
            (rows() || []).forEach(r => setVisible(r.id, show));
            render();
        });
    });

    if (subscribe) subscribe(render);
    render();

    return { el, render };
}
