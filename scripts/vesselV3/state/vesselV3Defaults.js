/**
 * Vessel Designer V3 - Defaults
 * Pen-drawn exterior profile state.
 */

import { getDefaultMotif } from '../../geometry/surfacePatternOptions.js';

export const VESSEL_V3_DEFAULTS = {
    project: {
        id: null,
        name: 'Untitled Vessel V3',
        dateCreated: null,
        lastModified: null,
        isDirty: false
    },

    global: {
        wallThickness: 3,
        radialSegments: 96,
        snapEnabled: true,
        snapSize: 5,
        maxRadius: 90,
        maxHeight: 160
    },

    profile: {
        mode: 'bezier',
        allowFooterOverlap: false,
        points: [
            {
                id: 'p0',
                r: 0,
                h: 0,
                inHandle: null,
                outHandle: null,
                kind: 'corner',
                cornerRadius: 0,
                locked: true
            },
            {
                id: 'p1',
                r: 34,
                h: 0,
                inHandle: null,
                outHandle: { r: 18, h: 18 },
                kind: 'corner',
                cornerRadius: 0,
                motif: getDefaultMotif()
            },
            {
                id: 'p2',
                r: 62,
                h: 78,
                inHandle: { r: -8, h: -34 },
                outHandle: { r: 6, h: 28 },
                kind: 'smooth',
                cornerRadius: 0,
                motif: getDefaultMotif()
            },
            {
                id: 'p3',
                r: 38,
                h: 138,
                inHandle: { r: 18, h: -20 },
                outHandle: null,
                kind: 'smooth',
                cornerRadius: 0,
                motif: getDefaultMotif()
            }
        ]
    },

    // Spout: a local wall-graft (Phase 1 = state/UI only, no mesh effect yet).
    spout: {
        enabled: false,
        segmentId: null,       // which profile segment/point the spout is pulled from
        angle: 0,               // ° around circumference, spout center
        width: 30,              // ° angular width of the pulled lip
        length: 18,             // mm, how far the spout projects outward
        drop: 6,                // mm, tip droop below the rim
        wallThickness: 2.2      // mm at the spout tip (validated against min print wall)
    },

    // Lid: an independent second lathe body (Phase 1 = state/UI only, no mesh/export yet).
    lid: {
        enabled: false,
        fit: 'inset',           // inset (drops inside neck) | overcap (caps over rim)
        domeHeight: 20,
        wallThickness: 2.4,
        clearance: 0.4,         // mm radial gap, FDM tolerance
        knob: { style: 'ball', height: 10, width: 12 },
        flangeDepth: 8          // for inset: how far the skirt drops into the neck
    },

    ui: {
        tool: 'pen',
        selectedPointId: null,
        selectedHandle: null,
        selectedSegmentId: null,
        viewportCameraPreset: 'threeQuarter',
        gridVisible: true,
        crossSectionEnabled: false,
        // 'seated' previews the lid ghosted, resting on the vessel's own
        // rim; 'standalone' shows it alone, opaque, centered, for
        // inspecting the actual export candidate.
        lidPreviewMode: 'seated'
    },

    warnings: []
};

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function getDefaultVesselV3State() {
    return deepClone(VESSEL_V3_DEFAULTS);
}
