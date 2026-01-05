/**
 * Cast Form Generator - Main Entry Point
 * Initializes the application and coordinates all modules
 */

import * as THREE from 'three';
import { initTheme } from '../ui/themeManager.js';
import castFormState from './state/castFormState.js';
import { CastFormViewport } from './ui/castFormViewport.js';
import { ParameterPanel } from './ui/parameterPanel.js';
import { InputProcessor } from './geometry/inputProcessor.js';
import { MoldGenerator } from './geometry/moldGenerator.js';
import { CastFormSTLExporter } from './geometry/castFormSTLExporter.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';

class CastFormApp {
    constructor() {
        this.viewport = null;
        this.parameterPanel = null;
        this.moldGenerator = new MoldGenerator();
        this.regenerateTimeout = null;
        
        this.init();
    }

    async init() {
        // Initialize theme
        initTheme();
        
        // Initialize viewport
        const viewportContainer = document.getElementById('viewport');
        if (viewportContainer) {
            this.viewport = new CastFormViewport(viewportContainer);
        }
        
        // Initialize parameter panel
        this.parameterPanel = new ParameterPanel();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup state subscriptions
        this.setupStateSubscriptions();
        
        // Load from URL params or autosave
        this.loadInitialState();
        
        console.log('Cast Form Generator initialized');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Header buttons
        document.getElementById('newBtn')?.addEventListener('click', () => this.newProject());
        document.getElementById('loadBtn')?.addEventListener('click', () => this.loadProjectFromFile());
        document.getElementById('saveBtn')?.addEventListener('click', () => this.showSaveModal());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.showExportModal());
        
        // Custom events from parameter panel
        window.addEventListener('importFile', (e) => this.handleFileImport(e.detail.file));
        
        // Modal events
        this.setupModalListeners();
        
        // View controls
        this.setupViewControls();
        
        // Settings panel
        this.setupSettingsPanel();
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (castFormState.getState('project.isDirty')) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    /**
     * Setup state subscriptions for regeneration
     */
    setupStateSubscriptions() {
        // Subscribe to parameter changes to trigger regeneration
        castFormState.subscribe('params', () => this.scheduleRegenerate());
        
        // Subscribe to input changes
        castFormState.subscribe('input.isValid', (isValid) => {
            if (isValid) {
                this.scheduleRegenerate();
            }
        });
        
        // Update project name display
        castFormState.subscribe('project.name', (name) => {
            const nameEl = document.getElementById('projectName');
            if (nameEl) nameEl.textContent = name || 'Untitled Cast Form';
        });
        
        // Update unsaved indicator
        castFormState.subscribe('project.isDirty', (isDirty) => {
            const indicator = document.getElementById('unsavedIndicator');
            if (indicator) indicator.style.display = isDirty ? 'inline' : 'none';
        });
    }

    /**
     * Schedule mold regeneration (debounced)
     */
    scheduleRegenerate() {
        clearTimeout(this.regenerateTimeout);
        this.regenerateTimeout = setTimeout(() => {
            this.regenerateMold();
        }, 150);
    }

    /**
     * Regenerate mold geometry from current state
     */
    async regenerateMold() {
        const inputState = castFormState.getState('input');
        
        if (!inputState.isValid || !inputState.geometry) {
            return;
        }
        
        // Show loading
        this.showLoading(true);
        castFormState.setState('output.isGenerating', true);
        
        try {
            // Generate mold parts directly from the original geometry
            // This ensures the mold visually matches the displayed vessel
            const params = castFormState.getState('params');
            const result = this.moldGenerator.generate(inputState.geometry, params);
            
            // Update state with generated geometry
            castFormState.setOutputGeometry(result.foot, result.walls, inputState.geometry);
            
            // Validate and generate warnings
            this.validateMold(result);
            
            // Update status
            this.updateStatus('Mold generated');
            
        } catch (error) {
            console.error('Mold generation error:', error);
            this.updateStatus('Generation failed');
            castFormState.setErrors([{ message: error.message }]);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * Validate generated mold and update warnings
     */
    validateMold(result) {
        const warnings = [];
        const params = castFormState.getState('params');
        const input = castFormState.getState('input');
        
        // Check shell thickness
        if (params.shell.wallThickness < 1.2) {
            warnings.push({
                type: 'error',
                message: 'Shell thickness below minimum (1.2mm)'
            });
        }
        
        // Check mold size
        if (input.bounds) {
            const maxDim = Math.max(input.bounds.size.x, input.bounds.size.y, input.bounds.size.z);
            if (maxDim > 200) {
                warnings.push({
                    type: 'info',
                    message: 'Large mold size may require extended print time'
                });
            }
        }
        
        castFormState.setWarnings(warnings);
    }

    /**
     * Handle file import
     * @param {File} file 
     */
    async handleFileImport(file) {
        this.showLoading(true);
        this.updateStatus('Loading file...');
        
        try {
            const result = await InputProcessor.loadFromFile(file);
            
            if (result.errors.length > 0) {
                castFormState.setState('input.validationErrors', result.errors);
                this.updateStatus('Import failed');
            }
            
            if (result.geometry) {
                castFormState.setInputGeometry(
                    result.geometry,
                    file.name,
                    null,
                    null
                );
                this.updateStatus('File loaded');
            }
        } catch (error) {
            console.error('File import error:', error);
            this.updateStatus('Import failed');
            castFormState.setState('input.validationErrors', [error.message]);
        } finally {
            this.showLoading(false);
        }
    }

    /**
     * New project
     */
    newProject() {
        if (castFormState.getState('project.isDirty')) {
            if (!confirm('You have unsaved changes. Start a new project anyway?')) {
                return;
            }
        }
        
        castFormState.reset();
        this.updateStatus('New project');
    }

    /**
     * Show/hide loading overlay
     */
    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('hidden', !show);
        }
    }

    /**
     * Update status text
     */
    updateStatus(text) {
        const statusEl = document.getElementById('statusText');
        if (statusEl) statusEl.textContent = text;
    }

    /**
     * Update debug mode button appearance
     */
    updateDebugButtonState() {
        const btn = document.getElementById('debugModeBtn');
        if (btn && this.viewport) {
            if (this.viewport.debugMode) {
                btn.classList.add('active');
                btn.title = 'Debug Mode ON (D)';
            } else {
                btn.classList.remove('active');
                btn.title = 'Toggle Debug Mode (D)';
            }
        }
    }

    /**
     * Setup modal event listeners
     */
    setupModalListeners() {
        // Save modal
        const saveModal = document.getElementById('saveModal');
        document.getElementById('saveModalClose')?.addEventListener('click', () => this.hideModal(saveModal));
        document.getElementById('saveModalCancel')?.addEventListener('click', () => this.hideModal(saveModal));
        document.getElementById('saveModalConfirm')?.addEventListener('click', () => {
            const downloadFile = document.getElementById('saveAsFile')?.checked || false;
            this.saveProject(downloadFile);
        });
        
        // Export modal
        const exportModal = document.getElementById('exportModal');
        document.getElementById('exportModalClose')?.addEventListener('click', () => this.hideModal(exportModal));
        document.getElementById('exportModalCancel')?.addEventListener('click', () => this.hideModal(exportModal));
        document.getElementById('exportIndividual')?.addEventListener('click', () => this.exportIndividual());
        document.getElementById('exportZip')?.addEventListener('click', () => this.exportZip());
        document.getElementById('selectAllExport')?.addEventListener('click', () => this.selectAllExportParts(true));
        document.getElementById('selectNoneExport')?.addEventListener('click', () => this.selectAllExportParts(false));
        
        // Load modal
        const loadModal = document.getElementById('loadModal');
        document.getElementById('loadModalClose')?.addEventListener('click', () => this.hideModal(loadModal));
        document.getElementById('loadModalCancel')?.addEventListener('click', () => this.hideModal(loadModal));
        
        // Close modals on backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                const modal = backdrop.closest('.modal');
                this.hideModal(modal);
            });
        });
    }

    /**
     * Show save modal
     */
    showSaveModal() {
        const modal = document.getElementById('saveModal');
        const input = document.getElementById('saveProjectName');
        
        if (input) {
            input.value = castFormState.getState('project.name') || '';
        }
        
        this.showModal(modal);
        input?.focus();
    }

    /**
     * Save project
     */
    saveProject(downloadFile = false) {
        const input = document.getElementById('saveProjectName');
        const name = input?.value.trim() || 'Untitled Cast Form';

        castFormState.setState('project.name', name);

        // Generate thumbnail
        const thumbnail = this.viewport?.captureThumbnail(256, 256);

        // Get state for saving
        const projectData = castFormState.exportState();
        projectData.thumbnail = thumbnail;

        // Ensure project has ID
        if (!projectData.project.id) {
            projectData.project.id = `cast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            castFormState.setState('project.id', projectData.project.id);
        }

        // Save to localStorage
        this.saveToStorage(projectData);

        // Optionally download as file
        if (downloadFile) {
            this.downloadProjectFile();
        }

        castFormState.markSaved();
        this.hideModal(document.getElementById('saveModal'));
        this.updateStatus('Project saved');
    }

    /**
     * Save project to localStorage
     */
    saveToStorage(projectData) {
        try {
            const key = 'playground_ceramics_castform_projects';
            let projects = [];

            const existing = localStorage.getItem(key);
            if (existing) {
                projects = JSON.parse(existing);
            }

            // Find and update or add new
            const idx = projects.findIndex(p => p.project?.id === projectData.project.id);
            if (idx >= 0) {
                projects[idx] = projectData;
            } else {
                projects.push(projectData);
            }

            localStorage.setItem(key, JSON.stringify(projects));
        } catch (e) {
            console.error('Failed to save project:', e);
            alert('Failed to save project. Storage may be full.');
        }
    }

    /**
     * Download project as JSON file
     */
    downloadProjectFile() {
        const name = castFormState.getState('project.name') || 'Untitled Cast Form';
        const thumbnail = this.viewport?.captureThumbnail(256, 256);

        const projectData = castFormState.exportState();
        projectData.thumbnail = thumbnail;

        // Ensure project has ID
        if (!projectData.project.id) {
            projectData.project.id = `cast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        }

        // Create enhanced JSON format
        const enhancedData = ProjectFileFormat.serialize(projectData, 'castform');
        const json = JSON.stringify(enhancedData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        // Generate filename with timestamp
        const filename = ProjectFileFormat.generateFilename(
            name,
            'castform',
            new Date()
        );

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        this.updateStatus('Project downloaded');
    }

    /**
     * Load project from JSON file
     */
    loadProjectFromFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                const text = await file.text();
                const data = JSON.parse(text);

                // Detect format (enhanced or legacy)
                const format = ProjectFileFormat.detectFormat(data);

                let projectData;

                if (format === 'enhanced') {
                    // New enhanced format
                    const deserialized = ProjectFileFormat.deserialize(data);

                    // Validate it's a castform project
                    if (deserialized.fileFormat.appType !== 'castform') {
                        throw new Error('This is not a cast form project file');
                    }

                    projectData = deserialized.state;
                } else {
                    // Legacy format
                    projectData = data;
                }

                // Load the project
                castFormState.loadState(projectData);

                // Check if geometry was loaded
                const hasGeometry = castFormState.getState('input.geometry');
                if (!hasGeometry && projectData.input?.source) {
                    // Geometry not saved in file - inform user
                    alert('Note: This project file does not contain the input geometry. You will need to re-import the original STL/OBJ file to regenerate the mold.');
                    this.updateStatus('Project loaded (geometry missing)');
                } else if (hasGeometry) {
                    // Regenerate mold from loaded geometry
                    this.regenerateMold();
                    this.updateStatus('Project loaded from file');
                } else {
                    this.updateStatus('Project loaded');
                }
            } catch (error) {
                console.error('Load project file error:', error);
                alert('Failed to load project file: ' + error.message);
            }
        });

        input.click();
    }

    /**
     * Show load modal
     */
    showLoadModal() {
        const modal = document.getElementById('loadModal');
        const list = document.getElementById('projectList');
        const noProjects = document.getElementById('noProjects');
        
        // Load projects from storage
        const projects = this.loadProjectsFromStorage();
        
        if (projects.length === 0) {
            list?.classList.add('hidden');
            noProjects?.classList.remove('hidden');
        } else {
            list?.classList.remove('hidden');
            noProjects?.classList.add('hidden');
            
            if (list) {
                list.innerHTML = projects.map(p => `
                    <div class="project-item" data-id="${p.project?.id}">
                        <div class="project-thumbnail">
                            ${p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : ''}
                        </div>
                        <div class="project-info">
                            <div class="name">${p.project?.name || 'Untitled'}</div>
                            <div class="date">${this.formatDate(p.project?.lastModified)}</div>
                        </div>
                    </div>
                `).join('');
                
                // Add click handlers
                list.querySelectorAll('.project-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const id = item.dataset.id;
                        this.loadProject(id);
                        this.hideModal(modal);
                    });
                });
            }
        }
        
        this.showModal(modal);
    }

    /**
     * Load projects from storage
     */
    loadProjectsFromStorage() {
        try {
            const key = 'playground_ceramics_castform_projects';
            const data = localStorage.getItem(key);
            if (data) {
                return JSON.parse(data).sort((a, b) => 
                    new Date(b.project?.lastModified) - new Date(a.project?.lastModified)
                );
            }
        } catch (e) {
            console.error('Failed to load projects:', e);
        }
        return [];
    }

    /**
     * Load project by ID
     */
    loadProject(id) {
        const projects = this.loadProjectsFromStorage();
        const project = projects.find(p => p.project?.id === id);

        if (project) {
            castFormState.loadState(project);

            // Regenerate mold from loaded geometry
            this.regenerateMold();

            // Sync UI
            this.parameterPanel?.syncUIFromState();

            this.updateStatus('Project loaded');
        }
    }

    /**
     * Show export modal
     */
    showExportModal() {
        const output = castFormState.getState('output');
        
        if (!output.footShell && !output.wallShells.some(w => w)) {
            alert('No mold geometry to export. Please load a model and generate the mold first.');
            return;
        }
        
        const modal = document.getElementById('exportModal');
        const projectName = castFormState.getState('project.name') || 'CastForm';
        
        // Update file names in modal
        document.getElementById('exportFootName').textContent = `${projectName}_Shell_Foot.stl`;
        document.getElementById('exportWall1Name').textContent = `${projectName}_Shell_Wall_1.stl`;
        document.getElementById('exportWall2Name').textContent = `${projectName}_Shell_Wall_2.stl`;
        document.getElementById('exportWall3Name').textContent = `${projectName}_Shell_Wall_3.stl`;
        
        this.showModal(modal);
    }

    /**
     * Export individual STL files
     */
    exportIndividual() {
        const output = castFormState.getState('output');
        const projectName = castFormState.getState('project.name') || 'CastForm';
        
        const selectedParts = [];
        document.querySelectorAll('#exportModal input[type="checkbox"]:checked').forEach(cb => {
            selectedParts.push(cb.dataset.part);
        });
        
        if (selectedParts.length === 0) {
            alert('Please select at least one part to export.');
            return;
        }
        
        CastFormSTLExporter.exportSelected(
            { foot: output.footShell, walls: output.wallShells },
            projectName,
            selectedParts
        );
        
        this.hideModal(document.getElementById('exportModal'));
        this.updateStatus('Export complete');
    }

    /**
     * Export as ZIP
     */
    async exportZip() {
        const output = castFormState.getState('output');
        const projectName = castFormState.getState('project.name') || 'CastForm';
        
        try {
            await CastFormSTLExporter.exportAsZip(
                { foot: output.footShell, walls: output.wallShells },
                projectName
            );
            
            this.hideModal(document.getElementById('exportModal'));
            this.updateStatus('ZIP export complete');
        } catch (e) {
            console.error('ZIP export failed:', e);
            alert('ZIP export failed. Please try individual downloads.');
        }
    }

    /**
     * Select all/none export parts
     */
    selectAllExportParts(selectAll) {
        document.querySelectorAll('#exportModal input[type="checkbox"]').forEach(cb => {
            cb.checked = selectAll;
        });
    }

    /**
     * Show modal
     */
    showModal(modal) {
        modal?.classList.remove('hidden');
    }

    /**
     * Hide modal
     */
    hideModal(modal) {
        modal?.classList.add('hidden');
    }

    /**
     * Setup view controls
     */
    setupViewControls() {
        // View mode dropdown
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.view;
                castFormState.setState('view.mode', mode);
                
                // Update active state
                document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                // Show/hide relevant sliders based on view mode
                const explosionContainer = document.getElementById('explosionDistanceContainer');
                const crossSectionContainer = document.getElementById('crossSectionAngleContainer');
                
                if (explosionContainer) {
                    explosionContainer.style.display = mode === 'exploded' ? 'flex' : 'none';
                }
                if (crossSectionContainer) {
                    crossSectionContainer.style.display = mode === 'crossSection' ? 'flex' : 'none';
                }
            });
        });
        
        // Camera presets
        document.querySelectorAll('[data-camera]').forEach(btn => {
            btn.addEventListener('click', () => {
                const preset = btn.dataset.camera;
                this.viewport?.setCameraPreset(preset);
                
                // Update active state
                document.querySelectorAll('[data-camera]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Explosion distance slider
        const explosionSlider = document.getElementById('explosionDistance');
        const explosionValue = document.getElementById('explosionDistanceValue');
        if (explosionSlider) {
            explosionSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                castFormState.setState('view.explosionDistance', value);
                if (explosionValue) {
                    explosionValue.textContent = value;
                }
            });
        }
        
        // Cross-section angle slider
        const crossSectionSlider = document.getElementById('crossSectionAngle');
        const crossSectionValue = document.getElementById('crossSectionAngleValue');
        if (crossSectionSlider) {
            crossSectionSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                castFormState.setState('view.crossSectionAngle', value);
                if (crossSectionValue) {
                    crossSectionValue.textContent = value;
                }
            });
        }
        
        // Grid toggle
        document.getElementById('showGrid')?.addEventListener('change', (e) => {
            castFormState.setState('view.showGrid', e.target.checked);
        });
        
        // Natches toggle
        document.getElementById('showNatches')?.addEventListener('change', (e) => {
            castFormState.setState('view.showNatches', e.target.checked);
        });
        
        // Debug shell caps toggle (checkbox in View menu)
        document.getElementById('debugShellCaps')?.addEventListener('change', (e) => {
            if (this.viewport) {
                if (e.target.checked !== this.viewport.debugMode) {
                    this.viewport.toggleDebugMode();
                }
            }
        });
        
        // Debug mode button (in footer)
        document.getElementById('debugModeBtn')?.addEventListener('click', () => {
            if (this.viewport) {
                this.viewport.toggleDebugMode();
                // Sync checkbox state
                const checkbox = document.getElementById('debugShellCaps');
                if (checkbox) {
                    checkbox.checked = this.viewport.debugMode;
                }
                // Update button appearance
                this.updateDebugButtonState();
            }
        });
        
        // Part legend clicks
        document.querySelectorAll('.legend-item').forEach(item => {
            item.addEventListener('click', () => {
                const part = item.dataset.part;
                const currentSelected = castFormState.getState('view.selectedPart');
                
                if (currentSelected === part) {
                    castFormState.setState('view.selectedPart', null);
                    this.viewport?.highlightPart(null);
                    document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('selected'));
                } else {
                    castFormState.setState('view.selectedPart', part);
                    this.viewport?.highlightPart(part);
                    document.querySelectorAll('.legend-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                }
            });
        });
    }

    /**
     * Setup settings panel
     */
    setupSettingsPanel() {
        const panel = document.getElementById('settingsPanel');
        const openBtn = document.getElementById('settingsBtn');
        const closeBtn = document.getElementById('settingsClose');
        
        openBtn?.addEventListener('click', () => panel?.classList.remove('hidden'));
        closeBtn?.addEventListener('click', () => panel?.classList.add('hidden'));
        
        // Theme toggle
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                document.documentElement.setAttribute('data-mode', mode);
                localStorage.setItem('playground-ceramics-mode', mode);
                
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
        
        // Accent colors
        document.querySelectorAll('.accent-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                document.documentElement.style.setProperty('--th-accent', color);
                localStorage.setItem('playground-ceramics-accent', color);
                
                document.querySelectorAll('.accent-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    /**
     * Handle keyboard shortcuts
     */
    handleKeyboard(e) {
        // Ctrl/Cmd + S = Save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.showSaveModal();
        }
        
        // Ctrl/Cmd + O = Load
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            this.showLoadModal();
        }
        
        // Ctrl/Cmd + E = Export
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            this.showExportModal();
        }
        
        // Escape = Close modals
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                this.hideModal(modal);
            });
            document.getElementById('settingsPanel')?.classList.add('hidden');
        }
    }

    /**
     * Load initial state from URL or autosave
     */
    loadInitialState() {
        // Check URL params for project ID
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get('project');
        
        if (projectId) {
            this.loadProject(projectId);
        }
    }

    /**
     * Format date for display
     */
    formatDate(isoString) {
        if (!isoString) return 'Unknown';
        
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return date.toLocaleTimeString('en-US', { 
                hour: 'numeric', 
                minute: '2-digit' 
            });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            return date.toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
            });
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.castFormApp = new CastFormApp();
});

