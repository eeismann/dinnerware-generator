/**
 * Dinnerware Generator - Main Application
 * Web-based parametric dinnerware 3D model generator
 */

import { 
    stateManager, 
    parameterResolver,
    ITEM_TYPES, 
    ITEM_NAMES,
    DEFAULT_PARAMETERS,
    PARAMETER_CONSTRAINTS,
    DEFAULT_RATIOS
} from './state/projectState.js';
import { initViewport, getViewport } from './ui/viewport.js';
import { generateItemMesh, getItemDimensions } from './geometry/meshGenerator.js';
import { exportMultipleSTL } from './geometry/stlExporter.js';
import { warningSystem, clampValue, roundToStep } from './utils/validation.js';
import { saveProject as saveToStorage, getProject } from './dashboard/projectStorage.js';
import { init as initTheme } from './ui/themeManager.js';
import { ProjectFileFormat } from './storage/fileFormat.js';

// DOM Elements
let viewport;
let elements = {};

/**
 * Initialize the application
 */
function init() {
    // Cache DOM elements
    cacheElements();
    
    // Initialize viewport
    viewport = initViewport(elements.viewport);
    
    // Check if we're editing an existing project from the dashboard
    const editingProjectId = localStorage.getItem('dinnerware_editing_project_id');
    if (editingProjectId) {
        const project = getProject(editingProjectId);
        if (project && project.state) {
            // Load the project state
            const currentData = {
                state: project.state,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('dinnerware_current_project', JSON.stringify(currentData));
        }
    }
    
    // Load auto-saved state if available
    stateManager.loadAutoSave();
    
    // Initialize UI
    initParameterControls();
    initItemProportions();
    initOverrideControls();
    initFooterControls();
    initHeaderButtons();
    initModals();
    initSectionCollapse();
    
    // Generate initial meshes
    viewport.updateAllItems();
    
    // Initial validation
    warningSystem.validate();
    updateWarningsDisplay();
    
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
        itemProportionsGrid: document.getElementById('itemProportionsGrid'),
        overrideItemSelect: document.getElementById('overrideItemSelect'),
        overrideControls: document.getElementById('overrideControls'),
        exportModal: document.getElementById('exportModal'),
        exportItemList: document.getElementById('exportItemList'),
        exportProgress: document.getElementById('exportProgress'),
        exportProgressFill: document.getElementById('exportProgressFill'),
        exportProgressText: document.getElementById('exportProgressText'),
        saveModal: document.getElementById('saveModal'),
        saveProjectName: document.getElementById('saveProjectName'),
        saveAsFile: document.getElementById('saveAsFile'),
        confirmModal: document.getElementById('confirmModal'),
        confirmTitle: document.getElementById('confirmTitle'),
        confirmMessage: document.getElementById('confirmMessage'),
        loadingSpinner: document.getElementById('loadingSpinner')
    };
}

/**
 * Initialize parameter controls
 */
function initParameterControls() {
    // Global parameters
    document.querySelectorAll('.parameter-row[data-param]').forEach(row => {
        const paramName = row.dataset.param;
        const rangeInput = row.querySelector('input[type="range"]');
        const numberInput = row.querySelector('input[type="number"]');
        const resetBtn = row.querySelector('.btn-reset');
        
        if (!rangeInput || !numberInput) return;
        
        // Sync range and number inputs
        rangeInput.addEventListener('input', () => {
            numberInput.value = rangeInput.value;
            handleParameterChange(paramName, parseFloat(rangeInput.value));
        });
        
        numberInput.addEventListener('change', () => {
            const constraints = PARAMETER_CONSTRAINTS[paramName];
            if (constraints) {
                const value = clampValue(parseFloat(numberInput.value), constraints.min, constraints.max);
                numberInput.value = value;
                rangeInput.value = value;
                handleParameterChange(paramName, value);
            }
        });
        
        // Reset button
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const constraints = PARAMETER_CONSTRAINTS[paramName];
                if (constraints) {
                    rangeInput.value = constraints.default;
                    numberInput.value = constraints.default;
                    handleParameterChange(paramName, constraints.default);
                }
            });
        }
    });
}

/**
 * Handle parameter changes
 */
function handleParameterChange(paramName, value) {
    // Check if it's a saucer setting
    if (paramName === 'cupRingDepth') {
        stateManager.setState('saucerSettings.cupRingDepth', value);
        viewport.updateItem('saucer');
    } else {
        // Global parameter
        stateManager.setState(`globalParameters.${paramName}`, value);
        
        // Update all items that use this parameter (not overridden)
        ITEM_TYPES.forEach(itemType => {
            if (!parameterResolver.hasOverride(itemType, paramName)) {
                viewport.updateItem(itemType);
            }
        });
    }
    
    warningSystem.validate();
    updateWarningsDisplay();
}

/**
 * Initialize item proportions section
 */
function initItemProportions() {
    const grid = elements.itemProportionsGrid;
    grid.innerHTML = '';
    
    ITEM_TYPES.forEach(itemType => {
        const ratios = stateManager.getState(`itemRatios.${itemType}`);
        const multipliers = stateManager.getState(`itemMultipliers.${itemType}`);
        
        const item = document.createElement('div');
        item.className = 'proportion-item';
        item.innerHTML = `
            <div class="proportion-item-header">
                <span class="proportion-item-name">${ITEM_NAMES[itemType]}</span>
            </div>
            <div class="proportion-item-controls">
                <div class="proportion-control">
                    <label>H</label>
                    <input type="number" data-item="${itemType}" data-type="height" 
                           value="${multipliers.height}" min="50" max="200" step="5">
                    <span class="unit">%</span>
                </div>
                <div class="proportion-control">
                    <label>W</label>
                    <input type="number" data-item="${itemType}" data-type="width" 
                           value="${multipliers.width}" min="50" max="200" step="5">
                    <span class="unit">%</span>
                </div>
            </div>
        `;
        
        grid.appendChild(item);
        
        // Add event listeners
        item.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => {
                const itemType = input.dataset.item;
                const type = input.dataset.type;
                const value = clampValue(parseFloat(input.value), 50, 200);
                input.value = value;
                
                stateManager.setState(`itemMultipliers.${itemType}.${type}`, value);
                viewport.updateItem(itemType);
                updateStatusInfo();
            });
        });
    });
}

/**
 * Initialize override controls
 */
function initOverrideControls() {
    const select = elements.overrideItemSelect;
    const controlsContainer = elements.overrideControls;
    
    const updateOverrideUI = () => {
        const selectedItem = select.value;
        const overrides = stateManager.getState(`itemOverrides.${selectedItem}`) || {};
        
        controlsContainer.innerHTML = '';
        
        const overridableParams = [
            'wallAngle', 'bottomCornerRadius', 'footringOriginHeight', 'outerFootringAngle',
            'footringBaseWidth', 'innerFootringAngle', 'wallThickness', 'baseRecessDepth'
        ];
        
        overridableParams.forEach(paramName => {
            const constraints = PARAMETER_CONSTRAINTS[paramName];
            const globalValue = stateManager.getState(`globalParameters.${paramName}`);
            const hasOverride = overrides[paramName] !== undefined;
            const currentValue = hasOverride ? overrides[paramName] : globalValue;
            
            const row = document.createElement('div');
            row.className = `parameter-row ${hasOverride ? 'has-override' : ''}`;
            row.dataset.param = paramName;
            
            row.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <label>${formatParamName(paramName)}</label>
                    ${hasOverride ? '<span class="override-indicator">Override</span>' : ''}
                </div>
                <div class="control-group">
                    <input type="range" min="${constraints.min}" max="${constraints.max}" 
                           value="${currentValue}" step="${constraints.step}">
                    <div class="numeric-input">
                        <input type="number" min="${constraints.min}" max="${constraints.max}" 
                               value="${currentValue}" step="${constraints.step}">
                        <span class="unit">${constraints.unit}</span>
                    </div>
                    <button class="btn-reset" title="${hasOverride ? 'Reset to global' : 'Reset to default'}">↺</button>
                </div>
            `;
            
            controlsContainer.appendChild(row);
            
            // Add event listeners
            const rangeInput = row.querySelector('input[type="range"]');
            const numberInput = row.querySelector('input[type="number"]');
            const resetBtn = row.querySelector('.btn-reset');
            
            rangeInput.addEventListener('input', () => {
                numberInput.value = rangeInput.value;
                setOverrideValue(selectedItem, paramName, parseFloat(rangeInput.value));
            });
            
            numberInput.addEventListener('change', () => {
                const value = clampValue(parseFloat(numberInput.value), constraints.min, constraints.max);
                numberInput.value = value;
                rangeInput.value = value;
                setOverrideValue(selectedItem, paramName, value);
            });
            
            resetBtn.addEventListener('click', () => {
                if (hasOverride) {
                    // Remove override
                    const currentOverrides = stateManager.getState(`itemOverrides.${selectedItem}`) || {};
                    delete currentOverrides[paramName];
                    stateManager.setState(`itemOverrides.${selectedItem}`, currentOverrides);
                    viewport.updateItem(selectedItem);
                    updateOverrideUI();
                } else {
                    // Reset to global default
                    rangeInput.value = constraints.default;
                    numberInput.value = constraints.default;
                }
                warningSystem.validate();
                updateWarningsDisplay();
            });
        });
    };
    
    select.addEventListener('change', updateOverrideUI);
    updateOverrideUI();
}

/**
 * Set override value for an item parameter
 */
function setOverrideValue(itemType, paramName, value) {
    const currentOverrides = stateManager.getState(`itemOverrides.${itemType}`) || {};
    currentOverrides[paramName] = value;
    stateManager.setState(`itemOverrides.${itemType}`, currentOverrides);
    viewport.updateItem(itemType);
    
    // Update override indicator
    const row = elements.overrideControls.querySelector(`[data-param="${paramName}"]`);
    if (row && !row.classList.contains('has-override')) {
        row.classList.add('has-override');
        const label = row.querySelector('label');
        if (label && !row.querySelector('.override-indicator')) {
            const indicator = document.createElement('span');
            indicator.className = 'override-indicator';
            indicator.textContent = 'Override';
            label.parentElement.appendChild(indicator);
        }
    }
    
    warningSystem.validate();
    updateWarningsDisplay();
}

/**
 * Initialize footer controls
 */
function initFooterControls() {
    // View menu toggle
    const viewMenuContainer = document.querySelector('.view-menu-container');
    const viewMenuBtn = document.getElementById('btnViewMenu');
    
    // Items menu toggle
    const itemsMenuContainer = document.querySelector('.items-menu-container');
    const itemsMenuBtn = document.getElementById('btnItemsMenu');
    
    viewMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewMenuContainer.classList.toggle('open');
        itemsMenuContainer.classList.remove('open');
    });
    
    itemsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        itemsMenuContainer.classList.toggle('open');
        viewMenuContainer.classList.remove('open');
    });
    
    // Warnings menu toggle
    const warningsMenuContainer = document.getElementById('warningsMenuContainer');
    const warningsMenuBtn = document.getElementById('btnWarningsMenu');
    
    warningsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        warningsMenuContainer.classList.toggle('open');
        // Close other menus if open
        viewMenuContainer.classList.remove('open');
        itemsMenuContainer.classList.remove('open');
    });
    
    // Close menus when clicking outside
    document.addEventListener('click', (e) => {
        if (!viewMenuContainer.contains(e.target)) {
            viewMenuContainer.classList.remove('open');
        }
        if (!itemsMenuContainer.contains(e.target)) {
            itemsMenuContainer.classList.remove('open');
        }
        if (!warningsMenuContainer.contains(e.target)) {
            warningsMenuContainer.classList.remove('open');
        }
    });
    
    // Camera presets
    document.getElementById('btnViewTop').addEventListener('click', () => {
        setActiveViewButton('btnViewTop');
        viewport.setCameraPreset('top');
    });
    
    document.getElementById('btnViewSide').addEventListener('click', () => {
        setActiveViewButton('btnViewSide');
        viewport.setCameraPreset('side');
    });
    
    document.getElementById('btnViewThreeQuarter').addEventListener('click', () => {
        setActiveViewButton('btnViewThreeQuarter');
        viewport.setCameraPreset('three-quarter');
    });
    
    document.getElementById('btnViewBottom').addEventListener('click', () => {
        setActiveViewButton('btnViewBottom');
        viewport.setCameraPreset('bottom');
    });
    
    // Reset view
    document.getElementById('btnResetView').addEventListener('click', () => {
        // Clear active state from preset buttons
        ['btnViewTop', 'btnViewSide', 'btnViewThreeQuarter', 'btnViewBottom'].forEach(id => {
            document.getElementById(id).classList.remove('active');
        });
        viewport.resetView();
    });
    
    // Cross-section toggle
    const crossSectionBtn = document.getElementById('btnCrossSection');
    const crossSectionToggle = document.getElementById('crossSectionToggle');
    crossSectionBtn.addEventListener('click', () => {
        const enabled = !crossSectionBtn.classList.contains('active');
        crossSectionBtn.classList.toggle('active', enabled);
        crossSectionToggle.classList.toggle('active', enabled);
        viewport.toggleCrossSection(enabled);
    });
    
    // Grid toggle
    const gridBtn = document.getElementById('btnToggleGrid');
    const gridToggle = document.getElementById('gridToggle');
    gridBtn.addEventListener('click', () => {
        const visible = !gridToggle.classList.contains('active');
        gridBtn.classList.toggle('active', visible);
        gridToggle.classList.toggle('active', visible);
        viewport.toggleGrid(visible);
    });
    
    // Background toggle (light/dark)
    const backgroundBtn = document.getElementById('btnToggleBackground');
    const backgroundToggle = document.getElementById('backgroundToggle');
    backgroundBtn.addEventListener('click', () => {
        const isLight = !backgroundToggle.classList.contains('active');
        backgroundBtn.classList.toggle('active', isLight);
        backgroundToggle.classList.toggle('active', isLight);
        backgroundBtn.querySelector('span:first-of-type').textContent = isLight ? 'Light' : 'Dark';
        viewport.setBackgroundColor(isLight ? 0xf0f0f0 : 0x1a1a1a);
        viewport.setGridColors(isLight);
    });
    
    // Layout toggles
    document.getElementById('btnLayoutRow').addEventListener('click', () => {
        document.getElementById('btnLayoutRow').classList.add('active');
        document.getElementById('btnLayoutGrid').classList.remove('active');
        viewport.setLayoutMode('row');
    });
    
    document.getElementById('btnLayoutGrid').addEventListener('click', () => {
        document.getElementById('btnLayoutRow').classList.remove('active');
        document.getElementById('btnLayoutGrid').classList.add('active');
        viewport.setLayoutMode('grid');
    });
    
    // Item toggles
    document.querySelectorAll('.items-menu-item input').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            updateVisibleItems();
        });
    });
    
    // Show/Hide all buttons
    document.getElementById('btnShowAll').addEventListener('click', () => {
        document.querySelectorAll('.items-menu-item input').forEach(cb => cb.checked = true);
        updateVisibleItems();
    });
    
    document.getElementById('btnHideAll').addEventListener('click', () => {
        document.querySelectorAll('.items-menu-item input').forEach(cb => cb.checked = false);
        updateVisibleItems();
    });
}

/**
 * Set active view button in the menu
 */
function setActiveViewButton(activeId) {
    ['btnViewTop', 'btnViewSide', 'btnViewThreeQuarter', 'btnViewBottom'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.classList.toggle('active', id === activeId);
        }
    });
}

/**
 * Update visible items from checkboxes
 */
function updateVisibleItems() {
    const visibleItems = [];
    document.querySelectorAll('.items-menu-item input').forEach(checkbox => {
        if (checkbox.checked) {
            visibleItems.push(checkbox.dataset.item);
        }
    });
    
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
                        saveProject(name, false);
                        window.location.href = '/dashboard.html';
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
 * Create a new project
 */
function createNewProject() {
    // Clear editing project ID
    localStorage.removeItem('dinnerware_editing_project_id');
    
    stateManager.reset();
    viewport.updateAllItems();
    updateUIFromState();
    warningSystem.validate();
    updateWarningsDisplay();
    elements.projectName.textContent = 'Untitled';
    elements.unsavedIndicator.style.display = 'none';
}

/**
 * Show save modal
 */
function showSaveModal() {
    elements.saveProjectName.value = stateManager.getState('project.name') || 'Untitled';
    elements.saveModal.style.display = 'flex';
}

/**
 * Save project to storage (with thumbnail) and optionally to file
 */
function saveProject(name, downloadFile = false) {
    stateManager.setState('project.name', name);
    stateManager.setState('project.isDirty', false);
    
    // Capture thumbnail from viewport
    const thumbnail = viewport.captureThumbnail(400, 300);
    
    // Get or create project ID
    let projectId = localStorage.getItem('dinnerware_editing_project_id');
    
    // Prepare project data for storage
    const projectForStorage = {
        id: projectId || null,
        projectName: name,
        thumbnail: thumbnail,
        state: stateManager.getState()
    };
    
    // Save to project storage
    const savedProject = saveToStorage(projectForStorage);
    
    // Store the project ID for future saves
    localStorage.setItem('dinnerware_editing_project_id', savedProject.id);
    
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
    elements.unsavedIndicator.style.display = 'none';
    elements.saveModal.style.display = 'none';
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
                    stateData = deserialized.state;
                    projectName = deserialized.project.name;
                } else {
                    // Legacy format
                    stateData = data;
                    projectName = data.projectName || 'Imported Project';
                }

                // Import the state
                stateManager.importState(stateData);
                viewport.updateAllItems();
                updateUIFromState();
                warningSystem.validate();
                updateWarningsDisplay();

                elements.projectName.textContent = projectName;
                elements.unsavedIndicator.style.display = 'none';
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
 * Show export modal
 */
function showExportModal() {
    const itemList = elements.exportItemList;
    itemList.innerHTML = '';
    
    ITEM_TYPES.forEach(itemType => {
        const dims = getItemDimensions(itemType);
        const item = document.createElement('div');
        item.className = 'export-item';
        item.innerHTML = `
            <input type="checkbox" data-item="${itemType}" checked>
            <span class="export-item-name">${ITEM_NAMES[itemType]}</span>
            <span class="export-item-dims">${dims.diameter}mm × ${dims.height}mm</span>
        `;
        
        item.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                const checkbox = item.querySelector('input');
                checkbox.checked = !checkbox.checked;
            }
        });
        
        itemList.appendChild(item);
    });
    
    elements.exportProgress.style.display = 'none';
    elements.exportModal.style.display = 'flex';
}

/**
 * Export selected items as STL
 */
async function exportSTL() {
    const selectedItems = [];
    elements.exportItemList.querySelectorAll('input:checked').forEach(checkbox => {
        const itemType = checkbox.dataset.item;
        const geometry = viewport.getGeometry(itemType);
        if (geometry) {
            selectedItems.push({
                type: itemType,
                geometry: geometry,
                displayName: ITEM_NAMES[itemType]
            });
        }
    });
    
    if (selectedItems.length === 0) {
        alert('Please select at least one item to export.');
        return;
    }
    
    const projectName = stateManager.getState('project.name') || 'Dinnerware';
    
    // Show progress
    elements.exportProgress.style.display = 'block';
    elements.exportProgressFill.style.width = '0%';
    elements.exportProgressText.textContent = 'Preparing export...';
    
    await exportMultipleSTL(selectedItems, projectName, (progress) => {
        elements.exportProgressFill.style.width = `${progress.progress * 100}%`;
        
        if (progress.complete) {
            elements.exportProgressText.textContent = `Export complete! ${progress.total} files saved.`;
            setTimeout(() => {
                elements.exportModal.style.display = 'none';
            }, 1500);
        } else {
            elements.exportProgressText.textContent = `Exporting ${progress.itemName}... (${progress.current}/${progress.total})`;
        }
    });
}

/**
 * Initialize modals
 */
function initModals() {
    // Export modal
    document.getElementById('btnCloseExportModal').addEventListener('click', () => {
        elements.exportModal.style.display = 'none';
    });
    
    document.getElementById('btnCancelExport').addEventListener('click', () => {
        elements.exportModal.style.display = 'none';
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
        elements.saveModal.style.display = 'none';
    });
    
    document.getElementById('btnCancelSave').addEventListener('click', () => {
        elements.saveModal.style.display = 'none';
    });
    
    document.getElementById('btnConfirmSave').addEventListener('click', () => {
        const name = elements.saveProjectName.value.trim() || 'Untitled';
        const downloadFile = elements.saveAsFile.checked;
        saveProject(name, downloadFile);
    });
    
    // Confirm modal
    document.getElementById('btnCloseConfirmModal').addEventListener('click', () => {
        elements.confirmModal.style.display = 'none';
    });
    
    document.getElementById('btnConfirmCancel').addEventListener('click', () => {
        elements.confirmModal.style.display = 'none';
    });
    
    // Close modals on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.parentElement.style.display = 'none';
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
    elements.confirmModal.style.display = 'flex';
}

// Set up confirm button
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btnConfirmOk').addEventListener('click', () => {
        elements.confirmModal.style.display = 'none';
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
    });
});

/**
 * Initialize section collapse
 */
function initSectionCollapse() {
    document.querySelectorAll('.section-header').forEach(header => {
        header.addEventListener('click', () => {
            const section = header.parentElement;
            section.classList.toggle('expanded');
        });
    });
}

/**
 * Subscribe to state changes
 */
function subscribeToStateChanges() {
    // Update unsaved indicator
    stateManager.subscribe('project.isDirty', (isDirty) => {
        elements.unsavedIndicator.style.display = isDirty ? 'inline' : 'none';
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
    
    // Update parameter inputs
    Object.entries(state.globalParameters).forEach(([param, value]) => {
        const row = document.querySelector(`.parameter-row[data-param="${param}"]`);
        if (row) {
            const rangeInput = row.querySelector('input[type="range"]');
            const numberInput = row.querySelector('input[type="number"]');
            if (rangeInput) rangeInput.value = value;
            if (numberInput) numberInput.value = value;
        }
    });
    
    // Update saucer settings
    const cupRingRow = document.querySelector('.parameter-row[data-param="cupRingDepth"]');
    if (cupRingRow) {
        const value = state.saucerSettings.cupRingDepth;
        cupRingRow.querySelector('input[type="range"]').value = value;
        cupRingRow.querySelector('input[type="number"]').value = value;
    }
    
    // Update item toggles
    document.querySelectorAll('.items-menu-item input').forEach(checkbox => {
        const itemType = checkbox.dataset.item;
        checkbox.checked = state.ui.visibleItems.includes(itemType);
    });
    
    // Update item proportions
    initItemProportions();
    
    // Update override controls
    initOverrideControls();
    
    // Update status
    updateStatusInfo();
}

/**
 * Update warnings display
 */
function updateWarningsDisplay() {
    const warnings = warningSystem.warnings;
    
    if (warnings.length === 0) {
        elements.warningsMenuContainer.style.display = 'none';
    } else {
        elements.warningsMenuContainer.style.display = 'block';
        elements.warningCount.textContent = `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
        
        elements.warningsList.innerHTML = warnings.map(warning => `
            <div class="warning-item" data-item="${warning.itemType}" data-param="${warning.parameter || ''}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div class="warning-item-content">
                    <div class="warning-item-title">${warning.itemName}</div>
                    <div class="warning-item-message">${warning.message}</div>
                </div>
            </div>
        `).join('');
        
        // Add click handlers to warnings
        elements.warningsList.querySelectorAll('.warning-item').forEach(item => {
            item.addEventListener('click', () => {
                const itemType = item.dataset.item;
                const param = item.dataset.param;
                
                // Close the warnings menu
                elements.warningsMenuContainer.classList.remove('open');
                
                // Select item in override controls
                elements.overrideItemSelect.value = itemType;
                elements.overrideItemSelect.dispatchEvent(new Event('change'));
                
                // Expand per-item overrides section
                const overridesSection = document.querySelector('[data-section="per-item-overrides"]');
                if (overridesSection) {
                    overridesSection.classList.add('expanded');
                }
                
                // Highlight parameter if applicable
                if (param) {
                    const paramRow = elements.overrideControls.querySelector(`[data-param="${param}"]`);
                    if (paramRow) {
                        paramRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        paramRow.style.background = 'rgba(255, 209, 102, 0.2)';
                        setTimeout(() => {
                            paramRow.style.background = '';
                        }, 2000);
                    }
                }
            });
        });
    }
}

/**
 * Update status info
 */
function updateStatusInfo() {
    const visibleItems = stateManager.getState('ui.visibleItems');
    elements.statusInfo.textContent = `${visibleItems.length} item${visibleItems.length !== 1 ? 's' : ''}`;
}

/**
 * Format parameter name for display
 */
function formatParamName(paramName) {
    return paramName
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .replace('Footring', 'Footring ')
        .trim();
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

