/**
 * Line Dashboard — the project index in the Patterns "Line edition"
 * language: a bar with the mark, a filter index by generator and text
 * actions; projects as numbered plates with crop marks and captions; a
 * caption strip with the readout. Reparents the classic dashboard controls,
 * so dashboard.js keeps owning every behaviour. Enabled with ?ui=line.
 */

import { getLineTheme, applyLineTheme, loadLineFonts, switchToClassic } from './lineTheme.js';

const APP_LABELS = {
    dinnerware: 'Dinnerware',
    vessel: 'Vessel',
    'vessel-v2': 'Vessel V2',
    'vessel-v3': 'Vessel V3',
    handle: 'Handle',
    castform: 'Cast Form'
};
const ACTION_LABELS = { open: 'Open', duplicate: 'Copy', castform: 'Cast', delete: 'Delete' };

const $ = (selector, root = document) => root.querySelector(selector);
const el = (tag, className, html = '') => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.innerHTML = html;
    return node;
};

function whenReady(check, callback, tries = 200) {
    if (check()) callback();
    else if (tries > 0) setTimeout(() => whenReady(check, callback, tries - 1), 50);
}

function textButton(label, action) {
    const button = el('button', 'ln-toggle', label);
    button.type = 'button';
    if (action) button.dataset.action = action;
    return button;
}

function mountDashboard() {
    const container = $('.dashboard-container');
    const grid = $('#projectsGrid');
    let filter = 'all';

    // === Bar ===
    const bar = el('header', 'ln-bar', `
        <a class="ln-mark" href="./dashboard.html">Ceramics <span>/</span> Projects</a>
        <nav class="ln-tabs" aria-label="Filter by generator"></nav>
        <div class="ln-actions"></div>`);
    const tabs = $('.ln-tabs', bar);
    const actions = $('.ln-actions', bar);

    const search = $('#searchInput');
    if (search) {
        search.classList.add('ln-search');
        search.placeholder = 'Search';
        actions.appendChild(search);
    }
    const importButton = $('#btnImportProject');
    importButton?.classList.add('ln-toggle', 'ln-text-only');
    const themeToggle = textButton('Negative', 'theme');
    const newButton = $('#btnNewProject');
    newButton?.classList.add('ln-toggle', 'ln-solid', 'ln-text-only');
    actions.append(...[importButton, themeToggle, newButton].filter(Boolean));
    container.prepend(bar);

    // === Caption strip ===
    const caption = el('footer', 'ln-caption', `
        <div class="ln-caption-title"></div>
        <div class="ln-caption-hint">Click a plate to open it · drop a project file anywhere to import</div>
        <dl class="ln-readout">
            <div><dt>Storage</dt><dd>This browser</dd></div>
            <div><dt>Shown</dt><dd data-r="shown">—</dd></div>
        </dl>
        <div class="ln-caption-links"></div>`);
    const links = $('.ln-caption-links', caption);
    const clearAll = $('#btnClearAll');
    if (clearAll) {
        clearAll.classList.add('ln-classic');
        links.appendChild(clearAll);
    }
    const classic = el('button', 'ln-classic', 'Classic interface');
    classic.type = 'button';
    classic.addEventListener('click', switchToClassic);
    links.appendChild(classic);
    container.appendChild(caption);

    // === Theme ===
    let theme = getLineTheme();
    const applyTheme = () => {
        applyLineTheme(theme);
        themeToggle.setAttribute('aria-pressed', String(theme === 'negative'));
    };
    themeToggle.addEventListener('click', () => {
        theme = theme === 'negative' ? 'positive' : 'negative';
        applyTheme();
    });
    applyTheme();

    // New-project picker shows the hairline "plate" drawings
    $('.app-icon-style-option[data-icon-variant="plate"]')?.click();

    // === Plates: decorate cards each time dashboard.js renders them ===
    const decorate = () => {
        const cards = [...grid.querySelectorAll('.project-card:not(.new-project)')];
        cards.forEach((card, index) => {
            if (!card.dataset.lnDecorated) {
                card.dataset.lnDecorated = 'true';
                const preview = $('.card-preview', card);
                ['tl', 'tr', 'bl', 'br'].forEach(corner => preview?.appendChild(el('span', `ln-crop ${corner}`)));
                card.querySelectorAll('.card-action-btn').forEach(button => {
                    button.classList.add('ln-toggle');
                    button.textContent = ACTION_LABELS[button.dataset.action] ?? button.title;
                });
                const title = $('.card-title', card);
                title?.prepend(el('span', 'ln-plate-num', ''));
                const date = $('.card-date', card);
                const items = Number(card.dataset.items) || 1;
                date?.prepend(el('span', 'ln-app',
                    `${APP_LABELS[card.dataset.app] ?? 'Project'}${items > 1 ? ` · ${items} pieces` : ''} · `));
            }
            const number = $('.ln-plate-num', card);
            if (number) number.textContent = String(index + 1).padStart(2, '0');
            card.hidden = filter !== 'all' && card.dataset.app !== filter;
        });
        const newCard = $('.project-card.new-project', grid);
        if (newCard && !newCard.dataset.lnDecorated) {
            newCard.dataset.lnDecorated = 'true';
            ['tl', 'tr', 'bl', 'br'].forEach(corner => newCard.appendChild(el('span', `ln-crop ${corner}`)));
            const text = $('.new-project-text', newCard);
            if (text) text.textContent = 'New project';
        }

        // Filter index: All plus each generator in use, with counts
        const counts = {};
        cards.forEach(card => { counts[card.dataset.app] = (counts[card.dataset.app] ?? 0) + 1; });
        if (filter !== 'all' && !counts[filter]) filter = 'all';
        const entries = [['all', 'All', cards.length],
            ...Object.keys(APP_LABELS).filter(app => counts[app]).map(app => [app, APP_LABELS[app], counts[app]])];
        tabs.innerHTML = '';
        entries.forEach(([id, label, count]) => {
            const tab = el('button', 'ln-tab', `<span class="name">${label}</span><span class="num">${String(count).padStart(2, '0')}</span>`);
            tab.type = 'button';
            if (id === filter) tab.setAttribute('aria-current', 'page');
            tab.addEventListener('click', () => {
                filter = id;
                decorate();
            });
            tabs.appendChild(tab);
        });

        const shown = cards.filter(card => !card.hidden).length;
        $('[data-r="shown"]', caption).textContent = `${shown} / ${cards.length}`;
        $('.ln-caption-title', caption).innerHTML = `<span>Index</span>${cards.length} project${cards.length === 1 ? '' : 's'}, drawn in one ink.`;
    };
    new MutationObserver(decorate).observe(grid, { childList: true });
    decorate();
    document.documentElement.classList.add('ln-dashboard-ready');
}

if (document.documentElement.dataset.ui === 'line') {
    loadLineFonts();
    // After dashboard.js has initialised (it binds on DOMContentLoaded)
    whenReady(() => document.readyState !== 'loading', () => setTimeout(mountDashboard, 0));
}
