/**
 * Studio Shell — orchestrator.
 *
 * initStudioShell(adapter) builds the floating-island chrome over the
 * full-bleed viewport and REPARENTS live classic DOM into it (never clones),
 * so every existing event binding survives. No-op in classic mode apart
 * from ensuring the Interface toggle exists.
 *
 * Adapter shape: see scripts/ui/studio/adapters/*.
 */
import { isStudio, setUIMode } from './studioMode.js';
import { injectIcons, icon } from './icons.js';
import { createViewCube } from './viewCube.js';
import { createItemsPanel } from './itemsPanel.js';
import { createWarningsIsland } from './warningsIsland.js';

const $ = (s, r) => (r || document).querySelector(s);
const PANEL_BOTTOM_MARGIN = 16;

function setupAutoPanelHeight(panel, {
    bodySelector,
    contentSelector = null,
    bottomMargin = PANEL_BOTTOM_MARGIN
} = {}) {
    const body = bodySelector && $(bodySelector, panel);
    if (!body) return { refresh() {} };

    let frame = null;

    function getBodyContentHeight() {
        const style = getComputedStyle(body);
        const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const content = contentSelector && $(contentSelector, body);
        if (content) return content.scrollHeight + padding;
        return body.scrollHeight;
    }

    function refreshNow() {
        frame = null;
        if (!document.body.contains(panel)) return;

        const panelStyle = getComputedStyle(panel);
        const top = panel.getBoundingClientRect().top || parseFloat(panelStyle.top) || 0;
        const maxHeight = Math.max(120, window.innerHeight - top - bottomMargin);
        const borderHeight = parseFloat(panelStyle.borderTopWidth) + parseFloat(panelStyle.borderBottomWidth);
        const headHeight = $('.st-pan-head', panel)?.offsetHeight || 0;
        const footHeight = ($('.st-pan-status', panel) || $('.st-items-foot', panel))?.offsetHeight || 0;
        const contentHeight = panel.dataset.fill === 'true'
            ? maxHeight
            : Math.ceil(headHeight + getBodyContentHeight() + footHeight + borderHeight);
        const panelHeight = Math.min(contentHeight, maxHeight);

        panel.style.setProperty('--st-panel-height', `${panelHeight}px`);
        panel.style.setProperty('--st-panel-max-height', `${maxHeight}px`);
        panel.dataset.scroll = contentHeight > maxHeight + 1 ? 'true' : 'false';
    }

    function refresh() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(refreshNow);
    }

    const mutationObserver = new MutationObserver(refresh);
    mutationObserver.observe(panel, {
        attributes: true,
        attributeFilter: ['class', 'hidden', 'aria-expanded'],
        childList: true,
        subtree: true
    });

    const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(refresh)
        : null;
    resizeObserver?.observe(body);
    window.addEventListener('resize', refresh);
    refresh();

    return { refresh };
}

/* ------------------------------------------------------------------ */
/* Classic-mode Interface toggle (for pages without #settingsMenu,     */
/* e.g. Cast Form's slide-out settings panel)                          */
/* ------------------------------------------------------------------ */
export function injectClassicToggle(hostSel) {
    const host = $(hostSel);
    if (!host || host.querySelector('.ui-mode-row')) return;
    const row = document.createElement('div');
    row.className = 'ui-mode-row';
    row.innerHTML = `
      <div class="ui-mode-title">Interface</div>
      <div class="ui-mode-options">
        <button type="button" class="ui-mode-opt active" data-ui-mode="classic">Classic</button>
        <button type="button" class="ui-mode-opt" data-ui-mode="studio">Studio</button>
      </div>`;
    host.appendChild(row);
    row.querySelectorAll('[data-ui-mode]').forEach(b =>
        b.addEventListener('click', () => setUIMode(b.dataset.uiMode)));
}

/* ------------------------------------------------------------------ */

export function initStudioShell(adapter) {
    if (!isStudio()) {
        if (adapter.classicToggleHost) injectClassicToggle(adapter.classicToggleHost);
        return null;
    }

    injectIcons();

    const root = document.createElement('div');
    root.className = 'st-root';
    root.dataset.app = adapter.appId;
    document.body.appendChild(root);

    /* ---------- top-center project pill ---------- */
    const topbar = document.createElement('div');
    topbar.className = 'st-isl st-topbar';
    topbar.dataset.hide = 'up';
    topbar.innerHTML = `
      <a class="st-ib" href="${adapter.homeHref}" title="Home">${icon('home')}</a>
      <span class="st-tb-name"></span>
      <span class="st-tb-div"></span>
      <span class="st-tb-primary"></span>
      <span class="st-menu-wrap">
        <button class="st-ib st-menu-btn" title="More">${icon('dots')}</button>
        <div class="st-menu"></div>
      </span>`;
    root.appendChild(topbar);

    const nameSlot = $('.st-tb-name', topbar);
    const nameEl = adapter.topbar.nameEl && $(adapter.topbar.nameEl);
    const unsavedEl = adapter.topbar.unsavedEl && $(adapter.topbar.unsavedEl);
    const dot = document.createElement('span');
    dot.className = 'st-save-dot';
    nameSlot.appendChild(dot);
    if (nameEl) nameSlot.appendChild(nameEl);
    if (unsavedEl) nameSlot.appendChild(unsavedEl);

    const primaryEl = adapter.topbar.primaryEl && $(adapter.topbar.primaryEl);
    if (primaryEl) {
        primaryEl.classList.add('st-primary');
        $('.st-tb-primary', topbar).appendChild(primaryEl);
    }

    const menu = $('.st-menu', topbar);
    (adapter.topbar.menuEls || []).forEach(sel => {
        const elx = $(sel);
        if (elx) { elx.classList.add('st-menu-item'); menu.appendChild(elx); }
    });
    const switcher = document.createElement('button');
    switcher.className = 'st-menu-item st-menu-switch';
    switcher.textContent = 'Switch to classic UI';
    switcher.addEventListener('click', () => setUIMode('classic'));
    menu.appendChild(switcher);
    $('.st-menu-btn', topbar).addEventListener('click', (e) => {
        e.stopPropagation();
        topbar.querySelector('.st-menu-wrap').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
        const w = topbar.querySelector('.st-menu-wrap');
        if (!w.contains(e.target)) w.classList.remove('open');
    });

    /* ---------- left tool rail ---------- */
    const rail = document.createElement('div');
    rail.className = 'st-isl st-rail';
    rail.dataset.hide = 'left';
    root.appendChild(rail);

    /* ---------- parameters panel(s) ---------- */
    /* adapter.panels (array) is the general form; adapter.panel (singular,
       used by every other app) is normalized into a one-entry array so all
       existing adapters work unchanged. */
    const panelDefs = adapter.panels || (adapter.panel ? [Object.assign({ id: 'params' }, adapter.panel)] : []);
    let panel = null;
    let panelToggle = null;
    let activePanelId = panelDefs[0] && panelDefs[0].id;
    let panelSizer = null;
    if (panelDefs.length) {
        panel = document.createElement('div');
        panel.className = 'st-isl st-params';
        panel.innerHTML = `
          <div class="st-pan-head">
            ${icon('sliders', 'st-ic st-ph-ic')}
            <span class="st-ph-t">${panelDefs[0].title}</span>
            <button class="st-ib st-params-close" title="Collapse">${icon('chevleft')}</button>
          </div>
          <div class="st-pan-body"></div>
          <div class="st-pan-status"><span class="st-status-dot"></span><span class="st-status-text"></span></div>`;
        root.appendChild(panel);

        if (panelDefs[0].dockedToggle === true) {
            // This docked tab remains available while the configurator collapses,
            // giving the panel a local, predictable way back into the viewport.
            panelToggle = document.createElement('button');
            panelToggle.className = 'st-panel-toggle';
            panelToggle.type = 'button';
            panelToggle.setAttribute('aria-label', 'Hide configurator');
            panelToggle.setAttribute('aria-expanded', 'false');
            panelToggle.title = 'Hide configurator';
            panelToggle.innerHTML = icon('chevleft');
            root.appendChild(panelToggle);
        }

        const body = $('.st-pan-body', panel);
        panelDefs.forEach(def => {
            const view = document.createElement('div');
            view.className = 'st-pan-view';
            view.dataset.panel = def.id;
            const mount = def.mountEl && $(def.mountEl);
            if (mount) view.appendChild(mount);
            body.appendChild(view);
        });

        $('.st-params-close', panel).addEventListener('click', () => setPanelOpen(false));
        panelToggle?.addEventListener('click', () => setPanelOpen(!root.classList.contains('st-params-open')));
        panelSizer = setupAutoPanelHeight(panel, {
            bodySelector: '.st-pan-body',
            contentSelector: '.st-pan-view.active'
        });

        /* status footer mirrors the classic status element */
        if (adapter.statusSel) {
            const src = $(adapter.statusSel);
            const out = $('.st-status-text', panel);
            if (src && out) {
                const mirror = () => { out.textContent = (src.textContent || '').trim(); };
                new MutationObserver(mirror).observe(src, { childList: true, characterData: true, subtree: true });
                mirror();
            } else if (out) {
                out.textContent = '';
            }
        }
    }

    function showPanelView(id) {
        activePanelId = id;
        const def = panelDefs.find(d => d.id === id) || panelDefs[0];
        if (!def) return;
        panel.querySelectorAll('.st-pan-view').forEach(v => v.classList.toggle('active', v.dataset.panel === id));
        panel.dataset.fill = def.fill === true ? 'true' : 'false';
        $('.st-ph-t', panel).textContent = def.title;
        rail.querySelectorAll('[data-panel-id]').forEach(b => b.classList.toggle('on', b.dataset.panelId === id));
        panelSizer?.refresh();
    }

    function setPanelOpen(open) {
        root.classList.toggle('st-params-open', open);
        if (panelToggle) {
            panelToggle.setAttribute('aria-expanded', String(open));
            panelToggle.setAttribute('aria-label', open ? 'Hide configurator' : 'Show configurator');
            panelToggle.title = open ? 'Hide configurator' : 'Show configurator';
        }
        const b = rail.querySelector(`[data-panel-id="${activePanelId}"]`);
        if (b) b.classList.toggle('on', open);
        panelSizer?.refresh();
    }

    /* rail buttons */
    (adapter.rail || []).forEach(spec => {
        if (spec.divider) {
            const d = document.createElement('div');
            d.className = 'st-rail-div';
            rail.appendChild(d);
            return;
        }
        const b = document.createElement('button');
        b.className = 'st-ib st-rail-btn';
        b.dataset.rail = spec.id;
        b.dataset.tip = spec.tip || '';
        b.innerHTML = icon(spec.icon);
        if (spec.initial) b.classList.add('on');
        rail.appendChild(b);

        if (spec.role === 'panel') {
            b.dataset.panelId = spec.panelId || (panelDefs[0] && panelDefs[0].id);
            b.addEventListener('click', () => {
                if (root.classList.contains('st-case-mode')) {
                    // leave the mode and land on this button's panel, kept open
                    if (adapter.modes && adapter.modes.exitMode) adapter.modes.exitMode();
                    setCaseMode(false);
                    showPanelView(b.dataset.panelId);
                    setPanelOpen(true);
                    return;
                }
                const isOpen = root.classList.contains('st-params-open');
                const isActive = activePanelId === b.dataset.panelId;
                showPanelView(b.dataset.panelId);
                setPanelOpen(!(isOpen && isActive));
            });
        } else if (spec.role === 'mode') {
            b.addEventListener('click', () => {
                const on = !root.classList.contains('st-case-mode');
                spec.set(on);
                setCaseMode(on, spec);
            });
        } else if (spec.role === 'pan') {
            const syncPan = () => {
                const on = Boolean(spec.get?.());
                b.classList.toggle('on', on);
                root.classList.toggle('st-pan-tool', on);
            };
            b.addEventListener('click', () => {
                const on = spec.toggle ? spec.toggle() : spec.set(!Boolean(spec.get?.()));
                b.classList.toggle('on', Boolean(on));
                root.classList.toggle('st-pan-tool', Boolean(on));
            });
            spec.subscribe?.(syncPan);
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && spec.get?.()) {
                    spec.set?.(false);
                    syncPan();
                }
            });
            window.addEventListener('blur', syncPan);
            syncPan();
        } else {
            b.addEventListener('click', () => {
                const on = !b.classList.contains('on');
                b.classList.toggle('on', on);
                spec.set(on);
            });
        }
    });

    function setCaseMode(on, spec) {
        root.classList.toggle('st-case-mode', on);
        const b = rail.querySelector('[data-rail="' + ((spec && spec.id) || 'casebox') + '"]');
        if (b) b.classList.toggle('on', on);
        if (panel) {
            $('.st-ph-t', panel).textContent = on && spec && spec.title ? spec.title : panelDefs[0].title;
            setPanelOpen(true);
        }
    }

    /* ---------- view cube ---------- */
    let cubeApi = null;
    const rig = adapter.camera && adapter.camera.rig && adapter.camera.rig();
    if (rig && rig.camera && rig.controls && typeof rig.controls.addEventListener === 'function') {
        cubeApi = createViewCube({
            rig,
            presets: adapter.camera.presets || {},
            onReset: adapter.camera.reset
        });
        root.appendChild(cubeApi.el);

    }

    /* ---------- top-right corner: focus + items ---------- */
    const focusBtn = document.createElement('button');
    focusBtn.className = 'st-corner st-focus-btn';
    focusBtn.dataset.hide = 'up';
    focusBtn.title = 'Focus on model — F';
    focusBtn.innerHTML = icon('expand');
    root.appendChild(focusBtn);

    let itemsApi = null;
    if (adapter.items) {
        const layersBtn = document.createElement('button');
        layersBtn.className = 'st-corner st-layers-btn';
        layersBtn.dataset.hide = 'up';
        layersBtn.title = adapter.items.title;
        layersBtn.innerHTML = icon('layers');
        root.appendChild(layersBtn);

        itemsApi = createItemsPanel(adapter.items);
        root.appendChild(itemsApi.el);
        const itemsSizer = setupAutoPanelHeight(itemsApi.el, {
            bodySelector: '.st-items-list'
        });

        const toggleItems = () => {
            const on = root.classList.toggle('st-items-open');
            layersBtn.classList.toggle('on', on);
            itemsSizer.refresh();
        };
        layersBtn.addEventListener('click', toggleItems);
        itemsApi.el.querySelector('.st-items-close').addEventListener('click', toggleItems);
    } else {
        focusBtn.classList.add('st-focus-solo');
    }

    /* ---------- warnings (lower-left) ---------- */
    let warningsApi = null;
    if (adapter.warnings && adapter.warnings.listSel) {
        warningsApi = createWarningsIsland(adapter.warnings);
        root.appendChild(warningsApi.el);
    }

    /* ---------- focus mode ---------- */
    const focusExit = document.createElement('button');
    focusExit.className = 'st-focus-exit';
    focusExit.innerHTML = `${icon('collapse')}<span>Exit focus</span><kbd>F</kbd>`;
    root.appendChild(focusExit);

    const setFocus = (on) => root.classList.toggle('st-focus', on);
    focusBtn.addEventListener('click', () => setFocus(true));
    focusExit.addEventListener('click', () => setFocus(false));
    document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
        if (e.key === 'f' || e.key === 'F') {
            setFocus(!root.classList.contains('st-focus'));
            e.preventDefault();
        } else if (e.key === 'Escape' && root.classList.contains('st-focus')) {
            setFocus(false);
        }
    });

    /* panel starts open — it's the primary work surface (apps whose canvas
       itself is the work surface, e.g. Vessel V2, opt out) */
    if (panel) {
        showPanelView(activePanelId);
        setPanelOpen((panelDefs[0] && panelDefs[0].startOpen) !== false);
    }

    /* window resize is handled by each viewport's own observers; nudge once
       after the layout switch so renderers refit the full-bleed container. */
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));

    return { root, setPanelOpen, setFocus, itemsApi, warningsApi, cubeApi };
}
