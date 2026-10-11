/**
 * Vessel Designer V3 - Main Entry Point
 */

import * as THREE from 'three';
import vesselV3State from './state/vesselV3State.js';
import { VesselV3MeshGenerator } from './geometry/vesselV3MeshGenerator.js';
import { validateVesselV3Profile } from './geometry/profileSampler.js';
import { buildLidGeometry, deriveVesselNeckContext } from './geometry/lidGenerator.js';
import { VesselV3Storage } from './vesselV3Storage.js';
import { ProfileEditor } from './ui/profileEditor.js';
import { MotifPreview } from './ui/motifPreview.js';
import { VesselViewport } from '../vessel/ui/vesselViewport.js';
import { init as initThemeManager } from '../ui/themeManager.js';
import { openDialog, closeDialog } from '../ui/accessibility.js';
import { initDkMenu, initPanelToggle } from '../ui/dialkit/dkChrome.js';
import { getDefaultMotif } from '../geometry/surfacePatternOptions.js';

let vesselExporterPromise = null;

function loadVesselExporter() {
    if (!vesselExporterPromise) {
        vesselExporterPromise = import('../vessel/geometry/vesselSTLExporter.js');
    }
    return vesselExporterPromise;
}

class VesselV3App {
    constructor() {
        this.viewport = null;
        this.profileEditor = null;
        this.autosaveInterval = null;
        this.pendingViewportUpdate = null;
        this.viewportUpdateDelayMs = 40;
        this.init();
    }

    async init() {
        initThemeManager();

        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');

        if (projectId) {
            this.loadProjectById(projectId);
        } else if (VesselV3Storage.hasAutosave()) {
            VesselV3Storage.loadFromLocalStorage();
        }

        this.initViewport();
        this.initProfileEditor();
        await this.initDials();
        this.motifPreview = new MotifPreview(document.getElementById('motifStrip'),
            () => this.dials.activeSegmentId());
        this.bindHeaderButtons();
        this.bindProjectNameEditing();
        this.bindToolButtons();
        this.bindModals();
        this.bindKeyboard();
        this.subscribeToState();
        this.initHeaderChrome();

        this.autosaveInterval = VesselV3Storage.setupAutosave(30000);
        this.updateAll();
    }

    initViewport() {
        const container = document.getElementById('viewport');
        if (!container) return;
        try {
            this.viewport = new VesselViewport(container, vesselV3State.getState(), {
                MeshGenerator: VesselV3MeshGenerator
            });
        } catch (error) {
            // A viewport/WebGL failure must not take down the profile editor and
            // motif inspector — degrade gracefully to a 2D-editing experience.
            this.viewport = null;
            console.warn('Vessel V3 viewport unavailable (WebGL?):', error);
        }
    }

    initProfileEditor() {
        const container = document.getElementById('profileEditor');
        if (!container) return;
        this.profileEditor = new ProfileEditor(container);
    }

    /**
     * DialKit parameter panels (scripts/ui/dialkit/vesselV3Dials.js). Edits go
     * through vesselV3State; profile edits made during a slider drag skip
     * history and commit as one undo step on release.
     */
    async initDials() {
        // Loaded on demand: the DialKit host imports CSS, and Node gates import this module
        this.dialsModule = await import('../ui/dialkit/vesselV3Dials.js');
        const { initVesselV3Dials } = this.dialsModule;
        this.dials = initVesselV3Dials({
            container: document.getElementById('parameterPanel'),
            setGlobal: (param, value) => vesselV3State.setState(`global.${param}`, value, { history: false }),
            setProfileMode: (mode) => {
                vesselV3State.setState('profile.mode', mode);
                vesselV3State.setState('ui.selectedHandle', null, { history: false });
            },
            setCornerRadius: (value, { interactive }) => {
                const selectedId = vesselV3State.getState('ui.selectedPointId');
                this.updatePoints((points) => {
                    const point = points.find((entry) => entry.id === selectedId);
                    if (point && !point.locked) point.cornerRadius = value;
                }, { interactive });
            },
            setFooterOverlap: (enabled) => {
                vesselV3State.setState('profile.allowFooterOverlap', enabled);
                vesselV3State.setProfilePoints(vesselV3State.getState('profile.points'));
            },
            selectSegment: (segmentId) => {
                vesselV3State.setState('ui.selectedPointId', null, { history: false });
                vesselV3State.setState('ui.selectedHandle', null, { history: false });
                vesselV3State.setState('ui.selectedSegmentId', segmentId, { history: false });
            },
            setMotif: (segmentId, patch, { interactive }) => {
                this.updatePoints((points) => {
                    const point = points.find((entry) => entry.id === segmentId);
                    if (point) point.motif = { ...(point.motif || getDefaultMotif()), ...patch };
                }, { interactive });
            },
            copyMotifToAdjacent: (segmentId) => this.copyMotif(segmentId, 'adjacent'),
            applyMotifToAll: (segmentId) => this.copyMotif(segmentId, 'all'),
            setSpout: (patch) => vesselV3State.setSpout(patch, { history: false }),
            setLid: (patch) => vesselV3State.setLid(patch, { history: false }),
            setLidPreviewMode: (mode) => vesselV3State.setState('ui.lidPreviewMode', mode, { history: false }),
            setCamera: (preset) => this.viewport?.setCameraPreset(preset),
            resetView: () => this.viewport?.resetCamera(),
            setCrossSection: (enabled) => this.viewport?.toggleCrossSection(enabled),
            setGrid: (visible) => this.viewport?.toggleGrid(visible),
            onGestureStart: () => {},
            onGestureEnd: (changed) => {
                if (!changed) return;
                vesselV3State.commitHistory();
                this.updateHistoryButtons();
            }
        });
    }

    /** Apply `mutate` to a copy of the profile points and store the result. */
    updatePoints(mutate, { interactive = false } = {}) {
        const points = vesselV3State.getState('profile.points').map((point) => ({
            ...point,
            motif: point.motif ? { ...point.motif } : point.motif
        }));
        mutate(points);
        vesselV3State.setProfilePoints(points, { history: !interactive });
    }

    /** Copy one segment's motif to its wall neighbours or to every wall segment. */
    copyMotif(segmentId, scope) {
        const segments = this.dialsModule.wallSegments();
        const position = segments.findIndex((segment) => segment.id === segmentId);
        if (position < 0) return;
        const targets = scope === 'all'
            ? segments
            : segments.filter((segment) => Math.abs(segment.index - segments[position].index) === 1);
        const motif = vesselV3State.getState('profile.points')[segments[position].index].motif;
        this.updatePoints((points) => {
            targets.forEach(({ index }) => {
                points[index].motif = { ...getDefaultMotif(), ...motif };
            });
        });
    }

    initHeaderChrome() {
        initPanelToggle(document.getElementById('btnTogglePanel'), 'vessel_v3_dials_visible');
        initDkMenu(document.getElementById('fileMenu'));
    }

    bindHeaderButtons() {
        document.getElementById('btnNewProject')?.addEventListener('click', () => this.newProject());
        document.getElementById('btnLoadProject')?.addEventListener('click', () => this.loadProject());
        document.getElementById('btnSaveProject')?.addEventListener('click', () => this.showSaveModal());
        document.getElementById('btnExportSTL')?.addEventListener('click', () => this.exportSTL());
        document.getElementById('btnExportLidSTL')?.addEventListener('click', () => this.exportLidSTL());
        document.getElementById('btnUndo')?.addEventListener('click', () => vesselV3State.undo());
        document.getElementById('btnRedo')?.addEventListener('click', () => vesselV3State.redo());
    }

    /**
     * The header title renames in place: commits on blur/Enter through the
     * normal save path, Escape restores the previous name.
     */
    bindProjectNameEditing() {
        const nameEl = document.getElementById('projectName');
        if (!nameEl) return;
        let originalName = '';
        let cancelEdit = false;

        nameEl.addEventListener('focus', () => {
            originalName = vesselV3State.getState('project.name') || 'Untitled Vessel V3';
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
            if (!cancelEdit && nextName !== vesselV3State.getState('project.name')) {
                this.saveProject(nextName, false);
            }
        });
    }

    bindToolButtons() {
        document.querySelectorAll('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => {
                this.profileEditor?.setPanMode(false);
                vesselV3State.setState('ui.tool', button.dataset.tool, { history: false });
            });
        });

        document.getElementById('btnProfileZoomOut')?.addEventListener('click', () => this.profileEditor?.zoomOut());
        document.getElementById('btnProfileZoomIn')?.addEventListener('click', () => this.profileEditor?.zoomIn());
        document.getElementById('btnProfileFit')?.addEventListener('click', () => this.profileEditor?.fitView());
        document.getElementById('btnProfilePan')?.addEventListener('click', () => this.profileEditor?.togglePanMode());

        document.getElementById('btnDeletePoint')?.addEventListener('click', () => {
            this.profileEditor?.deleteSelectedPoint();
        });
    }

    bindModals() {
        const saveModal = document.getElementById('saveModal');
        const confirmModal = document.getElementById('confirmModal');
        ['btnCloseSaveModal', 'btnCancelSave'].forEach((id) => {
            document.getElementById(id)?.addEventListener('click', () => closeDialog(saveModal));
        });
        document.getElementById('btnConfirmSave')?.addEventListener('click', () => {
            const name = document.getElementById('saveProjectName')?.value.trim() || 'Vessel V3';
            const downloadFile = document.getElementById('saveAsFile')?.checked || false;
            closeDialog(saveModal);
            this.saveProject(name, downloadFile);
        });
        document.getElementById('saveProjectName')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') document.getElementById('btnConfirmSave')?.click();
        });

        ['btnCloseConfirmModal', 'btnConfirmCancel'].forEach((id) => {
            document.getElementById(id)?.addEventListener('click', () => closeDialog(confirmModal));
        });
        document.getElementById('btnConfirmOk')?.addEventListener('click', () => {
            const onConfirm = this.confirmCallback;
            this.confirmCallback = null;
            closeDialog(confirmModal);
            onConfirm?.();
        });

        [saveModal, confirmModal].forEach((modal) => {
            modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => closeDialog(modal));
        });
    }

    bindKeyboard() {
        document.addEventListener('keydown', (event) => {
            const target = event.target;
            const typing = target.isContentEditable || target.matches('input, textarea, select');
            // Canvas shortcuts stay out of the dials, dialogs and header buttons
            const inControls = typing || Boolean(target.closest('#parameterPanel, .modal, button, a, [role="slider"]'));
            const meta = event.ctrlKey || event.metaKey;
            const key = event.key.toLowerCase();
            if (meta && key === 's') {
                event.preventDefault();
                this.showSaveModal();
            } else if (meta && key === 'o') {
                event.preventDefault();
                this.loadProject();
            } else if (meta && !typing && key === 'z') {
                event.preventDefault();
                if (event.shiftKey) vesselV3State.redo();
                else vesselV3State.undo();
            } else if (meta && !typing && key === 'y') {
                event.preventDefault();
                vesselV3State.redo();
            } else if (meta || event.altKey || inControls) {
                // Leave everything else to the focused control
            } else if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
                this.profileEditor?.deleteSelectedPoint();
            } else if (event.code === 'Space') {
                event.preventDefault();
                this.profileEditor?.setSpacePanning(true);
            } else if (key === 'v' || key === 'p') {
                this.profileEditor?.setPanMode(false);
                vesselV3State.setState('ui.tool', key === 'v' ? 'edit' : 'pen', { history: false });
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
        vesselV3State.subscribe('*', (state, changedPaths) => {
            this.syncUIFromState(state);

            if (this.shouldRegenerate(changedPaths)) {
                this.scheduleViewportUpdate(state, false, changedPaths);
            }

            this.updateProjectName();
            this.updateUnsavedIndicator();
        });
    }

    shouldRegenerate(changedPaths) {
        return Object.values(this.getViewportChanges(changedPaths)).some(Boolean);
    }

    getViewportChanges(changedPaths) {
        if (!Array.isArray(changedPaths) || changedPaths.includes('*')) {
            return { body: true, lid: true, lidView: true };
        }
        const has = (prefix) => changedPaths.some((path) => path === prefix || path.startsWith(`${prefix}.`));
        const profile = has('profile') || has('global.wallThickness') || has('global.radialSegments') || changedPaths.includes('global');
        return {
            body: profile || has('spout'),
            lid: profile || has('lid'),
            lidView: has('ui.lidPreviewMode')
        };
    }

    scheduleViewportUpdate(state, immediate = false, changedPaths = ['*']) {
        if (!this.viewport) return;
        const changes = this.getViewportChanges(changedPaths);
        const pending = this.pendingViewportChanges || {};
        this.pendingViewportChanges = {
            body: pending.body || changes.body,
            lid: pending.lid || changes.lid,
            lidView: pending.lidView || changes.lidView
        };
        this.pendingViewportState = state;
        const runUpdate = () => {
            this.pendingViewportUpdate = null;
            const nextState = this.pendingViewportState;
            const dirty = this.pendingViewportChanges;
            this.pendingViewportState = null;
            this.pendingViewportChanges = null;
            this.viewport.state = nextState;
            if (dirty.body) this.viewport.updateVessel();
            if (dirty.lid) this.updateLid(nextState);
            else if (dirty.lidView) this.updateLidView(nextState);
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
            const active = button.dataset.tool === state.ui.tool;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });

        const dimensions = this.calculateDimensions(state);
        document.getElementById('profileHeight').textContent = `${Math.round(dimensions.height)} mm`;
        document.getElementById('profileDiameter').textContent = `${Math.round(dimensions.maxRadius * 2)} mm`;
        document.getElementById('profilePointCount').textContent = String(state.profile.points.length);

        // Hidden menu items also leave the menu's arrow-key order
        const exportLidButton = document.getElementById('btnExportLidSTL');
        if (exportLidButton) {
            const lidEnabled = state.lid?.enabled === true;
            exportLidButton.hidden = !lidEnabled;
            if (lidEnabled) exportLidButton.setAttribute('role', 'menuitem');
            else exportLidButton.removeAttribute('role');
        }

        this.updateHistoryButtons();
        this.dials?.sync();
        this.motifPreview?.update();
    }

    updateHistoryButtons() {
        const undo = document.getElementById('btnUndo');
        const redo = document.getElementById('btnRedo');
        if (undo) undo.disabled = vesselV3State.historyIndex <= 0;
        if (redo) redo.disabled = vesselV3State.historyIndex >= vesselV3State.history.length - 1;
    }

    /**
     * Build (or clear) the lid as a SEPARATE object in the shared viewport —
     * never merged into the vessel body mesh (Phase 3, see
     * VESSEL_V3_SPOUT_HANDLE_LID_PLAN.md section 4). Reads the vessel's own
     * neck/rim radius via lidGenerator.deriveVesselNeckContext() so the lid
     * is always sized off the vessel's current profile.
     */
    updateLid(state) {
        if (!this.viewport) return;

        if (!state.lid?.enabled) {
            this.viewport.clearSecondaryMesh('lid');
            return;
        }

        const neckContext = deriveVesselNeckContext(state);
        const lidGroup = neckContext ? buildLidGeometry(neckContext, state.lid) : null;
        if (!lidGroup) {
            this.viewport.clearSecondaryMesh('lid');
            return;
        }

        lidGroup.userData.neckContext = neckContext;
        this.applyLidView(lidGroup, state);
        this.viewport.setSecondaryMesh('lid', lidGroup);
    }

    updateLidView(state) {
        const lidGroup = this.viewport?.getSecondaryMesh('lid');
        if (!lidGroup) return;
        this.applyLidView(lidGroup, state);
        this.viewport.requestRender();
    }

    applyLidView(lidGroup, state) {
        const neckContext = lidGroup.userData.neckContext;
        const seated = (state.ui?.lidPreviewMode || 'seated') !== 'standalone';
        const material = seated ? this.getLidGhostMaterial() : this.getLidSolidMaterial();
        lidGroup.traverse((child) => {
            if (child.isMesh) child.material = material;
        });

        // The inset seat is flangeDepth above the local skirt bottom.
        const seatOffset = state.lid.fit === 'inset' ? state.lid.flangeDepth : 0;
        lidGroup.position.set(0, seated ? neckContext.rimHeight - seatOffset : 0, 0);
    }

    /** Ghost/translucent preview material — lid shown seated on the vessel. */
    getLidGhostMaterial() {
        if (!this._lidGhostMaterial) {
            this._lidGhostMaterial = new THREE.MeshStandardMaterial({
                color: 0x4ECDC4,
                roughness: 0.4,
                metalness: 0.0,
                transparent: true,
                opacity: 0.45,
                depthWrite: false,
                side: THREE.DoubleSide
            });
        }
        return this._lidGhostMaterial;
    }

    /** Opaque material — standalone view, for inspecting the export candidate. */
    getLidSolidMaterial() {
        if (!this._lidSolidMaterial) {
            this._lidSolidMaterial = new THREE.MeshStandardMaterial({
                color: 0xE8E0D5,
                roughness: 0.7,
                metalness: 0.0,
                side: THREE.DoubleSide
            });
        }
        return this._lidSolidMaterial;
    }

    calculateDimensions(state) {
        const points = state.profile.points || [];
        return {
            height: Math.max(0, ...points.map((point) => Number(point.h) || 0)),
            maxRadius: Math.max(0, ...points.map((point) => Number(point.r) || 0))
        };
    }

    updateAll() {
        const state = vesselV3State.getState();
        this.scheduleViewportUpdate(state, true);
        this.syncUIFromState(state);
        this.updateProjectName();
        this.updateUnsavedIndicator();
    }

    loadProjectById(projectId) {
        if (!VesselV3Storage.loadFromProjectStorage(projectId)) {
            console.warn('Failed to load Vessel V3 project:', projectId);
        }
    }

    newProject() {
        const create = () => {
            vesselV3State.reset();
            const url = new URL(window.location);
            url.searchParams.delete('project');
            window.history.replaceState({}, '', url);
            this.updateAll();
        };

        if (vesselV3State.getState('project.isDirty')) {
            this.showConfirmModal('New Project', 'You have unsaved changes. Create new project anyway?', create);
        } else {
            create();
        }
    }

    async loadProject() {
        const load = async () => {
            try {
                await VesselV3Storage.loadFromFile();
                this.updateAll();
            } catch (error) {
                console.error('Failed to load Vessel V3 project:', error);
                alert(`Could not load the project: ${error.message}`);
            }
        };

        if (vesselV3State.getState('project.isDirty')) {
            this.showConfirmModal('Load Project', 'You have unsaved changes. Load a different project anyway?', load);
        } else {
            load();
        }
    }

    showSaveModal() {
        const modal = document.getElementById('saveModal');
        const nameInput = document.getElementById('saveProjectName');
        if (nameInput) {
            nameInput.value = vesselV3State.getState('project.name') || 'Vessel V3';
        }
        openDialog(modal, { initialFocus: '#saveProjectName' });
        requestAnimationFrame(() => nameInput?.select());
    }

    saveProject(name, downloadFile = false) {
        const thumbnail = this.viewport ? this.viewport.captureThumbnail() : null;
        VesselV3Storage.saveToProjectStorage(name, thumbnail);
        vesselV3State.setState('project.name', name, { silent: true, history: false });
        if (downloadFile) {
            VesselV3Storage.saveToFile(name);
        }
        this.updateProjectName();
        this.updateUnsavedIndicator();
    }

    async exportSTL() {
        const validation = validateVesselV3Profile(vesselV3State.getState());
        if (!validation.valid) {
            const message = validation.errors.join('\n');
            alert(`Export blocked:\n${message}`);
            return;
        }

        const projectName = vesselV3State.getState('project.name') || 'Vessel V3';
        const exportGroup = new VesselV3MeshGenerator(vesselV3State.getState()).generate();

        try {
            const { VesselSTLExporter } = await loadVesselExporter();
            await VesselSTLExporter.exportBinary(exportGroup, `${projectName}.stl`, {
                trackOrientationConflicts: false
            });
        } catch (error) {
            console.error('Vessel V3 STL export failed:', error);
            alert(`Export blocked by mesh validation: ${error.message}`);
        } finally {
            this.viewport?.disposeObject(exportGroup, { disposeMaterial: false });
        }
    }

    /**
     * Export the lid as its own independent STL part — reuses
     * VesselSTLExporter (geometry-agnostic: it merges whatever meshes are in
     * the group it's handed) exactly as exportSTL() does for the vessel
     * body, mirroring Cast Form's per-part export pattern.
     */
    async exportLidSTL() {
        const state = vesselV3State.getState();
        if (!state.lid?.enabled) return;

        const neckContext = deriveVesselNeckContext(state);
        if (!neckContext) {
            alert('Export blocked: fix the vessel profile before exporting the lid.');
            return;
        }

        const exportGroup = buildLidGeometry(neckContext, state.lid);
        if (!exportGroup) {
            alert('Export blocked: could not build lid geometry from the current settings.');
            return;
        }

        const projectName = state.project?.name || 'Vessel V3';

        try {
            const { VesselSTLExporter } = await loadVesselExporter();
            await VesselSTLExporter.exportBinary(exportGroup, `${projectName} - Lid.stl`, {
                trackOrientationConflicts: false
            });
        } catch (error) {
            console.error('Vessel V3 lid STL export failed:', error);
            alert(`Export blocked by mesh validation: ${error.message}`);
        } finally {
            this.viewport?.disposeObject(exportGroup, { disposeMaterial: false });
        }
    }

    showConfirmModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        this.confirmCallback = onConfirm;
        openDialog(modal, { initialFocus: '#btnConfirmOk' });
    }

    updateProjectName() {
        const nameEl = document.getElementById('projectName');
        if (nameEl && document.activeElement !== nameEl) {
            nameEl.textContent = vesselV3State.getState('project.name') || 'Untitled Vessel V3';
        }
    }

    updateUnsavedIndicator() {
        const indicator = document.getElementById('unsavedIndicator');
        if (indicator) {
            indicator.hidden = !vesselV3State.getState('project.isDirty');
        }
    }

    dispose() {
        clearInterval(this.autosaveInterval);
        clearTimeout(this.pendingViewportUpdate);
        this.profileEditor?.dispose();
        this.viewport?.dispose();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.vesselV3App = new VesselV3App();
});

export default VesselV3App;
