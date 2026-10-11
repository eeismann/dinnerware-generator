/**
 * Line App Shell — the Patterns "Line edition" frame for every generator:
 * a bar (mark, optional index tabs, text actions), framed stages with crop
 * marks, a caption strip (title, hint, tools, readout) and a hairline
 * parameter column.
 *
 * Like the Studio Shell it only REPARENTS live classic controls (their
 * listeners and state wiring survive) and proxies buttons, so each app's
 * own logic is untouched. Apps describe themselves with a small config
 * (see scripts/ui/line/adapters/); enabled with ?ui=line (remembered).
 */

import { getLineTheme, applyLineTheme, loadLineFonts, switchToClassic } from './lineTheme.js';

const PANEL_KEY = 'ceramics-line-panel';

export const $ = (selector, root = document) => (selector ? root.querySelector(selector) : null);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
export const el = (tag, className, html = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.innerHTML = html;
    return node;
};

export function isLineUI() {
    return document.documentElement.dataset.ui === 'line';
}

export function whenReady(check, callback, tries = 300) {
    let ok = false;
    try { ok = Boolean(check()); } catch { ok = false; }
    if (ok) callback();
    else if (tries > 0) setTimeout(() => whenReady(check, callback, tries - 1), 50);
}

export function toggleButton(label, action) {
    const button = el('button', 'ln-toggle', label);
    button.type = 'button';
    if (action) button.dataset.action = action;
    button.setAttribute('aria-pressed', 'false');
    return button;
}

/**
 * Restyle existing buttons as Line text toggles.
 * @param {Array<string|Element>} items
 * @param {string[]} classes
 */
function adopt(items, classes) {
    return items
        .map(item => (typeof item === 'string' ? $(item) : item))
        .filter(Boolean)
        .map(node => {
            const button = node.matches('button, a') ? node : node.querySelector('button');
            button?.classList.add(...classes);
            return node;
        });
}

/**
 * Text toggles proxying classic buttons and mirroring their `active` state.
 */
export function proxyGroup(label, options) {
    const group = el('div', 'ln-group');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    options.forEach(({ text, source, activeClass = 'active' }) => {
        const classic = typeof source === 'string' ? $(source) : source;
        if (!classic) return;
        const button = toggleButton(text);
        button.addEventListener('click', () => classic.click());
        const sync = () => button.setAttribute('aria-pressed', String(classic.classList.contains(activeClass)));
        new MutationObserver(sync).observe(classic, { attributes: true, attributeFilter: ['class'] });
        sync();
        group.appendChild(button);
    });
    return group;
}

/**
 * One menu button listing proxied classic options; its label shows the
 * active one ("Layout · Row").
 */
export function proxyMenu(label, options) {
    const container = el('div', 'ln-menu-container');
    const button = el('button', 'ln-toggle ln-menu-button');
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    const menu = el('div', 'ln-menu');
    menu.setAttribute('role', 'menu');
    const items = options.map(({ text, source }) => {
        const classic = typeof source === 'string' ? $(source) : source;
        if (!classic) return null;
        const item = el('button', 'ln-menu-item', text);
        item.type = 'button';
        item.setAttribute('role', 'menuitemradio');
        item.addEventListener('click', () => {
            classic.click();
            container.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
        });
        menu.appendChild(item);
        return { item, classic, text };
    }).filter(Boolean);
    const sync = () => {
        const active = items.find(({ classic }) => classic.classList.contains('active'));
        button.innerHTML = `${label}<span class="ln-menu-value">${active ? ` · ${active.text}` : ''}</span>`;
        items.forEach(({ item, classic }) => item.setAttribute('aria-checked', String(classic.classList.contains('active'))));
    };
    items.forEach(({ classic }) => new MutationObserver(sync).observe(classic, { attributes: true, attributeFilter: ['class'] }));
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        const open = !container.classList.contains('open');
        container.classList.toggle('open', open);
        button.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (event) => {
        if (!container.contains(event.target)) {
            container.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
        }
    });
    sync();
    container.append(button, menu);
    return container;
}

// Every app in the platform, for the mark's switcher (paths from the site root)
export const LINE_APPS = [
    { id: 'dashboard', name: 'Dashboard', path: 'dashboard.html' },
    { id: 'dinnerware', name: 'Dinnerware', path: 'index.html' },
    { id: 'vessel', name: 'Vessel', path: 'vessel-generator/index.html' },
    { id: 'vessel-v2', name: 'Vessel V2', path: 'vessel-v2-generator/index.html' },
    { id: 'vessel-v3', name: 'Vessel V3', path: 'vessel-v3-generator/index.html' },
    { id: 'handle', name: 'Handle', path: 'handle-generator/index.html' },
    { id: 'castform', name: 'Cast Form', path: 'cast-form-generator/index.html' }
];

const ICONS = {
    parameters: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><rect x="14" y="5" width="4" height="4"/><rect x="8" y="15" width="4" height="4"/>',
    caret: '<path d="M8 10l4 4 4-4"/>'
};
export const lineIcon = (name) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${ICONS[name]}</svg>`;

/**
 * The app name as a menu that switches between apps (and the dashboard).
 * @param {string} current - Current app id
 * @param {string} base - Relative path from this page to the site root
 * @param {Function} [leave] - Called instead of navigating to the dashboard
 */
function appSwitcher(current, title, base, leave) {
    const container = el('div', 'ln-menu-container ln-app-switcher');
    const button = el('button', 'ln-mark', `<span class="ln-mark-text">${title}</span>${lineIcon('caret')}`);
    button.type = 'button';
    button.setAttribute('aria-haspopup', 'true');
    button.setAttribute('aria-expanded', 'false');
    const menu = el('nav', 'ln-menu ln-menu-down');
    menu.setAttribute('aria-label', 'Apps');
    LINE_APPS.forEach(app => {
        const link = el('a', 'ln-menu-item', app.name);
        link.href = `${base}${app.path}`;
        if (app.id === current) link.setAttribute('aria-current', 'page');
        if (app.id === 'dashboard') {
            link.classList.add('ln-menu-item-home');
            if (leave) {
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    leave();
                });
            }
        }
        menu.appendChild(link);
    });
    const setOpen = (open) => {
        container.classList.toggle('open', open);
        button.setAttribute('aria-expanded', String(open));
    };
    button.addEventListener('click', (event) => {
        event.stopPropagation();
        setOpen(!container.classList.contains('open'));
    });
    document.addEventListener('click', (event) => {
        if (!container.contains(event.target)) setOpen(false);
    });
    container.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setOpen(false);
    });
    container.append(button, menu);
    return container;
}

/**
 * A toggle item in an app's own View menu, styled like its siblings.
 */
function viewMenuToggle(label, action) {
    const item = el('button', 'view-menu-item ln-view-toggle', `<span>${label}</span><span class="view-menu-toggle"></span>`);
    item.type = 'button';
    item.dataset.action = action;
    item.setAttribute('aria-pressed', 'false');
    item.setPressed = (on) => {
        item.setAttribute('aria-pressed', String(on));
        item.querySelector('.view-menu-toggle').classList.toggle('active', on);
    };
    return item;
}

/**
 * Mount the Line frame.
 * @param {Object} config
 * @param {string} config.title - App name for the mark ("Ceramics / <title>")
 * @param {string} [config.root] - Element holding header/main/footer
 * @param {string} [config.back] - Classic back link (keeps unsaved checks)
 * @param {string[]} config.stages - Viewport areas to frame, left to right
 * @param {string} [config.panel] - Parameter column
 * @param {string[]} [config.panelNodes] - Without a panel: nodes to gather into a new column
 * @param {string} [config.panelBody] - Where the project section goes (default: panel)
 * @param {string[]} [config.barActions] - Classic buttons for the bar (undo/redo...)
 * @param {Array<{label, action, title, get, set, restyleViewer}>} [config.barToggles] - Extra bar toggles
 * @param {string[]} [config.primary] - Primary actions (export), solid
 * @param {string[]} [config.project] - New/Load/Save buttons for the project section
 * @param {Array<Element|string>|Function} [config.tools] - Caption tools (or builder)
 * @param {Array<{label: string, source?: string, text?: Function}>} [config.readout]
 * @param {string} [config.checks] - Warnings container for the readout
 * @param {Function} [config.caption] - () => title HTML (with a leading <span>)
 * @param {string} [config.hint]
 * @param {Function} [config.tabs] - (nav) => syncFn: builds the bar's index tabs
 * @param {Function} [config.viewer] - (colors, theme) => restyle the 3D view
 * @param {Function} [config.subscribe] - (refresh) => subscribe to app changes
 * @param {{text: string, icon?: string}} [config.mark] - Mark content (default "Ceramics / title")
 * @param {boolean} [config.projectInBar] - Project name and New/Load/Save in the bar
 * @param {string} [config.viewMenu] - App menu that takes the display toggles (Negative...)
 * @param {Function|false} [config.caption] - Caption title; false hides title and hint
 * @param {{base: string}} [config.appSwitcher] - Make the mark a menu of every app
 * @param {boolean} [config.iconActions] - Undo/redo and Parameters as icon buttons
 * @param {boolean} [config.projectCentered] - Project controls centred over the stage
 * @param {string[]} [config.hide] - Extra classic elements to hide
 * @returns {{ refresh: Function, root: Element }}
 */
export function mountLineApp(config) {
    const root = $(config.root || '#app') || document.body;
    root.classList.add('ln-root', `ln-app-${config.id || 'app'}`);
    (config.hide || []).forEach(selector => $$(selector).forEach(node => node.classList.add('ln-hidden')));

    // === Bar ===
    const markContent = config.mark
        ? `${config.mark.icon || ''}<span class="ln-mark-text">${config.mark.text}</span>`
        : `Ceramics <span>/</span> ${config.title}`;
    const bar = el('header', 'ln-bar', `
        <a class="ln-mark${config.mark?.icon ? ' has-icon' : ''}" href="${config.dashboardHref || '../dashboard.html'}" title="Back to projects">${markContent}</a>
        <nav class="ln-tabs" aria-label="${config.tabsLabel || 'Index'}"></nav>
        <div class="ln-actions"></div>`);
    const back = $(config.back || '#btnBackToDashboard') || $('.back-btn, .header-left a, .header-left button');
    // The classic back control asks before leaving unsaved work
    const leave = back ? () => back.click() : null;
    if (config.appSwitcher) {
        $('.ln-mark', bar).replaceWith(appSwitcher(config.id, config.mark?.text || config.title, config.appSwitcher.base, leave));
    } else {
        $('.ln-mark', bar).addEventListener('click', (event) => {
            if (!leave) return;
            event.preventDefault();
            leave();
        });
    }
    const syncTabs = config.tabs ? config.tabs($('.ln-tabs', bar)) : () => {};

    const actions = $('.ln-actions', bar);
    actions.append(...adopt(config.barActions || [], config.iconActions
        ? ['ln-toggle', 'ln-icon-button']
        : ['ln-toggle', 'ln-text-only']));
    // Display toggles live in the app's View menu when it has one,
    // otherwise in the bar
    const viewMenu = $(config.viewMenu);
    const makeToggle = viewMenu ? viewMenuToggle : toggleButton;
    const setPressed = (button, on) => (button.setPressed ? button.setPressed(on) : button.setAttribute('aria-pressed', String(on)));
    const extraToggles = (config.barToggles || []).map(spec => {
        const button = makeToggle(spec.label, spec.action);
        if (spec.title) button.title = spec.title;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            spec.set(!spec.get());
            setPressed(button, spec.get());
            if (spec.restyleViewer) applyTheme();
        });
        setPressed(button, spec.get());
        return button;
    });
    const themeToggle = makeToggle('Negative', 'theme');
    let panel = $(config.panel);
    if (!panel && config.panelNodes?.length) {
        // Gather loose inspectors into a parameter column of their own
        panel = el('aside', 'ln-created-panel');
        panel.setAttribute('aria-label', 'Parameters');
        panel.append(...config.panelNodes.map(selector => $(selector)).filter(Boolean));
        root.appendChild(panel);
    }
    const panelToggle = panel ? toggleButton('Parameters', 'panel') : null;
    if (panelToggle && config.iconActions) {
        panelToggle.innerHTML = lineIcon('parameters');
        panelToggle.classList.add('ln-icon-button');
        panelToggle.setAttribute('aria-label', 'Parameters');
        panelToggle.title = 'Parameters';
    }
    if (viewMenu) {
        const section = el('div', 'view-menu-section ln-view-section', '<div class="view-menu-section-title">Display style</div>');
        section.append(...extraToggles, themeToggle);
        viewMenu.append(el('div', 'view-menu-divider'), section);
        actions.append(...(panelToggle ? [panelToggle] : []));
    } else {
        actions.append(...extraToggles, themeToggle, ...(panelToggle ? [panelToggle] : []));
    }
    actions.append(...adopt(config.primary || [], ['ln-toggle', 'ln-solid', 'ln-text-only']));
    root.prepend(bar);

    // === Stages with crop marks (several sit side by side) ===
    const stageNodes = config.stages.map(selector => $(selector)).filter(Boolean);
    const stageRow = el('div', 'ln-stages');
    stageNodes[0]?.before(stageRow);
    stageNodes.forEach(stage => {
        stage.classList.add('ln-stage');
        ['tl', 'tr', 'bl', 'br'].forEach(corner => stage.appendChild(el('span', `ln-crop ${corner}`)));
        stageRow.appendChild(stage);
    });
    if (stageNodes.length > 1) stageRow.classList.add('is-split');

    // === Caption strip ===
    const caption = el('footer', 'ln-caption', `
        <div class="ln-caption-title"></div>
        <div class="ln-caption-hint"></div>
        <div class="ln-tools"></div>
        <dl class="ln-readout"></dl>`);
    $('.ln-caption-hint', caption).textContent = config.hint || '';
    if (config.caption === false) caption.classList.add('no-text');
    const tools = $('.ln-tools', caption);
    if (typeof config.tools === 'function') {
        config.tools(tools);
    } else if (config.tools?.length) {
        const group = el('div', 'ln-group');
        group.append(...adopt(config.tools, ['ln-toggle', 'ln-text-only']));
        tools.appendChild(group);
    }
    const readout = $('.ln-readout', caption);
    const readoutCells = (config.readout || []).map(spec => {
        const row = el('div', spec.wide ? 'wide' : '', `<dt>${spec.label}</dt><dd></dd>`);
        readout.appendChild(row);
        const cell = $('dd', row);
        if (spec.source) {
            const source = $(spec.source);
            if (source) {
                source.classList.add('ln-readout-source');
                cell.appendChild(source);
            }
        }
        return { spec, cell };
    });
    if (config.checks && $(config.checks)) {
        const row = el('div', 'wide', '<dt>Checks</dt><dd></dd>');
        $('dd', row).appendChild($(config.checks));
        readout.appendChild(row);
        $$(`${config.checks} button`).slice(0, 1).forEach(button => button.classList.add('ln-toggle', 'ln-text-only'));
    }
    root.appendChild(caption);

    // === Project controls: in the bar, or first in the parameter column ===
    if (panel && !config.projectInBar) {
        panel.classList.add('ln-panel');
        const body = $(config.panelBody, panel) || panel;
        const project = el('section', 'ln-project', '<h2>Project</h2><div class="ln-project-name"></div><div class="ln-project-actions"></div>');
        $('.ln-project-name', project).append(...[config.projectName || '#projectName', config.unsaved || '#unsavedIndicator']
            .map(selector => $(selector)).filter(Boolean));
        $('.ln-project-actions', project).append(...adopt(config.project || ['#btnNewProject', '#btnLoadProject', '#btnSaveProject'], ['ln-chip', 'ln-text-only']));
        body.prepend(project);
        const classicLink = el('button', 'ln-classic', 'Classic interface');
        classicLink.type = 'button';
        classicLink.addEventListener('click', switchToClassic);
        body.appendChild(classicLink);
    } else {
        // The project controls join the bar
        if (panel) panel.classList.add('ln-panel');
        const projectGroup = el('div', `ln-bar-project${config.projectCentered ? ' is-centered' : ''}`);
        projectGroup.append(...[config.projectName || '#projectName', config.unsaved || '#unsavedIndicator']
            .map(selector => $(selector)).filter(Boolean));
        projectGroup.append(...adopt(config.project || ['#btnNewProject', '#btnLoadProject', '#btnSaveProject'], ['ln-toggle', 'ln-text-only']));
        if (config.projectCentered) bar.appendChild(projectGroup);
        else actions.prepend(projectGroup);
        const classicLink = el('button', 'ln-classic', 'Classic interface');
        classicLink.type = 'button';
        classicLink.addEventListener('click', switchToClassic);
        if (panel) ($(config.panelBody, panel) || panel).appendChild(classicLink);
        else tools.appendChild(classicLink);
    }

    // === Theme ===
    let theme = getLineTheme();
    const applyTheme = () => {
        const colors = applyLineTheme(theme);
        setPressed(themeToggle, theme === 'negative');
        try {
            config.viewer?.(colors, theme);
        } catch (error) {
            console.warn('Line viewer styling failed:', error);
        }
    };
    themeToggle.addEventListener('click', () => {
        theme = theme === 'negative' ? 'positive' : 'negative';
        applyTheme();
    });

    // === Panel open / closed ===
    if (panelToggle) {
        const setPanel = (open) => {
            root.classList.toggle('ln-panel-open', open);
            panelToggle.setAttribute('aria-pressed', String(open));
            localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed');
        };
        panelToggle.addEventListener('click', () => setPanel(!root.classList.contains('ln-panel-open')));
        setPanel(localStorage.getItem(PANEL_KEY) !== 'closed');
    }

    // === Caption and readout refresh ===
    const title = $('.ln-caption-title', caption);
    let frame = null;
    const refresh = () => {
        frame = null;
        if (config.caption !== false) {
            title.innerHTML = config.caption ? config.caption() : `<span>${config.title}</span>`;
        }
        readoutCells.forEach(({ spec, cell }) => {
            if (spec.text) cell.textContent = spec.text();
        });
        syncTabs();
    };
    const scheduleRefresh = () => {
        if (frame === null) frame = requestAnimationFrame(refresh);
    };
    config.subscribe?.(scheduleRefresh);

    // Hairline sliders show their filled portion in ink
    const syncFills = () => {
        $$('input[type="range"]', root).forEach(range => {
            const min = Number(range.min) || 0;
            const max = Number(range.max) || 100;
            const fill = ((Number(range.value) - min) / Math.max(max - min, 1e-9)) * 100;
            range.style.setProperty('--fill', `${Math.max(0, Math.min(100, fill))}%`);
        });
    };
    root.addEventListener('input', syncFills);
    setInterval(() => {
        syncFills();
        scheduleRefresh();
    }, 400);

    applyTheme();
    // Apps restyle their viewers when their own theme initialises or the
    // light/dark mode changes; re-apply the paper afterwards
    setTimeout(applyTheme, 600);
    new MutationObserver(() => applyTheme())
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    syncFills();
    refresh();
    root.classList.add('ln-ready');
    document.documentElement.classList.add('ln-app-ready');
    return { refresh: scheduleRefresh, syncTabs, root, applyTheme };
}

/**
 * Boot an app's Line frame once its classic UI is ready.
 */
export function bootLineApp(ready, build) {
    if (!isLineUI()) return;
    loadLineFonts();
    whenReady(ready, build);
}
