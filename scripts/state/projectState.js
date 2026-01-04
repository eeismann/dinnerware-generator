/**
 * Project State Management
 * Manages all application state with reactive updates
 */

// Item types
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
    wallCurveAmount: 0,
    wallCurvePosition: 0.5,
    bottomCornerRadius: 0,
    footringOriginHeight: 8,
    outerFootringAngle: 15,
    footringBaseWidth: 8,
    innerFootringAngle: -15,
    wallThickness: 2.5,
    baseRecessDepth: 1,
    globalHeightScale: 100,
    globalWidthScale: 100
};

// Parameter constraints
export const PARAMETER_CONSTRAINTS = {
    wallAngle: { min: -30, max: 45, step: 1, unit: '°', default: 15 },
    wallCurveAmount: { min: -50, max: 50, step: 1, unit: 'mm', default: 0 },
    wallCurvePosition: { min: 0.1, max: 0.9, step: 0.05, unit: '', default: 0.5 },
    bottomCornerRadius: { min: 0, max: 50, step: 1, unit: 'mm', default: 0 },
    footringOriginHeight: { min: 0, max: 50, step: 0.5, unit: 'mm', default: 8 },
    outerFootringAngle: { min: -45, max: 45, step: 1, unit: '°', default: 15 },
    footringBaseWidth: { min: 2, max: 30, step: 0.5, unit: 'mm', default: 8 },
    innerFootringAngle: { min: -45, max: 45, step: 1, unit: '°', default: -15 },
    wallThickness: { min: 0.8, max: 10, step: 0.1, unit: 'mm', default: 2.5 },
    baseRecessDepth: { min: -10, max: 10, step: 0.5, unit: 'mm', default: 1 },
    globalHeightScale: { min: 50, max: 200, step: 5, unit: '%', default: 100 },
    globalWidthScale: { min: 50, max: 200, step: 5, unit: '%', default: 100 },
    cupRingDepth: { min: 0, max: 10, step: 0.5, unit: 'mm', default: 2 }
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
            saucerSettings: {
                cupRingDepth: 2
            },
            ui: {
                visibleItems: [...ITEM_TYPES],
                layoutMode: 'row',
                crossSectionEnabled: false,
                expandedPanels: ['global-scaling'],
                cameraPreset: 'three-quarter'
            },
            project: {
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
        if (JSON.stringify(oldValue) === JSON.stringify(value)) return;

        this.setNestedValue(this.state, path, value);
        this.state.project.isDirty = true;
        this.state.project.lastModified = new Date().toISOString();

        this.notifyListeners(path, value, oldValue);
        this.scheduleAutoSave();
    }

    // Batch update multiple state values
    batchUpdate(updates) {
        const changedPaths = [];
        
        for (const [path, value] of Object.entries(updates)) {
            const oldValue = this.getState(path);
            if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                this.setNestedValue(this.state, path, value);
                changedPaths.push({ path, value, oldValue });
            }
        }

        if (changedPaths.length > 0) {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();

            changedPaths.forEach(({ path, value, oldValue }) => {
                this.notifyListeners(path, value, oldValue);
            });
            
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
            const data = {
                state: this.state,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('dinnerware_current_project', JSON.stringify(data));
        } catch (e) {
            console.warn('Auto-save failed:', e);
        }
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
        
        // Merge visible items - add any new item types
        let visibleItems = loadedState.ui?.visibleItems || [...ITEM_TYPES];
        ITEM_TYPES.forEach(itemType => {
            if (!visibleItems.includes(itemType)) {
                visibleItems.push(itemType);
            }
        });
        // Remove any items that no longer exist
        visibleItems = visibleItems.filter(item => ITEM_TYPES.includes(item));
        
        return {
            ...defaultState,
            ...loadedState,
            baseDimensions,
            itemRatios,
            itemMultipliers,
            globalParameters: { ...defaultState.globalParameters, ...loadedState.globalParameters },
            ui: { ...defaultState.ui, ...loadedState.ui, visibleItems },
            project: { ...defaultState.project, ...loadedState.project }
        };
    }

    // Reset to initial state
    reset() {
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
            saucerSettings: this.state.saucerSettings
        };
    }

    // Import state from file
    importState(data) {
        if (!data.version) {
            throw new Error('Invalid project file format');
        }

        this.state = {
            ...this.getInitialState(),
            globalParameters: { ...DEFAULT_PARAMETERS, ...data.globalParameters },
            itemRatios: data.itemRatios || JSON.parse(JSON.stringify(DEFAULT_RATIOS)),
            itemMultipliers: data.itemMultipliers || this.getDefaultMultipliers(),
            itemOverrides: data.itemOverrides || {},
            saucerSettings: data.saucerSettings || { cupRingDepth: 2 },
            project: {
                name: data.projectName || 'Imported Project',
                dateCreated: data.dateCreated,
                lastModified: data.lastModified,
                isDirty: false
            }
        };

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
            'wallAngle', 'wallCurveAmount', 'wallCurvePosition',
            'bottomCornerRadius', 'footringOriginHeight', 'outerFootringAngle',
            'footringBaseWidth', 'innerFootringAngle', 'wallThickness',
            'baseRecessDepth'
        ];

        const parameters = {};
        for (const name of parameterNames) {
            parameters[name] = this.getEffectiveParameter(itemType, name);
        }

        parameters.dimensions = this.getFinalDimensions(itemType);

        // Add saucer-specific parameters
        if (itemType === 'saucer') {
            parameters.cupRingDepth = this.state.getState('saucerSettings.cupRingDepth');
            // Get mug base dimensions for cup ring diameter
            const mugDims = this.getFinalDimensions('mug');
            parameters.cupRingDiameter = mugDims.diameter * 0.6 + 4; // Base diameter + clearance
        }

        return parameters;
    }
}

// Create singleton instances
export const stateManager = new StateManager();
export const parameterResolver = new ParameterResolver(stateManager);

