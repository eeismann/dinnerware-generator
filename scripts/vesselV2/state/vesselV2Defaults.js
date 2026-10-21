/**
 * Vessel Designer V2 - Defaults
 * Pen-drawn exterior profile state.
 */

import { getDefaultMotif } from '../../geometry/surfacePatternOptions.js';

export const VESSEL_V2_DEFAULTS = {
    project: {
        id: null,
        name: 'Untitled Bezier Vessel',
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

    ui: {
        tool: 'pen',
        selectedPointId: null,
        selectedHandle: null,
        selectedSegmentId: null,
        viewportCameraPreset: 'threeQuarter',
        gridVisible: true,
        crossSectionEnabled: false
    },

    warnings: []
};

export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

export function getDefaultVesselV2State() {
    return deepClone(VESSEL_V2_DEFAULTS);
}
