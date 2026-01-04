/**
 * Cast Form Generator - Default Parameters & Constraints
 */

// Fixed base mold height - creates interlocking cavity with wall molds
export const BASE_MOLD_HEIGHT = 15;  // mm (1.5cm)

export const DEFAULT_PARAMS = {
    // Mold Dimensions
    mold: {
        plasterWallThickness: 20,  // mm
        spareHeight: 10,           // mm
        cornerCutWidth: 20         // mm - removes corner triangles with vertical cuts
    },
    
    // Registration Keys (Natches)
    natches: {
        diameter: 10,              // mm
        depth: 5,                  // mm
        toleranceOffset: 0.2,      // mm (per side)
        countPerSeam: 2
    },
    
    // Shell Properties
    shell: {
        wallThickness: 1.5         // mm (min 1.2)
    }
};

export const PARAM_CONSTRAINTS = {
    'mold.plasterWallThickness': { min: 20, max: 50, step: 1, unit: 'mm' },
    'mold.spareHeight': { min: 10, max: 80, step: 1, unit: 'mm' },
    'mold.cornerCutWidth': { min: 0, max: 100, step: 1, unit: 'mm' },
    'natches.diameter': { min: 6, max: 15, step: 1, unit: 'mm' },
    'natches.depth': { min: 3, max: 10, step: 0.5, unit: 'mm' },
    'natches.toleranceOffset': { min: 0.1, max: 0.5, step: 0.05, unit: 'mm' },
    'shell.wallThickness': { min: 1.2, max: 3.0, step: 0.1, unit: 'mm' }
};

// Part colors for visualization
export const PART_COLORS = {
    foot: 0xC45C26,    // Terracotta
    wall1: 0x7D9B76,   // Sage Green
    wall2: 0x6B8BA4,   // Dusty Blue
    wall3: 0x9C9588,   // Warm Gray
    natch: 0xD4A84B,   // Gold highlight
    input: 0xE8E0D5    // Cream (input vessel preview)
};

/**
 * Deep clone an object
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

