/**
 * Handle Generator Main Application
 * Entry point for the mug handle generator app
 */

import { init as initThemeManager } from '../ui/themeManager.js';
import { handleStateManager, DEFAULT_HANDLE_PARAMS, PARAM_CONSTRAINTS } from './state/handleState.js';
import { initHandleViewport, getHandleViewport } from './ui/handleViewport.js';
import { initCrossSectionPreview, getCrossSectionPreview } from './ui/crossSectionPreview.js';
import { initDimensionOverlays, getDimensionOverlays } from './ui/dimensionOverlays.js';
import { showMugImportModal, getDinnerwareProjects } from './ui/mugImporter.js';
import { exportHandleToSTL, downloadSTL, getSuggestedFilename } from './geometry/handleSTLExporter.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';

// Storage key for handle projects
const HANDLE_STORAGE_KEY = 'playground_ceramics_handle_projects';

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
    const crossSectionPreview = initCrossSectionPreview('crossSectionCanvas');
    
    // Initialize dimension overlays
    const dimensionOverlays = initDimensionOverlays('dimensionOverlays');
    
    // Initialize parameter controls
    initParameterControls();
    
    // Initialize panel sections
    initPanelSections();
    
    // Initialize header buttons
    initHeaderButtons();
    
    // Initialize footer controls
    initFooterControls();
    
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
    } else {
        // New project - must select a mug first
        const projects = getDinnerwareProjects();
        if (projects.length > 0) {
            // Show mug import modal - required
            showMugImportModal().then(mugData => {
                if (mugData) {
                    updateUI();
                    regenerateHandle();
                } else {
                    // User cancelled - show message and use defaults for preview
                    handleStateManager.setMugData({
                        loaded: false,
                        projectName: 'No mug selected',
                        height: 95,
                        topDiameter: 80,
                        bottomDiameter: 60,
                        wallThickness: 2.5,
                        wallAngle: 5,
                    });
                    updateUI();
                    regenerateHandle();
                }
            });
        } else {
            // No dinnerware projects - show prompt to create one
            showConfirmModal(
                'No Mug Projects Found',
                'To create a handle, you first need to create a mug in the Dinnerware Generator.',
                () => {
                    window.location.href = '/index.html';
                },
                'Go to Dinnerware Generator',
                'Use Default Mug'
            );
            
            // Use default mug data for now
            handleStateManager.setMugData({
                loaded: false,
                projectName: 'Default mug (no project)',
                height: 95,
                topDiameter: 80,
                bottomDiameter: 60,
                wallThickness: 2.5,
                wallAngle: 5,
            });
            updateUI();
            regenerateHandle();
        }
    }
}

/**
 * Initialize parameter controls
 */
function initParameterControls() {
    // Get all parameter rows
    const parameterRows = document.querySelectorAll('.parameter-row[data-param]');
    
    parameterRows.forEach(row => {
        const param = row.dataset.param;
        const rangeInput = row.querySelector('input[type="range"]');
        const numberInput = row.querySelector('input[type="number"]');
        const checkboxInput = row.querySelector('input[type="checkbox"]');
        const resetBtn = row.querySelector('.btn-reset');
        
        if (rangeInput && numberInput) {
            // Sync range and number inputs
            rangeInput.addEventListener('input', () => {
                numberInput.value = rangeInput.value;
                handleParameterChange(param, parseFloat(rangeInput.value));
            });
            
            numberInput.addEventListener('input', () => {
                const value = parseFloat(numberInput.value);
                if (!isNaN(value)) {
                    rangeInput.value = value;
                    handleParameterChange(param, value);
                }
            });
            
            numberInput.addEventListener('change', () => {
                // Clamp value on blur
                const constraints = PARAM_CONSTRAINTS[param];
                if (constraints) {
                    let value = parseFloat(numberInput.value);
                    value = Math.max(constraints.min, Math.min(constraints.max, value));
                    numberInput.value = value;
                    rangeInput.value = value;
                    handleParameterChange(param, value);
                }
            });
        }
        
        // Handle checkbox inputs
        if (checkboxInput) {
            checkboxInput.addEventListener('change', () => {
                handleParameterChange(param, checkboxInput.checked);
                
                // Special handling for matchMugWallAngle
                if (param === 'matchMugWallAngle') {
                    updateMatchMugWallAngle(checkboxInput.checked);
                }
            });
        }
        
        // Reset button
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                const defaultValue = DEFAULT_HANDLE_PARAMS[param];
                if (defaultValue !== undefined) {
                    if (rangeInput) rangeInput.value = defaultValue;
                    if (numberInput) numberInput.value = defaultValue;
                    handleParameterChange(param, defaultValue);
                }
            });
        }
    });
    
    // Initialize cross-section type selector
    initCrossSectionTypeSelector();
}

/**
 * Initialize cross-section type selector
 */
function initCrossSectionTypeSelector() {
    const typeButtons = document.querySelectorAll('.cross-section-type-btn');
    const cornerRadiusRow = document.getElementById('cornerRadiusRow');
    
    typeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update button states
            typeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Get selected type
            const type = btn.dataset.type;
            
            // Update state
            handleStateManager.setHandleParam('crossSectionType', type);
            
            // Show/hide corner radius row
            if (cornerRadiusRow) {
                cornerRadiusRow.style.display = type === 'rectangular' ? 'flex' : 'none';
            }
            
            // Regenerate handle
            regenerateHandle();
        });
    });
    
    // Set initial visibility based on current state
    const state = handleStateManager.getState();
    if (cornerRadiusRow) {
        cornerRadiusRow.style.display = state.handleParams.crossSectionType === 'rectangular' ? 'flex' : 'none';
    }
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
 * Update vertical arm angle to match mug wall angle
 */
function updateMatchMugWallAngle(enabled) {
    const verticalAngleRow = document.querySelector('.parameter-row[data-param="verticalArmAngle"]');
    const rangeInput = verticalAngleRow?.querySelector('input[type="range"]');
    const numberInput = verticalAngleRow?.querySelector('input[type="number"]');
    
    if (enabled) {
        // Calculate and apply mug wall angle
        const mugWallAngle = calculateMugWallAngle();
        const clampedAngle = Math.max(-30, Math.min(30, Math.round(mugWallAngle)));
        
        if (rangeInput) {
            rangeInput.value = clampedAngle;
            rangeInput.disabled = true;
        }
        if (numberInput) {
            numberInput.value = clampedAngle;
            numberInput.disabled = true;
        }
        
        handleStateManager.setHandleParam('verticalArmAngle', clampedAngle);
        regenerateHandle();
    } else {
        // Re-enable manual control
        if (rangeInput) rangeInput.disabled = false;
        if (numberInput) numberInput.disabled = false;
    }
}

/**
 * Handle parameter changes
 */
function handleParameterChange(param, value) {
    handleStateManager.setHandleParam(param, value);
    regenerateHandle();
}

/**
 * Regenerate handle mesh
 */
function regenerateHandle() {
    const state = handleStateManager.getState();
    const viewport = getHandleViewport();
    const crossSectionPreview = getCrossSectionPreview();
    
    if (viewport) {
        viewport.updateHandle(state.handleParams, state.mugData);
        viewport.updateMug(state.mugData);
    }
    
    if (crossSectionPreview) {
        crossSectionPreview.render(
            state.handleParams.crossSectionWidth,
            state.handleParams.crossSectionHeight,
            state.handleParams.crossSectionType,
            state.handleParams.crossSectionCornerRadius
        );
    }
    
    // Update dimension overlays
    updateDimensionOverlays();
    
    // Update footer summary
    updateDimensionsSummary();
    
    // Update warnings
    updateWarnings();
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
 * Initialize panel sections (collapsible)
 */
function initPanelSections() {
    const sections = document.querySelectorAll('.panel-section');
    
    sections.forEach(section => {
        const header = section.querySelector('.section-header');
        
        header.addEventListener('click', () => {
            section.classList.toggle('expanded');
        });
    });
}

/**
 * Initialize header buttons
 */
function initHeaderButtons() {
    // New Project - requires mug selection
    document.getElementById('btnNewProject').addEventListener('click', () => {
        const createNewWithMug = async () => {
            // First check if there are any dinnerware projects
            const projects = getDinnerwareProjects();
            if (projects.length === 0) {
                showConfirmModal(
                    'No Mug Projects Found',
                    'You need to create a mug in the Dinnerware Generator first. Would you like to go there now?',
                    () => {
                        window.location.href = '/index.html';
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
    
    // Change Mug
    document.getElementById('btnChangeMug').addEventListener('click', () => {
        if (handleStateManager.getState().ui.hasUnsavedChanges) {
            showConfirmModal(
                'Unsaved Changes',
                'Changing the mug will affect handle dimensions. Continue?',
                () => {
                    showMugImportModal().then(mugData => {
                        if (mugData) {
                            updateUI();
                            regenerateHandle();
                        }
                    });
                }
            );
        } else {
            showMugImportModal().then(mugData => {
                if (mugData) {
                    updateUI();
                    regenerateHandle();
                }
            });
        }
    });
}

/**
 * Initialize footer controls
 */
function initFooterControls() {
    // NOTE: Settings menu toggle and theme handling is done by themeManager.js initSettingsMenu()
    // We only need to watch for theme changes to update the viewport
    
    // Watch for theme mode changes to update viewport
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-mode') {
                const isDark = document.documentElement.getAttribute('data-mode') === 'dark';
                getHandleViewport()?.setTheme(isDark);
            }
        });
    });
    
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-mode']
    });
    
    // Set initial viewport theme based on current mode
    const isDark = document.documentElement.getAttribute('data-mode') === 'dark';
    getHandleViewport()?.setTheme(isDark);
    
    // Mug display options
    document.querySelectorAll('.mug-display-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mug-display-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const mode = btn.dataset.mode;
            handleStateManager.setViewSetting('mugDisplayMode', mode);
            getHandleViewport()?.setMugDisplayMode(mode);
        });
    });
    
    // Panel toggle
    const panelToggle = document.getElementById('btnTogglePanel');
    const panelToggleLabel = document.getElementById('panelToggleLabel');
    const parameterPanel = document.querySelector('.parameter-panel');
    
    if (panelToggle && panelToggleLabel && parameterPanel) {
        panelToggle.addEventListener('click', () => {
            const isHidden = parameterPanel.classList.toggle('hidden');
            panelToggleLabel.textContent = isHidden ? 'Show Parameter Panel' : 'Hide Parameter Panel';
            // Resize viewport when panel is toggled
            setTimeout(() => {
                getHandleViewport()?.handleResize();
            }, 300);
        });
    }
    
    // View menu
    initViewMenu();
    
    // Warnings menu
    initWarningsMenu();
}

/**
 * Initialize view menu
 */
function initViewMenu() {
    const viewContainer = document.querySelector('.view-menu-container');
    const viewBtn = document.getElementById('btnViewMenu');
    
    viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewContainer.classList.toggle('open');
    });
    
    document.addEventListener('click', () => {
        viewContainer.classList.remove('open');
    });
    
    // Camera views
    const viewButtons = {
        'btnViewSide': 'side',
        'btnViewThreeQuarter': 'threeQuarter',
        'btnViewTop': 'top',
        'btnViewBottom': 'bottom',
    };
    
    Object.entries(viewButtons).forEach(([btnId, view]) => {
        const btn = document.getElementById(btnId);
        btn.addEventListener('click', () => {
            // Update active state
            Object.keys(viewButtons).forEach(id => {
                document.getElementById(id).classList.remove('active');
            });
            btn.classList.add('active');
            
            handleStateManager.setViewSetting('cameraView', view);
            getHandleViewport()?.setCameraView(view);
        });
    });
    
    // Reset view
    document.getElementById('btnResetView').addEventListener('click', () => {
        getHandleViewport()?.resetView();
    });
    
    // Display toggles
    const toggles = {
        'btnCrossSection': { setting: 'showCrossSection', toggle: 'crossSectionToggle', action: (v) => getHandleViewport()?.setShowCrossSection(v) },
        'btnToggleDimensions': { setting: 'showDimensions', toggle: 'dimensionsToggle', action: (v) => getDimensionOverlays()?.setVisible(v) },
        'btnToggleOutlines': { setting: 'showAttachmentOutlines', toggle: 'outlinesToggle', action: (v) => getHandleViewport()?.setShowAttachmentOutlines(v) },
        'btnToggleGrid': { setting: 'showGrid', toggle: 'gridToggle', action: (v) => getHandleViewport()?.setShowGrid(v) },
    };
    
    Object.entries(toggles).forEach(([btnId, config]) => {
        const btn = document.getElementById(btnId);
        const toggle = document.getElementById(config.toggle);
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isActive = toggle.classList.toggle('active');
            handleStateManager.setViewSetting(config.setting, isActive);
            config.action(isActive);
        });
    });
}

/**
 * Initialize warnings menu
 */
function initWarningsMenu() {
    const warningsContainer = document.getElementById('warningsMenuContainer');
    const warningsBtn = document.getElementById('btnWarningsMenu');
    
    warningsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        warningsContainer.classList.toggle('open');
    });
    
    document.addEventListener('click', () => {
        warningsContainer.classList.remove('open');
    });
}

/**
 * Update warnings display
 */
function updateWarnings() {
    const warnings = handleStateManager.getWarnings();
    const container = document.getElementById('warningsMenuContainer');
    const countEl = document.getElementById('warningCount');
    const listEl = document.getElementById('warningsList');
    
    if (warnings.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    countEl.textContent = `${warnings.length} warning${warnings.length > 1 ? 's' : ''}`;
    
    listEl.innerHTML = warnings.map(warning => `
        <div class="warning-item" data-param="${warning.param}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <div class="warning-item-content">
                <div class="warning-item-title">${warning.title}</div>
                <div class="warning-item-message">${warning.message}</div>
            </div>
        </div>
    `).join('');
}

/**
 * Update dimensions summary in footer
 */
function updateDimensionsSummary() {
    const state = handleStateManager.getState();
    const { topAttachmentHeight, bottomAttachmentHeight, handleProtrusion, handleWidth } = state.handleParams;
    
    // Handle height is derived from attachment points
    const handleHeight = topAttachmentHeight - bottomAttachmentHeight;
    
    const summaryEl = document.getElementById('handleDimensionsSummary');
    summaryEl.textContent = `${handleHeight} × ${handleProtrusion} × ${handleWidth}mm`;
}

/**
 * Update mug info display
 */
function updateMugInfo() {
    const state = handleStateManager.getState();
    const mugInfo = document.getElementById('mugInfo');
    
    if (!state.mugData.loaded) {
        mugInfo.innerHTML = `
            <div class="mug-info-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="6" y="4" width="10" height="14" rx="2"/>
                    <path d="M16 8h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/>
                </svg>
                <span>No mug loaded</span>
            </div>
        `;
    } else {
        mugInfo.innerHTML = `
            <div class="mug-info-loaded">
                <div class="mug-info-name">${escapeHtml(state.mugData.projectName || 'Imported Mug')}</div>
                <div class="mug-info-dims">
                    <div class="mug-info-dim">
                        <label>H:</label>
                        <span>${state.mugData.height}mm</span>
                    </div>
                    <div class="mug-info-dim">
                        <label>Ø Top:</label>
                        <span>${state.mugData.topDiameter}mm</span>
                    </div>
                    <div class="mug-info-dim">
                        <label>Ø Bot:</label>
                        <span>${state.mugData.bottomDiameter}mm</span>
                    </div>
                </div>
            </div>
        `;
    }
}

/**
 * Update UI to reflect current state
 */
function updateUI() {
    const state = handleStateManager.getState();
    
    // Update project name
    document.getElementById('projectName').textContent = state.project.name;
    
    // Update unsaved indicator
    document.getElementById('unsavedIndicator').style.display = 
        state.ui.hasUnsavedChanges ? 'inline' : 'none';
    
    // Update mug info
    updateMugInfo();
    
    // Update parameter controls
    Object.entries(state.handleParams).forEach(([param, value]) => {
        const row = document.querySelector(`.parameter-row[data-param="${param}"]`);
        if (row) {
            const rangeInput = row.querySelector('input[type="range"]');
            const numberInput = row.querySelector('input[type="number"]');
            const checkboxInput = row.querySelector('input[type="checkbox"]');
            
            if (rangeInput) rangeInput.value = value;
            if (numberInput) numberInput.value = value;
            if (checkboxInput) checkboxInput.checked = value;
        }
    });
    
    // Update cross-section type selector
    const typeButtons = document.querySelectorAll('.cross-section-type-btn');
    typeButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === state.handleParams.crossSectionType);
    });
    
    // Show/hide corner radius row based on type
    const cornerRadiusRow = document.getElementById('cornerRadiusRow');
    if (cornerRadiusRow) {
        cornerRadiusRow.style.display = state.handleParams.crossSectionType === 'rectangular' ? 'flex' : 'none';
    }
    
    // Handle matchMugWallAngle state
    if (state.handleParams.matchMugWallAngle) {
        updateMatchMugWallAngle(true);
    }
    
}

/**
 * State change handler
 */
function onStateChange(state, changedPaths) {
    // Update unsaved indicator
    document.getElementById('unsavedIndicator').style.display = 
        state.ui.hasUnsavedChanges ? 'inline' : 'none';
    
    // Update warnings if handle params changed
    if (changedPaths.includes('handleParams')) {
        updateWarnings();
    }
}

/**
 * Show save modal
 */
function showSaveModal() {
    const modal = document.getElementById('saveModal');
    const nameInput = document.getElementById('saveProjectName');
    const state = handleStateManager.getState();
    
    nameInput.value = state.project.name;
    modal.style.display = 'flex';
    nameInput.focus();
    nameInput.select();
    
    const confirmBtn = document.getElementById('btnConfirmSave');
    const cancelBtn = document.getElementById('btnCancelSave');
    const closeBtn = document.getElementById('btnCloseSaveModal');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    const handleSave = () => {
        const name = nameInput.value.trim() || 'Untitled Handle';
        const downloadFile = document.getElementById('saveAsFile')?.checked || false;
        saveProject(name, downloadFile);
        modal.style.display = 'none';
        cleanup();
    };
    
    const handleClose = () => {
        modal.style.display = 'none';
        cleanup();
    };
    
    const cleanup = () => {
        confirmBtn.removeEventListener('click', handleSave);
        cancelBtn.removeEventListener('click', handleClose);
        closeBtn.removeEventListener('click', handleClose);
        backdrop.removeEventListener('click', handleClose);
    };
    
    confirmBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    backdrop.addEventListener('click', handleClose);
    
    // Enter key to save
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSave();
    });
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
    showSaveSuccessToast(name);
}

/**
 * Show a success toast message after saving
 */
function showSaveSuccessToast(projectName) {
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
            showSaveSuccessToast(projectData.project?.name || 'Imported Project');
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
function showLoadModal() {
    // Get saved projects
    let projects = [];
    try {
        const stored = localStorage.getItem(HANDLE_STORAGE_KEY);
        if (stored) projects = JSON.parse(stored);
    } catch (e) {
        console.error('Error loading projects:', e);
    }
    
    if (projects.length === 0) {
        alert('No saved handle projects found.');
        return;
    }
    
    // Create simple project selection
    const projectNames = projects.map(p => p.project.name);
    const selected = prompt(
        'Enter project name to load:\n\n' + 
        projectNames.map((n, i) => `${i + 1}. ${n}`).join('\n'),
        projectNames[0]
    );
    
    if (selected) {
        const project = projects.find(p => p.project.name === selected);
        if (project) {
            if (handleStateManager.getState().ui.hasUnsavedChanges) {
                showConfirmModal(
                    'Unsaved Changes',
                    'You have unsaved changes. Are you sure you want to load a different project?',
                    () => {
                        loadProject(project);
                    }
                );
            } else {
                loadProject(project);
            }
        } else {
            alert('Project not found.');
        }
    }
}

/**
 * Load a project
 */
function loadProject(projectData) {
    handleStateManager.loadProject(projectData);
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

/**
 * Show export modal
 */
function showExportModal() {
    const modal = document.getElementById('exportModal');
    const state = handleStateManager.getState();
    
    // Update filename preview
    const filenameEl = document.getElementById('exportFilename');
    filenameEl.textContent = getSuggestedFilename(state.project.name);
    
    modal.style.display = 'flex';
    
    const confirmBtn = document.getElementById('btnConfirmExport');
    const cancelBtn = document.getElementById('btnCancelExport');
    const closeBtn = document.getElementById('btnCloseExportModal');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    const handleExport = async () => {
        const orientation = document.querySelector('input[name="exportOrientation"]:checked').value;
        
        // Show progress
        const progressEl = document.getElementById('exportProgress');
        const progressFill = document.getElementById('exportProgressFill');
        const progressText = document.getElementById('exportProgressText');
        
        progressEl.style.display = 'block';
        progressText.textContent = 'Generating mesh...';
        progressFill.style.width = '30%';
        
        // Generate and export
        setTimeout(() => {
            try {
                progressText.textContent = 'Creating STL...';
                progressFill.style.width = '60%';
                
                const blob = exportHandleToSTL(
                    state.handleParams,
                    state.mugData,
                    { orientation }
                );
                
                progressText.textContent = 'Downloading...';
                progressFill.style.width = '90%';
                
                downloadSTL(blob, getSuggestedFilename(state.project.name));
                
                progressFill.style.width = '100%';
                progressText.textContent = 'Complete!';
                
                setTimeout(() => {
                    modal.style.display = 'none';
                    progressEl.style.display = 'none';
                    progressFill.style.width = '0%';
                    cleanup();
                }, 500);
            } catch (error) {
                console.error('Export error:', error);
                alert('Export failed: ' + error.message);
                progressEl.style.display = 'none';
            }
        }, 100);
    };
    
    const handleClose = () => {
        modal.style.display = 'none';
        cleanup();
    };
    
    const cleanup = () => {
        confirmBtn.removeEventListener('click', handleExport);
        cancelBtn.removeEventListener('click', handleClose);
        closeBtn.removeEventListener('click', handleClose);
        backdrop.removeEventListener('click', handleClose);
    };
    
    confirmBtn.addEventListener('click', handleExport);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    backdrop.addEventListener('click', handleClose);
}

/**
 * Show confirmation modal
 */
function showConfirmModal(title, message, onConfirm, confirmLabel = 'OK', cancelLabel = 'Cancel') {
    const modal = document.getElementById('confirmModal');
    
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    
    const confirmBtn = document.getElementById('btnConfirmOk');
    const cancelBtn = document.getElementById('btnConfirmCancel');
    const closeBtn = document.getElementById('btnCloseConfirmModal');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    // Set button labels
    confirmBtn.textContent = confirmLabel;
    cancelBtn.textContent = cancelLabel;
    
    modal.style.display = 'flex';
    
    const handleConfirm = () => {
        modal.style.display = 'none';
        cleanup();
        onConfirm();
    };
    
    const handleClose = () => {
        modal.style.display = 'none';
        cleanup();
    };
    
    const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleClose);
        closeBtn.removeEventListener('click', handleClose);
        backdrop.removeEventListener('click', handleClose);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleClose);
    closeBtn.addEventListener('click', handleClose);
    backdrop.addEventListener('click', handleClose);
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

