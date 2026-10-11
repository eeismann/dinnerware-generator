/**
 * Project State Management
 * Manages all application state with reactive updates
 */

// Item types
import { saveDinnerwareDraft } from '../storage/dinnerwareDrafts.js';

export const ITEM_TYPES = ['plate', 'soup_bowl', 'pasta_bowl', 'mug', 'tumbler', 'saucer', 'serving_bowl'];

// Item display names
export const ITEM_NAMES = {
    plate: 'Plate',
    soup_bowl: 'Soup Bowl',
    pasta_bowl: 'Pasta Bowl',
    mug: 'Mug',
    tumbler: 'Tumbler',
    saucer: 'Saucer',
    serving_bowl: 'Serving Bowl'
};

// Default parameter values
export const DEFAULT_PARAMETERS = {
    wallAngle: 15,
    positiveWallAngleAnchor: 'base',
    wallCurveAmount: 0,
    wallCurvePosition: 0.5,
    wallInsetEnabled: false,
    wallInsetHeight: 50,
    wallInsetDepth: 8,
    bottomCornerRadius: 0,
    footringOriginHeight: 8,
    outerFootringAngle: 15,
    footringBaseWidth: 8,
    footringWidthProportional: false,
    footringWidthReduction: 100,
    innerFootringAngle: -15,
    wallThickness: 2.5,
    footCavityDepth: 100,
    rimStyle: 'flat',
    globalHeightScale: 100,
    globalWidthScale: 100,
    // Surface pattern - outer wall
    wallPatternType: 'none',
    wallPatternDepth: 0.4,
    wallPatternRelief: 'raised',
    wallPatternCount: 48,
    wallPatternPitch: 4,
    wallPatternLineWidth: 50,
    wallPatternProfile: 'rounded',
    wallPatternAngle: 45,
    wallPatternDirection: 'right',
    wallPatternInsetRegion: 'both',
    // Surface pattern - outer footring
    footringPatternType: 'none',
    footringPatternDepth: 0.3,
    footringPatternRelief: 'raised',
    footringPatternCount: 36,
    footringPatternPitch: 2.5,
    footringPatternLineWidth: 50,
    footringPatternProfile: 'rounded',
    footringPatternAngle: 30,
    footringPatternDirection: 'right'
};

// Shared option lists for surface pattern enum parameters
export const PATTERN_TYPE_OPTIONS = [
    { value: 'none', label: 'Smooth' },
    { value: 'vertical', label: 'Vertical Lines' },
    { value: 'horizontal', label: 'Horizontal Lines' },
    { value: 'diagonal', label: 'Diagonal Lines' },
    { value: 'crosshatch', label: 'Cross-Hatch' },
    { value: 'knurl', label: 'Knurling' }
];

export const PATTERN_RELIEF_OPTIONS = [
    { value: 'raised', label: 'Raised' },
    { value: 'recessed', label: 'Recessed' }
];

export const PATTERN_PROFILE_OPTIONS = [
    { value: 'rounded', label: 'Rounded' },
    { value: 'v', label: 'V-Groove' },
    { value: 'square', label: 'Square' }
];

export const PATTERN_DIRECTION_OPTIONS = [
    { value: 'right', label: 'Right' },
    { value: 'left', label: 'Left' }
];

// Parameter constraints
export const PARAMETER_CONSTRAINTS = {
    wallAngle: { min: -30, max: 45, step: 1, unit: '°', default: 15 },
    positiveWallAngleAnchor: {
        options: [
            { value: 'base', label: 'Base — Keep Base Width' },
            { value: 'rim', label: 'Rim — Keep Rim Width' }
        ],
        default: 'base'
    },
    wallCurveAmount: { min: -50, max: 50, step: 1, unit: 'mm', default: 0 },
    wallCurvePosition: { min: 0.1, max: 0.9, step: 0.05, unit: '', default: 0.5 },
    wallInsetEnabled: { type: 'boolean', default: false },
    wallInsetHeight: { min: 10, max: 90, step: 5, unit: '%', default: 50 },
    wallInsetDepth: { min: 1, max: 25, step: 1, unit: '%', default: 8 },
    bottomCornerRadius: { min: 0, max: 50, step: 1, unit: 'mm', default: 0 },
    footringOriginHeight: { min: 0, max: 50, step: 0.5, unit: 'mm', default: 8 },
    outerFootringAngle: { min: -45, max: 45, step: 1, unit: '°', default: 15 },
    footringBaseWidth: { min: 2, max: 30, step: 0.5, unit: 'mm', default: 8 },
    footringWidthProportional: { type: 'boolean', default: false },
    footringWidthReduction: { min: 0, max: 100, step: 1, unit: '%', default: 100 },
    innerFootringAngle: { min: -45, max: 45, step: 1, unit: '°', default: -15 },
    wallThickness: { min: 0.8, max: 10, step: 0.1, unit: 'mm', default: 2.5 },
    footCavityDepth: { min: 0, max: 100, step: 5, unit: '%', default: 100 },
    rimStyle: {
        options: [
            { value: 'flat', label: 'Flat' },
            { value: 'rounded', label: 'Rounded' },
            { value: 'tapered', label: 'Tapered' }
        ],
        default: 'flat'
    },
    globalHeightScale: { min: 50, max: 200, step: 5, unit: '%', default: 100 },
    globalWidthScale: { min: 50, max: 200, step: 5, unit: '%', default: 100 },
    // Surface pattern - outer wall
    wallPatternType: { options: PATTERN_TYPE_OPTIONS, default: 'none' },
    wallPatternDepth: { min: 0.1, max: 1.5, step: 0.05, unit: 'mm', default: 0.4 },
    wallPatternRelief: { options: PATTERN_RELIEF_OPTIONS, default: 'raised' },
    wallPatternCount: { min: 8, max: 160, step: 1, unit: '', default: 48 },
    wallPatternPitch: { min: 1, max: 20, step: 0.5, unit: 'mm', default: 4 },
    wallPatternLineWidth: { min: 10, max: 90, step: 5, unit: '%', default: 50 },
    wallPatternProfile: { options: PATTERN_PROFILE_OPTIONS, default: 'rounded' },
    wallPatternAngle: { min: 15, max: 75, step: 5, unit: '°', default: 45 },
    wallPatternDirection: { options: PATTERN_DIRECTION_OPTIONS, default: 'right' },
    wallPatternInsetRegion: {
        options: [
            { value: 'upper', label: 'Upper Portion' },
            { value: 'lower', label: 'Lower Portion' },
            { value: 'both', label: 'Both Portions' }
        ],
        default: 'both'
    },
    // Surface pattern - outer footring
    footringPatternType: { options: PATTERN_TYPE_OPTIONS, default: 'none' },
    footringPatternDepth: { min: 0.1, max: 1.5, step: 0.05, unit: 'mm', default: 0.3 },
    footringPatternRelief: { options: PATTERN_RELIEF_OPTIONS, default: 'raised' },
    footringPatternCount: { min: 8, max: 160, step: 1, unit: '', default: 36 },
    footringPatternPitch: { min: 1, max: 20, step: 0.5, unit: 'mm', default: 2.5 },
    footringPatternLineWidth: { min: 10, max: 90, step: 5, unit: '%', default: 50 },
    footringPatternProfile: { options: PATTERN_PROFILE_OPTIONS, default: 'rounded' },
    footringPatternAngle: { min: 15, max: 75, step: 5, unit: '°', default: 30 },
    footringPatternDirection: { options: PATTERN_DIRECTION_OPTIONS, default: 'right' }
};

// Base dimensions (at 100% scale)
export const BASE_DIMENSIONS = {
    plate: { diameter: 280, height: 25 },
    soup_bowl: { diameter: 180, height: 60 },
    pasta_bowl: { diameter: 240, height: 50 },
    mug: { diameter: 90, height: 100 },
    tumbler: { diameter: 70, height: 145 },
    saucer: { diameter: 150, height: 20 },
    serving_bowl: { diameter: 280, height: 100 }
};

// Default item ratios (relative to plate)
export const DEFAULT_RATIOS = {
    plate: { widthRatio: 100, heightRatio: 100 },
    soup_bowl: { widthRatio: 64, heightRatio: 240 },
    pasta_bowl: { widthRatio: 86, heightRatio: 200 },
    mug: { widthRatio: 32, heightRatio: 400 },
    tumbler: { widthRatio: 25, heightRatio: 580 },
    saucer: { widthRatio: 54, heightRatio: 80 },
    serving_bowl: { widthRatio: 100, heightRatio: 400 }
};

/**
 * Projects saved before the foot cavity rework stored `baseRecessDepth` in mm,
 * where positive values pushed the base *below* the foot ring (the piece
 * rested on its centre) and negative values raised it into the foot. Convert
 * to `footCavityDepth`, a percentage of the foot ring height: deliberate
 * raised bases keep their depth, a flush base stays solid, and the old
 * default/protruding values become the full cavity.
 */
function legacyRecessToCavity(recess, footringHeight) {
    if (!Number.isFinite(recess)) return undefined;
    if (recess > 0) return DEFAULT_PARAMETERS.footCavityDepth;
    if (recess === 0) return 0;
    if (!(footringHeight > 0)) return DEFAULT_PARAMETERS.footCavityDepth;
    const percent = Math.min(100, (-recess / footringHeight) * 100);
    return Math.round(percent / 5) * 5;
}

function migrateBaseRecess(globalParameters, loadedOverrides) {
    const itemOverrides = loadedOverrides ? JSON.parse(JSON.stringify(loadedOverrides)) : {};
    const globalFootHeight = globalParameters.footringOriginHeight;
    if ('baseRecessDepth' in globalParameters) {
        if (globalParameters.footCavityDepth === undefined
            || globalParameters.footCavityDepth === DEFAULT_PARAMETERS.footCavityDepth) {
            globalParameters.footCavityDepth = legacyRecessToCavity(
                Number(globalParameters.baseRecessDepth), globalFootHeight
            ) ?? DEFAULT_PARAMETERS.footCavityDepth;
        }
        delete globalParameters.baseRecessDepth;
    }
    Object.values(itemOverrides).forEach(overrides => {
        if (!overrides || !('baseRecessDepth' in overrides)) return;
        const cavity = legacyRecessToCavity(
            Number(overrides.baseRecessDepth),
            overrides.footringOriginHeight ?? globalFootHeight
        );
        if (cavity !== undefined && overrides.footCavityDepth === undefined) {
            overrides.footCavityDepth = cavity;
        }
        delete overrides.baseRecessDepth;
    });
    return itemOverrides;
}

// Primitive slider values compare directly; objects fall back to JSON.
function valuesEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * State Manager Class
 * Provides reactive state management with subscriptions
 */
export class StateManager {
    constructor() {
        this.state = this.getInitialState();
        this.listeners = new Map();
        this.autoSaveTimeout = null;
    }

    getInitialState() {
        return {
            globalParameters: { ...DEFAULT_PARAMETERS },
            baseDimensions: { ...BASE_DIMENSIONS },
            itemRatios: JSON.parse(JSON.stringify(DEFAULT_RATIOS)),
            itemMultipliers: this.getDefaultMultipliers(),
            itemOverrides: {},
            ui: {
                visibleItems: [...ITEM_TYPES],
                layoutMode: 'row',
                crossSectionEnabled: false,
                expandedPanels: ['global-scaling'],
                cameraPreset: 'three-quarter',
                exportUpAxis: 'z'
            },
            project: {
                id: null,
                name: 'Untitled',
                dateCreated: null,
                lastModified: null,
                isDirty: false
            },
            warnings: []
        };
    }

    getDefaultMultipliers() {
        const multipliers = {};
        ITEM_TYPES.forEach(item => {
            multipliers[item] = { height: 100, width: 100 };
        });
        return multipliers;
    }

    // Subscribe to state changes
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);

        return () => this.listeners.get(path).delete(callback);
    }

    // Subscribe to any state change
    subscribeAll(callback) {
        return this.subscribe('*', callback);
    }

    // Get state value by path
    getState(path) {
        if (!path) return this.state;
        return this.getNestedValue(this.state, path);
    }

    // Set state value by path
    setState(path, value) {
        const oldValue = this.getState(path);
        if (valuesEqual(oldValue, value)) return;

        const wasDirty = this.state.project.isDirty;
        this.setNestedValue(this.state, path, value);
        if (path !== 'project.isDirty') {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();
        }

        this.notifyListeners(path, value, oldValue);
        if (path !== 'project.isDirty' && !wasDirty) this.notifyListeners('project.isDirty', true, false);
        this.scheduleAutoSave();
    }

    // Batch update multiple state values
    batchUpdate(updates) {
        const changedPaths = [];
        
        for (const [path, value] of Object.entries(updates)) {
            const oldValue = this.getState(path);
            if (!valuesEqual(oldValue, value)) {
                this.setNestedValue(this.state, path, value);
                changedPaths.push({ path, value, oldValue });
            }
        }

        if (changedPaths.length > 0) {
            const wasDirty = this.state.project.isDirty;
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();

            changedPaths.forEach(({ path, value, oldValue }) => {
                this.notifyListeners(path, value, oldValue);
            });
            if (!wasDirty) this.notifyListeners('project.isDirty', true, false);
            
            this.scheduleAutoSave();
        }
    }

    // Notify all relevant listeners
    notifyListeners(path, newValue, oldValue) {
        // Notify exact path listeners
        if (this.listeners.has(path)) {
            for (const callback of this.listeners.get(path)) {
                callback(newValue, oldValue, path);
            }
        }

        // Notify parent path listeners
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            if (this.listeners.has(parentPath)) {
                for (const callback of this.listeners.get(parentPath)) {
                    callback(this.getState(parentPath), null, path);
                }
            }
        }

        // Notify wildcard listeners
        if (this.listeners.has('*')) {
            for (const callback of this.listeners.get('*')) {
                callback(newValue, oldValue, path);
            }
        }
    }

    // Helper: Get nested value
    getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    // Helper: Set nested value
    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        let target = obj;
        
        for (const part of parts) {
            if (target[part] === undefined) {
                target[part] = {};
            }
            target = target[part];
        }
        
        target[last] = value;
    }

    // Schedule auto-save to localStorage
    scheduleAutoSave() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
        this.autoSaveTimeout = setTimeout(() => this.autoSave(), 2000);
    }

    // Auto-save to localStorage
    autoSave() {
        try {
            saveDinnerwareDraft(this.state);
            this.lastStorageError = null;
            this.notifyListeners('storage.error', null, null);
            return true;
        } catch (e) {
            console.warn('Auto-save failed:', e);
            this.lastStorageError = e.message;
            this.notifyListeners('storage.error', e.message, null);
            return false;
        }
    }

    markSaved(project) {
        clearTimeout(this.autoSaveTimeout);
        Object.assign(this.state.project, {
            id: project.id,
            dateCreated: project.dateCreated,
            lastModified: project.lastModified,
            isDirty: false
        });
        this.notifyListeners('project.isDirty', false, true);
        this.autoSave();
    }

    // Load from localStorage
    loadAutoSave() {
        try {
            const data = localStorage.getItem('dinnerware_current_project');
            if (data) {
                const parsed = JSON.parse(data);
                this.state = this.mergeWithDefaults(parsed.state);
                return true;
            }
        } catch (e) {
            console.warn('Failed to load auto-save:', e);
        }
        return false;
    }

    // Merge loaded state with defaults (for backwards compatibility)
    mergeWithDefaults(loadedState) {
        const defaultState = this.getInitialState();
        
        // Always use current base dimensions (not user-configurable)
        const baseDimensions = { ...BASE_DIMENSIONS };
        
        // Merge item ratios - ensure all current item types have ratios
        const itemRatios = { ...JSON.parse(JSON.stringify(DEFAULT_RATIOS)) };
        if (loadedState.itemRatios) {
            Object.keys(loadedState.itemRatios).forEach(key => {
                if (ITEM_TYPES.includes(key)) {
                    itemRatios[key] = loadedState.itemRatios[key];
                }
            });
        }
        
        // Merge item multipliers - ensure all current item types have multipliers
        const itemMultipliers = this.getDefaultMultipliers();
        if (loadedState.itemMultipliers) {
            Object.keys(loadedState.itemMultipliers).forEach(key => {
                if (ITEM_TYPES.includes(key)) {
                    itemMultipliers[key] = loadedState.itemMultipliers[key];
                }
            });
        }
        
        // An absent field uses defaults; an intentionally hidden item stays hidden.
        const visibleItems = Array.isArray(loadedState.ui?.visibleItems)
            ? loadedState.ui.visibleItems.filter(item => ITEM_TYPES.includes(item))
            : [...ITEM_TYPES];

        const globalParameters = { ...defaultState.globalParameters, ...loadedState.globalParameters };
        // Keep the authored plate width as the reference. The superseded
        // diameter percentage is not a degree of reduction.
        delete globalParameters.footringWidthRatio;
        globalParameters.footringWidthReduction ??= DEFAULT_PARAMETERS.footringWidthReduction;
        const itemOverrides = migrateBaseRecess(globalParameters, loadedState.itemOverrides);
        
        return {
            ...defaultState,
            ...loadedState,
            baseDimensions,
            itemRatios,
            itemMultipliers,
            globalParameters,
            itemOverrides,
            ui: { ...defaultState.ui, ...loadedState.ui, visibleItems },
            project: { ...defaultState.project, ...loadedState.project }
        };
    }

    // Reset to initial state
    reset() {
        clearTimeout(this.autoSaveTimeout);
        this.state = this.getInitialState();
        this.notifyListeners('*', this.state, null);
    }

    // Export state for saving
    exportState() {
        return {
            version: '1.0',
            projectName: this.state.project.name,
            dateCreated: this.state.project.dateCreated || new Date().toISOString(),
            lastModified: new Date().toISOString(),
            globalParameters: this.state.globalParameters,
            itemRatios: this.state.itemRatios,
            itemMultipliers: this.state.itemMultipliers,
            itemOverrides: this.state.itemOverrides,
            ui: this.state.ui
        };
    }

    // Import state from file
    importState(data) {
        if (!data || !data.globalParameters || typeof data.globalParameters !== 'object') {
            throw new Error('Invalid project file format');
        }

        clearTimeout(this.autoSaveTimeout);
        this.state = this.mergeWithDefaults({
            ...data,
            project: {
                id: null,
                name: data.projectName || data.project?.name || 'Imported Project',
                dateCreated: data.dateCreated || data.project?.dateCreated,
                lastModified: data.lastModified || data.project?.lastModified,
                isDirty: true
            }
        });

        this.notifyListeners('*', this.state, null);
    }
}

/**
 * Parameter Resolver
 * Resolves effective parameters considering overrides
 */
export class ParameterResolver {
    constructor(stateManager) {
        this.state = stateManager;
    }

    // Get effective parameter value for an item
    getEffectiveParameter(itemType, parameterName) {
        const override = this.state.getState(`itemOverrides.${itemType}.${parameterName}`);
        if (override !== undefined) {
            return override;
        }
        return this.state.getState(`globalParameters.${parameterName}`);
    }

    // Check if parameter is overridden
    hasOverride(itemType, parameterName) {
        return this.state.getState(`itemOverrides.${itemType}.${parameterName}`) !== undefined;
    }

    // Get final dimensions for an item
    // Base dimensions are the actual sizes - just apply global scale and item multipliers
    getFinalDimensions(itemType) {
        const base = this.state.getState(`baseDimensions.${itemType}`) || BASE_DIMENSIONS[itemType];
        if (!base) {
            console.error(`No base dimensions found for item type: ${itemType}`);
            return { diameter: 100, height: 50 }; // Fallback dimensions
        }
        const multipliers = this.state.getState(`itemMultipliers.${itemType}`) || { height: 100, width: 100 };
        const globalHeightScale = this.state.getState('globalParameters.globalHeightScale') || 100;
        const globalWidthScale = this.state.getState('globalParameters.globalWidthScale') || 100;

        return {
            diameter: base.diameter * (globalWidthScale / 100) * (multipliers.width / 100),
            height: base.height * (globalHeightScale / 100) * (multipliers.height / 100)
        };
    }

    // Get all effective parameters for an item
    getAllParameters(itemType) {
        const parameterNames = [
            'wallAngle', 'positiveWallAngleAnchor', 'wallCurveAmount', 'wallCurvePosition',
            'wallInsetEnabled', 'wallInsetHeight', 'wallInsetDepth',
            'bottomCornerRadius', 'footringOriginHeight', 'outerFootringAngle',
            'footringBaseWidth', 'innerFootringAngle', 'wallThickness',
            'footCavityDepth', 'rimStyle',
            'wallPatternType', 'wallPatternDepth', 'wallPatternRelief',
            'wallPatternCount', 'wallPatternPitch', 'wallPatternLineWidth',
            'wallPatternProfile', 'wallPatternAngle', 'wallPatternDirection',
            'wallPatternInsetRegion',
            'footringPatternType', 'footringPatternDepth', 'footringPatternRelief',
            'footringPatternCount', 'footringPatternPitch', 'footringPatternLineWidth',
            'footringPatternProfile', 'footringPatternAngle', 'footringPatternDirection'
        ];

        const parameters = {};
        for (const name of parameterNames) {
            parameters[name] = this.getEffectiveParameter(itemType, name);
        }

        parameters.dimensions = this.getFinalDimensions(itemType);
        // Blend from the plate's effective footring width (no reduction) to
        // full baseline-diameter proportions. The plate stays at the maximum;
        // size/angle edits do not change these canonical baseline proportions.
        // Explicit item widths remain absolute mm in either mode.
        if (this.state.getState('globalParameters.footringWidthProportional')
            && !this.hasOverride(itemType, 'footringBaseWidth')) {
            const baseline = BASE_DIMENSIONS[itemType] || BASE_DIMENSIONS.plate;
            const plateWidth = this.getEffectiveParameter('plate', 'footringBaseWidth');
            const reduction = Math.max(0, Math.min(100,
                this.state.getState('globalParameters.footringWidthReduction')
                    ?? DEFAULT_PARAMETERS.footringWidthReduction)) / 100;
            const baselineRatio = Math.min(1, baseline.diameter / BASE_DIMENSIONS.plate.diameter);
            parameters.footringBaseWidth = plateWidth * (1 - reduction * (1 - baselineRatio));
        }
        // Wall-pattern count is authored against the plate, then resolved per
        // item by diameter so physical ridge spacing stays uniform as the set
        // changes size. Using the final plate diameter preserves global scale.
        parameters.patternReferenceDiameter = this.getFinalDimensions('plate').diameter;

        return parameters;
    }
}

// Create singleton instances
export const stateManager = new StateManager();
export const parameterResolver = new ParameterResolver(stateManager);
