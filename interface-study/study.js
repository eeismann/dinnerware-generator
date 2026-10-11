const study = document.getElementById('interfaceStudy');
const frame = study.querySelector('.prototype-frame');
const surfaceTitle = document.getElementById('surfaceTitle');
const documentName = document.getElementById('documentName');
const primaryActionLabel = document.getElementById('primaryActionLabel');
const shelfKicker = document.getElementById('shelfKicker');
const shelfTitle = document.getElementById('shelfTitle');
const shelfBody = document.getElementById('shelfBody');
const contextTitle = document.getElementById('contextTitle');
const contextBody = document.getElementById('contextBody');
const statusText = document.getElementById('statusText');
const viewLabel = document.getElementById('viewLabel');
const sceneContent = document.getElementById('sceneContent');
const viewToast = document.getElementById('viewToast');

const optionData = {
    1: {
        name: '01 · Floating Shelf', summary: 'Shapr3D-inspired, balanced',
        bestFor: 'A coherent default across all four surfaces',
        shelf: '296 px floating · pin / hide / close', gain: '+374 px with rail + shelf hidden',
        tradeoff: 'Floating chrome overlaps the canvas edge'
    },
    2: {
        name: '02 · Docked Studio', summary: 'Stable, dense, desktop-first',
        bestFor: 'Long parameter sessions and predictable layout',
        shelf: '284 px docked · resize / collapse', gain: '+284 px when collapsed',
        tradeoff: 'Less model area while controls stay open'
    },
    3: {
        name: '03 · Canvas Focus', summary: 'Maximum model area',
        bestFor: 'Reviewing, orbiting, and fast direct manipulation',
        shelf: '278 px transient · tool opens / Esc closes', gain: '+100% width in focus mode',
        tradeoff: 'Parameters are less continuously visible'
    },
    4: {
        name: '04 · Workspaces', summary: 'Power-user, configurable',
        bestFor: 'Vessel V2 and cast-form multi-pane work',
        shelf: '254 px left + 232 px right · saved layouts', gain: '+486 px in presentation mode',
        tradeoff: 'Most capable, but highest implementation cost'
    }
};

const surfaces = {
    dashboard: {
        title: 'Dashboard', document: 'Ceramics workspace', action: 'New project',
        kicker: 'Library', shelf: 'Projects', status: 'Workspace ready', view: 'Recent projects',
        body: `
            <section class="shelf-section">
                <input class="shelf-search" type="search" placeholder="Filter projects" aria-label="Filter projects">
            </section>
            <section class="shelf-section">
                <h3 class="section-title">Create</h3>
                <button class="app-shortcut" type="button"><span class="shortcut-icon"><svg><use href="#i-bowl"/></svg></span><span><strong>Dinnerware set</strong><small>Plate, bowl, cup, saucer</small></span><span>›</span></button>
                <button class="app-shortcut" type="button"><span class="shortcut-icon"><svg><use href="#i-vessel"/></svg></span><span><strong>Vessel V2</strong><small>Profile-based form</small></span><span>›</span></button>
                <button class="app-shortcut" type="button"><span class="shortcut-icon"><svg><use href="#i-mold"/></svg></span><span><strong>Cast form</strong><small>Two-wall plaster mold</small></span><span>›</span></button>
            </section>
            <section class="shelf-section">
                <h3 class="section-title">Browse</h3>
                <div class="shelf-row"><span>All projects</span><strong>12</strong></div>
                <div class="shelf-row"><span>Recently opened</span><strong>3</strong></div>
                <div class="shelf-row"><span>Ready to export</span><strong>4</strong></div>
            </section>`,
        context: `<div class="context-stat"><span>Selected</span><strong>Sunday service</strong></div><div class="context-stat"><span>App</span><strong>Dinnerware</strong></div><div class="context-stat"><span>Items</span><strong>7</strong></div><div class="context-stat"><span>Updated</span><strong>12 min ago</strong></div>`
    },
    dinnerware: {
        title: 'Dinnerware Designer', document: 'Sunday service', action: 'Export STL',
        kicker: 'Set controls', shelf: 'Dinnerware', status: '7 items · geometry valid', view: 'Perspective',
        body: `
            <section class="shelf-section"><h3 class="section-title">Set proportions</h3>
                <div class="shelf-row"><span>Height scale</span><input class="shelf-range" type="range" value="58"><span class="value-box">100<em>%</em></span></div>
                <div class="shelf-row"><span>Width scale</span><input class="shelf-range" type="range" value="58"><span class="value-box">100<em>%</em></span></div>
            </section>
            <section class="shelf-section"><h3 class="section-title">Global style</h3><div class="segmented"><button class="active" type="button">Soft</button><button type="button">Straight</button><button type="button">Flared</button></div>
                <div class="shelf-row"><span>Wall</span><span class="value-box">3.0<em>mm</em></span></div><div class="shelf-row"><span>Rim radius</span><span class="value-box">2.4<em>mm</em></span></div>
            </section>
            <section class="shelf-section"><h3 class="section-title">Surface</h3><div class="shelf-row"><span>Pattern</span><strong>Clean lines</strong></div><div class="shelf-row"><span>Depth</span><input class="shelf-range" type="range" value="38"><span class="value-box">0.8<em>mm</em></span></div></section>
            <section class="shelf-section"><h3 class="section-title">Items</h3><div class="shelf-row"><span>Visible</span><strong>7 / 7</strong></div><div class="shelf-row"><span>Selected</span><strong>Serving bowl</strong></div></section>`,
        context: `<div class="context-stat"><span>Selected</span><strong>Serving bowl</strong></div><div class="context-stat"><span>Diameter</span><strong>240 mm</strong></div><div class="context-stat"><span>Height</span><strong>82 mm</strong></div><div class="context-stat"><span>Mesh</span><strong>Valid</strong></div>`
    },
    vessel: {
        title: 'Vessel Designer V2', document: 'Soft shoulder vase', action: 'Export STL',
        kicker: 'Profile', shelf: 'Vessel controls', status: 'Profile ready · 4 points', view: '3/4 · 100%',
        body: `
            <section class="shelf-section"><h3 class="section-title">Profile mode</h3><div class="segmented"><button class="active" type="button">Bezier</button><button type="button">Straight</button></div>
                <div class="shelf-row"><span>Snap to grid</span><button class="toggle on" type="button" aria-label="Toggle snap"></button></div><div class="shelf-row"><span>Grid</span><span class="value-box">5<em>mm</em></span></div>
            </section>
            <section class="shelf-section"><h3 class="section-title">Wall & base</h3><div class="shelf-row"><span>Wall thickness</span><input class="shelf-range" type="range" value="42"><span class="value-box">3.0<em>mm</em></span></div><div class="shelf-row"><span>Footer overlap</span><button class="toggle" type="button" aria-label="Toggle footer overlap"></button></div></section>
            <section class="shelf-section"><h3 class="section-title">Profile view</h3><p class="section-note">View controls never change saved geometry or export scale.</p><div class="segmented"><button type="button">−</button><button class="active" type="button">100%</button><button type="button">+</button><button class="fit-view" type="button">Fit</button></div></section>
            <section class="shelf-section"><h3 class="section-title">Resolution</h3><div class="shelf-row"><span>Segments</span><span class="value-box">96</span></div><div class="shelf-row"><span>Points</span><strong>4</strong></div></section>`,
        context: `<div class="context-stat"><span>Height</span><strong>138 mm</strong></div><div class="context-stat"><span>Diameter</span><strong>124 mm</strong></div><div class="context-stat"><span>Points</span><strong>4</strong></div><div class="context-stat"><span>Zoom</span><strong>100%</strong></div>`
    },
    mold: {
        title: 'Cast Form Generator', document: 'Sunday bowl mold', action: 'Export 3 STL',
        kicker: 'Build', shelf: 'Cast form', status: '2 walls + foot · validation ready', view: 'Exploded · 3/4',
        body: `
            <section class="shelf-section"><h3 class="section-title">Input</h3><button class="app-shortcut active" type="button"><span class="shortcut-icon"><svg><use href="#i-import"/></svg></span><span><strong>Sunday bowl.stl</strong><small>Watertight · 58k faces</small></span><span>✓</span></button></section>
            <section class="shelf-section"><h3 class="section-title">Mold configuration</h3><div class="shelf-row"><span>Plaster wall</span><input class="shelf-range" type="range" value="45"><span class="value-box">20<em>mm</em></span></div><div class="shelf-row"><span>Spare height</span><input class="shelf-range" type="range" value="28"><span class="value-box">10<em>mm</em></span></div><div class="shelf-row"><span>Wall sections</span><strong>2 fixed</strong></div></section>
            <section class="shelf-section"><h3 class="section-title">Polymer case box</h3><div class="shelf-row"><span>Preview casting box</span><button class="toggle" type="button" aria-label="Toggle case box"></button></div><div class="segmented"><button class="active" type="button">Wall box</button><button type="button">Foot box</button></div></section>
            <section class="shelf-section"><h3 class="section-title">View</h3><div class="segmented"><button type="button">Assemble</button><button class="active" type="button">Explode</button><button type="button">Section</button></div><div class="shelf-row"><span>Explosion</span><input class="shelf-range" type="range" value="36"><span class="value-box">40<em>mm</em></span></div></section>`,
        context: `<div class="context-stat"><span>Parts</span><strong>3</strong></div><div class="context-stat"><span>Walls</span><strong>2</strong></div><div class="context-stat"><span>Foot</span><strong>1</strong></div><div class="context-stat"><span>Registration</span><strong>Valid</strong></div>`
    }
};

let selectedSurface = 'dashboard';
let selectedOption = '1';
let panActive = false;
let panStart = null;
let panX = 0;
let panY = 0;
let toastTimer = null;

function iconMarkup() {
    return `<svg><use href="#i-fit"/></svg>`;
}

function setSurface(surface) {
    selectedSurface = surface;
    const data = surfaces[surface];
    frame.dataset.surface = surface;
    surfaceTitle.textContent = data.title;
    documentName.textContent = data.document;
    primaryActionLabel.textContent = data.action;
    shelfKicker.textContent = data.kicker;
    shelfTitle.textContent = data.shelf;
    shelfBody.innerHTML = data.body;
    contextTitle.textContent = surface === 'dashboard' ? 'Project details' : 'Selection';
    contextBody.innerHTML = data.context;
    statusText.textContent = data.status;
    viewLabel.textContent = data.view;
    study.querySelectorAll('[data-surface]').forEach((button) => button.classList.toggle('active', button.dataset.surface === surface));
    study.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === (surface === 'dashboard' ? 'projects' : surface)));
    bindDynamicControls();
    resetPan();
}

function setOption(option) {
    selectedOption = option;
    const data = optionData[option];
    frame.dataset.option = option;
    frame.classList.remove('shelf-hidden', 'shelf-collapsed');
    if (option === '3') frame.classList.add('shelf-hidden');
    document.getElementById('conceptName').textContent = data.name;
    document.getElementById('conceptSummary').textContent = data.summary;
    document.getElementById('bestFor').textContent = data.bestFor;
    document.getElementById('shelfSpec').textContent = data.shelf;
    document.getElementById('canvasGain').textContent = data.gain;
    document.getElementById('tradeoff').textContent = data.tradeoff;
    study.querySelectorAll('[data-option]').forEach((button) => button.classList.toggle('active', button.dataset.option === option));
}

function bindDynamicControls() {
    shelfBody.querySelectorAll('.toggle').forEach((toggle) => toggle.addEventListener('click', () => toggle.classList.toggle('on')));
    shelfBody.querySelectorAll('.segmented button').forEach((button) => button.addEventListener('click', () => {
        button.parentElement.querySelectorAll('button').forEach((peer) => peer.classList.remove('active'));
        button.classList.add('active');
    }));
    shelfBody.querySelectorAll('.fit-view').forEach((button) => button.addEventListener('click', fitView));
}

function setPanActive(active) {
    panActive = active;
    study.querySelectorAll('.pan-toggle').forEach((button) => button.classList.toggle('active', active));
    sceneContent.classList.toggle('is-panning', active);
    statusText.textContent = active ? 'Pan mode · drag the canvas' : surfaces[selectedSurface].status;
}

function resetPan() {
    panX = 0;
    panY = 0;
    sceneContent.style.setProperty('--pan-x', '0px');
    sceneContent.style.setProperty('--pan-y', '0px');
    sceneContent.removeAttribute('data-view');
}

function fitView() {
    resetPan();
    showToast('Fit to selection');
}

function showToast(text) {
    viewToast.textContent = text;
    viewToast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => viewToast.classList.remove('show'), 1100);
}

study.querySelectorAll('.study-chip[data-option]').forEach((button) => button.addEventListener('click', () => setOption(button.dataset.option)));
study.querySelectorAll('.study-chip[data-surface]').forEach((button) => button.addEventListener('click', () => setSurface(button.dataset.surface)));
study.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => setSurface(button.dataset.tool === 'projects' ? 'dashboard' : button.dataset.tool)));
study.querySelector('.shelf-collapse').addEventListener('click', () => frame.classList.add('shelf-collapsed'));
study.querySelector('.shelf-close').addEventListener('click', () => frame.classList.add('shelf-hidden'));
study.querySelector('.shelf-reveal').addEventListener('click', () => frame.classList.remove('shelf-hidden', 'shelf-collapsed'));
study.querySelectorAll('.pan-toggle').forEach((button) => button.addEventListener('click', () => setPanActive(!panActive)));
study.querySelectorAll('.fit-view').forEach((button) => button.addEventListener('click', fitView));
study.querySelectorAll('.cube-face').forEach((button) => button.addEventListener('click', () => {
    sceneContent.dataset.view = button.dataset.view;
    viewLabel.textContent = button.dataset.view;
    showToast(`${button.dataset.view} view`);
}));

sceneContent.addEventListener('pointerdown', (event) => {
    if (!panActive && !event.shiftKey) return;
    panStart = { x: event.clientX - panX, y: event.clientY - panY };
    sceneContent.setPointerCapture(event.pointerId);
    sceneContent.classList.add('is-panning');
});
sceneContent.addEventListener('pointermove', (event) => {
    if (!panStart) return;
    panX = event.clientX - panStart.x;
    panY = event.clientY - panStart.y;
    sceneContent.style.setProperty('--pan-x', `${panX}px`);
    sceneContent.style.setProperty('--pan-y', `${panY}px`);
});
sceneContent.addEventListener('pointerup', (event) => {
    panStart = null;
    if (sceneContent.hasPointerCapture(event.pointerId)) sceneContent.releasePointerCapture(event.pointerId);
    sceneContent.classList.toggle('is-panning', panActive);
});

window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat && selectedSurface !== 'dashboard') setPanActive(true);
    if (event.key === 'Escape') {
        setPanActive(false);
        if (selectedOption === '3') frame.classList.add('shelf-hidden');
    }
});
window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' && selectedSurface !== 'dashboard') setPanActive(false);
});

setOption(selectedOption);
setSurface(selectedSurface);
