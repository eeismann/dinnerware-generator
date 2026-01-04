/**
 * Vessel Generator - Default Values
 * Default parameters for all vessel sections
 */

export const VESSEL_DEFAULTS = {
    // Project metadata
    project: {
        id: null,
        name: 'Untitled',
        dateCreated: null,
        lastModified: null,
        isDirty: false
    },

    // Global parameters
    global: {
        wallThickness: 3.0,         // mm
        wallThicknessMode: 'uniform', // 'uniform' | 'variable'
        wallThicknessTop: 2.5,      // mm (if variable)
        wallThicknessBottom: 4.0,   // mm (if variable)
        proportionMode: 'absolute'  // 'absolute' | 'proportional'
    },

    // Section definitions
    sections: {
        lip: {
            enabled: true,
            style: 'straight',      // 'straight'|'flaredOut'|'flaredIn'|'rolledOut'|'rolledIn'|'beaded'|'squared'
            height: 8,              // mm
            topDiameter: 80,        // mm (mouth opening)
            bottomDiameter: 80,     // mm (connects to neck)
            midDiameter: 80,        // mm (diameter at middle of section)
            thickness: 1,           // mm additional
            flareAngle: 15,         // degrees
            rollDiameter: 6,        // mm
            beadSize: 5,            // mm
            curvature: 0,           // % (0 = straight, positive = outward bulge)
            wallModeOverride: 'inherit' // 'inherit'|'curved'|'flat'
        },

        neck: {
            enabled: true,
            height: 50,             // mm
            heightLocked: false,
            topDiameter: 80,        // mm (usually = mouth)
            bottomDiameter: 100,    // mm
            bottomDiameterLocked: true, // locks to shoulder.topDiameter
            midDiameter: 90,        // mm (diameter at middle of section)
            flatWall: false,        // when true, wall is straight line (ignores curve/midDiameter)
            wallModeOverride: 'inherit',
            curveType: 'concave',   // 'straight'|'concave'|'convex'|'sCurve'
            curvature: 30,          // %
            bezierHandles: {
                h1: { x: 0.0, y: 0.33 },
                h2: { x: 0.0, y: 0.67 }
            },
            wallAngle: null
        },

        shoulder: {
            enabled: true,
            height: 40,
            heightLocked: false,
            topDiameter: 100,       // from neck bottom
            bottomDiameter: 140,
            bottomDiameterLocked: true, // locks to body.topDiameter
            midDiameter: 120,       // mm (diameter at middle of section)
            flatWall: false,        // when true, wall is straight line (ignores curve/midDiameter)
            wallModeOverride: 'inherit',
            curveType: 'convex',
            curvature: 70,          // %
            bezierHandles: {
                h1: { x: 0.3, y: 0.2 },
                h2: { x: 0.3, y: 0.8 }
            },
            wallAngle: null
        },

        body: {
            height: 100,
            topDiameter: 140,
            bottomDiameter: 100,
            bottomDiameterLocked: true, // locks to waist.topDiameter (or foot if waist disabled)
            midDiameter: 120,       // mm (diameter at middle of section)
            flatWall: false,        // when true, wall is straight line (ignores curve/midDiameter)
            curveType: 'convex',
            curvature: 25,          // %
            bezierHandles: {
                h1: { x: 0.15, y: 0.25 },
                h2: { x: 0.15, y: 0.75 }
            }
        },

        waist: {
            enabled: false,
            height: 25,
            heightLocked: false,
            topDiameter: 100,       // mm (from body)
            bottomDiameter: 100,    // mm (to foot)
            bottomDiameterLocked: true, // locks to foot.topDiameter
            midDiameter: 70,        // mm (diameter at middle - the pinch point)
            flatWall: false,        // when true, wall is straight line (ignores curve/midDiameter)
            position: 50,           // %
            wallModeOverride: 'inherit',
            curveType: 'circular',
            curvature: 50,          // %
            bezierHandles: {
                h1: { x: -0.2, y: 0.3 },
                h2: { x: -0.2, y: 0.7 }
            }
        },

        foot: {
            enabled: true,
            height: 15,
            heightLocked: false,
            topDiameter: 100,       // from body/waist - where outer wall meets body
            bottomDiameter: 60,     // outer edge of footring at base (y=0)
            midDiameter: 80,        // mm (diameter at middle of section)
            flatWall: false,        // when true, wall is straight line (ignores curve/midDiameter)
            wallModeOverride: 'inherit',
            curveType: 'straight',
            curvature: 0,           // %
            bezierHandles: {
                h1: { x: 0, y: 0.33 },
                h2: { x: 0, y: 0.67 }
            },
            // Footring geometry (uses dinnerware generator architecture)
            footringWidth: 8,        // width of the contact ring at y=0
            innerFootringAngle: -15, // angle of inner wall going to base surface (negative = inward)
            baseRecessDepth: -2,     // negative = recessed below y=0, 0 = flat base
            sharpFootringCorners: true // when true, footring corners are sharp angles instead of smooth curves
        }
    },

    // Transition sharpness (0-100)
    transitions: {
        lipToNeck: 50,
        neckToShoulder: 20,
        shoulderToBody: 10,
        bodySections: [30, 30, 30, 30, 30, 30], // Between body sections (up to 6)
        bodyToWaist: 30,
        waistToFoot: 20
    },

    // UI state
    ui: {
        selectedSection: 'body',
        expandedSections: ['global', 'body'],
        viewportCameraPreset: 'threeQuarter',
        crossSectionEnabled: false,
        dimensionsVisible: false,
        gridVisible: true
    },

    // Validation warnings
    warnings: []
};

/**
 * Deep clone an object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Get a fresh copy of defaults
 */
export function getDefaultState() {
    return deepClone(VESSEL_DEFAULTS);
}

