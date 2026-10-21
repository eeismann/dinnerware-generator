/**
 * Playground Ceramics - Dashboard intro tour
 *
 * A short first-run walkthrough of the platform: what it is, the form tools,
 * the handle and mold tools, how a generator is laid out, and how projects
 * are kept. Opens once on the first visit (remembered in localStorage) and
 * again from Settings → Intro Tour or the empty state.
 */

import { APP_ICON_VARIANTS, getAppIconSvg } from './appIcons.js';

const SEEN_KEY = 'pc_intro_tour_seen_v1';

const TOOLS = [
    ['dinnerware', 'Dinnerware Set'], ['vessel', 'Vessel'], ['vessel-v2', 'Bezier Vessel'],
    ['handle', 'Mug Handle'], ['castform', 'Cast Form'], ['stackedmold', 'Stacked Mold']
];

const icon = (app, size = 28) => getAppIconSvg(app, `tour-${app}`, size, APP_ICON_VARIANTS.line);

const appRow = (app, name, text) => `
    <li class="tour-app">
        <span class="tour-app-icon" aria-hidden="true">${icon(app)}</span>
        <span class="tour-app-text"><b>${name}</b><span>${text}</span></span>
    </li>`;

const featureRow = (glyph, name, text) => `
    <li class="tour-app">
        <span class="tour-app-icon tour-glyph" aria-hidden="true">${glyph}</span>
        <span class="tour-app-text"><b>${name}</b><span>${text}</span></span>
    </li>`;

const GLYPH = {
    dials: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    dock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M12 12v6M9.5 15.5L12 18l2.5-2.5"/></svg>',
    cards: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="8" height="7" rx="1.5"/><rect x="13" y="4" width="8" height="7" rx="1.5"/><rect x="3" y="13" width="8" height="7" rx="1.5"/><rect x="13" y="13" width="8" height="7" rx="1.5"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v12"/></svg>',
    device: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/></svg>'
};

const STEPS = [
    {
        title: 'Welcome to Playground Ceramics',
        body: () => `
            <p class="tour-lede">Design ceramic forms with parametric dials, then export watertight STL files for FDM printing.
            Molds for slip casting come from the same forms.</p>
            <div class="tour-hero">
                ${TOOLS.map(([app, name]) => `<span class="tour-tool">${icon(app, 34)}<b>${name}</b></span>`).join('')}
            </div>
            <p class="tour-note">Everything runs in your browser. There is no account, and projects are saved on this device.</p>`
    },
    {
        title: 'Start with a form',
        body: () => `
            <p class="tour-lede">Three tools make the ceramic pieces themselves.</p>
            <ul class="tour-apps">
                ${appRow('dinnerware', 'Dinnerware Set', 'Plates, bowls, mugs, tumblers and saucers that share one style, with per-item overrides.')}
                ${appRow('vessel', 'Vessel', 'A vessel built section by section, from lip and neck down to waist and foot.')}
                ${appRow('vessel-v2', 'Bezier Vessel', 'Draw a profile with pen points and bezier handles, and it revolves into the form.')}
            </ul>`
    },
    {
        title: 'Add handles and molds',
        body: () => `
            <p class="tour-lede">These tools build on a form you have already made, or on an STL or OBJ file.</p>
            <ul class="tour-apps">
                ${appRow('handle', 'Mug Handle', 'A handle fitted to a Dinnerware mug or a Bezier Vessel, ready to join to the body.')}
                ${appRow('castform', 'Cast Form', 'A four-part slip-casting mold with registration keys and a slip well.')}
                ${appRow('stackedmold', 'Stacked Mold', 'PLA casting units you pour plaster into. The plaster pieces stack into one cylindrical mold.')}
            </ul>`
    },
    {
        title: 'Inside a generator',
        body: () => `
            <p class="tour-lede">Every tool is laid out the same way.</p>
            <ul class="tour-apps">
                ${featureRow(GLYPH.dials, 'Dials on the right', 'Drag a dial or type a value. The preview updates as you go, and your work saves automatically.')}
                ${featureRow(GLYPH.dock, 'View dock, lower left', 'Click a face of the cube to snap the view, or drag it to orbit. Expand it for view options and light or dark appearance.')}
                ${featureRow(GLYPH.file, 'File menu, top right', 'Save the project, export STL files for printing, or save a project file to keep or share.')}
            </ul>`
    },
    {
        title: 'Your projects',
        body: () => `
            <p class="tour-lede">This dashboard is home base for everything you make.</p>
            <ul class="tour-apps">
                ${featureRow(GLYPH.cards, 'Project cards', 'Click a card to open it. Hover for more: duplicate it, send a form to Cast Form or Stacked Mold, or delete it.')}
                ${featureRow(GLYPH.import, 'Import', 'Bring in a project file with the Import button, or drop it anywhere on this page.')}
                ${featureRow(GLYPH.device, 'Saved on this device', 'Projects live in this browser. Save project files from a tool’s File menu to back them up or move them to another computer.')}
            </ul>`
    }
];

/**
 * Mount the tour. Returns { open }.
 * @param {{ onCreateProject: () => void }} options
 */
export function initIntroTour({ onCreateProject } = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal-dashboard intro-tour';
    modal.id = 'introTourModal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-dashboard-backdrop"></div>
        <div class="modal-dashboard-content modal-dashboard-large tour-content" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
            <div class="app-select-heading">
                <div>
                    <p class="tour-kicker" id="tourKicker"></p>
                    <h2 class="modal-dashboard-title" id="tourTitle"></h2>
                </div>
                <button class="app-select-close" type="button" id="tourClose" aria-label="Close the intro tour">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
                </button>
            </div>
            <div class="tour-body" id="tourBody" aria-live="polite"></div>
            <div class="modal-dashboard-actions tour-actions">
                <div class="tour-dots" id="tourDots" role="tablist" aria-label="Tour steps"></div>
                <button class="dk-btn" id="tourBack" type="button">Back</button>
                <button class="dk-btn dk-btn-primary" id="tourNext" type="button">Next</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const $ = (id) => modal.querySelector(`#${id}`);
    let step = 0;
    let returnFocus = null;

    const dots = $('tourDots');
    dots.innerHTML = STEPS.map((s, i) =>
        `<button type="button" class="tour-dot" role="tab" data-step="${i}" aria-label="Step ${i + 1}: ${s.title}"></button>`).join('');

    function render() {
        const s = STEPS[step];
        const last = step === STEPS.length - 1;
        $('tourKicker').textContent = `${step + 1} of ${STEPS.length}`;
        $('tourTitle').textContent = s.title;
        $('tourBody').innerHTML = s.body();
        $('tourBack').textContent = step === 0 ? 'Skip' : 'Back';
        $('tourNext').textContent = last ? 'Create a project' : 'Next';
        dots.querySelectorAll('.tour-dot').forEach((d, i) => {
            d.classList.toggle('on', i === step);
            d.setAttribute('aria-selected', String(i === step));
        });
    }

    function close() {
        modal.style.display = 'none';
        try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
        document.removeEventListener('keydown', onKey);
        returnFocus?.focus?.();
    }

    function go(i) {
        step = Math.max(0, Math.min(STEPS.length - 1, i));
        render();
    }

    function onKey(event) {
        if (event.key === 'Escape') close();
        else if (event.key === 'ArrowRight') go(step + 1);
        else if (event.key === 'ArrowLeft') go(step - 1);
    }

    function open(at = 0) {
        returnFocus = document.activeElement;
        step = at;
        render();
        modal.style.display = 'flex';
        document.addEventListener('keydown', onKey);
        $('tourNext').focus();
    }

    $('tourClose').addEventListener('click', close);
    modal.querySelector('.modal-dashboard-backdrop').addEventListener('click', close);
    $('tourBack').addEventListener('click', () => (step === 0 ? close() : go(step - 1)));
    $('tourNext').addEventListener('click', () => {
        if (step < STEPS.length - 1) return go(step + 1);
        close();
        onCreateProject?.();
    });
    dots.addEventListener('click', (event) => {
        const dot = event.target.closest('[data-step]');
        if (dot) go(Number(dot.dataset.step));
    });

    let seen = false;
    try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch { /* private mode */ }
    if (!seen) open();

    return { open, close };
}
