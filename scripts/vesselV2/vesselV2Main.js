/**
 * Vessel Designer V2 - Main Entry Point
 */

import vesselV2State from './state/vesselV2State.js';
import { VesselV2MeshGenerator } from './geometry/vesselV2MeshGenerator.js';
import { validateVesselV2Profile } from './geometry/profileSampler.js';
import { VesselV2Storage } from './vesselV2Storage.js';
import { ProfileEditor } from './ui/profileEditor.js';
import { MotifInspector } from './ui/motifInspector.js';
import { VesselViewport } from '../vessel/ui/vesselViewport.js';
import { init as initThemeManager } from '../ui/themeManager.js';
import { openDialog, closeDialog } from '../ui/accessibility.js';
import { initVesselV2Dials } from '../ui/dialkit/vesselV2Dials.js';
import { createViewDock } from '../ui/dialkit/viewDock.js';
import { createDkControls } from '../ui/dialkit/dkControls.js';
import { initDkMenu, initPanelToggle } from '../ui/dialkit/dkChrome.js';

let vesselExporterPromise = null;

function loadVesselExporter() {
    if (!vesselExporterPromise) {
        vesselExporterPromise = import('../vessel/geometry/vesselSTLExporter.js');
    }
    return vesselExporterPromise;
}

class VesselV2App {
    constructor() {
        this.viewport = null;
        this.profileEditor = null;
        this.autosaveInterval = null;
        this.pendingViewportUpdate = null;
        this.viewportUpdateDelayMs = 40;
        this.dials = null;
        this.confirmCallback = null;
        this.lastSegmentId = null;
        this.init();
    }

    async init() {
        initThemeManager();

        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');

        if (projectId) {
            this.loadProjectById(projectId);
        } else if (VesselV2Storage.hasAutosave()) {
            VesselV2Storage.loadFromLocalStorage();
        }

        this.initViewport();
        this.initProfileEditor();
        this.motifInspector = new MotifInspector();
        this.initEditorSettings();
        this.initDials();
        this.initEditorPanel();
        this.initViewDock();
        this.initHeaderChrome();
        this.bindHeaderButtons();
        this.bindToolButtons();
        this.bindModals();
        this.bindKeyboard();
        this.subscribeToState();

        this.autosaveInterval = VesselV2Storage.setupAutosave(30000);
        this.updateAll();
        this.setStatus('Ready');
    }

    initViewport() {
        const container = document.getElementById('viewport');
        if (!container) return;
        try {
            this.viewport = new VesselViewport(container, vesselV2State.getState(), {
                MeshGenerator: VesselV2MeshGenerator
            });
        } catch (error) {
            // A viewport/WebGL failure must not take down the profile editor and
            // motif inspector — degrade gracefully to a 2D-editing experience.
            this.viewport = null;
            console.warn('Vessel V2 viewport unavailable (WebGL?):', error);
        }
    }

    initProfileEditor() {
        const container = document.getElementById('profileEditor');
        if (!container) return;
        this.profileEditor = new ProfileEditor(container);
    }

    bindHeaderButtons() {
        document.getElementById('btnNewProject')?.addEventListener('click', () => this.newProject());
        document.getElementById('btnLoadProject')?.addEventListener('click', () => this.loadProject());
        document.getElementById('btnSaveProject')?.addEventListener('click', () => this.showSaveModal());
        document.getElementById('btnExportSTL')?.addEventListener('click', () => this.showExportModal());
    }

    bindToolButtons() {
        document.getElementById('btnToggleConfigurator')?.addEventListener('click', () => {
            const workspace = document.querySelector('.main-content');
            const button = document.getElementById('btnToggleConfigurator');
            if (!workspace || !button) return;

            const collapsed = workspace.classList.toggle('configurator-collapsed');
            button.setAttribute('aria-expanded', String(!collapsed));
            button.setAttribute('aria-label', collapsed ? 'Show profile editor' : 'Hide profile editor');
            button.title = collapsed ? 'Show profile editor' : 'Hide profile editor';
        });

        document.querySelectorAll('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => {
                this.profileEditor?.setPanMode(false);
                vesselV2State.setState('ui.tool', button.dataset.tool, { history: false });
            });
        });

        document.getElementById('btnProfileZoomOut')?.addEventListener('click', () => {
            this.profileEditor?.zoomOut();
            this.setStatus(`Profile zoom ${this.profileEditor?.getZoomPercent() || 100}%`);
        });

        document.getElementById('btnProfileZoomIn')?.addEventListener('click', () => {
            this.profileEditor?.zoomIn();
            this.setStatus(`Profile zoom ${this.profileEditor?.getZoomPercent() || 100}%`);
        });

        document.getElementById('btnProfileFit')?.addEventListener('click', () => {
            this.profileEditor?.fitView();
            this.setStatus('Profile fit');
        });

        document.getElementById('btnProfilePan')?.addEventListener('click', () => {
            const active = this.profileEditor?.togglePanMode();
            this.setStatus(active ? 'Profile pan on' : 'Profile pan off');
        });

        document.getElementById('btnUndo')?.addEventListener('click', () => {
            if (vesselV2State.undo()) this.setStatus('Undone');
        });

        document.getElementById('btnRedo')?.addEventListener('click', () => {
            if (vesselV2State.redo()) this.setStatus('Redone');
        });

        document.getElementById('btnDeletePoint')?.addEventListener('click', () => {
            this.profileEditor?.deleteSelectedPoint();
        });
    }

    // === Profile editor panel ===

    /**
     * Profile settings at the top of the editor panel, as compact
     * (¾-height) DialKit-style rows laid out side by side: mode, snapping,
     * grid size and footer overlap; wall thickness and radial segments; and
     * the selected point's corner radius when it applies. Short labels keep
     * a line together; full names are tooltips and accessible names.
     */
    initEditorSettings() {
        const host = document.getElementById('profileSettings');
        if (!host) return;
        // Slider writes preview without history; the release commits one step
        const commitWhenDone = (interactive) => {
            if (interactive) return;
            vesselV2State.commitHistory();
            this.updateHistoryButtons();
        };
        const global = (key, min, max, step, label, name) => ({
            type: 'slider',
            label,
            name,
            min,
            max,
            step,
            get: () => vesselV2State.getState(`global.${key}`),
            set: (value, { interactive } = {}) => {
                vesselV2State.setState(`global.${key}`, value, { history: false });
                commitWhenDone(interactive);
            }
        });
        const selectedPoint = () => {
            const state = vesselV2State.getState();
            return state.profile.points.find((point) => point.id === state.ui.selectedPointId) || null;
        };
        const lines = [
            [
                {
                    type: 'toggle',
                    label: 'Mode',
                    name: 'Profile Mode',
                    labels: ['Bezier', 'Straight'],
                    get: () => vesselV2State.getState('profile.mode') === 'straight-rounded',
                    set: (straight) => {
                        vesselV2State.setState('profile.mode', straight ? 'straight-rounded' : 'bezier');
                        vesselV2State.setState('ui.selectedHandle', null, { history: false });
                        this.setStatus(straight ? 'Straight mode' : 'Bezier mode');
                    }
                },
                {
                    type: 'toggle',
                    label: 'Snap',
                    name: 'Snap To Grid',
                    get: () => vesselV2State.getState('global.snapEnabled') !== false,
                    set: (on) => vesselV2State.setState('global.snapEnabled', on, { history: false })
                },
                global('snapSize', 1, 50, 1, 'Grid', 'Grid Size'),
                {
                    type: 'toggle',
                    label: 'Overlap',
                    name: 'Footer Overlap',
                    get: () => vesselV2State.getState('profile.allowFooterOverlap') === true,
                    set: (enabled) => {
                        vesselV2State.setState('profile.allowFooterOverlap', enabled);
                        vesselV2State.setProfilePoints(vesselV2State.getState('profile.points'));
                        this.setStatus(enabled ? 'Footer overlap on' : 'Footer overlap off');
                    }
                }
            ],
            [
                global('wallThickness', 1, 20, 0.5, 'Wall', 'Wall Thickness'),
                global('radialSegments', 32, 160, 8, 'Segments', 'Radial Segments')
            ],
            [
                {
                    type: 'slider',
                    label: 'Corner Radius',
                    min: 0,
                    max: 80,
                    step: 0.5,
                    // The selected, unlocked point in straight mode
                    visible: () => vesselV2State.getState('profile.mode') === 'straight-rounded'
                        && Boolean(selectedPoint()) && !selectedPoint().locked,
                    get: () => Number(selectedPoint()?.cornerRadius || 0),
                    set: (value, { interactive } = {}) => this.setCornerRadius(value, !interactive)
                }
            ]
        ];
        this.editorSettings = createDkControls();
        lines.forEach((controls) => {
            const line = document.createElement('div');
            line.className = 'profile-settings-line';
            controls.forEach(control => this.editorSettings.render(control, line));
            host.appendChild(line);
        });
        this.editorSettings.sync();
    }

    /**
     * The editor card floats over a full-width viewport and can be resized
     * from its right edge. Whenever its width changes (drag, collapse,
     * window resize) the 3D view treats the covered strip as inset and
     * re-centres on the vessel; orbiting afterwards may move it under the
     * panel.
     */
    initEditorPanel() {
        const main = document.querySelector('.main-content');
        const card = document.getElementById('profileEditor');
        const handle = document.getElementById('profileResize');
        if (!main || !card) return;
        const STORAGE_KEY = 'vessel_v2_editor_width';
        const MIN_WIDTH = 300;
        const maxWidth = () => Math.max(MIN_WIDTH, main.clientWidth * 0.7);
        const narrow = window.matchMedia('(max-width: 980px)');

        const setWidth = (width) => {
            const clamped = Math.round(Math.min(maxWidth(), Math.max(MIN_WIDTH, width)));
            main.style.setProperty('--v2-editor-width', `${clamped}px`);
            return clamped;
        };
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        if (stored) setWidth(stored);

        let lastInset = null;
        const updateInset = () => {
            const inset = narrow.matches ? 0 : Math.round(card.getBoundingClientRect().right - main.getBoundingClientRect().left);
            main.style.setProperty('--v2-inset', `${inset}px`);
            if (inset === lastInset) return;
            lastInset = inset;
            this.viewport?.setViewInset(inset);
            this.viewport?.centerOnVessel();
        };
        new ResizeObserver(() => requestAnimationFrame(updateInset)).observe(card);
        window.addEventListener('resize', () => requestAnimationFrame(updateInset));
        updateInset();

        handle?.addEventListener('pointerdown', (event) => {
            event.preventDefault();
            handle.setPointerCapture(event.pointerId);
            const startX = event.clientX;
            const startWidth = card.getBoundingClientRect().width;
            card.classList.add('is-resizing');
            const onMove = (moveEvent) => setWidth(startWidth + moveEvent.clientX - startX);
            const onUp = () => {
                handle.removeEventListener('pointermove', onMove);
                card.classList.remove('is-resizing');
                localStorage.setItem(STORAGE_KEY, String(Math.round(card.getBoundingClientRect().width)));
            };
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp, { once: true });
            handle.addEventListener('pointercancel', onUp, { once: true });
        });
        handle?.addEventListener('keydown', (event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
            event.preventDefault();
            const step = event.shiftKey ? 40 : 10;
            const width = setWidth(card.getBoundingClientRect().width + (event.key === 'ArrowRight' ? step : -step));
            localStorage.setItem(STORAGE_KEY, String(width));
        });
    }

    // === DialKit controls ===

    initDials() {
        this.dials = initVesselV2Dials({
            container: document.getElementById('parameterPanel'),
            motif: this.motifInspector,
            selectSegment: (id) => {
                vesselV2State.setState('ui.selectedSegmentId', id, { history: false });
            },
            // Profile edits during a drag skip history; the release commits one step
            onGestureEnd: (changed) => {
                if (changed) vesselV2State.commitHistory();
                this.updateHistoryButtons();
            }
        });
        // The segment's motif preview sits under the Surface Motif dials
        const inspector = document.getElementById('motifInspector');
        if (inspector) document.getElementById('parameterPanel')?.append(inspector);
    }

    /** Orientation cube and view controls in the lower left of the viewport. */
    initViewDock() {
        const display = { crossSection: false, showGrid: true };
        this.viewDock = createViewDock({
            container: document.querySelector('.viewport-shell'),
            rig: this.viewport.getCameraRig(),
            onReset: () => this.viewport.resetCamera(),
            storageKey: 'vessel_v2_view_dock_open',
            sections: [{
                title: 'View',
                controls: [
                    {
                        type: 'toggle',
                        label: 'Cross Section',
                        get: () => display.crossSection,
                        set: (on) => { display.crossSection = on; this.viewport.toggleCrossSection(on); }
                    },
                    {
                        type: 'toggle',
                        label: 'Show Grid',
                        get: () => display.showGrid,
                        set: (on) => { display.showGrid = on; this.viewport.toggleGrid(on); }
                    }
                ]
            }]
        });
    }

    setCornerRadius(value, commit) {
        const selectedId = vesselV2State.getState('ui.selectedPointId');
        if (!selectedId) return;
        const points = vesselV2State.getState('profile.points').map((point) => ({ ...point }));
        const index = points.findIndex((point) => point.id === selectedId);
        if (index < 0) return;
        points[index] = {
            ...points[index],
            cornerRadius: Math.max(0, Math.min(80, Number(value) || 0))
        };
        // A slider release re-sends the dragged value, which setState skips as
        // unchanged; commit the step explicitly (duplicate snapshots are ignored)
        vesselV2State.setProfilePoints(points, { history: false });
        if (commit) {
            vesselV2State.commitHistory();
            this.updateHistoryButtons();
        }
    }

    // === Header chrome ===

    initHeaderChrome() {
        initPanelToggle(document.getElementById('btnTogglePanel'), 'vessel_v2_dials_visible');
        initDkMenu(document.getElementById('fileMenu'));
        this.initProjectNameEditing();
    }

    /**
     * Rename in place: commits on blur/Enter (saving like the Save dialog),
     * Escape restores the previous name.
     */
    initProjectNameEditing() {
        const nameEl = document.getElementById('projectName');
        if (!nameEl) return;
        let originalName = '';
        let cancelEdit = false;

        nameEl.addEventListener('focus', () => {
            originalName = vesselV2State.getState('project.name') || 'Untitled Vessel V2';
            cancelEdit = false;
            requestAnimationFrame(() => {
                const range = document.createRange();
                range.selectNodeContents(nameEl);
                window.getSelection()?.removeAllRanges();
                window.getSelection()?.addRange(range);
            });
        });
        nameEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                cancelEdit = event.key === 'Escape';
                nameEl.blur();
            }
        });
        nameEl.addEventListener('blur', () => {
            const nextName = cancelEdit
                ? originalName
                : nameEl.textContent.replace(/\s+/g, ' ').trim() || originalName;
            nameEl.textContent = nextName;
            if (!cancelEdit && nextName !== vesselV2State.getState('project.name')) {
                this.saveProject(nextName, false);
            }
            cancelEdit = false;
        });
    }

    updateHistoryButtons() {
        const undo = document.getElementById('btnUndo');
        const redo = document.getElementById('btnRedo');
        if (undo) undo.disabled = vesselV2State.historyIndex <= 0;
        if (redo) redo.disabled = vesselV2State.historyIndex >= vesselV2State.history.length - 1;
    }

    bindModals() {
        const saveModal = document.getElementById('saveModal');
        const exportModal = document.getElementById('exportModal');
        const confirmModal = document.getElementById('confirmModal');
        const closers = {
            btnCloseSaveModal: saveModal,
            btnCancelSave: saveModal,
            btnCloseExportModal: exportModal,
            btnCancelExport: exportModal,
            btnCloseConfirmModal: confirmModal,
            btnConfirmCancel: confirmModal
        };
        Object.entries(closers).forEach(([id, modal]) => {
            document.getElementById(id)?.addEventListener('click', () => closeDialog(modal));
        });
        document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
            backdrop.addEventListener('click', () => closeDialog(backdrop.parentElement));
        });

        document.getElementById('btnConfirmSave')?.addEventListener('click', () => {
            const name = document.getElementById('saveProjectName')?.value.trim() || 'Vessel V2';
            const downloadFile = document.getElementById('saveAsFile')?.checked || false;
            closeDialog(saveModal);
            this.saveProject(name, downloadFile);
        });
        document.getElementById('saveProjectName')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') document.getElementById('btnConfirmSave')?.click();
        });

        document.getElementById('btnConfirmExport')?.addEventListener('click', () => this.exportSTL());
        document.getElementById('exportFileName')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') this.exportSTL();
        });

        document.getElementById('btnConfirmOk')?.addEventListener('click', () => {
            closeDialog(confirmModal);
            const callback = this.confirmCallback;
            this.confirmCallback = null;
            callback?.();
        });
    }

    bindKeyboard() {
        document.addEventListener('keydown', (event) => {
            const editableTarget = event.target.isContentEditable
                || event.target.matches('textarea, select, input:not([type="range"], [type="checkbox"], [type="radio"], [type="button"])');
            const meta = event.ctrlKey || event.metaKey;
            if (meta && event.key === 's') {
                event.preventDefault();
                this.showSaveModal();
            } else if (meta && event.key === 'o') {
                event.preventDefault();
                this.loadProject();
            } else if (meta && !editableTarget && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                vesselV2State.undo();
            } else if (meta && !editableTarget && (event.key === 'y' || (event.shiftKey && event.key.toLowerCase() === 'z'))) {
                event.preventDefault();
                vesselV2State.redo();
            } else if (event.key === 'Backspace' || event.key === 'Delete') {
                if (!editableTarget) {
                    event.preventDefault();
                    this.profileEditor?.deleteSelectedPoint();
                }
            } else if (event.code === 'Space' && !editableTarget) {
                event.preventDefault();
                this.profileEditor?.setSpacePanning(true);
            } else if (event.key === 'v' && !meta && !editableTarget) {
                this.profileEditor?.setPanMode(false);
                vesselV2State.setState('ui.tool', 'edit', { history: false });
            } else if (event.key === 'p' && !meta && !editableTarget) {
                this.profileEditor?.setPanMode(false);
                vesselV2State.setState('ui.tool', 'pen', { history: false });
            }
        });

        document.addEventListener('keyup', (event) => {
            if (event.code === 'Space') {
                this.profileEditor?.setSpacePanning(false);
            }
        });

        window.addEventListener('blur', () => {
            this.profileEditor?.setSpacePanning(false);
        });
    }

    subscribeToState() {
        vesselV2State.subscribe('*', (state, changedPaths) => {
            this.syncUIFromState(state);
            this.dials?.sync();
            this.editorSettings?.sync();
            this.updateHistoryButtons();

            // A segment picked on the canvas opens its motif dials
            const segmentId = state.ui.selectedSegmentId;
            if (segmentId && segmentId !== this.lastSegmentId) this.dials?.revealMotif();
            this.lastSegmentId = segmentId;

            if (this.shouldRegenerate(changedPaths)) {
                this.scheduleViewportUpdate(state);
            }

            this.updateProjectName();
            this.updateUnsavedIndicator();
        });
    }

    shouldRegenerate(changedPaths) {
        if (!Array.isArray(changedPaths) || changedPaths.includes('*')) return true;
        return changedPaths.some((path) =>
            path.startsWith('profile.') ||
            path.startsWith('global.wallThickness') ||
            path.startsWith('global.radialSegments')
        );
    }

    scheduleViewportUpdate(state, immediate = false) {
        if (!this.viewport) return;
        const runUpdate = () => {
            this.pendingViewportUpdate = null;
            this.viewport.state = state;
            this.viewport.updateVessel();
        };

        if (immediate) {
            clearTimeout(this.pendingViewportUpdate);
            runUpdate();
            return;
        }

        clearTimeout(this.pendingViewportUpdate);
        this.pendingViewportUpdate = setTimeout(runUpdate, this.viewportUpdateDelayMs);
    }

    syncUIFromState(state) {
        document.querySelectorAll('[data-tool]').forEach((button) => {
            button.classList.toggle('active', button.dataset.tool === state.ui.tool);
        });

        const dimensions = this.calculateDimensions(state);
        document.getElementById('profileHeight').textContent = `${Math.round(dimensions.height)} mm`;
        document.getElementById('profileDiameter').textContent = `${Math.round(dimensions.maxRadius * 2)} mm`;
        document.getElementById('profilePointCount').textContent = String(state.profile.points.length);
    }

    calculateDimensions(state) {
        const points = state.profile.points || [];
        return {
            height: Math.max(0, ...points.map((point) => Number(point.h) || 0)),
            maxRadius: Math.max(0, ...points.map((point) => Number(point.r) || 0))
        };
    }

    updateAll() {
        const state = vesselV2State.getState();
        this.scheduleViewportUpdate(state, true);
        this.syncUIFromState(state);
        this.dials?.sync();
        this.editorSettings?.sync();
        this.updateHistoryButtons();
        this.updateProjectName();
        this.updateUnsavedIndicator();
    }

    loadProjectById(projectId) {
        if (!VesselV2Storage.loadFromProjectStorage(projectId)) {
            console.warn('Failed to load Vessel V2 project:', projectId);
        }
    }

    newProject() {
        const create = () => {
            vesselV2State.reset();
            const url = new URL(window.location);
            url.searchParams.delete('project');
            window.history.replaceState({}, '', url);
            this.updateAll();
            this.setStatus('New project created');
        };

        if (vesselV2State.getState('project.isDirty')) {
            this.showConfirmModal('New Project', 'You have unsaved changes. Create new project anyway?', create);
        } else {
            create();
        }
    }

    async loadProject() {
        const load = async () => {
            try {
                await VesselV2Storage.loadFromFile();
                this.updateAll();
                this.setStatus('Project loaded');
            } catch (error) {
                console.error('Failed to load Vessel V2 project:', error);
                this.setStatus('Failed to load project');
            }
        };

        if (vesselV2State.getState('project.isDirty')) {
            this.showConfirmModal('Load Project', 'You have unsaved changes. Load a different project anyway?', load);
        } else {
            load();
        }
    }

    showSaveModal() {
        const modal = document.getElementById('saveModal');
        const nameInput = document.getElementById('saveProjectName');
        if (nameInput) {
            nameInput.value = vesselV2State.getState('project.name') || 'Vessel V2';
        }
        openDialog(modal, { initialFocus: '#saveProjectName' });
        requestAnimationFrame(() => nameInput?.select());
    }

    saveProject(name, downloadFile = false) {
        const thumbnail = this.viewport ? this.viewport.captureThumbnail() : null;
        VesselV2Storage.saveToProjectStorage(name, thumbnail);
        vesselV2State.setState('project.name', name, { silent: true, history: false });
        if (downloadFile) {
            VesselV2Storage.saveToFile(name);
        }
        this.updateProjectName();
        this.updateUnsavedIndicator();
        this.setStatus('Project saved');
    }

    showExportModal() {
        const modal = document.getElementById('exportModal');
        const nameInput = document.getElementById('exportFileName');
        const state = vesselV2State.getState();
        const dimensions = this.calculateDimensions(state);
        if (nameInput) nameInput.value = state.project.name || 'Vessel V2';
        document.getElementById('exportSummary').textContent =
            `${Math.round(dimensions.maxRadius * 2)} × ${Math.round(dimensions.height)} mm · ${state.global.wallThickness} mm wall`;
        this.setExportError('');
        openDialog(modal, { initialFocus: '#exportFileName' });
    }

    setExportError(message) {
        const errorEl = document.getElementById('exportError');
        if (!errorEl) return;
        errorEl.textContent = message;
        errorEl.hidden = !message;
    }

    async exportSTL() {
        const validation = validateVesselV2Profile(vesselV2State.getState());
        if (!validation.valid) {
            this.setStatus('Export blocked');
            this.setExportError(`Export blocked: ${validation.errors.join(' ')}`);
            return;
        }

        const fileName = document.getElementById('exportFileName')?.value.trim()
            || vesselV2State.getState('project.name') || 'Vessel V2';
        const exportGroup = new VesselV2MeshGenerator(vesselV2State.getState()).generate();

        try {
            const { VesselSTLExporter } = await loadVesselExporter();
            await VesselSTLExporter.exportBinary(exportGroup, `${fileName.replace(/\.stl$/i, '')}.stl`, {
                trackOrientationConflicts: false
            });
            closeDialog(document.getElementById('exportModal'));
            this.setStatus('STL exported');
        } catch (error) {
            console.error('Vessel V2 STL export failed:', error);
            this.setStatus('Export blocked');
            this.setExportError(`Export blocked by mesh validation: ${error.message}`);
        } finally {
            this.viewport?.disposeObject(exportGroup, { disposeMaterial: false });
        }
    }

    showConfirmModal(title, message, onConfirm) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        this.confirmCallback = onConfirm;
        openDialog(document.getElementById('confirmModal'));
    }

    updateProjectName() {
        const nameEl = document.getElementById('projectName');
        if (nameEl && document.activeElement !== nameEl) {
            nameEl.textContent = vesselV2State.getState('project.name') || 'Untitled Vessel V2';
        }
    }

    updateUnsavedIndicator() {
        const indicator = document.getElementById('unsavedIndicator');
        if (indicator) {
            indicator.hidden = !vesselV2State.getState('project.isDirty');
        }
    }

    setStatus(message) {
        const statusEl = document.getElementById('statusInfo');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    dispose() {
        clearInterval(this.autosaveInterval);
        clearTimeout(this.pendingViewportUpdate);
        this.profileEditor?.dispose();
        this.motifInspector?.dispose();
        this.viewport?.dispose();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.vesselV2App = new VesselV2App();
});

export default VesselV2App;
