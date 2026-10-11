/**
 * Vessel Generator - Main Entry Point
 * Initializes and coordinates all components
 */

import vesselState from './state/vesselState.js';
import { VesselViewport } from './ui/vesselViewport.js';
import { VesselMeshGenerator } from './geometry/vesselMeshGenerator.js';
import { VesselStorage } from './vesselStorage.js';
import { init as initThemeManager } from '../ui/themeManager.js';
import { initDiameterLinks, syncLinkedDiameters } from './state/diameterLinks.js';
import { openDialog, closeDialog } from '../ui/accessibility.js';
import { initVesselDials } from '../ui/dialkit/vesselDials.js';
import { initDkMenu, initPanelToggle } from '../ui/dialkit/dkChrome.js';

let vesselExporterPromise = null;

function loadVesselExporter() {
    if (!vesselExporterPromise) {
        vesselExporterPromise = import('./geometry/vesselSTLExporter.js');
    }
    return vesselExporterPromise;
}

class VesselGeneratorApp {
    constructor() {
        this.viewport = null;
        this.dials = null;
        this.statusTimer = null;
        this.autosaveInterval = null;
        this.editingProjectId = null;
        this.pendingViewportUpdate = null;
        this.viewportUpdateDelayMs = 40;

        this.init();
    }

    async init() {
        console.log('Vessel Generator initializing...');

        // Apply the saved theme (mode and typeface)
        initThemeManager();

        // Linked diameters follow every state change, however it is made
        initDiameterLinks(vesselState);

        // Check URL params for project to load
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');

        if (projectId) {
            // Load project from dashboard storage
            this.loadProjectById(projectId);
        } else {
            // Check for autosave for new projects
            await this.checkAutosave();
        }

        // Initialize components
        this.initViewport();
        this.initDials();
        this.initHeaderButtons();
        this.initProjectNameEditing();
        this.initHeaderChrome();
        this.initModals();
        this.initKeyboardShortcuts();

        // Subscribe to state changes
        this.subscribeToState();

        // Setup autosave
        this.autosaveInterval = VesselStorage.setupAutosave(30000);

        // Initial render
        this.updateAll();

        console.log('Vessel Generator ready');
    }

    /**
     * Load a project by ID from dashboard storage
     */
    loadProjectById(projectId) {
        const success = VesselStorage.loadFromProjectStorage(projectId);
        if (success) {
            this.editingProjectId = projectId;
            console.log('Loaded project:', projectId);
        } else {
            console.warn('Failed to load project:', projectId);
            // Fall back to default state
        }
    }

    async checkAutosave() {
        if (VesselStorage.hasAutosave()) {
            const info = VesselStorage.getAutosaveInfo();
            if (info) {
                // Could show a recovery dialog here
                console.log('Autosave found:', info.name, info.lastModified);
            }
        }
    }

    initViewport() {
        const container = document.getElementById('viewport');
        if (!container) {
            console.error('Viewport container not found');
            return;
        }

        this.viewport = new VesselViewport(container, vesselState.getState());
    }

    /**
     * DialKit parameter panels; edits write vessel state, whose subscription
     * regenerates the vessel (see subscribeToState).
     */
    initDials() {
        this.dials = initVesselDials({
            container: document.getElementById('parameterPanel'),
            setParam: (path, value) => vesselState.setState(path, value),
            setLinked: (sectionName, linked) => {
                vesselState.setState(`sections.${sectionName}.bottomDiameterLocked`, linked);
                // Switching a link on copies the bottom diameter downward
                if (linked) syncLinkedDiameters(vesselState, sectionName, 'bottom');
            },
            setCamera: (preset) => this.viewport?.setCameraPreset(preset),
            setCrossSection: (enabled) => this.viewport?.toggleCrossSection(enabled),
            setGrid: (visible) => this.viewport?.toggleGrid(visible)
        });
    }

    initHeaderChrome() {
        this.panelToggle = initPanelToggle(document.getElementById('btnTogglePanel'), 'vessel_dials_visible');
        initDkMenu(document.getElementById('fileMenu'));
    }

    /**
     * Rename the project in place; the new name is saved like Save would.
     */
    initProjectNameEditing() {
        const nameEl = document.getElementById('projectName');
        if (!nameEl) return;
        let originalName = 'Untitled';
        let cancelEdit = false;

        nameEl.addEventListener('focus', () => {
            originalName = vesselState.getState('project.name') || nameEl.textContent.trim() || 'Untitled';
            cancelEdit = false;
            requestAnimationFrame(() => {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(nameEl);
                selection?.removeAllRanges();
                selection?.addRange(range);
            });
        });

        nameEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                nameEl.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                cancelEdit = true;
                nameEl.blur();
            }
        });

        nameEl.addEventListener('blur', () => {
            if (cancelEdit) {
                cancelEdit = false;
                nameEl.textContent = originalName;
                return;
            }
            const nextName = nameEl.textContent.replace(/\s+/g, ' ').trim() || originalName;
            nameEl.textContent = nextName;
            if (nextName !== vesselState.getState('project.name')) {
                this.saveProject(nextName, false);
            }
        });
    }

    initHeaderButtons() {
        // New Project
        document.getElementById('btnNewProject')?.addEventListener('click', () => {
            this.newProject();
        });

        // Load Project
        document.getElementById('btnLoadProject')?.addEventListener('click', () => {
            this.loadProject();
        });

        // Save Project
        document.getElementById('btnSaveProject')?.addEventListener('click', () => {
            this.showSaveModal();
        });

        // Export STL
        document.getElementById('btnExportSTL')?.addEventListener('click', () => {
            this.exportSTL();
        });
    }

    initModals() {
        const saveModal = document.getElementById('saveModal');
        const confirmModal = document.getElementById('confirmModal');

        document.getElementById('btnCloseSaveModal')?.addEventListener('click', () => closeDialog(saveModal));
        document.getElementById('btnCancelSave')?.addEventListener('click', () => closeDialog(saveModal));
        document.getElementById('btnConfirmSave')?.addEventListener('click', () => {
            const name = document.getElementById('saveProjectName')?.value.trim() || 'vessel';
            const downloadFile = document.getElementById('saveAsFile')?.checked || false;
            closeDialog(saveModal);
            this.saveProject(name, downloadFile);
        });
        document.getElementById('saveProjectName')?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') document.getElementById('btnConfirmSave')?.click();
        });

        document.getElementById('btnCloseConfirmModal')?.addEventListener('click', () => closeDialog(confirmModal));
        document.getElementById('btnConfirmCancel')?.addEventListener('click', () => closeDialog(confirmModal));

        // Click backdrop to close
        [saveModal, confirmModal].forEach(modal => {
            modal?.querySelector('.modal-backdrop')?.addEventListener('click', () => closeDialog(modal));
        });
    }

    initKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + S = Save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.showSaveModal();
            }

            // Ctrl/Cmd + O = Load
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                this.loadProject();
            }

            // Ctrl/Cmd + N = New
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                this.newProject();
            }

            // Ctrl/Cmd + E = Export STL
            if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
                e.preventDefault();
                this.exportSTL();
            }
        });
    }

    subscribeToState() {
        vesselState.subscribe('*', (state, changedPaths) => {
            if (this.shouldRegenerateVessel(changedPaths)) {
                this.scheduleViewportUpdate(state);
            }

            // Update unsaved indicator
            this.updateUnsavedIndicator();

            // Dials follow loads, resets and linked-diameter updates
            this.dials?.sync();

            if (changedPaths.some((path) => path === 'project.name')) {
                this.updateProjectName();
            }
        });
    }

    shouldRegenerateVessel(changedPaths) {
        if (!Array.isArray(changedPaths) || changedPaths.length === 0) {
            return false;
        }

        if (changedPaths.includes('*')) {
            return true;
        }

        return changedPaths.some((path) =>
            path.startsWith('sections.') ||
            path.startsWith('global.') ||
            path.startsWith('transitions.')
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
            if (this.pendingViewportUpdate) {
                clearTimeout(this.pendingViewportUpdate);
                this.pendingViewportUpdate = null;
            }
            runUpdate();
            return;
        }

        if (this.pendingViewportUpdate) {
            clearTimeout(this.pendingViewportUpdate);
        }

        this.pendingViewportUpdate = setTimeout(runUpdate, this.viewportUpdateDelayMs);
    }

    updateAll() {
        const state = vesselState.getState();

        this.scheduleViewportUpdate(state, true);

        this.updateProjectName();
        this.updateUnsavedIndicator();
    }

    // Actions
    newProject() {
        const isDirty = vesselState.getState('project.isDirty');

        const doCreate = () => {
            // Clear editing project ID
            this.editingProjectId = null;

            // Reset state
            vesselState.reset();

            // Remove project param from URL
            const url = new URL(window.location);
            url.searchParams.delete('project');
            window.history.replaceState({}, '', url);

            this.updateAll();
            this.setStatus('New project created');
        };

        if (isDirty) {
            this.showConfirmModal(
                'New Project',
                'You have unsaved changes. Create new project anyway?',
                doCreate
            );
        } else {
            doCreate();
        }
    }

    async loadProject() {
        const isDirty = vesselState.getState('project.isDirty');

        const doLoad = async () => {
            try {
                await VesselStorage.loadFromFile();
                this.updateAll();
                this.setStatus('Project loaded');
            } catch (e) {
                console.error('Failed to load project:', e);
                this.setStatus('Failed to load project');
            }
        };

        if (isDirty) {
            this.showConfirmModal(
                'Load Project',
                'You have unsaved changes. Load a different project anyway?',
                doLoad
            );
        } else {
            doLoad();
        }
    }

    showSaveModal() {
        const modal = document.getElementById('saveModal');
        const nameInput = document.getElementById('saveProjectName');

        if (nameInput) {
            nameInput.value = vesselState.getState('project.name') || 'vessel';
        }

        openDialog(modal, { initialFocus: '#saveProjectName' });
        requestAnimationFrame(() => nameInput?.select());
    }

    async exportSTL() {
        if (!this.viewport) {
            this.setStatus('No vessel to export');
            return;
        }

        const projectName = vesselState.getState('project.name') || 'vessel';
        const exportGroup = new VesselMeshGenerator(vesselState.getState()).generate();

        try {
            const { VesselSTLExporter } = await loadVesselExporter();
            await VesselSTLExporter.exportBinary(exportGroup, `${projectName}.stl`);
            this.setStatus('STL exported');
        } catch (error) {
            console.error('STL export blocked:', error);
            this.setStatus('Export blocked: mesh validation failed');
            alert(`Export blocked by mesh validation: ${error.message}`);
        } finally {
            this.viewport.disposeObject(exportGroup, { disposeMaterial: false });
        }
    }

    /**
     * Save project to dashboard storage
     * @param {string} name - Project name
     */
    saveProject(name, downloadFile = false) {
        // Capture thumbnail from viewport
        const thumbnail = this.viewport ? this.viewport.captureThumbnail() : null;

        // Save to project storage
        const saved = VesselStorage.saveToProjectStorage(name, thumbnail);

        // Update the editing project ID
        this.editingProjectId = saved.id;

        // Update UI
        vesselState.setState('project.name', name);
        this.updateProjectName();
        this.updateUnsavedIndicator();

        // Optionally download as file
        if (downloadFile) {
            VesselStorage.saveToFile(name);
        }

        // Show success feedback
        this.setStatus(`Saved “${name}”`);
    }

    showConfirmModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;

        const okBtn = document.getElementById('btnConfirmOk');
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);

        newOkBtn.addEventListener('click', () => {
            closeDialog(modal);
            onConfirm();
        });

        openDialog(modal, { initialFocus: '#btnConfirmOk' });
    }

    updateProjectName() {
        const nameEl = document.getElementById('projectName');
        if (nameEl) {
            nameEl.textContent = vesselState.getState('project.name') || 'Untitled';
        }
    }

    updateUnsavedIndicator() {
        const indicator = document.getElementById('unsavedIndicator');
        const isDirty = vesselState.getState('project.isDirty');

        if (indicator) {
            indicator.hidden = !isDirty;
        }
    }

    /**
     * Brief feedback (save, load, export) in a toast above the viewport.
     */
    setStatus(message) {
        const toast = document.getElementById('statusToast');
        if (!toast) return;
        toast.textContent = message;
        toast.hidden = false;
        toast.classList.remove('visible');
        void toast.offsetWidth;
        toast.classList.add('visible');
        clearTimeout(this.statusTimer);
        this.statusTimer = setTimeout(() => {
            toast.classList.remove('visible');
            toast.hidden = true;
        }, 2600);
    }

    dispose() {
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
        }

        this.viewport?.dispose();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.vesselApp = new VesselGeneratorApp();
});

export default VesselGeneratorApp;
