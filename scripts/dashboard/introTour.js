/**
 * Playground Ceramics - Dashboard intro tour
 *
 * A short first-run walkthrough of the platform: what it is, the form tools,
 * the handle and mold tools, how a generator is laid out, and how projects
 * are kept. Opens once on the first visit (remembered in localStorage) and
 * again from Settings → Intro Tour or the empty state.
 *
 * The drawing above the copy is one line-art scene that carries through every
 * step (introTourScene.js); it only animates while the tour is open.
 */

import { createTourScene, TOOL_INFO } from './introTourScene.js';

// v2: the line-art tour; bumping the key shows it once more to everyone who saw v1
const SEEN_KEY = 'pc_intro_tour_seen_v2';

const TOOL_TEXT = {
    dinnerware: 'Plates, bowls, mugs, tumblers and saucers that share one style, with per-item overrides.',
    vessel: 'A vessel built section by section, from lip and neck down to waist and foot.',
    'vessel-v2': 'Draw a profile with pen points and bezier handles, and it revolves into the form.',
    handle: 'A handle fitted to a Dinnerware mug or a Bezier Vessel, ready to join to the body.',
    castform: 'A four-part slip-casting mold with registration keys and a slip well.',
    stackedmold: 'PLA casting units you pour plaster into. The plaster pieces stack into one cylindrical mold.'
};

const FEATURES = {
    dials: ['Dials on the right', 'Drag a dial or type a value. The preview updates as you go, and your work saves automatically.'],
    dock: ['View dock, lower left', 'Click a face of the cube to snap the view, or drag it to orbit. Expand it for view options and light or dark appearance.'],
    file: ['File menu, top right', 'Save the project, export STL files for printing, or save a project file to keep or share.'],
    cards: ['Project cards', 'Click a card to open it. Hover for more: duplicate it, send a form to Cast Form or Stacked Mold, or delete it.'],
    import: ['Import', 'Bring in a project file with the Import button, or drop it anywhere on this page.'],
    device: ['Saved on this device', 'Projects live in this browser. Save project files from a tool’s File menu to back them up or move them to another computer.']
};

const STEPS = [
    {
        title: 'Welcome to Playground Ceramics',
        lede: 'Design ceramic forms with parametric dials, then export watertight STL files for FDM printing. Molds for slip casting come from the same forms.',
        notes: [
            `Six tools: ${Object.values(TOOL_INFO).map((t) => t.name).join(', ')}.`,
            'Everything runs in your browser. There is no account, and projects are saved on this device.'
        ]
    },
    { title: 'Start with a form', lede: 'Three tools make the ceramic pieces themselves.', tools: ['dinnerware', 'vessel', 'vessel-v2'] },
    { title: 'Add handles and molds', lede: 'These tools build on a form you have already made, or on an STL or OBJ file.', tools: ['handle', 'castform', 'stackedmold'] },
    { title: 'Inside a generator', lede: 'Every tool is laid out the same way.', features: ['dials', 'dock', 'file'] },
    { title: 'Your projects', lede: 'This dashboard is home base for everything you make.', features: ['cards', 'import', 'device'] }
];

// Tool rows carry their colour dot; feature rows stay flush left
const column = (name, text, color, d) => `
    <li class="tour-in" style="--d:${d}${color ? `;--tool:${color}` : ''}"><b>${color ? '<i></i>' : ''}${name}</b><span>${text}</span></li>`;

function copyHtml(s) {
    const side = s.notes
        ? s.notes.map((n, i) => `<p class="tour-in tour-note" style="--d:${i + 2}">${n}</p>`).join('')
        : `<ul class="tour-cols">${s.tools
            ? s.tools.map((k, i) => column(TOOL_INFO[k].name, TOOL_TEXT[k], TOOL_INFO[k].color, i + 2)).join('')
            : s.features.map((k, i) => column(FEATURES[k][0], FEATURES[k][1], '', i + 2)).join('')}</ul>`;
    return `<div><h2 class="tour-in" id="tourTitle" style="--d:0">${s.title}</h2><p class="tour-in tour-lede" style="--d:1">${s.lede}</p></div>
        <div>${side}</div>`;
}

/**
 * Mount the tour. Returns { open, close }.
 * @param {{ onCreateProject: () => void }} options
 */
export function initIntroTour({ onCreateProject } = {}) {
    const modal = document.createElement('div');
    modal.className = 'modal-dashboard intro-tour';
    modal.id = 'introTourModal';
    modal.style.display = 'none';
    modal.innerHTML = `
        <div class="modal-dashboard-backdrop"></div>
        <div class="modal-dashboard-content tour-content" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
            <button class="tour-close" type="button" id="tourClose" aria-label="Close the intro tour">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>
            </button>
            <div class="tour-scene" aria-hidden="true">
                <svg viewBox="0 0 800 330" preserveAspectRatio="xMidYMid meet"></svg>
            </div>
            <div class="tour-copy" id="tourCopy" aria-live="polite"></div>
            <div class="tour-foot">
                <div class="tour-dots" id="tourDots" role="tablist" aria-label="Tour steps"></div>
                <button class="dk-btn" id="tourBack" type="button">Back</button>
                <button class="dk-btn dk-btn-primary" id="tourNext" type="button">Next</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    const $ = (id) => modal.querySelector(`#${id}`);
    const scene = createTourScene(modal.querySelector('.tour-scene svg'));
    let step = 0;
    let returnFocus = null;

    const dots = $('tourDots');
    dots.innerHTML = STEPS.map((s, i) =>
        `<button type="button" class="tour-dot" role="tab" data-step="${i}" aria-label="Step ${i + 1}: ${s.title}"></button>`).join('');

    function render(first = false) {
        const last = step === STEPS.length - 1;
        $('tourCopy').innerHTML = copyHtml(STEPS[step]);
        $('tourBack').textContent = step === 0 ? 'Skip' : 'Back';
        $('tourNext').textContent = last ? 'Create a project' : 'Next';
        dots.querySelectorAll('.tour-dot').forEach((d, i) => {
            d.classList.toggle('on', i === step);
            d.classList.toggle('done', i < step);
            d.setAttribute('aria-selected', String(i === step));
        });
        scene.show(step, first);
    }

    function close() {
        modal.style.display = 'none';
        scene.stop();
        try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ }
        document.removeEventListener('keydown', onKey);
        returnFocus?.focus?.();
    }

    function go(i) {
        const target = Math.max(0, Math.min(STEPS.length - 1, i));
        if (target === step) return;
        step = target;
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
        modal.style.display = 'flex';
        scene.reset();
        scene.start();
        render(true);
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
