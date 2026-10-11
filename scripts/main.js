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
import { getItemDimensions } from './geometry/meshGenerator.js';
import { warningSystem, clampValue, roundToStep } from './utils/validation.js';
import { saveProject as saveToStorage, getProject } from './dashboard/projectStorage.js';
import { init as initTheme } from './ui/themeManager.js';
import { ProjectFileFormat } from './storage/fileFormat.js';
import { resolveAppUrl } from './utils/navigation.js';
import { selectDinnerwareState, startDinnerwareProject, newDinnerwareDraftId } from './storage/dinnerwareDrafts.js';
import { DesignHistory, DESIGN_KEYS } from './state/history.js';
import {
    BUILT_IN_PRESETS, applyPreset, matchingPreset, loadUserPresets, saveUserPreset, deleteUserPreset
} from './state/presets.js';
import { initNumericFields } from './ui/numericFields.js';
import { initControlLabels, initSectionHeaders, openDialog, closeDialog } from './ui/accessibility.js';
import { ProfilePanel } from './ui/profilePanel.js';

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
    buildSurfacePatternSection();
    initParameterControls();
    initPositiveWallAngleAnchorControl();
    initWallInsetControls();
    initFootringWidthControls();
    initPatternControls();
    initItemProportions();
    initOverrideControls();
    initFooterControls();
    initHeaderButtons();
    initProjectNameEditing();
    initModals();
    initSectionCollapse();
    initSectionHeaders();
    initControlLabels(document.getElementById('parameterPanel'));
    initNumericFields(document.getElementById('parameterPanel'));
    initHistory();
    initPresets();
    initSelection();
    initProfilePanel();
    initCompare();
    initKeyboardShortcuts();
    initPanelDrawer();

    // Restore the saved layout without marking the project dirty
    const savedLayout = stateManager.getState('ui.layoutMode');
    if ([...LAYOUT_BUTTONS.values()].includes(savedLayout)) {
        viewport.layoutMode = savedLayout;
        setActiveLayoutButton(savedLayout);
    }

    // Generate initial meshes
    viewport.updateAllItems();
    updateOverrideIndicators();

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
        itemProportionsGrid: document.getElementById('itemProportionsGrid'),
        overrideItemSelect: document.getElementById('overrideItemSelect'),
        overrideControls: document.getElementById('overrideControls'),
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

/**
 * Initialize parameter controls
 */
function initParameterControls() {
    // Global parameters
    document.querySelectorAll('.parameter-row[data-param]').forEach(row => {
        const paramName = row.dataset.param;
        const rangeInput = row.querySelector('input[type="range"]');
        const numberInput = row.querySelector('.numeric-input input');
        const resetBtn = row.querySelector('.btn-reset');

        const selectInput = row.querySelector('select');
        if (selectInput && !rangeInput && paramName !== 'positiveWallAngleAnchor'
            && !row.closest('#surfacePatternControls')) {
            const constraints = PARAMETER_CONSTRAINTS[paramName];
            selectInput.addEventListener('change', () => handleParameterChange(paramName, selectInput.value));
            resetBtn?.addEventListener('click', () => {
                selectInput.value = constraints.default;
                handleParameterChange(paramName, constraints.default);
            });
            return;
        }

        if (!rangeInput || !numberInput) return;

        // Sync range and number inputs. Dragging previews interactively;
        // releasing (change) rebuilds at full resolution.
        rangeInput.addEventListener('input', () => {
            numberInput.value = rangeInput.value;
            handleParameterChange(paramName, parseFloat(rangeInput.value), { interactive: true });
        });
        rangeInput.addEventListener('change', () => {
            handleParameterChange(paramName, parseFloat(rangeInput.value));
        });

        numberInput.addEventListener('change', () => {
            const constraints = PARAMETER_CONSTRAINTS[paramName];
            if (constraints) {
                const value = clampValue(parseFloat(numberInput.value), constraints.min, constraints.max);
                if (paramName === 'footringWidthReduction' && !Number.isFinite(value)) {
                    syncFootringWidthControls();
                    return;
                }
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
 * Select which edge remains dimensionally fixed as a positive wall angle
 * opens the form. Negative and zero angles retain the rim-anchored behavior.
 */
function initPositiveWallAngleAnchorControl() {
    const row = document.querySelector('.parameter-row[data-param="positiveWallAngleAnchor"]');
    const select = row?.querySelector('select');
    const resetBtn = row?.querySelector('.btn-reset');
    const constraints = PARAMETER_CONSTRAINTS.positiveWallAngleAnchor;
    if (!select || !constraints) return;

    select.addEventListener('change', () => {
        handleParameterChange('positiveWallAngleAnchor', select.value);
    });

    resetBtn?.addEventListener('click', () => {
        select.value = constraints.default;
        handleParameterChange('positiveWallAngleAnchor', constraints.default);
    });
}

/**
 * Initialize the set-level wall inset toggle. The two numeric controls use the
 * shared parameter-row wiring above; this only owns enabled/disabled state.
 */
function initWallInsetControls() {
    const toggle = document.getElementById('wallInsetEnabled');
    if (!toggle) return;

    toggle.addEventListener('change', () => {
        handleParameterChange('wallInsetEnabled', toggle.checked);
        syncWallInsetControls();
    });

    syncWallInsetControls();
}

function syncWallInsetControls() {
    const toggle = document.getElementById('wallInsetEnabled');
    const controls = document.getElementById('wallInsetControls');
    if (!toggle || !controls) return;

    const enabled = Boolean(stateManager.getState('globalParameters.wallInsetEnabled'));
    toggle.checked = enabled;
    controls.classList.toggle('is-disabled', !enabled);
    controls.querySelectorAll('input, button').forEach(control => {
        control.disabled = !enabled;
    });
    updatePatternRowVisibility();
}

/**
 * Keep the plate width editable and offer a reduction amount when enabled.
 */
function initFootringWidthControls() {
    const toggle = document.getElementById('footringWidthProportional');
    toggle?.addEventListener('change', () => {
        handleParameterChange('footringWidthProportional', toggle.checked);
    });
    syncFootringWidthControls();
}

function syncFootringWidthControls() {
    const enabled = Boolean(stateManager.getState('globalParameters.footringWidthProportional'));
    const toggle = document.getElementById('footringWidthProportional');
    const fixedRow = document.querySelector('[data-section="global-style"] [data-param="footringBaseWidth"]');
    const reductionRow = document.querySelector('[data-section="global-style"] [data-param="footringWidthReduction"]');
    const help = document.getElementById('footringWidthHelp');
    if (toggle) toggle.checked = enabled;
    if (fixedRow) {
        fixedRow.hidden = false;
        fixedRow.querySelector('label').textContent = enabled ? 'Plate Footring Width' : 'Footring Width';
        fixedRow.querySelectorAll('input, button').forEach(control => { control.disabled = false; });
    }
    if (reductionRow) {
        reductionRow.hidden = !enabled;
        const reduction = stateManager.getState('globalParameters.footringWidthReduction');
        reductionRow.querySelectorAll('input, button').forEach(control => { control.disabled = !enabled; });
        reductionRow.querySelectorAll('input').forEach(input => { input.value = reduction; });
    }
    const plateWidth = Number(parameterResolver.getEffectiveParameter('plate', 'footringBaseWidth').toFixed(2));
    const plateReference = parameterResolver.hasOverride('plate', 'footringBaseWidth')
        ? `Plate override: ${plateWidth} mm maximum.`
        : `Plate: ${plateWidth} mm maximum.`;
    if (help) help.textContent = enabled
        ? `${plateReference} 0% keeps every footring at the plate width; 100% applies the full reduction by baseline diameter. Item overrides stay in millimeters.`
        : 'Uses the same width for every item. Item overrides stay in millimeters.';
}

function updatePlateFootringDependents(itemType, paramName) {
    if (itemType !== 'plate' || paramName !== 'footringBaseWidth'
        || !stateManager.getState('globalParameters.footringWidthProportional')) return;

    ITEM_TYPES.forEach(item => {
        if (item !== 'plate' && !parameterResolver.hasOverride(item, 'footringBaseWidth')) {
            scheduleItemUpdate(item);
        }
    });
    syncFootringWidthControls();
}

// === Surface Pattern controls ===

const PATTERN_PREFIXES = ['wall', 'footring'];
const PATTERN_GROUP_LABELS = { wall: 'Wall', footring: 'Footring' };
const PATTERN_PARAM_SUFFIXES = [
    'Type', 'Depth', 'Relief', 'Count', 'Pitch', 'LineWidth', 'Profile', 'Angle', 'Direction'
];
const PATTERN_PARAM_LABELS = {
    Type: 'Pattern',
    Depth: 'Depth',
    Relief: 'Relief',
    Count: 'Line Count',
    Pitch: 'Pitch',
    LineWidth: 'Line Width',
    Profile: 'Ridge Profile',
    Angle: 'Angle',
    Direction: 'Direction'
};
// Which variation controls each pattern type exposes
const PATTERN_VISIBLE_SUFFIXES = {
    none: [],
    vertical: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile'],
    horizontal: ['Depth', 'Relief', 'Pitch', 'LineWidth', 'Profile'],
    diagonal: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile', 'Angle', 'Direction'],
    crosshatch: ['Depth', 'Relief', 'Count', 'LineWidth', 'Profile', 'Angle'],
    knurl: ['Depth', 'Relief', 'Count', 'Angle']
};

function patternParamName(prefix, suffix) {
    return `${prefix}Pattern${suffix}`;
}

function buildSelectRowHTML(paramName, label, constraints, currentValue) {
    const optionsHTML = constraints.options.map(opt =>
        `<option value="${opt.value}" ${opt.value === currentValue ? 'selected' : ''}>${opt.label}</option>`
    ).join('');
    return `
        <label>${label}</label>
        <div class="control-group">
            <select>${optionsHTML}</select>
            <button class="btn-reset" title="Reset to default">↺</button>
        </div>
    `;
}

function buildSliderRowHTML(label, constraints, currentValue) {
    return `
        <label>${label}</label>
        <div class="control-group">
            <input type="range" min="${constraints.min}" max="${constraints.max}"
                   value="${currentValue}" step="${constraints.step}">
            <div class="numeric-input">
                <input type="number" min="${constraints.min}" max="${constraints.max}"
                       value="${currentValue}" step="${constraints.step}">
                <span class="unit">${constraints.unit}</span>
            </div>
            <button class="btn-reset" title="Reset to default">↺</button>
        </div>
    `;
}

/**
 * Build the Surface Pattern section rows (wall + footring groups).
 * Must run before initParameterControls so the slider rows get wired
 * by the shared parameter-row handler.
 */
function buildSurfacePatternSection() {
    const container = document.getElementById('surfacePatternControls');
    if (!container) return;
    container.innerHTML = '';

    PATTERN_PREFIXES.forEach(prefix => {
        const title = document.createElement('div');
        title.className = 'pattern-group-title';
        title.textContent = PATTERN_GROUP_LABELS[prefix];
        container.appendChild(title);

        PATTERN_PARAM_SUFFIXES.forEach(suffix => {
            const paramName = patternParamName(prefix, suffix);
            const constraints = PARAMETER_CONSTRAINTS[paramName];
            if (!constraints) return;

            const currentValue = stateManager.getState(`globalParameters.${paramName}`)
                ?? constraints.default;

            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.dataset.param = paramName;
            const label = prefix === 'wall' && suffix === 'Count'
                ? 'Reference Line Count'
                : PATTERN_PARAM_LABELS[suffix];
            row.innerHTML = constraints.options
                ? buildSelectRowHTML(paramName, label, constraints, currentValue)
                : buildSliderRowHTML(label, constraints, currentValue);

            container.appendChild(row);
        });

        if (prefix === 'wall') {
            const paramName = 'wallPatternInsetRegion';
            const constraints = PARAMETER_CONSTRAINTS[paramName];
            const currentValue = stateManager.getState(`globalParameters.${paramName}`)
                ?? constraints.default;
            const row = document.createElement('div');
            row.className = 'parameter-row';
            row.dataset.param = paramName;
            row.innerHTML = buildSelectRowHTML(
                paramName,
                'Inset Pattern Region',
                constraints,
                currentValue
            );
            container.appendChild(row);

            const help = document.createElement('p');
            help.className = 'parameter-help wall-pattern-scale-help';
            help.textContent = 'Count and ridge width scale with each form’s diameter.';
            container.appendChild(help);
        }
    });
}

/**
 * Wire select-based pattern rows (type/relief/profile/direction) and the
 * copy button. Slider rows are wired by initParameterControls.
 */
function initPatternControls() {
    const container = document.getElementById('surfacePatternControls');
    if (!container) return;

    container.querySelectorAll('.parameter-row[data-param]').forEach(row => {
        const paramName = row.dataset.param;
        const select = row.querySelector('select');
        if (!select) return; // slider rows handled by initParameterControls

        const constraints = PARAMETER_CONSTRAINTS[paramName];

        select.addEventListener('change', () => {
            handleParameterChange(paramName, select.value);
            updatePatternRowVisibility();
        });

        const resetBtn = row.querySelector('.btn-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                select.value = constraints.default;
                handleParameterChange(paramName, constraints.default);
                updatePatternRowVisibility();
            });
        }
    });

    const copyBtn = document.getElementById('btnCopyWallPattern');
    if (copyBtn) {
        copyBtn.addEventListener('click', () => {
            const updates = {};
            PATTERN_PARAM_SUFFIXES.forEach(suffix => {
                updates[`globalParameters.${patternParamName('footring', suffix)}`] =
                    stateManager.getState(`globalParameters.${patternParamName('wall', suffix)}`);
            });
            stateManager.batchUpdate(updates);
            ITEM_TYPES.forEach(itemType => scheduleItemUpdate(itemType));
            syncPatternInputsFromState();
        });
    }

    updatePatternRowVisibility();
}

/**
 * Show only the variation rows relevant to each surface's pattern type.
 */
function updatePatternRowVisibility() {
    const container = document.getElementById('surfacePatternControls');
    if (!container) return;

    PATTERN_PREFIXES.forEach(prefix => {
        const type = stateManager.getState(`globalParameters.${patternParamName(prefix, 'Type')}`) || 'none';
        const visible = PATTERN_VISIBLE_SUFFIXES[type] || [];

        PATTERN_PARAM_SUFFIXES.forEach(suffix => {
            if (suffix === 'Type') return;
            const row = container.querySelector(`.parameter-row[data-param="${patternParamName(prefix, suffix)}"]`);
            if (row) {
                row.style.display = visible.includes(suffix) ? '' : 'none';
            }
        });
    });

    const insetRegionRow = container.querySelector('[data-param="wallPatternInsetRegion"]');
    if (insetRegionRow) {
        const wallType = stateManager.getState('globalParameters.wallPatternType') || 'none';
        const insetEnabled = Boolean(stateManager.getState('globalParameters.wallInsetEnabled'));
        insetRegionRow.style.display = insetEnabled && wallType !== 'none' ? '' : 'none';
    }

    const scaleHelp = container.querySelector('.wall-pattern-scale-help');
    if (scaleHelp) {
        const wallType = stateManager.getState('globalParameters.wallPatternType') || 'none';
        scaleHelp.style.display = ['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(wallType)
            ? ''
            : 'none';
    }

    // The copy button only matters when the wall has a pattern
    const copyBtn = document.getElementById('btnCopyWallPattern');
    if (copyBtn) {
        const wallType = stateManager.getState('globalParameters.wallPatternType') || 'none';
        copyBtn.style.display = wallType === 'none' ? 'none' : '';
    }
}

/**
 * Push current global pattern values into the pattern section inputs.
 */
function syncPatternInputsFromState() {
    const container = document.getElementById('surfacePatternControls');
    if (!container) return;

    container.querySelectorAll('.parameter-row[data-param]').forEach(row => {
        const value = stateManager.getState(`globalParameters.${row.dataset.param}`);
        if (value === undefined) return;
        const select = row.querySelector('select');
        if (select) {
            select.value = value;
        } else {
            const rangeInput = row.querySelector('input[type="range"]');
            const numberInput = row.querySelector('.numeric-input input');
            if (rangeInput) rangeInput.value = value;
            if (numberInput) numberInput.value = value;
        }
    });

    updatePatternRowVisibility();
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
    syncPresetSelect();
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
    if (paramName === 'footringWidthReduction' && !Number.isFinite(value)) {
        syncFootringWidthControls();
        return;
    }
    // Global parameter
    stateManager.setState(`globalParameters.${paramName}`, value);

    if (['footringWidthProportional', 'footringBaseWidth', 'footringWidthReduction'].includes(paramName)) {
        syncFootringWidthControls();
        elements.overrideItemSelect.dispatchEvent(new Event('change'));
    }

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
                scheduleItemUpdate(itemType, { preserveLayout: true });
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
            'wallAngle', 'wallInsetEnabled', 'wallInsetHeight', 'wallInsetDepth',
            'bottomCornerRadius', 'footringOriginHeight', 'outerFootringAngle',
            'footringBaseWidth', 'innerFootringAngle', 'wallThickness', 'footCavityDepth', 'rimStyle',
            ...PATTERN_PREFIXES.flatMap(prefix =>
                PATTERN_PARAM_SUFFIXES.map(suffix => patternParamName(prefix, suffix)))
        ];

        overridableParams.forEach(paramName => {
            const constraints = paramName === 'footringBaseWidth'
                ? { ...PARAMETER_CONSTRAINTS[paramName], step: 0.01 }
                : PARAMETER_CONSTRAINTS[paramName];
            const globalValue = stateManager.getState(`globalParameters.${paramName}`);
            const hasOverride = overrides[paramName] !== undefined;
            const inheritedValue = paramName === 'footringBaseWidth'
                ? Number(parameterResolver.getAllParameters(selectedItem).footringBaseWidth.toFixed(2))
                : globalValue;
            const currentValue = hasOverride ? overrides[paramName] : inheritedValue;
            const inheritedFootring = paramName === 'footringBaseWidth' && !hasOverride
                && stateManager.getState('globalParameters.footringWidthProportional');

            // Pattern variation rows only appear when the item's effective
            // pattern type uses them
            const patternMatch = paramName.match(/^(wall|footring)Pattern(.+)$/);
            if (patternMatch && patternMatch[2] !== 'Type') {
                const typeParam = patternParamName(patternMatch[1], 'Type');
                const effectiveType = overrides[typeParam]
                    ?? stateManager.getState(`globalParameters.${typeParam}`)
                    ?? 'none';
                const visible = PATTERN_VISIBLE_SUFFIXES[effectiveType] || [];
                if (!visible.includes(patternMatch[2])) return;
            }

            const row = document.createElement('div');
            row.className = `parameter-row ${constraints.type === 'boolean' ? 'override-boolean-row' : ''} ${hasOverride ? 'has-override' : ''}`;
            row.dataset.param = paramName;

            const label = paramName === 'wallInsetEnabled'
                ? 'Wall Inset'
                : patternMatch
                ? `${PATTERN_GROUP_LABELS[patternMatch[1]]} ${PATTERN_PARAM_LABELS[patternMatch[2]] || patternMatch[2]}`
                : formatParamName(paramName);

            const controlHTML = inheritedFootring
                ? `
                <div class="control-group">
                    <div class="numeric-input">
                        <input type="number" value="${currentValue}" readonly aria-label="Inherited footring width">
                        <span class="unit">mm</span>
                    </div>
                    <button class="btn btn-secondary btn-footring-override" type="button">Override</button>
                </div>`
                : constraints.type === 'boolean'
                ? `
                <div class="control-group override-toggle-control">
                    <label class="parameter-switch" title="Override wall inset for this item">
                        <input type="checkbox" ${currentValue ? 'checked' : ''}>
                        <span class="parameter-switch-track"></span>
                    </label>
                    <span class="override-toggle-value">${currentValue ? 'On' : 'Off'}</span>
                    <button class="btn-reset" title="${hasOverride ? 'Reset to global' : 'Reset to default'}">↺</button>
                </div>`
                : constraints.options
                ? `
                <div class="control-group">
                    <select>${constraints.options.map(opt =>
                        `<option value="${opt.value}" ${opt.value === currentValue ? 'selected' : ''}>${opt.label}</option>`
                    ).join('')}</select>
                    <button class="btn-reset" title="${hasOverride ? 'Reset to global' : 'Reset to default'}">↺</button>
                </div>`
                : `
                <div class="control-group">
                    <input type="range" min="${constraints.min}" max="${constraints.max}"
                           value="${currentValue}" step="${constraints.step}">
                    <div class="numeric-input">
                        <input type="number" min="${constraints.min}" max="${constraints.max}"
                               value="${currentValue}" step="${constraints.step}">
                        <span class="unit">${constraints.unit}</span>
                    </div>
                    <button class="btn-reset" title="${hasOverride ? 'Reset to global' : 'Reset to default'}">↺</button>
                </div>`;

            const unit = constraints.unit ?? '';
            const optionLabel = constraints.options?.find(opt => opt.value === inheritedValue)?.label;
            const inheritedText = constraints.type === 'boolean'
                ? (inheritedValue ? 'On' : 'Off')
                : optionLabel ?? `${inheritedValue}${unit}`;
            row.innerHTML = `
                <div class="parameter-row-header">
                    <label>${label}</label>
                    ${hasOverride ? `<span class="inherited-hint">Global: ${inheritedText}</span>
                    <button type="button" class="revert-chip" title="Remove this override and follow the global value">Use global</button>` : ''}
                </div>
                ${controlHTML}
                ${paramName === 'footringBaseWidth' ? `<p class="parameter-help">${inheritedFootring ? 'Calculated from the plate width and reduction. ' : ''}Item overrides use a fixed width in millimeters.</p>` : ''}
            `;

            controlsContainer.appendChild(row);

            // Add event listeners
            const selectInput = row.querySelector('select');
            const checkboxInput = constraints.type === 'boolean'
                ? row.querySelector('input[type="checkbox"]')
                : null;
            const rangeInput = row.querySelector('input[type="range"]');
            const numberInput = row.querySelector('.numeric-input input');
            const resetBtn = row.querySelector('.btn-reset');

            row.querySelector('.revert-chip')?.addEventListener('click', () => resetBtn?.click());

            row.querySelector('.btn-footring-override')?.addEventListener('click', () => {
                setOverrideValue(selectedItem, paramName, clampValue(currentValue, constraints.min, constraints.max));
                updateOverrideUI();
            });

            if (selectInput) {
                selectInput.addEventListener('change', () => {
                    setOverrideValue(selectedItem, paramName, selectInput.value);
                    // Changing a pattern type changes which variation rows apply
                    if (patternMatch && patternMatch[2] === 'Type') {
                        updateOverrideUI();
                    }
                });
            }

            if (checkboxInput) {
                checkboxInput.addEventListener('change', () => {
                    setOverrideValue(selectedItem, paramName, checkboxInput.checked);
                    const valueLabel = row.querySelector('.override-toggle-value');
                    if (valueLabel) valueLabel.textContent = checkboxInput.checked ? 'On' : 'Off';
                });
            }

            if (rangeInput && numberInput) {
                rangeInput.addEventListener('input', () => {
                    numberInput.value = rangeInput.value;
                    setOverrideValue(selectedItem, paramName, parseFloat(rangeInput.value), { interactive: true });
                });
                rangeInput.addEventListener('change', () => {
                    setOverrideValue(selectedItem, paramName, parseFloat(rangeInput.value));
                });

                numberInput.addEventListener('change', () => {
                    const value = clampValue(parseFloat(numberInput.value), constraints.min, constraints.max);
                    numberInput.value = value;
                    rangeInput.value = value;
                    setOverrideValue(selectedItem, paramName, value);
                });
            }

            resetBtn?.addEventListener('click', () => {
                if (parameterResolver.hasOverride(selectedItem, paramName)) {
                    // Remove override
                    const currentOverrides = {
                        ...(stateManager.getState(`itemOverrides.${selectedItem}`) || {})
                    };
                    delete currentOverrides[paramName];
                    stateManager.setState(`itemOverrides.${selectedItem}`, currentOverrides);
                    viewport.updateItem(selectedItem);
                    updatePlateFootringDependents(selectedItem, paramName);
                    updateOverrideUI();
                    updateOverrideIndicators();
                } else if (paramName === 'footringBaseWidth') {
                    // With proportional sizing, the inherited width may differ
                    // from the authored plate width and the fixed default.
                    updateOverrideUI();
                } else if (checkboxInput) {
                    checkboxInput.checked = constraints.default;
                    const valueLabel = row.querySelector('.override-toggle-value');
                    if (valueLabel) valueLabel.textContent = constraints.default ? 'On' : 'Off';
                } else if (selectInput) {
                    selectInput.value = constraints.default;
                } else {
                    // Reset to global default
                    rangeInput.value = constraints.default;
                    numberInput.value = constraints.default;
                }
                refreshWarnings();
            });
        });
        annotateWarningRows();
    };

    if (!select.dataset.overrideListener) {
        select.dataset.overrideListener = 'true';
        select.addEventListener('change', () => overrideUIRenderer());
    }
    overrideUIRenderer = updateOverrideUI;
    updateOverrideUI();
}

let overrideUIRenderer = () => {};

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

    // A new override rebuilds its row with the inherited value and revert chip
    const row = elements.overrideControls.querySelector(`[data-param="${paramName}"]`);
    if (row && !row.classList.contains('has-override') && !interactive) {
        overrideUIRenderer();
    } else if (row) {
        row.classList.add('has-override');
    }
    updateOverrideIndicators();
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
    LAYOUT_BUTTONS.forEach((mode, id) => {
        document.getElementById(id)?.addEventListener('click', () => {
            setActiveLayoutButton(mode);
            viewport.setLayoutMode(mode);
        });
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

const LAYOUT_BUTTONS = new Map([
    ['btnLayoutRow', 'row'],
    ['btnLayoutGrid', 'grid'],
    ['btnLayoutStack', 'stack'],
    ['btnLayoutTable', 'table']
]);

function setActiveLayoutButton(mode) {
    LAYOUT_BUTTONS.forEach((buttonMode, id) => {
        document.getElementById(id)?.classList.toggle('active', buttonMode === mode);
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
    updateOverrideIndicators();
    syncPresetSelect();
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
                updateOverrideIndicators();
                syncPresetSelect();
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

    // Update parameter inputs
    Object.entries(state.globalParameters).forEach(([param, value]) => {
        const row = document.querySelector(`.parameter-row[data-param="${param}"]`);
        if (row) {
            const selectInput = row.querySelector('select');
            const rangeInput = row.querySelector('input[type="range"]');
            const numberInput = row.querySelector('.numeric-input input');
            if (selectInput) selectInput.value = value;
            if (rangeInput) rangeInput.value = value;
            if (numberInput) numberInput.value = value;
        }
    });

    // Update pattern row visibility for the loaded pattern types
    updatePatternRowVisibility();
    syncWallInsetControls();
    syncFootringWidthControls();

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
    annotateWarningRows();
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
 * Show a parameter for an item: its override row when the item overrides
 * it, otherwise the global control.
 */
function revealParameter(itemType, param) {
    selectItem(itemType);
    let row = null;
    if (param && parameterResolver.hasOverride(itemType, param)) {
        document.querySelector('[data-section="per-item-overrides"]')?.classList.add('expanded');
        row = elements.overrideControls.querySelector(`[data-param="${param}"]`);
    } else if (param) {
        row = document.querySelector(`[data-section="global-style"] .parameter-row[data-param="${param}"], #surfacePatternControls .parameter-row[data-param="${param}"]`);
        row?.closest('.panel-section')?.classList.add('expanded');
    }
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.remove('is-flashing');
        void row.offsetWidth;
        row.classList.add('is-flashing');
        row.querySelector('input, select')?.focus({ preventScroll: true });
    }
}

/**
 * Put each warning under the control it concerns: global rows list every
 * affected item that follows the global value; override rows show the
 * selected item's own warnings.
 */
function annotateWarningRows() {
    document.querySelectorAll('.param-warning').forEach(note => note.remove());
    const byRow = new Map();
    const add = (row, warning) => {
        if (!row) return;
        if (!byRow.has(row)) byRow.set(row, []);
        byRow.get(row).push(warning);
    };
    const overrideItem = elements.overrideItemSelect.value;
    sortedWarnings().forEach(warning => {
        const params = warning.parameters || (warning.parameter ? [warning.parameter] : []);
        params.forEach(param => {
            if (parameterResolver.hasOverride(warning.itemType, param)) {
                if (warning.itemType === overrideItem) {
                    add(elements.overrideControls.querySelector(`.parameter-row[data-param="${param}"]`), warning);
                }
            } else {
                add(document.querySelector(`[data-section="global-style"] .parameter-row[data-param="${param}"], #surfacePatternControls .parameter-row[data-param="${param}"]`), warning);
            }
        });
    });
    byRow.forEach((warnings, row) => {
        const worst = warnings[0].severity;
        const note = document.createElement('div');
        note.className = `param-warning severity-${worst}`;
        note.setAttribute('role', 'note');
        const shown = warnings.slice(0, 2).map(w => `<span><strong>${w.itemName}:</strong> ${w.message}</span>`);
        if (warnings.length > 2) shown.push(`<span class="param-warning-more">+${warnings.length - 2} more items</span>`);
        note.innerHTML = shown.join('');
        row.appendChild(note);
        const control = row.querySelector('input, select');
        if (control) {
            if (!note.id) note.id = `param-warning-${Math.random().toString(36).slice(2, 8)}`;
            control.setAttribute('aria-describedby', note.id);
        }
    });
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

// === Selection ===

let selectedItem = null;

function initSelection() {
    viewport.onSelect(itemType => selectItem(itemType));
    elements.overrideItemSelect.addEventListener('change', () => {
        selectItem(elements.overrideItemSelect.value, { fromOverrides: true });
    });
    document.getElementById('btnSelectionEdit')?.addEventListener('click', () => {
        const section = document.querySelector('[data-section="per-item-overrides"]');
        section?.classList.add('expanded');
        openPanelDrawer();
        section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        if (!fromOverrides && elements.overrideItemSelect.value !== selectedItem) {
            elements.overrideItemSelect.value = selectedItem;
            overrideUIRenderer();
        }
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
    // Each committed edit (Enter, arrow key, slider/scrub release, select)
    // is its own step; continuous drags only commit on release. Panel-level
    // listeners run after the controls' own handlers have updated state.
    document.getElementById('parameterPanel')?.addEventListener('change', () => {
        history.commit();
        updateHistoryButtons();
    });
    // Hold idle commits while a pointer gesture (slider, scrub, profile
    // handle) is in progress, however slowly it moves
    ['parameterPanel', 'profilePanel'].forEach(id => {
        document.getElementById(id)?.addEventListener('pointerdown', () => history.hold(), true);
    });
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
    updateOverrideIndicators();
    syncPresetSelect();
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

// === Style presets ===

function allPresets() {
    return [...BUILT_IN_PRESETS, ...loadUserPresets()];
}

function initPresets() {
    const select = document.getElementById('stylePresetSelect');
    const saveBtn = document.getElementById('btnSavePreset');
    const deleteBtn = document.getElementById('btnDeletePreset');
    if (!select) return;

    select.addEventListener('change', () => {
        const preset = allPresets().find(p => p.id === select.value);
        if (!preset) return;
        applyPreset(stateManager, preset);
        applyExternalDesignChange();
    });

    // Inline "save as" form instead of a blocking prompt
    const form = document.createElement('form');
    form.className = 'preset-save';
    form.hidden = true;
    form.innerHTML = `
        <input type="text" maxlength="40" placeholder="Preset name" aria-label="Preset name" required>
        <button type="submit" class="btn btn-small btn-primary">Save</button>
        <button type="button" class="btn btn-small btn-secondary" data-cancel>Cancel</button>`;
    select.closest('.preset-row').after(form);
    const nameInput = form.querySelector('input');
    saveBtn?.addEventListener('click', () => {
        form.hidden = false;
        nameInput.value = '';
        nameInput.focus();
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => { form.hidden = true; });
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = nameInput.value.trim();
        if (!name) return;
        try {
            saveUserPreset(name, stateManager.getState('globalParameters'));
            form.hidden = true;
            syncPresetSelect();
        } catch (error) {
            nameInput.setCustomValidity(`Could not save: ${error.message}`);
            nameInput.reportValidity();
        }
    });
    nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
    deleteBtn?.addEventListener('click', () => {
        const preset = loadUserPresets().find(p => p.id === select.value);
        if (!preset) return;
        deleteUserPreset(preset.id);
        syncPresetSelect();
    });
    syncPresetSelect();
}

function syncPresetSelect() {
    const select = document.getElementById('stylePresetSelect');
    if (!select) return;
    const user = loadUserPresets();
    const match = matchingPreset(stateManager.getState('globalParameters'), [...BUILT_IN_PRESETS, ...user]);
    const option = (preset) => `<option value="${preset.id}">${preset.name.replace(/[<>&"]/g, '')}</option>`;
    const html = `${match ? '' : '<option value="" disabled>Custom</option>'}
        <optgroup label="Built-in">${BUILT_IN_PRESETS.map(option).join('')}</optgroup>
        ${user.length ? `<optgroup label="Saved">${user.map(option).join('')}</optgroup>` : ''}`;
    if (select.dataset.html !== html) {
        select.innerHTML = html;
        select.dataset.html = html;
    }
    select.value = match?.id ?? '';
    const deleteBtn = document.getElementById('btnDeletePreset');
    if (deleteBtn) deleteBtn.hidden = !match?.user;
}

// === Override indicators ===

const GLOBAL_ROW_SELECTOR = '[data-section="global-style"] .parameter-row[data-param], #surfacePatternControls .parameter-row[data-param]';

/**
 * Show where items differ from the set: a badge on each global control that
 * some items override, a dot on those items in the Items menu, and a count
 * in the override item picker.
 */
function updateOverrideIndicators() {
    document.querySelectorAll(GLOBAL_ROW_SELECTOR).forEach(row => {
        const param = row.dataset.param;
        const overriding = ITEM_TYPES.filter(item => parameterResolver.hasOverride(item, param));
        let badge = row.querySelector(':scope > .override-badge');
        if (!overriding.length) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('button');
            badge.type = 'button';
            badge.className = 'override-badge';
            badge.addEventListener('pointerdown', event => event.stopPropagation());
            badge.addEventListener('click', () => {
                const items = JSON.parse(badge.dataset.items);
                const next = items[(items.indexOf(selectedItem) + 1) % items.length];
                revealParameter(next, param);
            });
            row.appendChild(badge);
        }
        badge.dataset.items = JSON.stringify(overriding);
        badge.textContent = overriding.length === 1
            ? `${ITEM_NAMES[overriding[0]]} differs`
            : `${overriding.length} items differ`;
        badge.title = `Overridden for ${overriding.map(item => ITEM_NAMES[item]).join(', ')}. Click to edit.`;
    });

    ITEM_TYPES.forEach(item => {
        const count = Object.keys(stateManager.getState(`itemOverrides.${item}`) || {}).length;
        const label = document.querySelector(`.items-menu-item input[data-item="${item}"]`)?.closest('label');
        if (label) {
            let dot = label.querySelector('.override-dot');
            if (count && !dot) {
                dot = document.createElement('span');
                dot.className = 'override-dot';
                label.appendChild(dot);
            } else if (!count) {
                dot?.remove();
            }
            dot?.setAttribute('title', `${count} per-item override${count > 1 ? 's' : ''}`);
        }
        const option = elements.overrideItemSelect.querySelector(`option[value="${item}"]`);
        if (option) option.textContent = count ? `${ITEM_NAMES[item]} (${count} override${count > 1 ? 's' : ''})` : ITEM_NAMES[item];
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
    profilePanel.setItem(selectedItem || elements.overrideItemSelect.value);
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
