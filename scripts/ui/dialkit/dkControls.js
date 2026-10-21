/**
 * DialKit-styled controls built from plain DOM (not DialKit panels): the view
 * dock's rows and other compact control blocks. Rows use the shared
 * `.dk-row` / `.dk-view-*` styles in dialkit-chrome.css.
 *
 * Control spec:
 *   { type: 'toggle', label, get(), set(value), labels?: [offLabel, onLabel] }
 *   { type: 'select', label, options: [{ value, label }] | () => [...], get(), set(value) }
 *   { type: 'slider', label, min, max, step, get(), set(value, { interactive }), format?(value) }
 *     (set runs with interactive: true while dragging, false on release)
 *   { type: 'actions', items: [{ label, run() }] }
 *   { type: 'group', label, controls: [...] | () => [...] }   // collapsible;
 *                                              // a function is re-read on sync
 * Any control may have `visible()`, and `name` (full accessible name and
 * tooltip) when `label` is shortened to fit a row. Call `sync()` after state
 * changes made elsewhere to refresh every row.
 */
export function createDkControls() {
    const refreshers = [];

    function segmented(onLabel = 'On', offLabel = 'Off') {
        const wrap = document.createElement('span');
        wrap.className = 'dk-switch';
        wrap.innerHTML = `<button type="button" class="dk-seg" data-value="false">${offLabel}</button>
            <button type="button" class="dk-seg" data-value="true">${onLabel}</button>`;
        return wrap;
    }

    function render(control, host, list = refreshers) {
        if (control.type === 'group') {
            const details = document.createElement('details');
            details.className = 'dk-view-group';
            details.innerHTML = `<summary>${control.label}</summary>`;
            host.appendChild(details);
            if (typeof control.controls !== 'function') {
                control.controls.forEach(child => render(child, details, list));
                if (control.visible) list.push(() => { details.hidden = !control.visible(); });
                return;
            }
            // Dynamic group (e.g. one row per generated part): rebuild its rows
            // when their labels change, then refresh them
            let signature = null;
            let childRefreshers = [];
            list.push(() => {
                if (control.visible) details.hidden = !control.visible();
                const children = control.controls();
                const next = children.map(child => child.label).join('|');
                if (next !== signature) {
                    signature = next;
                    details.querySelectorAll(':scope > :not(summary)').forEach(node => node.remove());
                    childRefreshers = [];
                    children.forEach(child => render(child, details, childRefreshers));
                }
                childRefreshers.forEach(refresh => refresh());
            });
            return;
        }
        if (control.type === 'actions') {
            const row = document.createElement('div');
            row.className = 'dk-view-actions';
            control.items.forEach(item => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'dk-chip';
                button.textContent = item.label;
                button.addEventListener('click', () => {
                    item.run();
                    sync();
                });
                row.appendChild(button);
            });
            host.appendChild(row);
            if (control.visible) list.push(() => { row.hidden = !control.visible(); });
            return;
        }

        const row = document.createElement('div');
        row.className = `dk-row dk-view-row dk-view-${control.type}`;
        const label = document.createElement('span');
        label.className = 'dk-row-label';
        label.textContent = control.label;
        const name = control.name ?? control.label;
        if (control.name) row.title = control.name;
        row.appendChild(label);
        let refresh;

        if (control.type === 'toggle') {
            const [offLabel, onLabel] = control.labels ?? ['Off', 'On'];
            const toggle = segmented(onLabel, offLabel);
            toggle.setAttribute('role', 'group');
            toggle.setAttribute('aria-label', name);
            toggle.querySelectorAll('.dk-seg').forEach(seg => {
                seg.addEventListener('click', () => {
                    control.set(seg.dataset.value === 'true');
                    sync();
                });
            });
            row.appendChild(toggle);
            refresh = () => {
                const on = Boolean(control.get());
                toggle.querySelectorAll('.dk-seg').forEach(seg => {
                    seg.setAttribute('aria-pressed', String((seg.dataset.value === 'true') === on));
                });
            };
        } else if (control.type === 'select') {
            row.classList.add('dk-select-row');
            const select = document.createElement('select');
            select.setAttribute('aria-label', name);
            // `options` may be a function, re-read on sync (e.g. one per generated unit)
            let optionSignature = null;
            const fillOptions = () => {
                const options = typeof control.options === 'function' ? control.options() : control.options;
                const next = options.map(opt => `${opt.value}:${opt.label}`).join('|');
                if (next === optionSignature) return;
                optionSignature = next;
                select.innerHTML = options
                    .map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('');
            };
            fillOptions();
            select.addEventListener('change', () => {
                control.set(select.value);
                sync();
            });
            row.appendChild(select);
            row.insertAdjacentHTML('beforeend', `<svg class="dk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`);
            refresh = () => {
                fillOptions();
                select.value = String(control.get());
            };
        } else if (control.type === 'slider') {
            // Reads like a DialKit slider: the fill shows the value; a real
            // range input on top keeps pointer and keyboard behaviour
            const fill = document.createElement('span');
            fill.className = 'dk-view-fill';
            const value = document.createElement('span');
            value.className = 'dk-view-value';
            const input = document.createElement('input');
            input.type = 'range';
            input.min = control.min;
            input.max = control.max;
            input.step = control.step ?? 1;
            input.setAttribute('aria-label', name);
            input.addEventListener('input', () => {
                control.set(Number(input.value), { interactive: true });
                paint();
            });
            // Releasing (or a keyboard step) commits the value
            input.addEventListener('change', () => control.set(Number(input.value), { interactive: false }));
            row.prepend(fill);
            row.append(value, input);
            const paint = () => {
                const v = Number(input.value);
                fill.style.width = `${((v - control.min) / (control.max - control.min)) * 100}%`;
                value.textContent = control.format ? control.format(v) : String(v);
            };
            refresh = () => {
                input.value = control.get();
                paint();
            };
        }
        host.appendChild(row);
        list.push(() => {
            if (control.visible) row.hidden = !control.visible();
            if (!row.hidden) refresh?.();
        });
    }

    function sync() {
        refreshers.forEach(refresh => refresh());
    }

    return { render, sync };
}
