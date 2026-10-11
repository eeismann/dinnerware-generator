/**
 * Dinnerware Generator - Main Application
 * Web-based parametric dinnerware 3D model generator
 */

import {
    stateManager,
    parameterResolver,
    ITEM_TYPES,
    ITEM_NAMES
} from './state/projectState.js';
import { initViewport, getViewport } from './ui/viewport.js';
import { getItemDimensions } from './geometry/meshGenerator.js';
import { warningSystem, clampValue } from './utils/validation.js';
import { saveProject as saveToStorage, getProject } from './dashboard/projectStorage.js';
import { init as initTheme } from './ui/themeManager.js';
import { ProjectFileFormat } from './storage/fileFormat.js';
import { resolveAppUrl } from './utils/navigation.js';
import { selectDinnerwareState, startDinnerwareProject, newDinnerwareDraftId } from './storage/dinnerwareDrafts.js';
import { DesignHistory, DESIGN_KEYS } from './state/history.js';
import {
    BUILT_IN_PRESETS, applyPreset, loadUserPresets, saveUserPreset, deleteUserPreset
} from './state/presets.js';
import { openDialog, closeDialog } from './ui/accessibility.js';
import { ProfilePanel } from './ui/profilePanel.js';
import {
    initDinnerwareDials, PATTERN_PARAM_SUFFIXES, patternParamName
} from './ui/dialkit/dinnerwareDials.js';

let stlExporterPromise = null;

function loadStlExporter() {
    if (!stlExporterPromise) {
        stlExporterPromise = import('./geometry/stlExporter.js');
    }
    return stlExporterPromise;
}

// DOM Elements
let viewport;
let elements = {};

function updateProjectUrl(projectId) {
    const url = new URL(window.location.href);
    url.searchParams.set('project', projectId);
    window.history.replaceState(null, '', url);
}

/**
 * Initialize the application
 */
function init() {
    // Cache DOM elements
    cacheElements();

    // Initialize viewport
    viewport = initViewport(elements.viewport);

    // Select the newest draft for this project without overwriting it on startup.
    try {
        const query = new URLSearchParams(window.location.search);
        const projectId = query.has('project') ? query.get('project') : localStorage.getItem('dinnerware_editing_project_id');
        const saved = projectId ? getProject(projectId) : null;
        const restored = selectDinnerwareState(saved, projectId);
        if (restored) stateManager.state = stateManager.mergeWithDefaults(restored);
        stateManager.state.project.id = projectId || newDinnerwareDraftId();
        localStorage.setItem('dinnerware_editing_project_id', stateManager.state.project.id);
        updateProjectUrl(stateManager.state.project.id);
    } catch (error) {
        alert(`Could not restore the project: ${error.message}`);
        return;
    }

    // Flush the debounce before a reload or backgrounding the app.
    window.addEventListener('pagehide', () => {
        if (stateManager.getState('project.isDirty')) stateManager.autoSave();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && stateManager.getState('project.isDirty')) stateManager.autoSave();
    });

    // Initialize UI
    initFooterControls();
    initHeaderButtons();
    initProjectNameEditing();
    initModals();
    initHistory();
    initDials();
    initSelection();
    initProfilePanel();
    initCompare();
    initKeyboardShortcuts();
    initPanelDrawer();

    // Restore the saved layout without marking the project dirty
    const savedLayout = stateManager.getState('ui.layoutMode');
    if (LAYOUT_MODES.includes(savedLayout)) {
        viewport.layoutMode = savedLayout;
    }

    // Generate initial meshes
    viewport.updateAllItems();

    // Initial validation
    refreshWarnings();

    // Subscribe to state changes
    subscribeToStateChanges();

    // Update UI from state
    updateUIFromState();

    console.log('Dinnerware Generator initialized');
}

/**
 * Cache frequently used DOM elements
 */
function cacheElements() {
    elements = {
        viewport: document.getElementById('viewport'),
        projectName: document.getElementById('projectName'),
        unsavedIndicator: document.getElementById('unsavedIndicator'),
        warningsMenuContainer: document.getElementById('warningsMenuContainer'),
        warningsList: document.getElementById('warningsList'),
        warningCount: document.getElementById('warningCount'),
        statusInfo: document.getElementById('statusInfo'),
        exportModal: document.getElementById('exportModal'),
        exportItemList: document.getElementById('exportItemList'),
        exportProgress: document.getElementById('exportProgress'),
        exportProgressFill: document.getElementById('exportProgressFill'),
        exportProgressText: document.getElementById('exportProgressText'),
        exportUpAxis: document.getElementById('exportUpAxis'),
        exportAsZip: document.getElementById('exportAsZip'),
        exportError: document.getElementById('exportError'),
        btnConfirmExport: document.getElementById('btnConfirmExport'),
        saveModal: document.getElementById('saveModal'),
        saveProjectName: document.getElementById('saveProjectName'),
        saveAsFile: document.getElementById('saveAsFile'),
        confirmModal: document.getElementById('confirmModal'),
        confirmTitle: document.getElementById('confirmTitle'),
        confirmMessage: document.getElementById('confirmMessage'),
        loadingSpinner: document.getElementById('loadingSpinner')
    };
}

function updatePlateFootringDependents(itemType, paramName) {
    if (itemType !== 'plate' || paramName !== 'footringBaseWidth'
        || !stateManager.getState('globalParameters.footringWidthProportional')) return;

    ITEM_TYPES.forEach(item => {
        if (item !== 'plate' && !parameterResolver.hasOverride(item, 'footringBaseWidth')) {
            scheduleItemUpdate(item);
        }
    });
}

// Coalesced mesh regeneration: slider "input" events fire continuously, so
// rebuilds (plus validation) run at most once per animation frame. While a
// slider is being dragged the viewport builds lighter interactive meshes;
// releasing it schedules the full-resolution rebuild.
const pendingMeshUpdates = new Map();
let meshUpdateFrame = null;

function scheduleItemUpdate(itemType, { preserveLayout = false, interactive = false } = {}) {
    if (itemType) {
        const pending = pendingMeshUpdates.get(itemType);
        // Any full-layout or full-resolution request wins when coalesced.
        pendingMeshUpdates.set(itemType, pending === undefined
            ? { preserveLayout, interactive }
            : {
                preserveLayout: pending.preserveLayout && preserveLayout,
                interactive: pending.interactive && interactive
            });
    }
    if (meshUpdateFrame === null) {
        meshUpdateFrame = requestAnimationFrame(flushPendingItemUpdates);
    }
}

function flushPendingItemUpdates() {
    meshUpdateFrame = null;
    let needsLayout = false;
    pendingMeshUpdates.forEach(({ preserveLayout, interactive }, itemType) => {
        viewport.updateItem(itemType, { preserveLayout, interactive, deferLayout: true });
        needsLayout ||= !preserveLayout;
    });
    pendingMeshUpdates.clear();
    if (needsLayout) viewport.arrangeItems();
    refreshWarnings();
    dials?.sync();
    updateHistoryButtons();
    profilePanel?.update();
}

/**
 * Validate and redraw the warnings list only when its contents changed.
 */
let lastWarningSignature = null;
function refreshWarnings() {
    warningSystem.validate();
    const signature = warningSystem.warnings.map(w => `${w.id}|${w.message}`).join('\n');
    if (signature === lastWarningSignature) return;
    lastWarningSignature = signature;
    updateWarningsDisplay();
}

/**
 * Handle parameter changes
 */
function handleParameterChange(paramName, value, { interactive = false } = {}) {
    if (paramName === 'footringWidthReduction' && !Number.isFinite(value)) return;
    // Global parameter
    stateManager.setState(`globalParameters.${paramName}`, value);

    // Update all items that use this parameter (not overridden)
    ITEM_TYPES.forEach(itemType => {
        const overrideParam = ['footringWidthProportional', 'footringWidthReduction'].includes(paramName)
            ? 'footringBaseWidth' : paramName;
        if (!parameterResolver.hasOverride(itemType, overrideParam)) {
            scheduleItemUpdate(itemType, { interactive });
        }
    });
}

/**
 * Set an item's height/width multiplier (percent of its base size).
 */
function setItemMultiplier(itemType, axis, value, { interactive = false } = {}) {
    stateManager.setState(`itemMultipliers.${itemType}.${axis}`, clampValue(value, 50, 200));
    scheduleItemUpdate(itemType, { preserveLayout: true, interactive });
}

/**
 * Set override value for an item parameter
 */
function setOverrideValue(itemType, paramName, value, { interactive = false } = {}) {
    const currentOverrides = {
        ...(stateManager.getState(`itemOverrides.${itemType}`) || {})
    };
    currentOverrides[paramName] = value;
    stateManager.setState(`itemOverrides.${itemType}`, currentOverrides);
    scheduleItemUpdate(itemType, { interactive });
    updatePlateFootringDependents(itemType, paramName);
    // Refresh the selection chip's override count
    if (!interactive && selectedItem === itemType) selectItem(itemType);
}

/**
 * Remove item overrides so the item follows the global values again.
 */
function clearOverrides(itemType, paramNames) {
    const currentOverrides = {
        ...(stateManager.getState(`itemOverrides.${itemType}`) || {})
    };
    paramNames.forEach(paramName => delete currentOverrides[paramName]);
    stateManager.setState(`itemOverrides.${itemType}`, currentOverrides);
    scheduleItemUpdate(itemType);
    paramNames.forEach(paramName => updatePlateFootringDependents(itemType, paramName));
    if (selectedItem === itemType) selectItem(itemType);
}

/**
 * Initialize footer controls. Camera, display, layout and item visibility
 * live in the View dial panel; the footer keeps the print-check menu.
 */
function initFooterControls() {
    const warningsMenuContainer = document.getElementById('warningsMenuContainer');
    const warningsMenuBtn = document.getElementById('btnWarningsMenu');

    warningsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        warningsMenuContainer.classList.toggle('open');
    });

    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!warningsMenuContainer.contains(e.target)) {
            warningsMenuContainer.classList.remove('open');
        }
    });
}

const LAYOUT_MODES = ['row', 'grid', 'stack', 'table'];

/**
 * Show only the given items in the viewport.
 */
function setVisibleItems(visibleItems) {
    stateManager.setState('ui.visibleItems', visibleItems);
    viewport.updateVisibility();
    updateStatusInfo();
}

/**
 * Initialize header buttons
 */
function initHeaderButtons() {
    // Back to Dashboard
    const backBtn = document.getElementById('btnBackToDashboard');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            if (stateManager.getState('project.isDirty')) {
                e.preventDefault();
                showConfirmDialog(
                    'Unsaved Changes',
                    'You have unsaved changes. Would you like to save before leaving?',
                    () => {
                        // Save first, then navigate
                        const name = stateManager.getState('project.name') || 'Untitled';
                        if (saveProject(name, false)) {
                            window.location.href = resolveAppUrl('dashboard.html');
                        }
                    }
                );
            }
            // If no unsaved changes, the default link behavior will navigate
        });
    }

    // New Project
    document.getElementById('btnNewProject').addEventListener('click', () => {
        if (stateManager.getState('project.isDirty')) {
            showConfirmDialog(
                'New Project',
                'You have unsaved changes. Are you sure you want to create a new project?',
                () => {
                    createNewProject();
                }
            );
        } else {
            createNewProject();
        }
    });

    // Save Project
    document.getElementById('btnSaveProject').addEventListener('click', () => {
        showSaveModal();
    });

    // Load Project
    document.getElementById('btnLoadProject').addEventListener('click', () => {
        loadProject();
    });

    // Export STL
    document.getElementById('btnExportSTL').addEventListener('click', () => {
        showExportModal();
    });
}

/**
 * Make the project title editable in place without bypassing project state.
 * The title commits on blur/Enter and uses the normal dirty + auto-save path.
 */
function initProjectNameEditing() {
    const nameEl = elements.projectName;
    if (!nameEl) return;

    let originalName = stateManager.getState('project.name') || 'Untitled';
    let cancelEdit = false;

    const selectName = () => {
        const selection = window.getSelection();
        if (!selection) return;

        const range = document.createRange();
        range.selectNodeContents(nameEl);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    nameEl.addEventListener('focus', () => {
        originalName = stateManager.getState('project.name') || nameEl.textContent.trim() || 'Untitled';
        cancelEdit = false;
        nameEl.dataset.editing = 'true';
        requestAnimationFrame(selectName);
    });

    nameEl.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            nameEl.blur();
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            cancelEdit = true;
            nameEl.textContent = originalName;
            nameEl.blur();
        }
    });

    nameEl.addEventListener('blur', () => {
        delete nameEl.dataset.editing;

        if (cancelEdit) {
            cancelEdit = false;
            nameEl.textContent = originalName;
            return;
        }

        const nextName = nameEl.textContent.replace(/\s+/g, ' ').trim() || originalName || 'Untitled';
        nameEl.textContent = nextName;

        if (nextName !== stateManager.getState('project.name')) {
            saveProject(nextName, false);
        }
    });
}

/**
 * Create a new project
 */
function createNewProject() {
    if (stateManager.getState('project.isDirty') && !stateManager.autoSave()) return;
    const projectId = startDinnerwareProject(null);

    stateManager.reset();
    stateManager.state.project.id = projectId;
    updateProjectUrl(projectId);
    resetCompare();
    viewport.updateAllItems();
    updateUIFromState();
    history?.reset();
    refreshWarnings();
    elements.projectName.textContent = 'Untitled';
    elements.unsavedIndicator.hidden = true;
}

/**
 * Show save modal
 */
function showSaveModal() {
    elements.saveProjectName.value = stateManager.getState('project.name') || 'Untitled';
    openDialog(elements.saveModal);
}

/**
 * Save project to storage (with thumbnail) and optionally to file
 */
function saveProject(name, downloadFile = false) {
    try {
        stateManager.setState('project.name', name);
    
        // Capture thumbnail from viewport
        const thumbnail = viewport.captureThumbnail(400, 300);
    
        // Get or create project ID
        const projectId = stateManager.getState('project.id');
    
        // Prepare project data for storage
        const projectForStorage = {
            id: projectId || null,
            projectName: name,
            dateCreated: stateManager.getState('project.dateCreated'),
            thumbnail: thumbnail,
            state: stateManager.getState()
        };

        // Save to project storage
        const savedProject = saveToStorage(projectForStorage);

        // Store the project ID for future saves
        stateManager.state.project.id = savedProject.id;
        localStorage.setItem('dinnerware_editing_project_id', savedProject.id);
        stateManager.markSaved(savedProject);
        updateProjectUrl(savedProject.id);

        // Optionally download as file
        if (downloadFile) {
            // Create project data for file export (use exportState for proper format)
            const projectForFile = {
                id: savedProject.id,
                projectName: name,
                thumbnail: thumbnail,
                dateCreated: savedProject.dateCreated,
                lastModified: savedProject.lastModified,
                state: stateManager.exportState()  // Use exportState for file format
            };

            // Create enhanced JSON format
            const enhancedData = ProjectFileFormat.serialize(projectForFile, 'dinnerware');
            const json = JSON.stringify(enhancedData, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Generate filename with timestamp
            const filename = ProjectFileFormat.generateFilename(
                name,
                'dinnerware',
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

        elements.projectName.textContent = name;
        elements.unsavedIndicator.hidden = !stateManager.lastStorageError;
        closeDialog(elements.saveModal);
        return true;
    } catch (error) {
        console.error('Save failed:', error);
        stateManager.setState('project.isDirty', true);
        alert(`Could not save the project: ${error.message}. Your changes are still open.`);
        return false;
    }

}

/**
 * Load project from file
 */
function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);

                // Detect format (enhanced or legacy)
                const format = ProjectFileFormat.detectFormat(data);

                let stateData;
                let projectName;

                if (format === 'enhanced') {
                    // New enhanced format
                    const deserialized = ProjectFileFormat.deserialize(data);
                    if (deserialized.fileFormat.appType !== 'dinnerware') throw new Error('Open this project from the dashboard in its matching generator.');
                    stateData = deserialized.state;
                    projectName = deserialized.project.name;
                } else {
                    // Legacy format
                    stateData = data;
                    projectName = data.projectName || 'Imported Project';
                }

                // Validate before changing the active project identity.
                if (!stateData?.globalParameters) throw new Error('Invalid dinnerware project');
                if (stateManager.getState('project.isDirty') && !stateManager.autoSave()) return;
                const projectId = startDinnerwareProject(null);
                stateManager.importState(stateData);
                stateManager.state.project.id = projectId;
                updateProjectUrl(projectId);
                stateManager.autoSave();
                resetCompare();
                viewport.updateAllItems();
                updateUIFromState();
                history?.reset();
                refreshWarnings();

                elements.projectName.textContent = projectName;
                elements.unsavedIndicator.hidden = false;
            } catch (error) {
                console.error('Load project error:', error);
                alert('Failed to load project file: ' + error.message);
            }
        };
        reader.readAsText(file);
    });

    input.click();
}

/**
 * Show export modal: each item with its size, its measured triangle count
 * and file size, and any print warnings.
 */
let exportMeasureBuilder = null;
async function showExportModal() {
    const itemList = elements.exportItemList;
    itemList.innerHTML = '';
    setExportError('');
    const warningsByItem = new Map();
    sortedWarnings().forEach(w => {
        if (!warningsByItem.has(w.itemType)) warningsByItem.set(w.itemType, []);
        warningsByItem.get(w.itemType).push(w);
    });

    ITEM_TYPES.forEach(itemType => {
        const dims = getItemDimensions(itemType);
        const warnings = warningsByItem.get(itemType) || [];
        const issues = warnings.filter(w => w.severity !== 'info');
        const item = document.createElement('label');
        item.className = 'export-item';
        item.innerHTML = `
            <input type="checkbox" data-item="${itemType}" checked>
            <span class="export-item-name">${ITEM_NAMES[itemType]}</span>
            <span class="export-item-dims">${dims.diameter} × ${dims.height} mm</span>
            <span class="export-item-size" data-size="${itemType}">…</span>
            ${issues.length ? `<span class="export-item-warning severity-${issues[0].severity}" title="${issues.map(w => w.message).join('\n').replace(/"/g, '&quot;')}">${issues.length} issue${issues.length > 1 ? 's' : ''}</span>` : ''}
        `;
        itemList.appendChild(item);
    });

    if (elements.exportUpAxis) {
        elements.exportUpAxis.value = stateManager.getState('ui.exportUpAxis') === 'y' ? 'y' : 'z';
    }
    elements.exportProgress.hidden = true;
    openDialog(elements.exportModal, { initialFocus: '#btnConfirmExport' });

    // Measure the real export meshes off the main thread
    try {
        const { createSTLBuilder } = await loadStlExporter();
        exportMeasureBuilder?.dispose();
        const builder = createSTLBuilder(stateManager.getState());
        exportMeasureBuilder = builder;
        for (const itemType of ITEM_TYPES) {
            const { triangles, bytes } = await builder.measure(itemType);
            if (exportMeasureBuilder !== builder) return;
            const cell = itemList.querySelector(`[data-size="${itemType}"]`);
            if (cell) {
                cell.textContent = `${formatBytes(bytes)} · ${(triangles / 1000).toFixed(0)}k tris`;
                cell.dataset.bytes = bytes;
            }
        }
        builder.dispose();
        if (exportMeasureBuilder === builder) exportMeasureBuilder = null;
    } catch (error) {
        console.warn('Could not measure export meshes:', error);
    }
}

function formatBytes(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

function setExportError(message) {
    if (!elements.exportError) return;
    elements.exportError.textContent = message;
    elements.exportError.hidden = !message;
}

/**
 * Export selected items as STL
 */
async function exportSTL() {
    const selectedItems = [];
    elements.exportItemList.querySelectorAll('input:checked').forEach(checkbox => {
        const itemType = checkbox.dataset.item;
        selectedItems.push({
            type: itemType,
            displayName: ITEM_NAMES[itemType]
        });
    });

    if (selectedItems.length === 0) {
        setExportError('Select at least one item to export.');
        return;
    }
    setExportError('');

    const projectName = stateManager.getState('project.name') || 'Dinnerware';

    // Show progress
    elements.exportProgress.hidden = false;
    elements.exportProgressFill.style.width = '0%';
    elements.exportProgressText.textContent = 'Preparing export...';
    elements.btnConfirmExport.disabled = true;

    const upAxis = elements.exportUpAxis?.value === 'y' ? 'y' : 'z';
    if (stateManager.getState('ui.exportUpAxis') !== upAxis) {
        stateManager.setState('ui.exportUpAxis', upAxis);
    }
    const zip = Boolean(elements.exportAsZip?.checked) && selectedItems.length > 1;

    let builder = null;
    try {
        const { exportMultipleSTL, createSTLBuilder } = await loadStlExporter();
        // Export meshes are built (in a worker where available) without
        // touching the viewport's lighter preview geometry.
        builder = createSTLBuilder(stateManager.getState());
        await exportMultipleSTL(selectedItems, projectName, (progress) => {
            elements.exportProgressFill.style.width = `${progress.progress * 100}%`;

            if (progress.complete) {
                elements.exportProgressText.textContent = zip
                    ? `Export complete! ${progress.total} files saved in one ZIP.`
                    : `Export complete! ${progress.total} files saved.`;
                setTimeout(() => {
                    closeDialog(elements.exportModal);
                }, 1500);
            } else {
                elements.exportProgressText.textContent = `Exporting ${progress.itemName}... (${progress.current}/${progress.total})`;
            }
        }, { builder, upAxis, zip });
    } catch (error) {
        console.error('STL export blocked:', error);
        elements.exportProgress.hidden = true;
        setExportError(`Export stopped: ${error.message}`);
    } finally {
        builder?.dispose();
        elements.btnConfirmExport.disabled = false;
    }
}

/**
 * Initialize modals
 */
function initModals() {
    // Export modal
    elements.exportModal.addEventListener('click', (event) => {
        if (event.target.closest('#btnCloseExportModal, #btnCancelExport, .modal-backdrop')) {
            exportMeasureBuilder?.dispose();
            exportMeasureBuilder = null;
        }
    });

    document.getElementById('btnCloseExportModal').addEventListener('click', () => {
        closeDialog(elements.exportModal);
    });

    document.getElementById('btnCancelExport').addEventListener('click', () => {
        closeDialog(elements.exportModal);
    });

    document.getElementById('btnConfirmExport').addEventListener('click', () => {
        exportSTL();
    });

    document.getElementById('btnExportSelectAll').addEventListener('click', () => {
        elements.exportItemList.querySelectorAll('input').forEach(cb => cb.checked = true);
    });

    document.getElementById('btnExportDeselectAll').addEventListener('click', () => {
        elements.exportItemList.querySelectorAll('input').forEach(cb => cb.checked = false);
    });

    // Save modal
    document.getElementById('btnCloseSaveModal').addEventListener('click', () => {
        closeDialog(elements.saveModal);
    });

    document.getElementById('btnCancelSave').addEventListener('click', () => {
        closeDialog(elements.saveModal);
    });

    document.getElementById('btnConfirmSave').addEventListener('click', () => {
        const name = elements.saveProjectName.value.trim() || 'Untitled';
        const downloadFile = elements.saveAsFile.checked;
        saveProject(name, downloadFile);
    });

    // Confirm modal
    document.getElementById('btnCloseConfirmModal').addEventListener('click', () => {
        closeDialog(elements.confirmModal);
    });

    document.getElementById('btnConfirmCancel').addEventListener('click', () => {
        closeDialog(elements.confirmModal);
    });

    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            closeDialog(backdrop.parentElement);
        });
    });
}

/**
 * Show confirmation dialog
 */
let confirmCallback = null;
function showConfirmDialog(title, message, onConfirm) {
    elements.confirmTitle.textContent = title;
    elements.confirmMessage.textContent = message;
    confirmCallback = onConfirm;
    openDialog(elements.confirmModal);
}

// Set up confirm button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnConfirmOk').addEventListener('click', () => {
        closeDialog(elements.confirmModal);
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
    });
});

/**
 * Subscribe to state changes
 */
function subscribeToStateChanges() {
    stateManager.subscribe('storage.error', (message) => {
        elements.unsavedIndicator.textContent = message ? 'Draft not saved' : '•';
        elements.unsavedIndicator.title = message ? `Draft could not be saved: ${message}` : '';
        if (message) elements.unsavedIndicator.hidden = false;
    });
    // Update unsaved indicator
    stateManager.subscribe('project.isDirty', (isDirty) => {
        elements.unsavedIndicator.hidden = !isDirty;
    });

    // Update visible items
    stateManager.subscribe('ui.visibleItems', () => {
        updateStatusInfo();
    });
}

/**
 * Update UI from current state
 */
function updateUIFromState() {
    const state = stateManager.getState();

    // Update project name
    elements.projectName.textContent = state.project.name || 'Untitled';

    // Update every dial from the state
    dials.sync();

    // Update status
    updateStatusInfo();
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };
const SEVERITY_LABELS = { error: 'Cannot build', warning: 'Print risk', info: 'Note' };

function sortedWarnings() {
    return [...warningSystem.warnings].sort((a, b) =>
        (SEVERITY_ORDER[a.severity] ?? 1) - (SEVERITY_ORDER[b.severity] ?? 1));
}

/**
 * Footer list entries: advisory notes of the same kind collapse into one
 * entry naming every affected item.
 */
function listedWarnings() {
    const listed = [];
    const notes = new Map();
    sortedWarnings().forEach(warning => {
        if (warning.severity !== 'info') {
            listed.push(warning);
            return;
        }
        const group = notes.get(warning.type);
        if (group) {
            group.items.push(warning.itemName);
            group.itemName = group.items.length > 2
                ? `${group.items.length} items`
                : group.items.join(', ');
        } else {
            const entry = { ...warning, items: [warning.itemName] };
            notes.set(warning.type, entry);
            listed.push(entry);
        }
    });
    return listed;
}

/**
 * Update warnings display: the footer list (most severe first), the inline
 * notes under each affected control, and the tint on affected items.
 */
function updateWarningsDisplay() {
    const warnings = listedWarnings();
    viewport.setWarnedItems(warnings
        .filter(w => w.severity !== 'info')
        .map(w => w.itemType));

    if (warnings.length === 0) {
        elements.warningsMenuContainer.hidden = true;
        elements.warningsList.innerHTML = '';
    } else {
        elements.warningsMenuContainer.hidden = false;
        const counts = { error: 0, warning: 0, info: 0 };
        warnings.forEach(w => { counts[w.severity in counts ? w.severity : 'warning']++; });
        const parts = [];
        if (counts.error) parts.push(`${counts.error} error${counts.error > 1 ? 's' : ''}`);
        if (counts.warning) parts.push(`${counts.warning} warning${counts.warning > 1 ? 's' : ''}`);
        if (counts.info) parts.push(`${counts.info} note${counts.info > 1 ? 's' : ''}`);
        elements.warningCount.textContent = parts.join(' · ');
        elements.warningsMenuContainer.dataset.severity = counts.error ? 'error' : counts.warning ? 'warning' : 'info';

        elements.warningsList.innerHTML = warnings.map(warning => `
            <div class="warning-item severity-${warning.severity}" data-item="${warning.itemType}" data-param="${warning.parameter || warning.parameters?.[0] || ''}" role="button" tabindex="0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div class="warning-item-content">
                    <div class="warning-item-title">${warning.itemName} <span class="severity-tag">${SEVERITY_LABELS[warning.severity] ?? ''}</span></div>
                    <div class="warning-item-message">${warning.items?.length > 1 && warning.groupMessage
                        ? warning.groupMessage
                        : warning.message}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers to warnings
        elements.warningsList.querySelectorAll('.warning-item').forEach(item => {
            const open = () => {
                elements.warningsMenuContainer.classList.remove('open');
                revealParameter(item.dataset.item, item.dataset.param);
            };
            item.addEventListener('click', open);
            item.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    open();
                }
            });
        });
    }
}

/**
 * Show a parameter for an item: its override control when the item
 * overrides it, otherwise the global control.
 */
function revealParameter(itemType, param) {
    selectItem(itemType);
    openPanelDrawer();
    dials.reveal(itemType, param);
}

/**
 * Update status info
 */
function updateStatusInfo() {
    const visibleItems = stateManager.getState('ui.visibleItems');
    elements.statusInfo.textContent = `${visibleItems.length} item${visibleItems.length !== 1 ? 's' : ''}`;
}

// === Selection ===

let selectedItem = null;

function initSelection() {
    viewport.onSelect(itemType => selectItem(itemType));
    document.getElementById('btnSelectionEdit')?.addEventListener('click', () => {
        openPanelDrawer();
        dials.revealOverrides(selectedItem);
    });
    document.getElementById('btnSelectionClear')?.addEventListener('click', () => selectItem(null));
}

/**
 * Select an item everywhere at once: viewport highlight, per-item override
 * editor and profile panel.
 */
function selectItem(itemType, { fromOverrides = false } = {}) {
    selectedItem = itemType && ITEM_TYPES.includes(itemType) ? itemType : null;
    viewport.setSelectedItem(selectedItem);
    if (selectedItem) {
        if (!fromOverrides) dials.setOverrideItem(selectedItem);
        profilePanel?.setItem(selectedItem);
    }
    const chip = document.getElementById('selectionChip');
    if (chip) {
        chip.hidden = !selectedItem;
        const name = chip.querySelector('.selection-name');
        if (name && selectedItem) {
            const count = Object.keys(stateManager.getState(`itemOverrides.${selectedItem}`) || {}).length;
            name.textContent = `${ITEM_NAMES[selectedItem]}${count ? ` · ${count} override${count > 1 ? 's' : ''}` : ''}`;
        }
    }
}

// === Undo / redo ===

let history = null;

function initHistory() {
    history = new DesignHistory(stateManager, {
        onApply: applyExternalDesignChange,
        onChange: updateHistoryButtons
    });
    // Edits commit once they settle; the dials hold commits for the length
    // of a drag (see initDials). Hold them too while a profile handle moves.
    document.getElementById('profilePanel')?.addEventListener('pointerdown', () => history.hold(), true);
    ['pointerup', 'pointercancel'].forEach(type => {
        document.addEventListener(type, () => history.release(), true);
    });
    document.getElementById('btnUndo')?.addEventListener('click', () => history.undo());
    document.getElementById('btnRedo')?.addEventListener('click', () => history.redo());
    updateHistoryButtons();
}

function updateHistoryButtons() {
    if (!history) return;
    const undo = document.getElementById('btnUndo');
    const redo = document.getElementById('btnRedo');
    if (undo) undo.disabled = !history.canUndo();
    if (redo) redo.disabled = !history.canRedo();
}

/**
 * Refresh every control and mesh after the design changed outside the
 * controls (undo/redo, presets).
 */
function applyExternalDesignChange() {
    updateUIFromState();
    ITEM_TYPES.forEach(itemType => scheduleItemUpdate(itemType));
    if (selectedItem) selectItem(selectedItem);
}

function initKeyboardShortcuts() {
    document.addEventListener('keydown', (event) => {
        const target = event.target;
        const typing = target.isContentEditable || target.tagName === 'TEXTAREA'
            || (target.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(target.type));
        const mod = event.metaKey || event.ctrlKey;
        const key = event.key.toLowerCase();
        if (mod && !typing && key === 'z') {
            event.preventDefault();
            if (event.shiftKey) history.redo();
            else history.undo();
        } else if (mod && !typing && key === 'y') {
            event.preventDefault();
            history.redo();
        } else if (event.key === 'Escape' && !typing && selectedItem
            && !document.querySelector('.modal:not([hidden])')) {
            selectItem(null);
        }
    });
}

// === DialKit controls ===

let dials = null;

function allPresets() {
    return [...BUILT_IN_PRESETS, ...loadUserPresets()];
}

function initDials() {
    dials = initDinnerwareDials({
        container: document.getElementById('parameterPanel'),
        setGlobal: handleParameterChange,
        setOverride: setOverrideValue,
        clearOverride: (itemType, paramName) => clearOverrides(itemType, [paramName]),
        clearAllOverrides: (itemType) => clearOverrides(itemType,
            Object.keys(stateManager.getState(`itemOverrides.${itemType}`) || {})),
        setMultiplier: (itemType, axis, value, options) => {
            setItemMultiplier(itemType, axis, value, options);
            updateStatusInfo();
        },
        applyPreset: (id) => {
            const preset = allPresets().find(p => p.id === id);
            if (!preset) return;
            applyPreset(stateManager, preset);
            applyExternalDesignChange();
        },
        savePreset: (name) => {
            try {
                saveUserPreset(name, stateManager.getState('globalParameters'));
            } catch (error) {
                alert(`Could not save the preset: ${error.message}`);
            }
        },
        deletePreset: (id) => deleteUserPreset(id),
        copyWallPatternToFootring: () => {
            const updates = {};
            PATTERN_PARAM_SUFFIXES.forEach(suffix => {
                updates[`globalParameters.${patternParamName('footring', suffix)}`] =
                    stateManager.getState(`globalParameters.${patternParamName('wall', suffix)}`);
            });
            stateManager.batchUpdate(updates);
            ITEM_TYPES.forEach(itemType => scheduleItemUpdate(itemType));
        },
        onSelectItem: (itemType) => selectItem(itemType, { fromOverrides: true }),
        setCamera: (preset) => viewport.setCameraPreset(preset),
        resetView: () => viewport.resetView(),
        setLayout: (mode) => viewport.setLayoutMode(mode),
        setCrossSection: (enabled) => viewport.toggleCrossSection(enabled),
        setGrid: (visible) => viewport.toggleGrid(visible),
        setLightBackground: (isLight) => {
            viewport.setBackgroundColor(isLight ? 0xf0f0f0 : 0x1a1a1a);
            viewport.setGridColors(isLight);
        },
        setVisibleItems,
        // A drag is one undo step and previews at interactive resolution;
        // the release rebuilds every item at full resolution.
        onGestureStart: () => history.hold(),
        onGestureEnd: (changed) => {
            history.release();
            if (!changed) return;
            ITEM_TYPES.forEach(itemType => scheduleItemUpdate(itemType));
            if (selectedItem) selectItem(selectedItem);
        }
    });
}

// === Profile panel ===

let profilePanel = null;

function initProfilePanel() {
    const container = document.getElementById('profilePanel');
    const toggle = document.getElementById('btnProfileView');
    if (!container) return;
    profilePanel = new ProfilePanel(container, {
        visibleItems: () => stateManager.getState('ui.visibleItems'),
        onSelect: (itemType) => selectItem(itemType),
        onEdit: (values, { interactive }) => {
            const item = profilePanel.itemType;
            Object.entries(values).forEach(([param, value]) => {
                if (parameterResolver.hasOverride(item, param)) {
                    setOverrideValue(item, param, value, { interactive });
                } else {
                    handleParameterChange(param, value, { interactive });
                }
            });
            if (!interactive) {
                updateUIFromState();
                history.commit();
            }
        }
    });
    profilePanel.setItem(selectedItem || ITEM_TYPES[0]);
    toggle?.addEventListener('click', () => {
        if (profilePanel.visible) profilePanel.hide();
        else profilePanel.show();
        toggle.setAttribute('aria-pressed', String(profilePanel.visible));
        toggle.classList.toggle('active', profilePanel.visible);
    });
    container.addEventListener('profile-hidden', () => {
        toggle?.setAttribute('aria-pressed', 'false');
        toggle?.classList.remove('active');
    });
}

// === Compare (A/B) ===

function initCompare() {
    const button = document.getElementById('btnCompare');
    if (!button) return;
    button.addEventListener('click', () => {
        const active = button.getAttribute('aria-pressed') === 'true';
        if (active) {
            viewport.setCompareSnapshot(null);
        } else {
            const snapshot = {};
            DESIGN_KEYS.forEach(key => {
                snapshot[key] = JSON.parse(JSON.stringify(stateManager.getState(key) ?? {}));
            });
            viewport.setCompareSnapshot(snapshot);
        }
        button.setAttribute('aria-pressed', String(!active));
        button.classList.toggle('active', !active);
        button.title = active
            ? 'Keep a ghost of the current design to compare against while you edit'
            : 'Stop comparing';
    });
}

function resetCompare() {
    const button = document.getElementById('btnCompare');
    if (button?.getAttribute('aria-pressed') === 'true') button.click();
}

// === Responsive parameter drawer ===

function openPanelDrawer() {
    document.body.classList.add('panel-drawer-open');
    document.getElementById('btnTogglePanel')?.setAttribute('aria-expanded', 'true');
}

function initPanelDrawer() {
    const button = document.getElementById('btnTogglePanel');
    button?.addEventListener('click', () => {
        const open = !document.body.classList.contains('panel-drawer-open');
        document.body.classList.toggle('panel-drawer-open', open);
        button.setAttribute('aria-expanded', String(open));
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        initTheme();
    });
} else {
    init();
    initTheme();
}
