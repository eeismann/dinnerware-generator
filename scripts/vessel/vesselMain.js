/**
 * Vessel Generator - Main Entry Point
 * Initializes and coordinates all components
 */

import vesselState from './state/vesselState.js';
import { VesselViewport } from './ui/vesselViewport.js';
import { ParameterPanel } from './ui/parameterPanel.js';
import { VesselMeshGenerator } from './geometry/vesselMeshGenerator.js';
import { VesselSTLExporter } from './geometry/vesselSTLExporter.js';
import { VesselStorage } from './vesselStorage.js';
import { init as initThemeManager } from '../ui/themeManager.js';

class VesselGeneratorApp {
    constructor() {
        this.viewport = null;
        this.parameterPanel = null;
        this.autosaveInterval = null;
        this.editingProjectId = null;
        
        this.init();
    }

    async init() {
        console.log('Vessel Generator initializing...');
        
        // Initialize theme manager for settings menu
        initThemeManager();
        
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
        this.initParameterPanel();
        this.initHeaderButtons();
        this.initFooterControls();
        this.initModals();
        this.initKeyboardShortcuts();
        
        // Subscribe to state changes
        this.subscribeToState();
        
        // Setup autosave
        this.autosaveInterval = VesselStorage.setupAutosave(30000);
        
        // Initial render
        this.updateAll();
        
        // Update status
        this.setStatus('Ready');
        
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

    initParameterPanel() {
        this.parameterPanel = new ParameterPanel();
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

    initFooterControls() {
        // View menu toggle
        const viewMenuContainer = document.getElementById('viewMenuContainer');
        const btnViewMenu = document.getElementById('btnViewMenu');
        
        btnViewMenu?.addEventListener('click', (e) => {
            e.stopPropagation();
            viewMenuContainer?.classList.toggle('open');
        });

        // Close view menu on outside click
        document.addEventListener('click', (e) => {
            if (!viewMenuContainer?.contains(e.target)) {
                viewMenuContainer?.classList.remove('open');
            }
        });

        // View preset buttons
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.currentTarget.dataset.view;
                this.viewport?.setCameraPreset(view);
                
                // Update active state
                document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        // Cross-section toggle
        document.getElementById('btnToggleCrossSection')?.addEventListener('click', () => {
            const toggle = document.getElementById('crossSectionToggle');
            toggle?.classList.toggle('active');
            this.viewport?.toggleCrossSection(toggle?.classList.contains('active'));
        });

        // Grid toggle
        document.getElementById('btnToggleGrid')?.addEventListener('click', () => {
            const toggle = document.getElementById('gridToggle');
            toggle?.classList.toggle('active');
            this.viewport?.toggleGrid(toggle?.classList.contains('active'));
        });
    }

    initModals() {
        // Save modal
        const saveModal = document.getElementById('saveModal');
        
        document.getElementById('btnCloseSaveModal')?.addEventListener('click', () => {
            saveModal.style.display = 'none';
        });

        document.getElementById('btnCancelSave')?.addEventListener('click', () => {
            saveModal.style.display = 'none';
        });

        document.getElementById('btnConfirmSave')?.addEventListener('click', () => {
            const name = document.getElementById('saveProjectName')?.value || 'vessel';
            const downloadFile = document.getElementById('saveAsFile')?.checked || false;
            this.saveProject(name, downloadFile);
            saveModal.style.display = 'none';
        });

        // Click backdrop to close
        saveModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
            saveModal.style.display = 'none';
        });

        // Confirm modal
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
            // Update viewport
            if (this.viewport) {
                this.viewport.state = state;
                this.viewport.updateVessel();
            }
            
            // Update unsaved indicator
            this.updateUnsavedIndicator();
        });
    }

    updateAll() {
        const state = vesselState.getState();
        
        if (this.viewport) {
            this.viewport.state = state;
            this.viewport.updateVessel();
        }
        
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
        
        modal.style.display = 'flex';
        nameInput?.focus();
        nameInput?.select();
    }

    exportSTL() {
        if (!this.viewport?.vesselGroup) {
            this.setStatus('No vessel to export');
            return;
        }
        
        const projectName = vesselState.getState('project.name') || 'vessel';
        VesselSTLExporter.exportBinary(this.viewport.vesselGroup, `${projectName}.stl`);
        this.setStatus('STL exported');
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
        this.showSaveSuccessToast(name);
        this.setStatus('Project saved');
    }

    /**
     * Show a success toast message after saving
     */
    showSaveSuccessToast(projectName) {
        // Create toast element if it doesn't exist
        let toast = document.getElementById('saveToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'saveToast';
            toast.style.cssText = `
                position: fixed;
                bottom: 80px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: var(--th-success, #10b981);
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                z-index: 10000;
                transition: transform 0.3s ease, opacity 0.3s ease;
                opacity: 0;
            `;
            document.body.appendChild(toast);
        }
        
        toast.textContent = `✓ "${projectName}" saved successfully`;
        
        // Show toast
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
            toast.style.opacity = '1';
        });
        
        // Hide after 3 seconds
        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            toast.style.opacity = '0';
        }, 3000);
    }

    showConfirmModal(title, message, onConfirm) {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        
        const okBtn = document.getElementById('btnConfirmOk');
        const newOkBtn = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOkBtn, okBtn);
        
        newOkBtn.addEventListener('click', () => {
            modal.style.display = 'none';
            onConfirm();
        });
        
        modal.style.display = 'flex';
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
            indicator.style.display = isDirty ? 'inline' : 'none';
        }
    }

    setStatus(message) {
        const statusEl = document.getElementById('statusInfo');
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    dispose() {
        if (this.autosaveInterval) {
            clearInterval(this.autosaveInterval);
        }
        
        this.viewport?.dispose();
        this.parameterPanel?.dispose();
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.vesselApp = new VesselGeneratorApp();
});

export default VesselGeneratorApp;

