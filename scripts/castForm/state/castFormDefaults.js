/**
 * Cast Form Generator - Default Parameters & Constraints
 */

// Fixed base mold height - creates interlocking cavity with wall molds
export const BASE_MOLD_HEIGHT = 15;  // mm (1.5cm)

export const DEFAULT_NATCHES = {
    enabled: true,
    diameter: 10,              // mm
    depth: 5,                  // mm
    toleranceOffset: 0.2,      // mm per side for negative sockets
    countPerSeam: 2
};

export const DEFAULT_PARAMS = {
    // Mold Dimensions
    mold: {
        plasterWallThickness: 20,  // mm
        spareHeight: 10,           // mm
        cornerCutWidth: 0,         // mm - legacy corner relief control (inert while experimental.compactWallBlocks is on)
        wallCount: 3               // 1 = continuous ring, 2-4 = split wall molds
    },
    // Registration Keys (Natches)
    natches: { ...DEFAULT_NATCHES },

    // Shell Properties
    shell: {
        wallThickness: 1.5         // mm - Bambu-risk diagnostic verified default
    },

    // Polymer case-mold pour boxes (printed separately from the mold forms).
    // The form lies outer-face-down in a floor indent; box walls keep a
    // consistent gap; interior is `headspace` taller than the seated form so a
    // brim pour leaves that much polymer over it. One wall box serves all
    // walls (forms are congruent), plus one circular foot box.
    caseBox: {
        enabled: true,
        gap: 10,             // mm side gap, form -> box wall
        headspace: 25.4,     // mm interior above the seated form (1 inch)
        wallThickness: 3,    // mm box wall
        floorThickness: 3,   // mm below the pocket floor
        indentDepth: 2.5,    // mm pocket the form nests into
        fitClearance: 0.25   // mm pocket oversize per side
    },

    // Experimental controls
    experimental: {
        volumeWallCompiler: true,
        // Compact block walls: clip each wall to two lateral planes parallel to its
        // bisector so the part is a lay-flat prism (outer face down, side faces exactly
        // vertical at 90°) — required for casting the printed form into a polymer case
        // mold. Set false to restore the legacy triangle-wedge envelope.
        compactWallBlocks: true,
        targetVoxelSizePreview: 1.35,
        targetVoxelSizeExport: 0.85,
        depthStepsMinPreview: 22,
        depthStepsMinExport: 32,
        depthStepsMaxPreview: 56,
        depthStepsMaxExport: 76,
        seamBandMultiplier: 1.2,
        heightSampleScalePreview: 0.85,
        heightSampleScaleExport: 0.86,
        angleSampleScalePreview: 0.70,
        angleSampleScaleExport: 0.72,
        spareShelfRisePreview: 0.04,
        spareShelfRiseExport: 0.02,
        featureSnapThresholdPreview: 0.22,
        featureSnapThresholdExport: 0.14
    }
};

export const PARAM_CONSTRAINTS = {
    'mold.plasterWallThickness': { min: 20, max: 50, step: 1, unit: 'mm' },
    'mold.spareHeight': { min: 10, max: 80, step: 1, unit: 'mm' },
    'mold.cornerCutWidth': { min: 0, max: 100, step: 1, unit: 'mm' }, // legacy: inert while experimental.compactWallBlocks is on
    'mold.wallCount': { min: 1, max: 4, step: 1, unit: '' },
    'shell.wallThickness': { min: 1.2, max: 3.0, step: 0.1, unit: 'mm' },
    'caseBox.gap': { min: 4, max: 25, step: 1, unit: 'mm' },
    'caseBox.headspace': { min: 10, max: 50, step: 0.2, unit: 'mm' },
    'caseBox.wallThickness': { min: 0.5, max: 6, step: 0.1, unit: 'mm' },
    'caseBox.floorThickness': { min: 0.5, max: 8, step: 0.5, unit: 'mm' },
    'caseBox.indentDepth': { min: 0, max: 6, step: 0.5, unit: 'mm' },
    'caseBox.fitClearance': { min: 0, max: 0.6, step: 0.05, unit: 'mm' }
};

// Part colors for visualization
export const PART_COLORS = {
    foot: 0xC45C26,    // Terracotta
    wall1: 0x7D9B76,   // Sage Green
    wall2: 0x6B8BA4,   // Dusty Blue
    wall3: 0x9C9588,   // Warm Gray
    wall4: 0xB07A9C,   // Muted Rose
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
