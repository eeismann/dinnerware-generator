/**
 * Handle Generator Main Application
 * Entry point for the mug handle generator app
 */

import { init as initThemeManager } from '../ui/themeManager.js';
import { handleStateManager } from './state/handleState.js';
import { initHandleViewport, getHandleViewport } from './ui/handleViewport.js';
import { initCrossSectionPreview, getCrossSectionPreview } from './ui/crossSectionPreview.js';
import { initDimensionOverlays, getDimensionOverlays } from './ui/dimensionOverlays.js';
import { showMugImportModal, getDinnerwareProjects, getVesselV2Projects, getVesselV3Projects } from './ui/mugImporter.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';
import { resolveAppUrl } from '../utils/navigation.js';
import {
    DEFAULT_MOLD_CONSTRUCTION_VIEW,
    mergeMoldConstructionViewSettings
} from './mold/handleMoldConstructionView.js';
import { openDialog, closeDialog } from '../ui/accessibility.js';
import { initDkMenu, initPanelToggle } from '../ui/dialkit/dkChrome.js';

// Storage key for handle projects
const HANDLE_STORAGE_KEY = 'playground_ceramics_handle_projects';
const FINAL_HANDLE_UPDATE_DELAY_MS = 140;
let finalHandleUpdateTimer = null;
let handleExporterPromise = null;
let handleMoldExporterPromise = null;

// Mug used when no source project is chosen
const DEFAULT_MUG = {
    height: 95,
    topDiameter: 80,
    bottomDiameter: 60,
    wallThickness: 2.5,
    wallAngle: 5,
};

function loadHandleExporter() {
    if (!handleExporterPromise) {
        handleExporterPromise = import('./geometry/handleSTLExporter.js');
    }
    return handleExporterPromise;
}

function loadHandleMoldExporter() {
    if (!handleMoldExporterPromise) {
        handleMoldExporterPromise = import('./mold/handleMoldSTLExporter.js');
    }
    return handleMoldExporterPromise;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    init();
});

async function init() {
    // Initialize theme manager
    initThemeManager();

    // Initialize viewport
    const viewport = initHandleViewport('viewport');

    // Initialize cross-section preview
    initCrossSectionPreview('crossSectionCanvas');

    // Initialize dimension overlays
    initDimensionOverlays('dimensionOverlays');
    viewport.setOverlayUpdater(() => updateDimensionOverlays());

    // Header, dialogs, readout cards and DialKit controls
    initHeaderButtons();
    initProjectNameEditing();
    initDialogs();
    initThemeSync();
    initReadouts();
    await initDials();
    initHeaderChrome();

    // Subscribe to state changes
    handleStateManager.subscribe(onStateChange);

    // Check if we should show mug import modal on startup
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('project');

    if (projectId) {
        // Load existing handle project
        loadProjectById(projectId);
        updateUI();
        regenerateHandle();
    } else if (hasImportSource()) {
        // New project - choose a mug or vessel; dismissing uses the default mug
        showMugImportModal({ cancelLabel: 'Use Default Mug' }).then(mugData => {
            if (!mugData) {
                handleStateManager.setMugData({
                    ...DEFAULT_MUG,
                    loaded: false,
                    projectName: 'No mug selected',
                });
            }
            updateUI();
            regenerateHandle();
        });
    } else {
        // No dinnerware or vessel projects - show prompt to create one
        showConfirmModal(
            'No Mug or Vessel Projects Found',
            'To create a handle, you first need a mug (Dinnerware Generator) or a vessel (Vessel V2/V3) to attach it to.',
            () => {
                window.location.href = resolveAppUrl('index.html');
            },
            'Go to Dinnerware Generator',
            'Use Default Mug'
        );

        // Use default mug data for now
        handleStateManager.setMugData({
            ...DEFAULT_MUG,
            loaded: false,
            projectName: 'Default mug (no project)',
        });
        updateUI();
        regenerateHandle();
    }
}

function hasImportSource() {
    return getDinnerwareProjects().length > 0
        || getVesselV2Projects().length > 0
        || getVesselV3Projects().length > 0;
}

// === DialKit controls ===

let dials = null;

async function initDials() {
    // Loaded on demand so headless gates can import this module without a DOM
    const { initHandleDials } = await import('../ui/dialkit/handleDials.js');
    dials = initHandleDials({
        container: document.getElementById('parameterPanel'),
        setParam: (param, value, { interactive }) => handleParameterChange(param, value, { preview: interactive }),
        setMatchMugWallAngle,
        setMoldPreview: setMoldPreviewState,
        setMoldSetting: (setting, value) => {
            handleStateManager.setViewSetting(setting, value);
            updateMoldConstructionViewport();
        },
        getMoldSettings: () => getMoldConstructionSettingsFromState(),
        setViewSetting,
        setCameraView: (view) => {
            handleStateManager.setViewSetting('cameraView', view);
            getHandleViewport()?.setCameraView(view);
        },
        resetView: () => getHandleViewport()?.resetView(),
        // Drags preview at interactive resolution; the release rebuilds at full resolution
        onGestureStart: () => {},
        onGestureEnd: (changed) => {
            if (!changed) return;
            clearTimeout(finalHandleUpdateTimer);
            finalHandleUpdateTimer = null;
            regenerateHandle({ preview: false });
        }
    });
}

// === Header chrome ===

let panelToggle = null;

function initHeaderChrome() {
    panelToggle = initPanelToggle(document.getElementById('btnTogglePanel'), 'handle_dials_visible');
    initDkMenu(document.getElementById('fileMenu'));
}

/**
 * Calculate mug wall angle from mug dimensions
 * Returns angle in degrees (positive means top is wider)
 */
function calculateMugWallAngle() {
    const state = handleStateManager.getState();
    const { mugData } = state;

    if (!mugData.loaded) {
        // Use default mug dimensions
        const topRadius = 40;  // default topDiameter/2
        const bottomRadius = 30;  // default bottomDiameter/2
        const height = 95;

        const radiusDiff = topRadius - bottomRadius;
        const angleRad = Math.atan(radiusDiff / height);
        return angleRad * 180 / Math.PI;
    }

    const topRadius = mugData.topDiameter / 2;
    const bottomRadius = mugData.bottomDiameter / 2;
    const height = mugData.height;

    const radiusDiff = topRadius - bottomRadius;
    const angleRad = Math.atan(radiusDiff / height);
    return angleRad * 180 / Math.PI;
}

/**
 * Set the vertical arm angle to the mug's wall angle (clamped to the dial range)
 */
function applyMatchedArmAngle() {
    const clampedAngle = Math.max(-30, Math.min(30, Math.round(calculateMugWallAngle())));
    if (handleStateManager.getState().handleParams.verticalArmAngle !== clampedAngle) {
        handleStateManager.setHandleParam('verticalArmAngle', clampedAngle);
    }
}

/**
 * Toggle matching the vertical arm angle to the mug wall angle
 */
function setMatchMugWallAngle(enabled) {
    handleStateManager.setHandleParam('matchMugWallAngle', enabled);
    if (enabled) applyMatchedArmAngle();
    regenerateHandle();
}

/**
 * Handle parameter changes
 */
function handleParameterChange(param, value, options = {}) {
    clearTimeout(finalHandleUpdateTimer);
    finalHandleUpdateTimer = null;
    handleStateManager.setHandleParam(param, value);
    regenerateHandle({ preview: options.preview === true });

    if (options.preview) {
        finalHandleUpdateTimer = setTimeout(() => {
            finalHandleUpdateTimer = null;
            regenerateHandle({ preview: false });
        }, FINAL_HANDLE_UPDATE_DELAY_MS);
    }
}

/**
 * Regenerate handle mesh
 */
function regenerateHandle(options = {}) {
    const state = handleStateManager.getState();
    const viewport = getHandleViewport();

    if (viewport) {
        viewport.updateHandle(state.handleParams, state.mugData, { preview: options.preview === true });
        viewport.updateMug(state.mugData);
    }

    renderCrossSectionPreview();

    // Update dimension overlays
    updateDimensionOverlays();

    // Update handle size readout
    updateDimensionsSummary();

    // Update mold kit summary
    updateMoldKitSummary();

    // Update warnings
    updateWarnings();
}

function renderCrossSectionPreview() {
    const { handleParams } = handleStateManager.getState();
    getCrossSectionPreview()?.render(
        handleParams.crossSectionWidth,
        handleParams.crossSectionHeight,
        handleParams.crossSectionType,
        handleParams.crossSectionCornerRadius
    );
}

/**
 * Update dimension overlays
 */
function updateDimensionOverlays() {
    const overlays = getDimensionOverlays();
    const viewport = getHandleViewport();
    const state = handleStateManager.getState();

    if (overlays && viewport && state.viewSettings.showDimensions) {
        overlays.update(state.handleParams, viewport.camera, state.mugData);
    }
}

/**
 * Initialize header buttons (File menu items)
 */
function initHeaderButtons() {
    // New Project - requires mug selection
    document.getElementById('btnNewProject').addEventListener('click', () => {
        const createNewWithMug = async () => {
            // First check if there are any dinnerware or vessel projects
            if (!hasImportSource()) {
                showConfirmModal(
                    'No Mug or Vessel Projects Found',
                    'You need a mug (Dinnerware Generator) or a vessel (Vessel V2/V3) first. Would you like to go there now?',
                    () => {
                        window.location.href = resolveAppUrl('index.html');
                    },
                    'Go to Dinnerware Generator',
                    'Cancel'
                );
                return;
            }

            // Show mug import modal - required for new project
            const mugData = await showMugImportModal();
            if (mugData) {
                handleStateManager.resetToNew();
                handleStateManager.setMugData(mugData);
                applyViewSettings();
                updateUI();
                regenerateHandle();
            }
            // If cancelled, don't create new project
        };

        if (handleStateManager.getState().ui.hasUnsavedChanges) {
            showConfirmModal(
                'Unsaved Changes',
                'You have unsaved changes. Are you sure you want to create a new project?',
                createNewWithMug
            );
        } else {
            createNewWithMug();
        }
    });

    // Load Project
    document.getElementById('btnLoadProject').addEventListener('click', loadProjectFromFile);

    // Save Project
    document.getElementById('btnSaveProject').addEventListener('click', showSaveModal);

    // Export STL
    document.getElementById('btnExportSTL').addEventListener('click', showExportModal);

    // Export Mold Kit
    document.getElementById('btnExportMoldKit').addEventListener('click', showMoldExportModal);

    // Change Source (mug or vessel)
    document.getElementById('btnChangeMug').addEventListener('click', changeSource);
}

function changeSource() {
    const pickSource = () => {
        showMugImportModal().then(mugData => {
            if (mugData) {
                updateUI();
                regenerateHandle();
            }
        });
    };
    if (handleStateManager.getState().ui.hasUnsavedChanges) {
        showConfirmModal(
            'Unsaved Changes',
            'Changing the mug will affect handle dimensions. Continue?',
            pickSource
        );
    } else {
        pickSource();
    }
}

/**
 * Rename the project from the header
 */
function initProjectNameEditing() {
    const nameEl = document.getElementById('projectName');
    let originalName = '';
    let cancelEdit = false;

    nameEl.addEventListener('focus', () => {
        originalName = handleStateManager.getState().project.name || 'Untitled Handle';
        cancelEdit = false;
        requestAnimationFrame(() => {
            const range = document.createRange();
            range.selectNodeContents(nameEl);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
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
        if (nextName === handleStateManager.getState().project.name) return;
        handleStateManager.setProject({ name: nextName });
        handleStateManager.setState(state => ({
            ...state,
            ui: { ...state.ui, hasUnsavedChanges: true },
        }), ['ui']);
    });
}

/**
 * Keep the viewport and cross-section preview in step with light/dark mode
 */
function initThemeSync() {
    const applyTheme = () => {
        const isDark = document.documentElement.getAttribute('data-mode') !== 'light';
        getHandleViewport()?.setTheme(isDark);
        renderCrossSectionPreview();
    };
    new MutationObserver(applyTheme).observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-mode']
    });
    applyTheme();
}

/**
 * Source and warnings readout cards
 */
function initReadouts() {
    document.getElementById('btnChangeSource').addEventListener('click', changeSource);
    document.getElementById('warningsList').addEventListener('click', (event) => {
        const item = event.target.closest('.warning-item[data-param]');
        if (!item) return;
        panelToggle?.setVisible(true);
        dials?.revealParam(item.dataset.param);
    });
}

// View settings applied to the viewport (mold preview is handled separately)
const VIEW_SETTING_ACTIONS = {
    mugDisplayMode: (mode) => getHandleViewport()?.setMugDisplayMode(mode),
    showCrossSection: (show) => getHandleViewport()?.setShowCrossSection(show),
    showDimensions: (show) => {
        getDimensionOverlays()?.setVisible(show && !handleStateManager.getState().viewSettings.showMoldPreview);
        updateDimensionOverlays();
        getHandleViewport()?.requestRender();
    },
    showAttachmentOutlines: (show) => getHandleViewport()?.setShowAttachmentOutlines(show),
    showGrid: (show) => getHandleViewport()?.setShowGrid(show),
};

function setViewSetting(setting, value) {
    handleStateManager.setViewSetting(setting, value);
    VIEW_SETTING_ACTIONS[setting]?.(value);
}

/**
 * Apply loaded/reset view settings to the viewport so it matches the dials
 */
function applyViewSettings() {
    const viewport = getHandleViewport();
    if (!viewport?.webglAvailable) return;
    const { viewSettings } = handleStateManager.getState();
    Object.entries(VIEW_SETTING_ACTIONS).forEach(([setting, apply]) => apply(viewSettings[setting]));
    const showMold = viewSettings.showMoldPreview === true;
    if (viewport.showMoldPreview !== showMold) setMoldPreviewState(showMold);
}

/**
 * Update warnings display
 */
function updateWarnings() {
    const warnings = handleStateManager.getWarnings();
    const card = document.getElementById('warningsCard');
    const countEl = document.getElementById('warningCount');
    const listEl = document.getElementById('warningsList');
    if (!card || !countEl || !listEl) return;

    card.hidden = warnings.length === 0;
    if (warnings.length === 0) {
        listEl.innerHTML = '';
        return;
    }

    countEl.textContent = `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;

    listEl.innerHTML = warnings.map(warning => `
        <button type="button" class="warning-item severity-${warning.type === 'error' ? 'error' : 'warning'}" data-param="${escapeHtml(warning.param)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span class="warning-item-content">
                <span class="warning-item-title">${escapeHtml(warning.title)}</span>
                <span class="warning-item-message">${escapeHtml(warning.message)}</span>
            </span>
        </button>
    `).join('');
}

/**
 * Update the handle size readout
 */
function updateDimensionsSummary() {
    const state = handleStateManager.getState();
    const { topAttachmentHeight, bottomAttachmentHeight, handleProtrusion, handleWidth } = state.handleParams;
    const summaryEl = document.getElementById('handleDimensionsSummary');
    if (!summaryEl) return;

    // Handle height is derived from attachment points
    const handleHeight = topAttachmentHeight - bottomAttachmentHeight;
    summaryEl.textContent = `${handleHeight} × ${handleProtrusion} × ${handleWidth}mm`;
}

function getMoldConstructionSettingsFromState(state = handleStateManager.getState()) {
    return mergeMoldConstructionViewSettings({
        explode: state.viewSettings.moldExplode ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.explode,
        opacity: state.viewSettings.moldOpacity ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.opacity,
        showProof: state.viewSettings.moldShowProof ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.showProof,
        showHandleMold: state.viewSettings.moldShowHandleMold ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.showHandleMold,
        showWalls: state.viewSettings.moldShowWalls ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.showWalls,
        showBottom: state.viewSettings.moldShowBottom ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.showBottom
    });
}

function setMoldPreviewState(show) {
    handleStateManager.setViewSetting('showMoldPreview', show);
    const state = handleStateManager.getState();

    getHandleViewport()?.setShowMoldPreview(
        show,
        state.handleParams,
        state.mugData,
        getMoldConstructionSettingsFromState(state)
    );
    getDimensionOverlays()?.setVisible(!show && state.viewSettings.showDimensions);
    updateDimensionOverlays();
    updateMoldKitSummary();
}

function updateMoldConstructionViewport() {
    const state = handleStateManager.getState();
    if (!state.viewSettings.showMoldPreview) {
        return;
    }

    getHandleViewport()?.setMoldConstructionSettings(getMoldConstructionSettingsFromState(state));
}

function formatMoldSize(size) {
    return `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)}mm`;
}

export function updateMoldKitSummary(viewport = getHandleViewport()) {
    const proofEl = document.getElementById('moldProofSize');
    const formerEl = document.getElementById('moldFormerSize');
    const wallEl = document.getElementById('moldWallSize');
    const bottomEl = document.getElementById('moldBottomSize');
    const plasterEl = document.getElementById('moldPlasterEstimate');
    const fitEl = document.getElementById('moldFitStatus');

    if (!proofEl || !formerEl || !wallEl || !bottomEl || !plasterEl) {
        return;
    }

    const state = handleStateManager.getState();
    // The readout card is only shown while the mold is visualized
    const card = document.getElementById('moldKitSummary');
    if (card) card.hidden = !state.viewSettings.showMoldPreview;
    if (!state.viewSettings.showMoldPreview) {
        proofEl.textContent = '-';
        formerEl.textContent = '-';
        wallEl.textContent = '-';
        bottomEl.textContent = '-';
        plasterEl.textContent = '-';
        if (fitEl) {
            fitEl.textContent = 'Visualization off';
            fitEl.classList.remove('warning');
            fitEl.classList.add('paused');
        }
        return;
    }

    try {
        const summary = viewport?.getMoldSummary();
        if (!summary) throw new Error('No current mold preview');

        proofEl.textContent = formatMoldSize(summary.sizes.proof);
        formerEl.textContent = formatMoldSize(summary.sizes.handleMold);
        wallEl.textContent = formatMoldSize(summary.sizes.wallA);
        bottomEl.textContent = formatMoldSize(summary.sizes.bottom);
        plasterEl.textContent = `${summary.plasterVolumeL.toFixed(2)} L`;

        if (fitEl) {
            const diagnostics = summary.diagnostics;
            const wellWallGap = Number.isFinite(diagnostics.wellWallGap)
                ? diagnostics.wellWallGap.toFixed(2)
                : 'n/a';
            fitEl.textContent = diagnostics.formerContainsProofHalf && diagnostics.wallContactOk
                ? `Half-form OK · well-wall gap ${wellWallGap}mm · taper delta ${diagnostics.attachmentDeltaX.toFixed(1)}mm`
                : diagnostics.formerContainsProofHalf
                    ? `Fit issue · well-wall gap ${wellWallGap}mm`
                    : 'Fit issue · proof half exceeds handle mold bounds';
            fitEl.classList.toggle('warning', !diagnostics.formerContainsProofHalf || !diagnostics.wallContactOk);
            fitEl.classList.remove('paused');
        }
    } catch (error) {
        proofEl.textContent = '-';
        formerEl.textContent = '-';
        wallEl.textContent = '-';
        bottomEl.textContent = '-';
        plasterEl.textContent = 'Check parameters';
        if (fitEl) {
            fitEl.textContent = 'Fit unavailable';
            fitEl.classList.add('warning');
            fitEl.classList.remove('paused');
        }
    }
}

function formatMm(value) {
    return `${Number(Number(value).toFixed(1))}mm`;
}

/**
 * Update mug info display
 */
function updateMugInfo() {
    const state = handleStateManager.getState();
    const mugInfo = document.getElementById('mugInfo');
    const { mugData } = state;

    const name = mugData.loaded
        ? (mugData.projectName || 'Imported Mug')
        : (mugData.projectName || 'No mug loaded');
    mugInfo.innerHTML = `
        <div class="mug-info-name">${escapeHtml(name)}</div>
        <dl class="mug-info-dims">
            <div><dt>Height</dt><dd>${formatMm(mugData.height)}</dd></div>
            <div><dt>Ø Top</dt><dd>${formatMm(mugData.topDiameter)}</dd></div>
            <div><dt>Ø Base</dt><dd>${formatMm(mugData.bottomDiameter)}</dd></div>
        </dl>
    `;
}

/**
 * Update UI to reflect current state
 */
function updateUI() {
    // Matching the mug's wall angle follows the current source
    if (handleStateManager.getState().handleParams.matchMugWallAngle) {
        applyMatchedArmAngle();
    }

    const state = handleStateManager.getState();

    // Update project name
    document.getElementById('projectName').textContent = state.project.name;

    // Update unsaved indicator
    document.getElementById('unsavedIndicator').hidden = !state.ui.hasUnsavedChanges;

    // Update mug info
    updateMugInfo();

    // Update every dial from the state
    dials?.sync();

    updateMoldKitSummary();
}

/**
 * State change handler
 */
function onStateChange(state, changedPaths) {
    // Update unsaved indicator
    document.getElementById('unsavedIndicator').hidden = !state.ui.hasUnsavedChanges;

    // Update warnings if handle params changed
    if (changedPaths.includes('handleParams')) {
        updateWarnings();
    }
}

// === Dialogs ===

/**
 * Close buttons, Cancel buttons and backdrops close their dialog; the
 * confirm buttons act on the dialog's current purpose. Escape is handled by
 * accessibility.js.
 */
function initDialogs() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.querySelectorAll('.btn-close, .modal-backdrop').forEach(el => {
            el.addEventListener('click', () => closeDialog(modal));
        });
    });
    [
        ['btnCancelExport', 'exportModal'],
        ['btnCancelSave', 'saveModal'],
        ['btnConfirmCancel', 'confirmModal'],
        ['btnCancelMugImport', 'mugImportModal']
    ].forEach(([buttonId, modalId]) => {
        document.getElementById(buttonId).addEventListener('click', () => {
            closeDialog(document.getElementById(modalId));
        });
    });

    // Save
    document.getElementById('btnConfirmSave').addEventListener('click', confirmSave);
    document.getElementById('saveProjectName').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') confirmSave();
    });

    // Export (STL or mold kit)
    document.getElementById('btnConfirmExport').addEventListener('click', () => {
        if (exportMode === 'mold') exportMoldKit();
        else exportHandleSTL();
    });

    // Confirm
    document.getElementById('btnConfirmOk').addEventListener('click', () => {
        const callback = confirmCallback;
        confirmCallback = null;
        closeDialog(document.getElementById('confirmModal'));
        callback?.();
    });
}

/**
 * Show save modal
 */
function showSaveModal() {
    const nameInput = document.getElementById('saveProjectName');
    nameInput.value = handleStateManager.getState().project.name;
    openDialog(document.getElementById('saveModal'), { initialFocus: '#saveProjectName' });
    requestAnimationFrame(() => nameInput.select());
}

function confirmSave() {
    const name = document.getElementById('saveProjectName').value.trim() || 'Untitled Handle';
    const downloadFile = document.getElementById('saveAsFile').checked;
    closeDialog(document.getElementById('saveModal'));
    saveProject(name, downloadFile);
}

/**
 * Save project to localStorage
 */
function saveProject(name, downloadFile = false) {
    const state = handleStateManager.getState();
    const projectId = state.project.id || generateId();
    const now = new Date().toISOString();

    // Capture thumbnail from viewport
    const viewport = getHandleViewport();
    const thumbnail = viewport ? viewport.captureThumbnail(400, 300) : null;

    handleStateManager.setProject({
        id: projectId,
        name: name,
        modifiedAt: now,
        createdAt: state.project.createdAt || now,
    });

    const projectData = {
        ...handleStateManager.getProjectData(),
        thumbnail: thumbnail,
        project: {
            ...handleStateManager.getProjectData().project,
            id: projectId,
            name: name,
            modifiedAt: now,
            createdAt: state.project.createdAt || now,
        },
    };

    // Get existing projects
    let projects = [];
    try {
        const stored = localStorage.getItem(HANDLE_STORAGE_KEY);
        if (stored) projects = JSON.parse(stored);
    } catch (e) {
        console.error('Error loading projects:', e);
    }

    // Update or add project
    const existingIndex = projects.findIndex(p => p.project?.id === projectId);
    if (existingIndex >= 0) {
        projects[existingIndex] = projectData;
    } else {
        projects.push(projectData);
    }

    // Save back
    localStorage.setItem(HANDLE_STORAGE_KEY, JSON.stringify(projects));

    // Optionally download as file
    if (downloadFile) {
        downloadProjectFile(name);
    }

    // Mark as saved
    handleStateManager.markSaved();
    updateUI();

    // Show success feedback
    showToast(`“${name}” saved`);
}

/**
 * Brief confirmation toast at the bottom of the viewport
 */
let toastTimer = null;

function showToast(message) {
    let toast = document.getElementById('saveToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'saveToast';
        toast.className = 'dk-toast';
        toast.setAttribute('role', 'status');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 3000);
}

/**
 * Download project as JSON file
 */
function downloadProjectFile(name) {
    const state = handleStateManager.getState();
    const projectId = state.project.id || generateId();
    const now = new Date().toISOString();

    // Capture thumbnail
    const viewport = getHandleViewport();
    const thumbnail = viewport ? viewport.captureThumbnail(400, 300) : null;

    // Prepare project data
    const projectData = {
        ...handleStateManager.getProjectData(),
        thumbnail: thumbnail,
        project: {
            id: projectId,
            name: name,
            modifiedAt: now,
            createdAt: state.project.createdAt || now,
        },
    };

    // Create enhanced JSON format
    const enhancedData = ProjectFileFormat.serialize(projectData, 'handle');
    const json = JSON.stringify(enhancedData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp
    const filename = ProjectFileFormat.generateFilename(
        name,
        'handle',
        new Date()
    );

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Load project from JSON file
 */
function loadProjectFromFile() {
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

                // Validate it's a handle project
                if (deserialized.fileFormat.appType !== 'handle') {
                    throw new Error('This is not a handle project file');
                }

                projectData = deserialized.state;
            } else {
                // Legacy format - assume it's handle data
                projectData = data;
            }

            // Load the project
            loadProject(projectData);
            showToast(`“${projectData.project?.name || 'Imported Project'}” loaded`);
        } catch (error) {
            console.error('Load project file error:', error);
            alert('Failed to load project file: ' + error.message);
        }
    });

    input.click();
}

/**
 * Load a project
 */
function loadProject(projectData) {
    handleStateManager.loadProject(projectData);
    applyViewSettings();
    updateUI();
    regenerateHandle();
}

/**
 * Load project by ID
 */
function loadProjectById(projectId) {
    try {
        const stored = localStorage.getItem(HANDLE_STORAGE_KEY);
        if (!stored) return;

        const projects = JSON.parse(stored);
        const project = projects.find(p => p.project.id === projectId);

        if (project) {
            loadProject(project);
        }
    } catch (e) {
        console.error('Error loading project:', e);
    }
}

// === Export ===

// The export dialog serves both the handle STL and the mold kit ZIP
let exportMode = 'stl';

function prepareExportDialog({ mode, title, confirmLabel, filename, note }) {
    exportMode = mode;
    document.getElementById('exportTitle').textContent = title;
    document.getElementById('handleExportOptions').hidden = mode !== 'stl';
    const confirmBtn = document.getElementById('btnConfirmExport');
    confirmBtn.textContent = confirmLabel;
    confirmBtn.disabled = false;
    document.getElementById('exportFilename').textContent = filename;
    document.getElementById('exportNote').textContent = note;
    document.getElementById('exportError').hidden = true;
    document.getElementById('exportProgress').hidden = true;
    document.getElementById('exportProgressFill').style.width = '0%';
    openDialog(document.getElementById('exportModal'), { initialFocus: '#btnConfirmExport' });
}

function setExportProgress(percent, text) {
    document.getElementById('exportProgress').hidden = false;
    document.getElementById('exportProgressFill').style.width = `${percent}%`;
    document.getElementById('exportProgressText').textContent = text;
}

function showExportError(message) {
    const errorEl = document.getElementById('exportError');
    errorEl.textContent = message;
    errorEl.hidden = false;
    document.getElementById('exportProgress').hidden = true;
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Show export modal
 */
async function showExportModal() {
    const { getSuggestedFilename } = await loadHandleExporter();
    prepareExportDialog({
        mode: 'stl',
        title: 'Export STL',
        confirmLabel: 'Export',
        filename: getSuggestedFilename(handleStateManager.getState().project.name),
        note: 'Handle will be exported with attachment geometry for boolean union with mug.'
    });
}

async function exportHandleSTL() {
    const modal = document.getElementById('exportModal');
    const confirmBtn = document.getElementById('btnConfirmExport');
    const orientation = document.getElementById('exportOrientation').value || 'mug-relative';
    const { downloadSTL, exportHandleToSTL, getSuggestedFilename } = await loadHandleExporter();
    const exportState = handleStateManager.getState();

    confirmBtn.disabled = true;
    document.getElementById('exportError').hidden = true;
    setExportProgress(30, 'Generating mesh...');
    try {
        // Let the progress bar paint before the synchronous mesh build
        await wait(100);
        setExportProgress(60, 'Creating STL...');
        const blob = exportHandleToSTL(exportState.handleParams, exportState.mugData, { orientation });
        setExportProgress(90, 'Downloading...');
        await downloadSTL(blob, getSuggestedFilename(exportState.project.name));
        setExportProgress(100, 'Complete!');
        await wait(500);
        closeDialog(modal);
    } catch (error) {
        console.error('Export error:', error);
        showExportError(`Export failed: ${error.message}`);
    } finally {
        confirmBtn.disabled = false;
    }
}

/**
 * Show mold-kit export modal
 */
async function showMoldExportModal() {
    const moldExporter = await loadHandleMoldExporter();
    const state = handleStateManager.getState();
    const previewPackage = moldExporter.generateHandleMoldPackage(state.handleParams, state.mugData);

    try {
        prepareExportDialog({
            mode: 'mold',
            title: 'Export Mold Kit',
            confirmLabel: 'Export Mold Kit',
            filename: moldExporter.getSuggestedMoldPackageFilename(state.project.name),
            note: `Includes Proof, Handle Mold, WallA, WallB, Bottom, and readme. Plaster estimate ${previewPackage.plaster.plasterVolumeL.toFixed(2)} L.`
        });
    } finally {
        moldExporter.disposeHandleMoldPackage(previewPackage);
    }
}

async function exportMoldKit() {
    const modal = document.getElementById('exportModal');
    const confirmBtn = document.getElementById('btnConfirmExport');
    const moldExporter = await loadHandleMoldExporter();
    const exportState = handleStateManager.getState();

    confirmBtn.disabled = true;
    document.getElementById('exportError').hidden = true;
    setExportProgress(25, 'Generating mold package...');
    try {
        await wait(100);
        setExportProgress(55, 'Validating STL parts...');
        await moldExporter.exportHandleMoldPackageAsZip(
            exportState.handleParams,
            exportState.mugData,
            exportState.project.name
        );
        setExportProgress(100, 'Complete!');
        await wait(500);
        closeDialog(modal);
    } catch (error) {
        console.error('Mold export error:', error);
        showExportError(`Mold export failed: ${error.message}`);
    } finally {
        confirmBtn.disabled = false;
    }
}

/**
 * Show confirmation modal
 */
let confirmCallback = null;

function showConfirmModal(title, message, onConfirm, confirmLabel = 'OK', cancelLabel = 'Cancel') {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('btnConfirmOk').textContent = confirmLabel;
    document.getElementById('btnConfirmCancel').textContent = cancelLabel;
    confirmCallback = onConfirm;
    openDialog(document.getElementById('confirmModal'));
}

// Helper functions
function generateId() {
    return 'handle_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
