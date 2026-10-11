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
import { MotifInspector } from './ui/motifInspector.js';
import { SpoutInspector } from './ui/spoutInspector.js';
import { LidInspector } from './ui/lidInspector.js';
import { VesselViewport } from '../vessel/ui/vesselViewport.js';
import { init as initThemeManager } from '../ui/themeManager.js';

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
        this.motifInspector = new MotifInspector();
        this.spoutInspector = new SpoutInspector();
        this.lidInspector = new LidInspector();
        this.bindHeaderButtons();
        this.bindToolButtons();
        this.bindGlobalControls();
        this.bindViewControls();
        this.bindModals();
        this.bindKeyboard();
        this.subscribeToState();

        this.autosaveInterval = VesselV3Storage.setupAutosave(30000);
        this.updateAll();
        this.setStatus('Ready');
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

    bindHeaderButtons() {
        document.getElementById('btnNewProject')?.addEventListener('click', () => this.newProject());
        document.getElementById('btnLoadProject')?.addEventListener('click', () => this.loadProject());
        document.getElementById('btnSaveProject')?.addEventListener('click', () => this.showSaveModal());
        document.getElementById('btnExportSTL')?.addEventListener('click', () => this.exportSTL());
        document.getElementById('btnExportLidSTL')?.addEventListener('click', () => this.exportLidSTL());
    }

    bindToolButtons() {
        document.querySelectorAll('[data-tool]').forEach((button) => {
            button.addEventListener('click', () => {
                this.profileEditor?.setPanMode(false);
                vesselV3State.setState('ui.tool', button.dataset.tool, { history: false });
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
            if (vesselV3State.undo()) this.setStatus('Undone');
        });

        document.getElementById('btnRedo')?.addEventListener('click', () => {
            if (vesselV3State.redo()) this.setStatus('Redone');
        });

        document.getElementById('btnDeletePoint')?.addEventListener('click', () => {
            this.profileEditor?.deleteSelectedPoint();
        });
    }

    bindGlobalControls() {
        this.bindNumberControl('wallThickness', 'global.wallThickness');
        this.bindNumberControl('snapSize', 'global.snapSize');
        this.bindNumberControl('radialSegments', 'global.radialSegments');
        this.bindGridStepButton('btnGridSmaller', -1);
        this.bindGridStepButton('btnGridLarger', 1);
        this.bindProfileModeButtons();
        this.bindCornerRadiusControl();

        document.getElementById('snapToggle')?.addEventListener('change', (event) => {
            vesselV3State.setState('global.snapEnabled', event.target.checked, { history: false });
        });

        document.getElementById('footerOverlapToggle')?.addEventListener('change', (event) => {
            vesselV3State.setState('profile.allowFooterOverlap', event.target.checked);
            vesselV3State.setProfilePoints(vesselV3State.getState('profile.points'));
            this.setStatus(event.target.checked ? 'Footer overlap on' : 'Footer overlap off');
        });
    }

    bindNumberControl(id, path) {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('input', () => {
            let value = Number(input.value);
            if (Number.isFinite(value)) {
                const min = Number(input.min);
                const max = Number(input.max);
                if (Number.isFinite(min)) value = Math.max(min, value);
                if (Number.isFinite(max)) value = Math.min(max, value);
                if (input.step && !String(input.step).includes('.')) value = Math.round(value);
                input.value = value;
                vesselV3State.setState(path, value, { history: false });
            }
        });
    }

    bindGridStepButton(id, direction) {
        const button = document.getElementById(id);
        const input = document.getElementById('snapSize');
        if (!button || !input) return;

        button.addEventListener('click', () => {
            const step = Number(input.step) || 1;
            const min = Number(input.min) || 1;
            const max = Number(input.max) || 50;
            const current = Number(vesselV3State.getState('global.snapSize')) || 5;
            const next = Math.max(min, Math.min(max, current + direction * step));
            vesselV3State.setState('global.snapSize', next, { history: false });
            this.setStatus(`Grid ${next} mm`);
        });
    }

    bindProfileModeButtons() {
        document.querySelectorAll('[data-profile-mode]').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.profileMode === 'straight-rounded'
                    ? 'straight-rounded'
                    : 'bezier';
                vesselV3State.setState('profile.mode', mode);
                vesselV3State.setState('ui.selectedHandle', null, { history: false });
                this.setStatus(mode === 'straight-rounded' ? 'Straight mode' : 'Bezier mode');
            });
        });
    }

    bindCornerRadiusControl() {
        const input = document.getElementById('cornerRadius');
        if (!input) return;

        input.addEventListener('input', () => {
            const selectedId = vesselV3State.getState('ui.selectedPointId');
            if (!selectedId) return;

            const min = Number(input.min) || 0;
            const max = Number(input.max) || 80;
            const value = Math.max(min, Math.min(max, Number(input.value) || 0));
            const points = vesselV3State.getState('profile.points').map((point) => ({ ...point }));
            const index = points.findIndex((point) => point.id === selectedId);
            if (index < 0) return;

            points[index] = {
                ...points[index],
                cornerRadius: value
            };
            input.value = value;
            vesselV3State.setProfilePoints(points);
        });
    }

    bindViewControls() {
        const viewMenuContainer = document.getElementById('viewMenuContainer');
        document.getElementById('btnViewMenu')?.addEventListener('click', (event) => {
            event.stopPropagation();
            viewMenuContainer?.classList.toggle('open');
        });

        document.addEventListener('click', (event) => {
            if (!viewMenuContainer?.contains(event.target)) {
                viewMenuContainer?.classList.remove('open');
            }
        });

        document.querySelectorAll('[data-view]').forEach((button) => {
            button.addEventListener('click', () => {
                const view = button.dataset.view;
                this.viewport?.setCameraPreset(view);
                document.querySelectorAll('[data-view]').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
            });
        });

        document.getElementById('btnToggleCrossSection')?.addEventListener('click', () => {
            const toggle = document.getElementById('crossSectionToggle');
            toggle?.classList.toggle('active');
            this.viewport?.toggleCrossSection(toggle?.classList.contains('active'));
        });

        document.getElementById('btnToggleGrid')?.addEventListener('click', () => {
            const toggle = document.getElementById('gridToggle');
            toggle?.classList.toggle('active');
            this.viewport?.toggleGrid(toggle?.classList.contains('active'));
        });
    }

    bindModals() {
        const saveModal = document.getElementById('saveModal');
        document.getElementById('btnCloseSaveModal')?.addEventListener('click', () => {
            saveModal.style.display = 'none';
        });
        document.getElementById('btnCancelSave')?.addEventListener('click', () => {
            saveModal.style.display = 'none';
        });
        document.getElementById('btnConfirmSave')?.addEventListener('click', () => {
            const name = document.getElementById('saveProjectName')?.value || 'Vessel V3';
            const downloadFile = document.getElementById('saveAsFile')?.checked || false;
            this.saveProject(name, downloadFile);
            saveModal.style.display = 'none';
        });
        saveModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
            saveModal.style.display = 'none';
        });

        const confirmModal = document.getElementById('confirmModal');
        document.getElementById('btnCloseConfirmModal')?.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });
        document.getElementById('btnConfirmCancel')?.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });
        confirmModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
            confirmModal.style.display = 'none';
        });
    }

    bindKeyboard() {
        document.addEventListener('keydown', (event) => {
            const editableTarget = event.target.matches('input, textarea');
            const meta = event.ctrlKey || event.metaKey;
            if (meta && event.key === 's') {
                event.preventDefault();
                this.showSaveModal();
            } else if (meta && event.key === 'o') {
                event.preventDefault();
                this.loadProject();
            } else if (meta && event.key === 'z' && !event.shiftKey) {
                event.preventDefault();
                vesselV3State.undo();
            } else if ((meta && event.key === 'y') || (meta && event.shiftKey && event.key === 'Z')) {
                event.preventDefault();
                vesselV3State.redo();
            } else if (event.key === 'Backspace' || event.key === 'Delete') {
                if (!editableTarget) {
                    event.preventDefault();
                    this.profileEditor?.deleteSelectedPoint();
                }
            } else if (event.code === 'Space' && !editableTarget) {
                event.preventDefault();
                this.profileEditor?.setSpacePanning(true);
            } else if (event.key === 'v') {
                this.profileEditor?.setPanMode(false);
                vesselV3State.setState('ui.tool', 'edit', { history: false });
            } else if (event.key === 'p') {
                this.profileEditor?.setPanMode(false);
                vesselV3State.setState('ui.tool', 'pen', { history: false });
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
            button.classList.toggle('active', button.dataset.tool === state.ui.tool);
        });

        this.syncInputValue('wallThickness', state.global.wallThickness);
        this.syncInputValue('snapSize', state.global.snapSize);
        this.syncInputValue('radialSegments', state.global.radialSegments);
        this.syncProfileMode(state);
        this.syncCornerRadiusControl(state);

        const snapToggle = document.getElementById('snapToggle');
        if (snapToggle) snapToggle.checked = state.global.snapEnabled;

        const footerOverlapToggle = document.getElementById('footerOverlapToggle');
        if (footerOverlapToggle) footerOverlapToggle.checked = state.profile.allowFooterOverlap === true;

        const dimensions = this.calculateDimensions(state);
        document.getElementById('profileHeight').textContent = `${Math.round(dimensions.height)} mm`;
        document.getElementById('profileDiameter').textContent = `${Math.round(dimensions.maxRadius * 2)} mm`;
        document.getElementById('profilePointCount').textContent = String(state.profile.points.length);

        const exportLidButton = document.getElementById('btnExportLidSTL');
        if (exportLidButton) {
            exportLidButton.hidden = state.lid?.enabled !== true;
        }
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

    syncProfileMode(state) {
        const mode = state.profile.mode === 'straight-rounded' ? 'straight-rounded' : 'bezier';
        document.querySelectorAll('[data-profile-mode]').forEach((button) => {
            button.classList.toggle('active', button.dataset.profileMode === mode);
        });
    }

    syncCornerRadiusControl(state) {
        const control = document.getElementById('cornerRadiusControl');
        const input = document.getElementById('cornerRadius');
        if (!control || !input) return;

        const straightMode = state.profile.mode === 'straight-rounded';
        control.hidden = !straightMode;

        const selected = state.profile.points.find((point) => point.id === state.ui.selectedPointId);
        input.disabled = !straightMode || !selected || selected.locked;
        if (document.activeElement !== input) {
            input.value = selected ? Number(selected.cornerRadius || 0) : 0;
        }
    }

    syncInputValue(id, value) {
        const input = document.getElementById(id);
        if (input && document.activeElement !== input) {
            input.value = value;
        }
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
            this.setStatus('New project created');
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
                this.setStatus('Project loaded');
            } catch (error) {
                console.error('Failed to load Vessel V3 project:', error);
                this.setStatus('Failed to load project');
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
        modal.style.display = 'flex';
        nameInput?.focus();
        nameInput?.select();
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
        this.setStatus('Project saved');
    }

    async exportSTL() {
        const validation = validateVesselV3Profile(vesselV3State.getState());
        if (!validation.valid) {
            const message = validation.errors.join('\n');
            this.setStatus('Export blocked');
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
            this.setStatus('STL exported');
        } catch (error) {
            console.error('Vessel V3 STL export failed:', error);
            this.setStatus('Export blocked');
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
        if (!state.lid?.enabled) {
            this.setStatus('Lid is not enabled');
            return;
        }

        const neckContext = deriveVesselNeckContext(state);
        if (!neckContext) {
            this.setStatus('Export blocked');
            alert('Export blocked: fix the vessel profile before exporting the lid.');
            return;
        }

        const exportGroup = buildLidGeometry(neckContext, state.lid);
        if (!exportGroup) {
            this.setStatus('Export blocked');
            alert('Export blocked: could not build lid geometry from the current settings.');
            return;
        }

        const projectName = state.project?.name || 'Vessel V3';

        try {
            const { VesselSTLExporter } = await loadVesselExporter();
            await VesselSTLExporter.exportBinary(exportGroup, `${projectName} - Lid.stl`, {
                trackOrientationConflicts: false
            });
            this.setStatus('Lid STL exported');
        } catch (error) {
            console.error('Vessel V3 lid STL export failed:', error);
            this.setStatus('Export blocked');
            alert(`Export blocked by mesh validation: ${error.message}`);
        } finally {
            this.viewport?.disposeObject(exportGroup, { disposeMaterial: false });
        }
    }

    showConfirmModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const okButton = document.getElementById('btnConfirmOk');
        const nextOkButton = okButton.cloneNode(true);
        okButton.parentNode.replaceChild(nextOkButton, okButton);
        nextOkButton.addEventListener('click', () => {
            modal.style.display = 'none';
            onConfirm();
        });
        modal.style.display = 'flex';
    }

    updateProjectName() {
        const nameEl = document.getElementById('projectName');
        if (nameEl) {
            nameEl.textContent = vesselV3State.getState('project.name') || 'Untitled Vessel V3';
        }
    }

    updateUnsavedIndicator() {
        const indicator = document.getElementById('unsavedIndicator');
        if (indicator) {
            indicator.style.display = vesselV3State.getState('project.isDirty') ? 'inline' : 'none';
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
        this.spoutInspector?.dispose();
        this.lidInspector?.dispose();
        this.viewport?.dispose();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.vesselV3App = new VesselV3App();
});

export default VesselV3App;
