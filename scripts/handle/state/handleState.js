/**
 * Handle Generator State Management
 * Manages all state for the mug handle generator application
 */

// Default handle parameters
export const DEFAULT_HANDLE_PARAMS = {
    // Handle Dimensions
    handleProtrusion: 35,       // mm - horizontal distance from mug
    handleWidth: 25,            // mm - width of handle (Z-direction)
    
    // Cross-Section Type ('oval' or 'rectangular')
    crossSectionType: 'oval',
    
    // Cross-Section Dimensions
    crossSectionWidth: 10,      // mm - displays as "Height" in UI
    crossSectionHeight: 20,     // mm - displays as "Width" in UI
    crossSectionCornerRadius: 3, // mm - corner radius for rectangular type
    
    // Attachment Points (determines handle height)
    topAttachmentHeight: 85,    // mm from mug base
    bottomAttachmentHeight: 15, // mm from mug base
    
    // Corner Radii (D-shape profile)
    attachmentRadius: 8,        // mm - fillet curve radius (circular arc) where handle meets mug
    upperCornerRadius: 15,      // mm - rounded corner at top-right
    lowerCornerRadius: 15,      // mm - rounded corner at bottom-right
    
    // Vertical arm angle (tilt of the back edge)
    verticalArmAngle: 0,        // degrees - positive tilts top outward
    matchMugWallAngle: false,   // when true, verticalArmAngle matches mug taper
};

// Parameter constraints
export const PARAM_CONSTRAINTS = {
    handleProtrusion: { min: 20, max: 80, step: 1, unit: 'mm' },
    handleWidth: { min: 15, max: 50, step: 1, unit: 'mm' },
    crossSectionWidth: { min: 8, max: 30, step: 0.5, unit: 'mm' },
    crossSectionHeight: { min: 8, max: 25, step: 0.5, unit: 'mm' },
    crossSectionCornerRadius: { min: 0, max: 10, step: 0.5, unit: 'mm' },
    topAttachmentHeight: { min: 30, max: 120, step: 1, unit: 'mm' },
    bottomAttachmentHeight: { min: 5, max: 80, step: 1, unit: 'mm' },
    attachmentRadius: { min: 0, max: 20, step: 0.1, unit: 'mm' },
    upperCornerRadius: { min: 5, max: 40, step: 1, unit: 'mm' },
    lowerCornerRadius: { min: 5, max: 40, step: 1, unit: 'mm' },
    verticalArmAngle: { min: -30, max: 30, step: 1, unit: '°' },
};

// Application state structure
const createInitialState = () => ({
    // Project metadata
    project: {
        id: null,
        name: 'Untitled Handle',
        createdAt: null,
        modifiedAt: null,
        linkedMugProjectId: null,
    },
    
    // Mug reference data (imported from dinnerware generator)
    mugData: {
        loaded: false,
        projectName: null,
        height: 95,             // mm
        topDiameter: 80,        // mm
        bottomDiameter: 60,     // mm
        wallThickness: 2.5,     // mm
        wallAngle: 15,          // degrees
    },
    
    // Handle parameters
    handleParams: { ...DEFAULT_HANDLE_PARAMS },
    
    // View settings
    viewSettings: {
        cameraView: 'side',             // side, threeQuarter, top, bottom
        showCrossSection: false,
        showDimensions: true,
        showAttachmentOutlines: true,
        showGrid: true,
        mugDisplayMode: 'transparent',  // transparent, wireframe, solid, hidden
    },
    
    // UI state
    ui: {
        hasUnsavedChanges: false,
        isLoading: false,
        activeSection: 'handle-dimensions',
    },
    
    // Warnings
    warnings: [],
});

// State manager singleton
class HandleStateManager {
    constructor() {
        this.state = createInitialState();
        this.listeners = new Set();
        this.historyEnabled = false; // Not needed for V1
    }
    
    // Get current state (immutable)
    getState() {
        return this.state;
    }
    
    // Subscribe to state changes
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    
    // Notify all listeners
    notify(changedPaths = []) {
        this.listeners.forEach(listener => listener(this.state, changedPaths));
    }
    
    // Update state
    setState(updater, paths = []) {
        if (typeof updater === 'function') {
            this.state = updater(this.state);
        } else {
            this.state = { ...this.state, ...updater };
        }
        this.notify(paths);
    }
    
    // Update handle parameter
    setHandleParam(param, value) {
        this.state = {
            ...this.state,
            handleParams: {
                ...this.state.handleParams,
                [param]: value,
            },
            ui: {
                ...this.state.ui,
                hasUnsavedChanges: true,
            },
        };
        this.validateParameters();
        this.notify(['handleParams', param]);
    }
    
    // Batch update handle parameters
    setHandleParams(params) {
        this.state = {
            ...this.state,
            handleParams: {
                ...this.state.handleParams,
                ...params,
            },
            ui: {
                ...this.state.ui,
                hasUnsavedChanges: true,
            },
        };
        this.validateParameters();
        this.notify(['handleParams']);
    }
    
    // Update mug data
    setMugData(mugData) {
        this.state = {
            ...this.state,
            mugData: {
                ...this.state.mugData,
                ...mugData,
                loaded: true,
            },
            ui: {
                ...this.state.ui,
                hasUnsavedChanges: true,
            },
        };
        // Apply smart defaults based on mug dimensions
        this.applySmartDefaults();
        this.validateParameters();
        this.notify(['mugData']);
    }
    
    // Apply smart defaults based on mug size
    applySmartDefaults() {
        const { mugData } = this.state;
        if (!mugData.loaded) return;
        
        const newDefaults = {
            handleProtrusion: Math.round(mugData.topDiameter * 0.4),
            topAttachmentHeight: Math.round(mugData.height * 0.9),
            bottomAttachmentHeight: Math.round(mugData.height * 0.15),
        };
        
        // Clamp to valid ranges
        Object.keys(newDefaults).forEach(key => {
            const constraints = PARAM_CONSTRAINTS[key];
            if (constraints) {
                newDefaults[key] = Math.max(constraints.min, Math.min(constraints.max, newDefaults[key]));
            }
        });
        
        this.state.handleParams = {
            ...this.state.handleParams,
            ...newDefaults,
        };
    }
    
    // Update view settings
    setViewSetting(setting, value) {
        this.state = {
            ...this.state,
            viewSettings: {
                ...this.state.viewSettings,
                [setting]: value,
            },
        };
        this.notify(['viewSettings', setting]);
    }
    
    // Update project metadata
    setProject(projectData) {
        this.state = {
            ...this.state,
            project: {
                ...this.state.project,
                ...projectData,
            },
        };
        this.notify(['project']);
    }
    
    // Set loading state
    setLoading(isLoading) {
        this.state = {
            ...this.state,
            ui: {
                ...this.state.ui,
                isLoading,
            },
        };
        this.notify(['ui', 'isLoading']);
    }
    
    // Mark as saved
    markSaved() {
        this.state = {
            ...this.state,
            project: {
                ...this.state.project,
                modifiedAt: new Date().toISOString(),
            },
            ui: {
                ...this.state.ui,
                hasUnsavedChanges: false,
            },
        };
        this.notify(['project', 'ui']);
    }
    
    // Reset to new project
    resetToNew() {
        this.state = createInitialState();
        this.notify(['all']);
    }
    
    // Load project data
    loadProject(projectData) {
        this.state = {
            ...createInitialState(),
            project: {
                ...projectData.project,
            },
            mugData: {
                ...projectData.mugData,
            },
            handleParams: {
                ...DEFAULT_HANDLE_PARAMS,
                ...projectData.handleParams,
            },
            viewSettings: {
                ...this.state.viewSettings,
                ...projectData.viewSettings,
            },
        };
        this.validateParameters();
        this.notify(['all']);
    }
    
    // Get serializable project data
    getProjectData() {
        return {
            version: '1.0',
            appType: 'handle-generator',
            project: this.state.project,
            mugData: this.state.mugData,
            handleParams: this.state.handleParams,
            viewSettings: this.state.viewSettings,
        };
    }
    
    // Validate parameters and generate warnings
    validateParameters() {
        const warnings = [];
        const { handleParams, mugData } = this.state;
        
        if (mugData.loaded) {
            // Check if handle extends beyond mug height
            if (handleParams.topAttachmentHeight > mugData.height) {
                warnings.push({
                    id: 'top-attachment-exceeds-height',
                    type: 'warning',
                    title: 'Top attachment above mug',
                    message: `Top attachment (${handleParams.topAttachmentHeight}mm) exceeds mug height (${mugData.height}mm)`,
                    param: 'topAttachmentHeight',
                });
            }
            
            // Check if bottom attachment is too high
            if (handleParams.bottomAttachmentHeight >= handleParams.topAttachmentHeight) {
                warnings.push({
                    id: 'attachment-overlap',
                    type: 'error',
                    title: 'Attachment points overlap',
                    message: 'Bottom attachment must be below top attachment',
                    param: 'bottomAttachmentHeight',
                });
            }
            
        }
        
        // Check if corner radii are too large for the handle dimensions
        const handleHeight = handleParams.topAttachmentHeight - handleParams.bottomAttachmentHeight;
        const maxCornerRadius = Math.min(handleParams.handleProtrusion, handleHeight / 2) - handleParams.attachmentRadius;
        
        if (handleParams.upperCornerRadius > maxCornerRadius) {
            warnings.push({
                id: 'upper-corner-too-large',
                type: 'warning',
                title: 'Upper corner radius too large',
                message: `Upper corner radius may be too large for handle dimensions`,
                param: 'upperCornerRadius',
            });
        }
        
        if (handleParams.lowerCornerRadius > maxCornerRadius) {
            warnings.push({
                id: 'lower-corner-too-large',
                type: 'warning',
                title: 'Lower corner radius too large',
                message: `Lower corner radius may be too large for handle dimensions`,
                param: 'lowerCornerRadius',
            });
        }
        
        this.state.warnings = warnings;
    }
    
    // Get current warnings
    getWarnings() {
        return this.state.warnings;
    }
}

// Export singleton instance
export const handleStateManager = new HandleStateManager();

// Helper function to get computed values
export function getComputedHandleValues(state) {
    const { handleParams, mugData } = state;
    
    // Calculate derived values
    // Handle height is determined by attachment points
    const handleHeight = handleParams.topAttachmentHeight - handleParams.bottomAttachmentHeight;
    
    // Mug radius at attachment points (accounting for wall angle)
    const mugRadius = mugData.loaded 
        ? mugData.topDiameter / 2 
        : 40; // Default
    
    return {
        handleHeight,
        mugRadius,
        centerHeight: (handleParams.topAttachmentHeight + handleParams.bottomAttachmentHeight) / 2,
    };
}

