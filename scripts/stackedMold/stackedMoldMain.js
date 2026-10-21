/**
 * Stacked Mold Generator - entry
 *
 * Slip-casting molds made by pouring plaster into 3D-printed PLA casting
 * units (stacked-cylinder-mold/PLAN.md). Source → outer profile → band slicer
 * → casting units → printable parts, previewed as the plaster stack, one unit
 * as poured, or a unit's parts on the printer bed.
 *
 * DialKit chrome: parameter panels (scripts/ui/dialkit/stackedMoldDials.js)
 * and the view dock load on demand; nothing is generated until a source is
 * chosen (start card).
 */

import { initTheme } from '../ui/themeManager.js';
import { initDkMenu, initPanelToggle } from '../ui/dialkit/dkChrome.js';
import stackedMoldState from './state/stackedMoldState.js';
import { computeMold } from './geometry/stackedMoldPipeline.js';
import { demoldOrder } from './geometry/bandSlicer.js';
import { KIT_REVISION } from './geometry/kitSpec.js';
import { buildExportFiles, downloadExport, sanitizeName } from './geometry/stackedMoldExporter.js';
import { StackedMoldViewport } from './ui/stackedMoldViewport.js';
import { drawProfileSchematic } from './ui/moldSchematic.js';
import {
    listSamples, listDinnerware, listVessels, ITEM_LABELS,
    loadSample, loadDinnerware, loadVessel, loadFile
} from './ui/sourceLoaders.js';

const $ = (id) => document.getElementById(id);
const GLYPH = { footer: '⌴', up: '↑', down: '↓', split: '⟷' };
const KIND_LABEL = { footer: 'Footer', ring: 'Ring', split: 'Split', well: 'Well collar' };
const RELEASE_LABEL = {
    footer: 'ware lifts off ↑', up: 'lifts off ↑', down: 'slides off ↓', split: 'opens sideways ⟷', well: 'lifts off ↑'
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

class StackedMoldApp {
    constructor() {
        this.mold = null;
        this.error = null;
        this.regenTimer = null;
        this.autosaveTimer = null;
        this.sourceTab = 'sample';
        this.init();
    }

    async init() {
        initTheme();
        this.viewport = new StackedMoldViewport($('viewport'));
        this.viewport.onPickUnit = (id) => this.selectUnit(id);
        this.viewport.setView(stackedMoldState.getState('view'));

        await this.initDials();
        await this.initViewDock();
        this.initChrome();
        this.initModals();
        this.subscribe();

        await this.loadInitial();
        this.regenerate();
        this.state = stackedMoldState;
        window.__stackedMold = this; // browser tests
    }

    /* ---------- DialKit ---------- */

    async initDials() {
        // Loaded on demand: DialKit imports its stylesheet
        const { initStackedMoldDials } = await import('../ui/dialkit/stackedMoldDials.js');
        this.dials = initStackedMoldDials({
            container: $('parameterPanel'),
            setParam: (path, value) => stackedMoldState.setState(path, value),
            onGestureStart: () => {},
            onGestureEnd: () => {}
        });
        // Readouts below the dials
        $('parameterPanel').append($('summaryCard'), $('unitsCard'), $('warningsCard'));
    }

    async initViewDock() {
        const { createViewDock } = await import('../ui/dialkit/viewDock.js');
        const view = (key) => ({
            get: () => stackedMoldState.getState(`view.${key}`),
            set: (value) => stackedMoldState.setState(`view.${key}`, value)
        });
        this.viewDock = createViewDock({
            container: document.querySelector('.viewport-container'),
            rig: this.viewport.getCameraRig(),
            onReset: () => this.viewport.resetView(),
            storageKey: 'stackedmold_view_dock_open',
            sections: [{
                title: 'View',
                controls: [
                    {
                        type: 'select', label: 'Show',
                        options: [
                            { value: 'stack', label: 'Plaster stack' },
                            { value: 'unit', label: 'Casting unit' },
                            { value: 'print', label: 'Unit prints' },
                            { value: 'kit', label: 'Universal kit' }
                        ],
                        ...view('mode')
                    },
                    {
                        type: 'select', label: 'Unit',
                        options: () => (this.mold?.result.units || []).map(u => ({ value: u.id, label: `${u.id} ${KIND_LABEL[u.kind]}` })),
                        ...view('unit')
                    },
                    {
                        type: 'slider', label: 'Explode', min: 0, max: 100, step: 1,
                        format: (v) => `${Math.round(v)}%`,
                        get: () => Math.round(stackedMoldState.getState('view.explode') * 100),
                        set: (v) => stackedMoldState.setState('view.explode', v / 100),
                        visible: () => !['print', 'kit'].includes(stackedMoldState.getState('view.mode'))
                    },
                    {
                        type: 'select', label: 'Section',
                        options: [
                            { value: 'none', label: 'None' },
                            { value: 'quarter', label: 'Quarter cut' },
                            { value: 'half', label: 'Half section' }
                        ],
                        visible: () => !['print', 'kit'].includes(stackedMoldState.getState('view.mode')),
                        ...view('section')
                    },
                    { type: 'toggle', label: 'Ware', ...view('showWare'), visible: () => stackedMoldState.getState('view.mode') === 'stack' },
                    { type: 'toggle', label: 'Plaster', ...view('showPlaster'), visible: () => !['print', 'kit'].includes(stackedMoldState.getState('view.mode')) },
                    { type: 'toggle', label: 'Profile', ...view('showProfile') }
                ]
            }]
        });
    }

    /* ---------- header, cards ---------- */

    initChrome() {
        this.panelToggle = initPanelToggle($('btnTogglePanel'), 'stackedmold_dials_visible');
        initDkMenu($('fileMenu'));

        const nameEl = $('projectName');
        const commit = () => {
            const name = nameEl.textContent.trim() || 'Untitled Stacked Mold';
            nameEl.textContent = name;
            stackedMoldState.setState('project.name', name);
        };
        nameEl.addEventListener('blur', commit);
        nameEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
            if (e.key === 'Escape') { nameEl.textContent = stackedMoldState.getState('project.name'); nameEl.blur(); }
        });

        $('newBtn').addEventListener('click', () => this.newProject());
        $('openSavedBtn').addEventListener('click', () => this.showLoadModal());
        $('loadFileBtn').addEventListener('click', () => $('projectFileInput').click());
        $('saveBtn').addEventListener('click', () => this.showSaveModal());
        $('downloadJsonBtn').addEventListener('click', () => this.downloadProjectJson());
        $('exportBtn').addEventListener('click', () => this.showExportModal());
        ['chooseSourceBtn', 'btnChooseSource', 'emptyChooseBtn'].forEach(id => $(id).addEventListener('click', () => this.showSourceModal()));
        $('emptySampleBtn').addEventListener('click', () => this.useSource(() => loadSample('belly-jar')));
        $('fileInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (file) this.useSource(() => loadFile(file));
        });
        $('projectFileInput').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            e.target.value = '';
            if (!file) return;
            try {
                stackedMoldState.loadProjectData(JSON.parse(await file.text()));
                this.afterLoad();
            } catch (err) {
                this.status(err.message, true);
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (stackedMoldState.getState('project.isDirty') && stackedMoldState.getState('source')) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                this.showSaveModal();
            }
        });
    }

    subscribe() {
        stackedMoldState.subscribe('params', () => this.scheduleRegenerate());
        stackedMoldState.subscribe('source', () => this.scheduleRegenerate(0));
        stackedMoldState.subscribe('view', (view) => {
            this.viewport.setView(view);
            this.renderProfile();
            this.renderUnits();
            this.renderCaption();
            this.viewDock?.sync();
        });
        stackedMoldState.subscribe('project', () => this.renderProject());
        stackedMoldState.subscribe('*', () => {
            this.dials?.sync();
            this.scheduleAutosave();
        });
        this.renderProject();
    }

    renderProject() {
        const p = stackedMoldState.getState('project');
        const nameEl = $('projectName');
        if (document.activeElement !== nameEl) nameEl.textContent = p.name;
        $('unsavedIndicator').hidden = !p.isDirty || !stackedMoldState.getState('source');
        document.title = `${p.name} - Stacked Mold Generator`;
    }

    status(text, isError = false) {
        const el = $('statusText');
        el.textContent = text;
        el.classList.toggle('is-error', isError);
    }

    /* ---------- generation ---------- */

    scheduleRegenerate(delay = 60) {
        clearTimeout(this.regenTimer);
        this.regenTimer = setTimeout(() => this.regenerate(), delay);
    }

    regenerate() {
        const source = stackedMoldState.getState('source');
        this.renderSource();
        if (!source) {
            this.mold = null;
            this.viewport.setMold(null);
            this.renderAll();
            return;
        }
        const t0 = performance.now();
        try {
            this.mold = computeMold(source.profile, stackedMoldState.getState('params'));
            this.error = null;
            const ids = this.mold.result.units.map(u => u.id);
            if (!ids.includes(stackedMoldState.getState('view.unit'))) {
                stackedMoldState.setState('view.unit', ids[1] || ids[0], { silent: true });
                this.viewport.setView({ unit: stackedMoldState.getState('view.unit') });
            }
            this.viewport.setMold(this.mold);
            const s = this.mold.summary;
            this.status(`${s.units} units · ${s.pieces} plaster pieces · Ø${s.diameter} mm · ${Math.round(performance.now() - t0)} ms`);
        } catch (err) {
            console.error(err);
            this.mold = null;
            this.error = err.message;
            this.viewport.setMold(null);
            this.status(err.message, true);
        }
        this.renderAll();
    }

    renderAll() {
        this.renderSummary();
        this.renderUnits();
        this.renderWarnings();
        this.renderProfile();
        this.renderCaption();
        $('emptyState').hidden = Boolean(stackedMoldState.getState('source')) || this.loadingSource;
        this.viewDock?.sync();
    }

    renderSource() {
        const source = stackedMoldState.getState('source');
        const card = $('sourceCard');
        card.classList.toggle('loaded', Boolean(source) && !this.error);
        card.classList.toggle('error', Boolean(this.error));
        $('sourceName').textContent = source ? source.label : 'No source chosen';
        $('sourceMeta').textContent = source ? source.meta : '';
        $('btnChooseSource').textContent = source ? 'Change…' : 'Choose…';
    }

    renderSummary() {
        const card = $('summaryCard');
        card.hidden = !this.mold;
        if (!this.mold) return;
        const { summary, parts, result } = this.mold;
        const warePrints = parts.units.reduce((n, e) => n + e.parts.reduce((m, p) => m + (p.count || 1), 0), 0);
        const kitPrints = parts.kit.parts.reduce((n, p) => n + p.count, 0);
        const stats = [
            ['Cylinder', `Ø${summary.diameter} mm`],
            ['Kit', `${parts.kit.id.replace('Kit_', '')}`],
            ['Pieces', `${summary.pieces}`],
            ['Ledge', `${summary.ledge.toFixed(1)} mm`],
            ['Plaster', `${summary.plasterLitres.toFixed(2)} L`],
            ['Ware prints', `${warePrints}`]
        ];
        $('summaryCard').title = `Cylinder Ø${summary.diameter} (ware needs Ø${result.fittedS}). Universal kit ${parts.kit.id}: ${kitPrints} prints, made once per diameter.`;
        $('summaryStats').innerHTML = stats.map(([k, v]) => `<div class="sm-stat"><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    }

    renderUnits() {
        const card = $('unitsCard');
        card.hidden = !this.mold;
        if (!this.mold) return;
        const selected = stackedMoldState.getState('view.unit');
        const units = this.mold.result.units;
        $('unitsNote').textContent = 'bottom → top';
        $('unitList').innerHTML = [...units].reverse().map(u => `
            <li>
                <button type="button" class="sm-unit${u.id === selected ? ' is-selected' : ''}${u.kind === 'split' ? ' is-split' : ''}" data-unit="${u.id}"
                    aria-pressed="${u.id === selected}" title="${escapeHtml(u.why)}">
                    <span class="sm-unit-id">${u.id}</span>
                    <span class="sm-unit-kind">${KIND_LABEL[u.kind]} <span class="sm-glyph">${GLYPH[u.release] || ''}</span></span>
                    <span class="sm-unit-z">${u.a.toFixed(0)}–${u.b.toFixed(0)}</span>
                    <span class="sm-unit-vol">${u.vol.toFixed(2)} L</span>
                    <span class="sm-unit-sub">${u.kind === 'well' || u.kind === 'footer' ? '' : `${RELEASE_LABEL[u.release]} · `}pour ${u.orient}</span>
                </button>
            </li>`).join('');
        $('unitList').querySelectorAll('[data-unit]').forEach(btn => btn.addEventListener('click', () => {
            this.selectUnit(btn.dataset.unit);
            if (stackedMoldState.getState('view.mode') === 'stack') stackedMoldState.setState('view.mode', 'unit');
        }));
        $('demoldList').innerHTML = demoldOrder(this.mold.result).map(s => `<li>${escapeHtml(s.text)} <span class="sm-ids">${s.ids.join(', ')}</span></li>`).join('');
    }

    renderWarnings() {
        const list = this.mold?.warnings || [];
        $('warningsCard').hidden = !list.length;
        $('warningCount').textContent = String(list.length);
        $('warningList').innerHTML = list.map(w => `<li class="sm-warning is-${w.level}">${escapeHtml(w.text)}</li>`).join('');
    }

    renderProfile() {
        const card = $('profileCard');
        const show = Boolean(this.mold) && stackedMoldState.getState('view.showProfile');
        card.hidden = !show;
        if (!show) return;
        const host = $('profileSvg');
        host.replaceChildren(drawProfileSchematic(this.mold.result, {
            width: 220, height: 260,
            selected: stackedMoldState.getState('view.unit'),
            onPick: (id) => this.selectUnit(id)
        }));
    }

    renderCaption() {
        const cap = $('unitCaption');
        const mode = stackedMoldState.getState('view.mode');
        if (!this.mold || mode === 'stack') { cap.hidden = true; return; }
        const u = this.mold.result.units.find(x => x.id === stackedMoldState.getState('view.unit'));
        if (!u) { cap.hidden = true; return; }
        const kit = this.mold.parts.kit;
        if (mode === 'kit') {
            cap.hidden = false;
            cap.innerHTML = `<b>Universal kit ${kit.id}</b> · print once, reuse for every Ø${kit.diameter} ware<br><span>${escapeHtml(kit.parts.map(p => `${p.label}${p.count > 1 ? ` ×${p.count}` : ''}`).join(' · '))}</span>`;
            return;
        }
        const entry = this.mold.parts.units.find(e => e.unit.id === u.id);
        const ware = entry.parts.map(p => `${p.label}${p.count > 1 ? ` ×${p.count}` : ''}`).join(' · ');
        cap.hidden = false;
        cap.innerHTML = `<b>${u.id} ${KIND_LABEL[u.kind]}</b> · ${u.h.toFixed(0)} mm · pour ${u.orient}${mode === 'print' ? ' · print layout' : ''}<br><span>Ware: ${escapeHtml(ware)} · kit ${escapeHtml(kit.id)}</span>`;
    }

    selectUnit(id) {
        stackedMoldState.setState('view.unit', id);
    }

    /* ---------- sources ---------- */

    async useSource(loader) {
        this.loadingSource = true;
        this.status('Reading the source profile…');
        $('sourceError').hidden = true;
        try {
            const source = await loader();
            this.closeModal('sourceModal');
            // Name the project after its source until the user renames it
            const name = stackedMoldState.getState('project.name');
            const previous = stackedMoldState.getState('source');
            if (name === 'Untitled Stacked Mold' || (previous && name === `${previous.label} Mold`)) {
                stackedMoldState.setState('project.name', `${source.label} Mold`);
            }
            stackedMoldState.setState('source', source);
            this.viewport.framedOnce = false;
        } catch (err) {
            console.error(err);
            $('sourceError').textContent = err.message;
            $('sourceError').hidden = false;
            this.status(err.message, true);
        } finally {
            this.loadingSource = false;
            this.renderAll();
        }
    }

    showSourceModal() {
        $('sourceError').hidden = true;
        this.renderSourceList();
        this.openModal('sourceModal');
    }

    renderSourceList() {
        const tab = this.sourceTab;
        $('sourceTabs').querySelectorAll('[data-source]').forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.source === tab)));
        const list = $('sourceList');
        const desc = {
            sample: 'The six concept forms: each shows a different slicing case.',
            dinnerware: 'A Dinnerware item, rebuilt from its saved project and sampled at mold size.',
            'vessel-v2': 'A Bezier Vessel profile, read directly from the project (surface motifs are left out).',
            'vessel-v3': 'A Vessel V3 profile, read directly from the project (spouts and motifs are left out).'
        }[tab];
        $('sourceDescription').textContent = desc;
        const row = (name, meta, attrs) => `<button type="button" class="project-list-item sm-source-item" ${attrs}>
            <span class="project-list-item-info"><span class="project-list-item-name">${escapeHtml(name)}</span>
            <span class="project-list-item-meta">${escapeHtml(meta || '')}</span></span></button>`;
        let html = '';
        if (tab === 'sample') {
            html = listSamples().map(s => row(s.name, s.meta, `data-sample="${s.id}"`)).join('');
        } else if (tab === 'dinnerware') {
            const projects = listDinnerware();
            html = projects.map(p => `<div class="sm-dw-project"><span class="project-list-item-name">${escapeHtml(p.name)}</span>
                <span class="sm-dw-items">${p.items.map(item => `<button type="button" class="dk-chip" data-dw="${p.id}" data-item="${item}">${ITEM_LABELS[item]}</button>`).join('')}</span></div>`).join('');
            if (!projects.length) html = '<p class="modal-description">No saved Dinnerware projects.</p>';
        } else {
            const vessels = listVessels(tab);
            html = vessels.map(v => row(v.name, v.note || '', `data-vessel="${escapeHtml(v.id)}"`)).join('');
            if (!vessels.length) html = `<p class="modal-description">No saved ${tab === 'vessel-v3' ? 'Vessel V3' : 'Bezier Vessel'} projects.</p>`;
        }
        list.innerHTML = html;
        list.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => this.useSource(() => loadSample(b.dataset.sample))));
        list.querySelectorAll('[data-dw]').forEach(b => b.addEventListener('click', () => this.useSource(() => loadDinnerware(b.dataset.dw, b.dataset.item))));
        list.querySelectorAll('[data-vessel]').forEach(b => b.addEventListener('click', () => this.useSource(() => loadVessel(tab, b.dataset.vessel))));
    }

    /* ---------- modals ---------- */

    initModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.querySelectorAll('[data-close], .modal-backdrop').forEach(el => el.addEventListener('click', () => this.closeModal(modal.id)));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            const open = [...document.querySelectorAll('.modal')].find(m => !m.hidden);
            if (open) this.closeModal(open.id);
        });
        $('sourceTabs').querySelectorAll('[data-source]').forEach(btn => btn.addEventListener('click', () => {
            this.sourceTab = btn.dataset.source;
            this.renderSourceList();
        }));
        $('importFileBtn').addEventListener('click', () => $('fileInput').click());
        $('saveConfirm').addEventListener('click', () => this.saveProject());
        $('saveProjectName').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.saveProject(); });
        $('exportAll').addEventListener('click', () => $('exportFiles').querySelectorAll('input').forEach(i => { i.checked = true; }));
        $('exportNone').addEventListener('click', () => $('exportFiles').querySelectorAll('input').forEach(i => { i.checked = false; }));
        $('exportZip').addEventListener('click', () => this.exportZip());
        $('confirmOk').addEventListener('click', () => {
            const fn = this.confirmAction;
            this.closeModal('confirmModal');
            fn?.();
        });
    }

    openModal(id) {
        this.lastFocus = document.activeElement;
        $(id).hidden = false;
        $(id).querySelector('input, button:not([data-close]), [data-close]')?.focus();
    }

    closeModal(id) {
        $(id).hidden = true;
        this.lastFocus?.focus?.();
    }

    confirm(title, message, action) {
        $('confirmTitle').textContent = title;
        $('confirmMessage').textContent = message;
        this.confirmAction = action;
        this.openModal('confirmModal');
    }

    /* ---------- projects ---------- */

    newProject() {
        const go = () => {
            stackedMoldState.reset();
            this.viewport.framedOnce = false;
            this.regenerate();
        };
        if (stackedMoldState.getState('project.isDirty') && stackedMoldState.getState('source')) {
            this.confirm('Start a new mold?', 'Unsaved changes to this mold will be lost.', go);
        } else go();
    }

    showSaveModal() {
        if (!stackedMoldState.getState('source')) {
            this.status('Choose a source before saving.', true);
            return;
        }
        $('saveProjectName').value = stackedMoldState.getState('project.name');
        this.openModal('saveModal');
        $('saveProjectName').select();
    }

    saveProject() {
        const name = $('saveProjectName').value.trim() || 'Untitled Stacked Mold';
        try {
            stackedMoldState.saveProject(name, this.viewport.thumbnail(240));
            this.closeModal('saveModal');
            this.status(`Saved “${name}”.`);
        } catch (err) {
            this.status(`Could not save: ${err.message}`, true);
        }
    }

    showLoadModal() {
        const list = stackedMoldState.readProjects()
            .sort((a, b) => String(b.project?.lastModified).localeCompare(String(a.project?.lastModified)));
        $('noSaved').hidden = list.length > 0;
        $('savedList').innerHTML = list.map(p => `<button type="button" class="project-list-item sm-source-item" data-id="${escapeHtml(p.id || p.project?.id)}">
            ${p.thumbnail ? `<img class="sm-thumb" src="${p.thumbnail}" alt="">` : ''}
            <span class="project-list-item-info"><span class="project-list-item-name">${escapeHtml(p.project?.name || 'Untitled')}</span>
            <span class="project-list-item-meta">${escapeHtml(p.source?.label || '')} · ${new Date(p.project?.lastModified || Date.now()).toLocaleDateString()}</span></span></button>`).join('');
        $('savedList').querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => {
            try {
                stackedMoldState.loadProject(b.dataset.id);
                this.closeModal('loadModal');
                this.afterLoad();
            } catch (err) {
                this.status(err.message, true);
            }
        }));
        this.openModal('loadModal');
    }

    afterLoad() {
        this.viewport.framedOnce = false;
        this.viewport.setView(stackedMoldState.getState('view'));
        this.regenerate();
    }

    downloadProjectJson() {
        const data = stackedMoldState.toProjectData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${sanitizeName(stackedMoldState.getState('project.name'))}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    scheduleAutosave() {
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => stackedMoldState.autosave(), 400);
    }

    async loadInitial() {
        const params = new URLSearchParams(location.search);
        const projectId = params.get('project');
        const sourceApp = params.get('sourceApp');
        const sourceProject = params.get('sourceProject');
        const sample = params.get('sample');
        if (projectId) {
            try {
                stackedMoldState.loadProject(projectId);
                return;
            } catch (err) {
                this.status(err.message, true);
            }
        }
        if (sourceApp && sourceProject) {
            stackedMoldState.reset();
            if (sourceApp === 'dinnerware') await this.useSource(() => loadDinnerware(sourceProject, params.get('sourceItem') || 'mug'));
            else if (sourceApp === 'vessel-v2' || sourceApp === 'vessel-v3') await this.useSource(() => loadVessel(sourceApp, sourceProject));
            return;
        }
        if (sample) {
            stackedMoldState.reset();
            await this.useSource(() => loadSample(sample));
            return;
        }
        stackedMoldState.restoreAutosave();
    }

    /* ---------- export ---------- */

    showExportModal() {
        if (!this.mold) {
            this.status('Choose a source to generate parts first.', true);
            return;
        }
        const files = buildExportFiles(this.mold, stackedMoldState.getState('project.name'));
        this.exportFiles = files;
        const groups = new Map();
        files.forEach(f => {
            const key = f.group === 'kit' ? 'kit' : f.unit;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(f);
        });
        const kind = (id) => this.mold.result.units.find(u => u.id === id);
        const kit = this.mold.parts.kit;
        // The kit is printed once per diameter: off by default after the first export
        const kitDone = (() => { try { return JSON.parse(localStorage.getItem('stackedmold_kits_exported') || '[]').includes(`${kit.id}#r${KIT_REVISION}`); } catch { return false; } })();
        $('exportFiles').innerHTML = [...groups.entries()].map(([key, group]) => `
            <div class="sm-export-group">
                <div class="sm-export-title">${key === 'kit'
                    ? `Universal kit ${kit.id} · print once per Ø${kit.diameter}${kitDone ? ' · already exported' : ''}`
                    : `${key} · ${KIND_LABEL[kind(key).kind]} · ware parts`}</div>
                ${group.map(f => `<label class="dk-row sm-export-row">
                    <input type="checkbox" class="dk-check" ${f.group === 'kit' && kitDone ? '' : 'checked'} value="${escapeHtml(f.name)}">
                    <span class="sm-export-name">${escapeHtml(f.label)}${f.count > 1 ? ` <em>×${f.count}</em>` : ''}</span>
                    <span class="sm-export-size" title="${escapeHtml(f.profile.text)}">${f.size.x.toFixed(0)}×${f.size.y.toFixed(0)}×${f.size.z.toFixed(0)}</span>
                </label>`).join('')}
            </div>`).join('');
        const prints = files.reduce((n, f) => n + f.count, 0);
        $('exportSummary').textContent = `${files.length} STL files · ${prints} prints`;
        $('exportError').hidden = true;
        this.openModal('exportModal');
    }

    async exportZip() {
        const only = [...$('exportFiles').querySelectorAll('input:checked')].map(i => i.value);
        if (!only.length) {
            $('exportError').textContent = 'Select at least one part.';
            $('exportError').hidden = false;
            return;
        }
        $('exportZip').disabled = true;
        try {
            const result = await downloadExport(this.mold, stackedMoldState.getState('project.name'), { only });
            this.lastExport = result;
            const kitId = this.mold.parts.kit.id;
            if (result.files.some(n => n.startsWith(`${kitId}/`))) {
                try {
                    const done = new Set(JSON.parse(localStorage.getItem('stackedmold_kits_exported') || '[]'));
                    done.add(`${kitId}#r${KIT_REVISION}`);
                    localStorage.setItem('stackedmold_kits_exported', JSON.stringify([...done]));
                } catch { /* best effort */ }
            }
            this.closeModal('exportModal');
            this.status(`Exported ${result.files.length} parts to ${result.zipName}`);
        } catch (err) {
            console.error(err);
            $('exportError').textContent = err.message;
            $('exportError').hidden = false;
        } finally {
            $('exportZip').disabled = false;
        }
    }
}

export const app = new StackedMoldApp();
