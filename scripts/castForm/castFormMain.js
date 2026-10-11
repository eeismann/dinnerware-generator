/**
 * Cast Form Generator - Main Entry Point
 * Initializes the application and coordinates all modules
 */

import { initTheme } from '../ui/themeManager.js';
import castFormState from './state/castFormState.js';
import { PART_COLORS } from './state/castFormDefaults.js';
import { CastFormViewport } from './ui/castFormViewport.js';
import { initPanelReadouts } from './ui/panelReadouts.js';
import { initDkMenu, initPanelToggle } from '../ui/dialkit/dkChrome.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';
import { MoldWorkerClient, abortMoldGeneration } from './geometry/moldWorkerClient.js';

let inputProcessorPromise = null;
let moldGeneratorPromise = null;
let castFormExporterPromise = null;

function loadInputProcessor() {
    if (!inputProcessorPromise) {
        inputProcessorPromise = import('./geometry/inputProcessor.js');
    }
    return inputProcessorPromise;
}

function loadMoldGenerator() {
    if (!moldGeneratorPromise) {
        moldGeneratorPromise = import('./geometry/moldGenerator.js');
    }
    return moldGeneratorPromise;
}

function loadCastFormExporter() {
    if (!castFormExporterPromise) {
        castFormExporterPromise = import('./geometry/castFormSTLExporter.js');
    }
    return castFormExporterPromise;
}

function disposeMoldParts(parts) {
    parts?.foot?.dispose?.();
    parts?.walls?.forEach((wall) => wall?.dispose?.());
    parts?.caseBoxes?.wall?.dispose?.();
    parts?.caseBoxes?.foot?.dispose?.();
}

function colorToHex(color) {
    return `#${Number(color).toString(16).padStart(6, '0')}`;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function parseUrlNumber(params, name) {
    const rawValue = params.get(name);
    if (rawValue === null || rawValue.trim() === '') return null;

    const value = Number(rawValue);
    return Number.isFinite(value) ? value : null;
}

function shouldGenerateRegistrationKeys(params) {
    const wallCount = Math.max(1, Math.min(4, Math.round(params?.mold?.wallCount || 2)));
    // Every split-wall mold gets seam registration keys (2-wall: legacy per-wall
    // male/female; 3/4-wall: per-face roles). 1-wall closed rings have no seams.
    return wallCount >= 2 && params?.natches?.enabled !== false;
}

export class CastFormApp {
    constructor({ initialize = true } = {}) {
        this.viewport = null;
        this.dials = null;
        this.panelToggle = null;
        this.regenerateTimeout = null;
        // A dial drag regenerates once on release (see initDials)
        this.regenerationHeld = false;
        this.regenerateAfterHold = false;
        this.loadingSource = false;
        this.workerClient = new MoldWorkerClient(
            () => this.createMoldWorker(),
            progress => this.updateStatus(progress?.message || 'Generating mold...')
        );
        this.workerUnavailable = false;
        this.fallbackGenerator = null;
        this.fallbackInput = null;
        this.currentGenerationToken = null;
        this.isExporting = false;
        this.pendingRegenerateAfterExport = false;
        this.activeExportPromise = null;

        if (initialize) this.init();
    }

    async init() {
        // Initialize theme
        initTheme();

        // Initialize viewport
        const viewportContainer = document.getElementById('viewport');
        if (viewportContainer) {
            this.viewport = new CastFormViewport(viewportContainer);
        }

        // Parameter card: source/material/warning readouts around the dials
        initPanelReadouts();
        await this.initDials();
        await this.initViewDock();

        // Setup event listeners
        this.setupEventListeners();
        this.initHeaderChrome();

        // Setup state subscriptions
        this.setupStateSubscriptions();
        this.renderPartLegend();

        // Load from URL params or autosave
        this.loadInitialState();

        console.log('Cast Form Generator initialized');
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // File menu
        document.getElementById('newBtn')?.addEventListener('click', () => this.newProject());
        document.getElementById('loadBtn')?.addEventListener('click', () => this.loadProjectFromFile());
        document.getElementById('openSavedBtn')?.addEventListener('click', () => this.showLoadModal());
        document.getElementById('saveBtn')?.addEventListener('click', () => this.showSaveModal());
        document.getElementById('exportBtn')?.addEventListener('click', () => this.showExportModal());

        // Source import: File menu, parameter card and the start card
        this.setupSourceImport();

        // Modal events
        this.setupModalListeners();

        // Part legend
        this.setupPartLegend();

        // Case box preview banner and readout
        this.setupCaseBoxPreview();

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (castFormState.getState('project.isDirty')) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        window.addEventListener('pagehide', () => this.workerClient.dispose());
    }

    /**
     * Setup state subscriptions for regeneration
     */
    setupStateSubscriptions() {
        // Subscribe to parameter changes to trigger regeneration. Case box
        // params are excluded: they only affect the box preview + export
        // geometry (built from already-generated parts), never the mold itself.
        this.lastRegenParamsSnapshot = JSON.stringify({
            ...castFormState.getState('params'),
            caseBox: undefined
        });
        castFormState.subscribe('params', (params) => {
            this.renderPartLegend();
            const snapshot = JSON.stringify({ ...params, caseBox: undefined });
            if (snapshot !== this.lastRegenParamsSnapshot) {
                this.lastRegenParamsSnapshot = snapshot;
                this.scheduleRegenerate();
            }
        });

        let lastInput = castFormState.getState('input');
        let lastInputSignature = '';
        castFormState.subscribe('input', (input) => {
            const signature = JSON.stringify([
                input?.geometry?.uuid, input?.geometry?.getAttribute('position')?.version,
                input?.geometry?.getIndex()?.version, input?.isValid, input?.patternMeta
            ]);
            if (lastInput === input && lastInputSignature === signature) return;
            lastInput = input;
            lastInputSignature = signature;
            this.invalidateGeneration({ releaseInput: true });
            if (input?.isValid) {
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

        castFormState.subscribe('output', () => this.renderPartLegend());

        castFormState.subscribe('input', () => this.updateEmptyState());
        this.updateEmptyState();
    }

    /**
     * Mount the DialKit panels. Loads, new projects, imports and generated
     * output all change state outside the dials, so every change syncs them.
     */
    async initDials() {
        // Loaded on demand: DialKit brings its stylesheet, which Node gates cannot import
        const { initCastFormDials } = await import('../ui/dialkit/castFormDials.js');
        const viewport = this.viewport;
        this.dials = initCastFormDials({
            container: document.getElementById('parameterPanel'),
            setParam: (path, value) => {
                castFormState.setState(path, path === 'params.mold.wallCount' ? Math.round(value) : value);
            },
            setView: (path, value) => castFormState.setState(path, value),
            // Mold generation is expensive: a drag previews nothing and
            // regenerates once when the pointer is released.
            onGestureStart: () => {
                this.regenerationHeld = true;
            },
            onGestureEnd: () => {
                this.regenerationHeld = false;
                if (this.regenerateAfterHold) {
                    this.regenerateAfterHold = false;
                    this.scheduleRegenerate();
                }
            }
        });
        if (viewport) viewport.onDebugModeChange = () => this.viewDock?.sync();

        // Readouts sit below the dials
        const panel = document.getElementById('parameterPanel');
        panel?.append(
            ...['materialVolumeCard', 'warningsSection'].map(id => document.getElementById(id)).filter(Boolean)
        );

        castFormState.subscribe('*', () => {
            this.dials.sync();
            this.viewDock?.sync();
        });
    }

    /** Orientation cube and view controls in the lower left of the viewport. */
    async initViewDock() {
        // Loaded on demand like the dials (Node gates import this module)
        const { createViewDock } = await import('../ui/dialkit/viewDock.js');
        const viewport = this.viewport;
        const view = (path) => ({
            get: () => castFormState.getState(path),
            set: (value) => castFormState.setState(path, value)
        });
        const mode = () => castFormState.getState('view.mode') || 'exploded';
        // One row per generated wall (or the planned count before generation)
        const wallCount = () => {
            const generated = (castFormState.getState('output.wallShells') || []).filter(Boolean).length;
            if (generated > 0) return generated;
            return Math.max(1, Math.min(4, Math.round(castFormState.getState('params.mold.wallCount') || 2)));
        };
        const part = (label, name) => ({
            type: 'toggle',
            label,
            get: () => viewport?.isPartVisible(name) ?? true,
            set: (visible) => viewport?.setPartVisible(name, visible)
        });
        this.viewDock = createViewDock({
            container: document.querySelector('.viewport-container'),
            rig: viewport?.getCameraRig(),
            onReset: () => viewport?.setCameraPreset('threeQuarter'),
            storageKey: 'castform_view_dock_open',
            // The part legend stacks above the cube
            accessory: document.getElementById('partLegend'),
            sections: [{
                title: 'View',
                controls: [
                    {
                        type: 'select',
                        label: 'View Mode',
                        options: [
                            { value: 'exploded', label: 'Exploded' },
                            { value: 'assembly', label: 'Assembly' },
                            { value: 'crossSection', label: 'Cross Section' }
                        ],
                        ...view('view.mode')
                    },
                    {
                        type: 'slider',
                        label: 'Explosion Distance',
                        min: 0,
                        max: 150,
                        step: 5,
                        visible: () => mode() === 'exploded',
                        ...view('view.explosionDistance')
                    },
                    {
                        type: 'slider',
                        label: 'Section Angle',
                        min: 0,
                        max: 360,
                        step: 5,
                        format: (value) => `${value}°`,
                        visible: () => mode() === 'crossSection',
                        ...view('view.crossSectionAngle')
                    },
                    { type: 'toggle', label: 'Show Grid', ...view('view.showGrid') },
                    {
                        type: 'toggle',
                        label: 'Debug Shell Caps',
                        get: () => Boolean(viewport?.debugMode),
                        set: (enabled) => {
                            if (viewport && viewport.debugMode !== enabled) viewport.toggleDebugMode();
                        }
                    },
                    {
                        type: 'group',
                        label: 'Parts',
                        controls: () => [
                            part('Foot', 'foot'),
                            ...Array.from({ length: wallCount() }, (_, index) => part(`Wall ${index + 1}`, `wall${index + 1}`)),
                            part('Input Vessel', 'inputPreview')
                        ]
                    }
                ]
            }]
        });
    }

    initHeaderChrome() {
        this.panelToggle = initPanelToggle(document.getElementById('btnTogglePanel'), 'castform_dials_visible');
        initDkMenu(document.getElementById('fileMenu'));
        this.setupProjectNameEditing();

        document.getElementById('warningBadge')?.addEventListener('click', () => {
            this.panelToggle.setVisible(true);
            document.getElementById('warningsSection')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    /**
     * Rename in place from the header; empty names fall back to the default.
     */
    setupProjectNameEditing() {
        const nameEl = document.getElementById('projectName');
        if (!nameEl) return;
        const commit = () => {
            const name = nameEl.textContent.trim() || 'Untitled Cast Form';
            nameEl.textContent = name;
            castFormState.setState('project.name', name);
        };
        nameEl.addEventListener('blur', commit);
        nameEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                nameEl.blur();
            } else if (event.key === 'Escape') {
                event.stopPropagation();
                nameEl.textContent = castFormState.getState('project.name') || 'Untitled Cast Form';
                nameEl.blur();
            }
        });
    }

    setupSourceImport() {
        const fileInput = document.getElementById('fileInput');
        ['importFile', 'sourceImportBtn', 'emptyImportBtn'].forEach((id) => {
            document.getElementById(id)?.addEventListener('click', () => fileInput?.click());
        });
        document.getElementById('emptyOpenSavedBtn')?.addEventListener('click', () => this.showLoadModal());
        fileInput?.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (file) this.handleFileImport(file);
            fileInput.value = ''; // Reset for re-selection
        });
    }

    /**
     * Start card over the empty viewport until a source is loaded.
     */
    updateEmptyState() {
        const empty = document.getElementById('emptyState');
        if (empty) empty.hidden = Boolean(castFormState.getState('input.isValid')) || this.loadingSource;
    }

    /**
     * Case box preview (toggled from the Polymer Case Box dials) swaps the
     * viewport to the case box scene (handled by castFormViewport) and pauses
     * the mold preview visuals; the mold data itself stays generated underneath.
     */
    setupCaseBoxPreview() {
        const banner = document.getElementById('caseBoxBanner');
        const legend = document.getElementById('partLegend');

        let lastEnabled = null;
        const syncUI = () => {
            const preview = castFormState.getState('view.caseBoxPreview') || {};
            const enabled = !!preview.enabled;
            const target = preview.target === 'foot' ? 'foot' : 'wall';

            banner?.classList.toggle('hidden', !enabled);
            if (banner) {
                banner.textContent = `Case box preview (${target === 'wall' ? 'Wall' : 'Foot'} box) — mold preview paused`;
            }
            if (legend) legend.style.display = enabled ? 'none' : '';
            document.getElementById('caseBoxReadout')?.classList.toggle('hidden', !enabled);

            if (enabled) {
                this.updateStatus(`Case box preview (${target}) — box params update live, exports use these values`);
            } else if (lastEnabled) {
                this.updateStatus('Mold preview');
            }
            lastEnabled = enabled;
        };

        castFormState.subscribe('view.caseBoxPreview', syncUI);
        syncUI();
    }

    /**
     * Schedule mold regeneration (debounced)
     */
    scheduleRegenerate() {
        clearTimeout(this.regenerateTimeout);

        if (this.isExporting) {
            this.pendingRegenerateAfterExport = true;
            return;
        }

        // Invalidate immediately, including the debounce interval: a response
        // for the previous settings must never be committed in that window.
        this.invalidateGeneration();

        if (this.regenerationHeld) {
            this.regenerateAfterHold = true;
            return;
        }

        this.regenerateTimeout = setTimeout(() => {
            this.regenerateTimeout = null;
            this.regenerateMold();
        }, 150);
    }

    invalidateGeneration({ releaseInput = false } = {}) {
        clearTimeout(this.regenerateTimeout);
        this.regenerateTimeout = null;
        this.currentGenerationToken = null;
        this.workerClient.cancel({ releaseInput });
        if (releaseInput) {
            this.fallbackGenerator?.dispose();
            this.fallbackGenerator = null;
            this.fallbackInput = null;
        }
        this.showLoading(false);
        castFormState.setState('output.isGenerating', false, { silent: true });
    }

    createMoldWorker() {
        return new Worker(new URL('./geometry/moldWorker.js', import.meta.url), { type: 'module' });
    }

    generateMoldInWorker(inputGeometry, params, options = {}) {
        return this.workerClient.generate(inputGeometry, params, options);
    }

    async generateMold(inputGeometry, params, options = {}) {
        const generationToken = this.currentGenerationToken;
        if (!this.workerUnavailable) {
            try {
                return await this.generateMoldInWorker(inputGeometry, params, options);
            } catch (error) {
                if (error.name === 'AbortError') {
                    throw error;
                }

                this.workerUnavailable = this.workerClient.unavailable;
                if (!this.workerUnavailable) {
                    throw error;
                }

                console.warn('Mold worker unavailable; falling back to main thread generation.', error);
            }
        }

        const { MoldGenerator } = await loadMoldGenerator();
        if (this.currentGenerationToken !== generationToken) throw abortMoldGeneration();
        if (this.fallbackInput !== inputGeometry || !this.fallbackGenerator) {
            this.fallbackGenerator?.dispose();
            this.fallbackGenerator = new MoldGenerator();
            this.fallbackGenerator.cacheLimit = 4;
            this.fallbackGenerator.resultCacheLimit = 2;
            this.fallbackInput = inputGeometry;
        }
        const generator = this.fallbackGenerator;
        const result = generator.generate(inputGeometry, params, options);
        return {
            ...result,
            sampling: generator.getLastSamplingInfo()
        };
    }

    /**
     * Regenerate mold geometry from current state
     */
    async regenerateMold() {
        clearTimeout(this.regenerateTimeout);
        this.regenerateTimeout = null;
        if (this.isExporting) {
            this.pendingRegenerateAfterExport = true;
            return;
        }

        const inputState = castFormState.getState('input');

        if (!inputState.isValid || !inputState.geometry) {
            return;
        }

        const generationToken = Symbol('mold-generation');
        this.currentGenerationToken = generationToken;

        // Show loading
        this.showLoading(true);
        castFormState.setState('output.isGenerating', true, { silent: true });

        try {
            // Generate mold parts directly from the original geometry
            // This ensures the mold visually matches the displayed vessel
            const params = structuredClone(castFormState.getState('params'));
            const result = await this.generateMold(inputState.geometry, params, {
                quality: 'preview',
                natchesEnabled: shouldGenerateRegistrationKeys(params),
                patternMeta: inputState.patternMeta || null
            });

            if (this.currentGenerationToken !== generationToken
                || castFormState.getState('input.geometry') !== inputState.geometry) {
                disposeMoldParts(result);
                return;
            }

            // Update state with generated geometry
            castFormState.setOutputGeometry(result.foot, result.walls);

            // Validate and generate warnings
            this.validateMold(result);

            // Update status
            const tierLabel = result.sampling?.tier === 'analytic'
                ? ' · pattern-exact'
                : result.sampling?.tier === 'measured' ? ' · pattern-detected' : '';
            this.updateStatus(result.sampling?.label
                ? `Mold generated (${result.sampling.label}${tierLabel})`
                : 'Mold generated');

        } catch (error) {
            if (error.name === 'AbortError' || this.currentGenerationToken !== generationToken) {
                return;
            }
            console.error('Mold generation error:', error);
            this.updateStatus('Generation failed');
            castFormState.setErrors([{ message: error.message }]);
        } finally {
            if (this.currentGenerationToken === generationToken) {
                this.currentGenerationToken = null;
                this.showLoading(false);
                castFormState.setState('output.isGenerating', false, { silent: true });
                this.viewport?.updateValidationState?.();
            }
        }
    }

    async generateExportParts() {
        if (this.activeExportPromise) {
            return this.activeExportPromise;
        }

        const inputState = castFormState.getState('input');
        if (!inputState.isValid || !inputState.geometry) {
            throw new Error('No valid input geometry to export');
        }

        this.activeExportPromise = this.generateExportPartsOnce(inputState).finally(() => {
            this.activeExportPromise = null;
        });

        return this.activeExportPromise;
    }

    async generateExportPartsOnce(inputState) {
        const generationToken = Symbol('mold-export');
        this.currentGenerationToken = generationToken;
        this.isExporting = true;
        this.pendingRegenerateAfterExport = false;
        clearTimeout(this.regenerateTimeout);
        this.regenerateTimeout = null;
        this.showLoading(true);
        this.setExportControlsBusy(true);
        this.updateStatus('Generating export-quality mold...');

        let result = null;
        let caseBoxes = null;
        const assertCurrent = () => {
            if (this.currentGenerationToken !== generationToken
                || castFormState.getState('input.geometry') !== inputState.geometry) throw abortMoldGeneration();
        };
        try {
            const params = structuredClone(castFormState.getState('params'));
            result = await this.generateMold(inputState.geometry, params, {
                quality: 'export',
                natchesEnabled: shouldGenerateRegistrationKeys(params),
                patternMeta: inputState.patternMeta || null
            });
            assertCurrent();

            // Polymer case-mold pour boxes: one wall box (all walls are
            // congruent) + one circular foot box, built from the export-quality
            // parts. Cheap (a measure pass + a few dozen faces) — main thread.
            if (params?.caseBox?.enabled !== false) {
                const { buildWallCaseBox, buildFootCaseBox, buildContinuousWallCaseBox } = await import('./geometry/caseBoxGenerator.js');
                assertCurrent();
                const wallCount = Math.max(1, Math.min(4, Math.round(params?.mold?.wallCount || 2)));
                caseBoxes = {
                    wall: result.walls?.[0]
                        ? (wallCount === 1
                            ? buildContinuousWallCaseBox(result.walls[0], params.caseBox)
                            : buildWallCaseBox(result.walls[0], wallCount, params.caseBox))
                        : null,
                    foot: result.foot
                        ? buildFootCaseBox(result.foot, params.caseBox)
                        : null
                };
            }

            this.updateStatus(result.sampling?.label ? `Export mesh ready (${result.sampling.label})` : 'Export mesh ready');
            return { foot: result.foot, walls: result.walls, caseBoxes };
        } catch (error) {
            disposeMoldParts({ ...result, caseBoxes });
            throw error;
        } finally {
            if (this.currentGenerationToken === generationToken) {
                this.currentGenerationToken = null;
                this.showLoading(false);
            }

            this.isExporting = false;
            this.setExportControlsBusy(false);
            if (this.pendingRegenerateAfterExport) {
                this.pendingRegenerateAfterExport = false;
                this.scheduleRegenerate();
            }
        }
    }

    setExportControlsBusy(isBusy) {
        ['exportBtn', 'exportIndividual', 'exportZip'].forEach((id) => {
            const button = document.getElementById(id);
            if (button) {
                button.disabled = isBusy;
                button.setAttribute('aria-busy', isBusy ? 'true' : 'false');
            }
        });
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
            const { InputProcessor } = await loadInputProcessor();
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
        projectData.project.lastModified = new Date().toISOString();

        // Ensure project has ID
        if (!projectData.project.id) {
            projectData.project.id = `cast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            castFormState.setState('project.id', projectData.project.id);
        }

        // Save to localStorage
        if (!this.saveToStorage(projectData)) {
            this.updateStatus('Project save failed');
            return false;
        }

        // Optionally download as file
        if (downloadFile) {
            this.downloadProjectFile();
        }

        castFormState.markSaved(projectData.project.lastModified);
        this.hideModal(document.getElementById('saveModal'));
        this.updateStatus('Project saved');
        return true;
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
            return true;
        } catch (e) {
            console.error('Failed to save project:', e);
            alert('Failed to save project. Storage may be full.');
            return false;
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
                    <button type="button" class="project-item" data-id="${escapeHtml(p.project?.id ?? '')}">
                        <span class="project-thumbnail">
                            ${p.thumbnail ? `<img src="${p.thumbnail}" alt="">` : ''}
                        </span>
                        <span class="project-info">
                            <span class="name">${escapeHtml(p.project?.name || 'Untitled')}</span>
                            <span class="date">${this.formatDate(p.project?.lastModified)}</span>
                        </span>
                    </button>
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
            this.updateStatus('Project loaded');
        }
    }

    getWallDisplayCount() {
        const outputWalls = castFormState.getState('output.wallShells') || [];
        const generatedCount = outputWalls.filter(Boolean).length;
        if (generatedCount > 0) return generatedCount;
        return Math.max(1, Math.min(4, Math.round(castFormState.getState('params.mold.wallCount') || 2)));
    }

    getWallColor(index) {
        return colorToHex(PART_COLORS[`wall${index + 1}`] || PART_COLORS.wall1);
    }

    renderPartLegend() {
        const legend = document.getElementById('partLegend');
        if (!legend) return;

        // Nothing to name until a source is loaded
        if (!castFormState.getState('input.isValid')) {
            legend.replaceChildren();
            return;
        }

        let selectedPart = castFormState.getState('view.selectedPart');
        const wallCount = this.getWallDisplayCount();
        const parts = [
            { id: 'foot', label: 'Foot', color: colorToHex(PART_COLORS.foot) },
            ...Array.from({ length: wallCount }, (_, index) => ({
                id: `wall${index + 1}`,
                label: `Wall ${index + 1}`,
                color: this.getWallColor(index)
            }))
        ];

        if (!parts.some((part) => part.id === selectedPart)) {
            selectedPart = null;
            castFormState.setState('view.selectedPart', null);
        }

        legend.innerHTML = parts.map((part) => `
            <div class="legend-item${selectedPart === part.id ? ' selected' : ''}" data-part="${part.id}">
                <span class="legend-color" style="background: ${part.color};"></span>
                <span class="legend-label">${part.label}</span>
            </div>
        `).join('');
    }

    renderExportFileList(projectName) {
        const fileList = document.querySelector('#exportModal .export-files');
        if (!fileList) return;

        const output = castFormState.getState('output');
        const parts = [];

        if (output.footShell) {
            parts.push({
                id: 'foot',
                name: `${projectName}_Shell_Foot.stl`,
                color: colorToHex(PART_COLORS.foot)
            });
        }

        (output.wallShells || []).forEach((wall, index) => {
            if (!wall) return;
            parts.push({
                id: `wall${index + 1}`,
                name: `${projectName}_Shell_Wall_${index + 1}.stl`,
                color: this.getWallColor(index)
            });
        });

        // Polymer case-mold pour boxes: split walls share a rectangular form,
        // while a continuous one-wall mold receives its own circular box.
        const params = castFormState.getState('params');
        if (params?.caseBox?.enabled !== false) {
            const wallCount = Math.max(1, Math.min(4, Math.round(params?.mold?.wallCount || 2)));
            if ((output.wallShells || []).some(Boolean)) {
                parts.push({
                    id: 'caseBoxWall',
                    name: `${projectName}_Case_Box_Wall.stl`,
                    color: '#6b8ba4'
                });
            }
            if (output.footShell) {
                parts.push({
                    id: 'caseBoxFoot',
                    name: `${projectName}_Case_Box_Foot.stl`,
                    color: '#6b8ba4'
                });
            }
        }

        const description = document.getElementById('exportDescription');
        if (description) {
            description.textContent = `${parts.length} STL File${parts.length === 1 ? '' : 's'}`;
        }

        fileList.innerHTML = parts.map((part) => `
            <label class="dk-row export-file-item">
                <input type="checkbox" class="dk-check" checked data-part="${part.id}">
                <span class="file-icon" style="background: ${part.color};" aria-hidden="true"></span>
                <span class="file-name">${escapeHtml(part.name)}</span>
            </label>
        `).join('');
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

        this.renderExportFileList(projectName);

        this.showModal(modal);
    }

    /**
     * Export individual STL files
     */
    async exportIndividual() {
        if (this.activeExportPromise) {
            this.updateStatus('Export already in progress');
            return;
        }

        const projectName = castFormState.getState('project.name') || 'CastForm';

        const selectedParts = [];
        document.querySelectorAll('#exportModal input[type="checkbox"]:checked').forEach(cb => {
            selectedParts.push(cb.dataset.part);
        });

        if (selectedParts.length === 0) {
            alert('Please select at least one part to export.');
            return;
        }

        let exportParts = null;
        const inputGeometry = castFormState.getState('input.geometry');
        try {
            exportParts = await this.generateExportParts();
            const { CastFormSTLExporter } = await loadCastFormExporter();
            if (castFormState.getState('input.geometry') !== inputGeometry) throw abortMoldGeneration();
            await CastFormSTLExporter.exportSelected(
                exportParts,
                projectName,
                selectedParts
            );

            this.hideModal(document.getElementById('exportModal'));
            this.updateStatus('Export complete');
        } catch (error) {
            if (error.name === 'AbortError') return;
            console.error('Export failed:', error);
            alert('Export failed: ' + error.message);
        } finally {
            disposeMoldParts(exportParts);
        }
    }

    /**
     * Export as ZIP
     */
    async exportZip() {
        if (this.activeExportPromise) {
            this.updateStatus('Export already in progress');
            return;
        }

        const projectName = castFormState.getState('project.name') || 'CastForm';
        let exportParts = null;
        const inputGeometry = castFormState.getState('input.geometry');

        try {
            exportParts = await this.generateExportParts();
            const { CastFormSTLExporter } = await loadCastFormExporter();
            if (castFormState.getState('input.geometry') !== inputGeometry) throw abortMoldGeneration();
            await CastFormSTLExporter.exportAsZip(
                exportParts,
                projectName
            );

            this.hideModal(document.getElementById('exportModal'));
            this.updateStatus('ZIP export complete');
        } catch (e) {
            if (e.name === 'AbortError') return;
            console.error('ZIP export failed:', e);
            alert('ZIP export failed. Please try individual downloads.');
        } finally {
            disposeMoldParts(exportParts);
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
     * Part legend: click a part to highlight it, again to clear
     */
    setupPartLegend() {
        document.getElementById('partLegend')?.addEventListener('click', (event) => {
            const item = event.target.closest('.legend-item');
            if (!item) return;

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
        }
    }

    /**
     * Load initial state from URL or autosave
     */
    loadInitialState() {
        // Check URL params for project ID
        const params = new URLSearchParams(window.location.search);
        const devStl = params.get('devStl');

        if (devStl) {
            this.whileLoadingSource(this.loadDevStlFromUrl(params));
            return;
        }

        const sourceApp = params.get('sourceApp');
        const sourceProject = params.get('sourceProject');
        if (sourceApp === 'dinnerware' && sourceProject) {
            this.whileLoadingSource(this.loadFromDinnerwareProject(sourceProject, params.get('sourceItem') || 'mug'));
            return;
        }

        const projectId = params.get('project');

        if (projectId) {
            this.loadProject(projectId);
        }
    }

    /**
     * Keep the start card away while a URL-driven source loads.
     */
    whileLoadingSource(promise) {
        this.loadingSource = true;
        this.updateEmptyState();
        promise.finally(() => {
            this.loadingSource = false;
            this.updateEmptyState();
        });
    }

    /**
     * Import an item from a Dinnerware Designer project (dashboard's
     * "Open in Cast Form" flow). Regenerates the item mesh from the saved
     * parametric state and derives exact surface-pattern metadata, enabling
     * Tier 1 analytic pattern relief in the mold.
     */
    async loadFromDinnerwareProject(projectId, itemType) {
        this.showLoading(true);
        this.updateStatus('Importing from Dinnerware Designer...');

        try {
            const [{ getProject }, { buildDinnerwareItemForCastForm }] = await Promise.all([
                import('../dashboard/projectStorage.js'),
                import('./geometry/dinnerwareImport.js')
            ]);

            const project = getProject(projectId);
            if (!project?.state) {
                throw new Error('Dinnerware project not found in storage');
            }

            const { geometry, patternMeta, errors } =
                buildDinnerwareItemForCastForm(project.state, itemType);

            if (errors.length > 0) {
                castFormState.setState('input.validationErrors', errors);
            }

            if (!geometry) {
                throw new Error(errors[0] || 'Could not generate item geometry');
            }

            castFormState.setInputGeometry(
                geometry,
                `${project.projectName || 'Dinnerware'} — ${itemType}`,
                'dinnerware',
                projectId,
                patternMeta
            );
            this.updateStatus(patternMeta
                ? 'Imported from Dinnerware Designer (pattern metadata attached)'
                : 'Imported from Dinnerware Designer');
        } catch (error) {
            console.error('Dinnerware import error:', error);
            this.updateStatus('Import failed');
            castFormState.setState('input.validationErrors', [error.message]);
        } finally {
            this.showLoading(false);
        }
    }

    async loadDevStlFromUrl(params) {
        try {
            const stlUrl = new URL(params.get('devStl'), window.location.origin);
            if (stlUrl.origin !== window.location.origin) {
                throw new Error('Validation STL URL must be same-origin');
            }

            const cornerCutWidth = parseUrlNumber(params, 'cornerCutWidth');
            if (cornerCutWidth !== null) {
                castFormState.setState('params.mold.cornerCutWidth', cornerCutWidth);
            }

            const wallCount = parseUrlNumber(params, 'wallCount');
            if (wallCount !== null) {
                castFormState.setState('params.mold.wallCount', Math.max(1, Math.min(4, Math.round(wallCount))));
            }

            const explosionDistance = parseUrlNumber(params, 'explosionDistance');
            if (explosionDistance !== null) {
                castFormState.setState('view.explosionDistance', explosionDistance);
            }

            const response = await fetch(stlUrl.href);
            if (!response.ok) {
                throw new Error(`Could not load validation STL (${response.status})`);
            }

            const blob = await response.blob();
            const fallbackName = stlUrl.pathname.split('/').filter(Boolean).pop() || 'validation.stl';
            const file = new File([blob], fallbackName, { type: blob.type || 'model/stl' });
            await this.handleFileImport(file);
            castFormState.setState('input.validationSourceUrl', stlUrl.pathname);

            clearTimeout(this.regenerateTimeout);
            this.regenerateTimeout = null;
            await this.regenerateMold();

            const mode = params.get('view');
            if (['exploded', 'assembly', 'crossSection'].includes(mode)) {
                castFormState.setState('view.mode', mode);
            }

            const camera = params.get('camera');
            if (['front', 'side', 'threeQuarter', 'top'].includes(camera)) {
                this.viewport?.setCameraPreset(camera, { instant: true });
            }
            this.updateStatus('Validation STL loaded');
        } catch (error) {
            console.error('Validation STL load error:', error);
            this.updateStatus('Validation load failed');
            castFormState.setErrors([{ message: error.message }]);
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
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
    window.castFormApp = new CastFormApp();
});
