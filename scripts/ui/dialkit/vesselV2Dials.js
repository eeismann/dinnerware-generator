/**
 * DialKit controls for Vessel Designer V2
 *
 * Panel definitions for the shared DialKit host (dialHost.js): vessel
 * (profile mode, corner radius of the selected point, wall, segments,
 * snapping) and per-segment surface motif; view controls live in the view
 * dock. The freeform profile canvas
 * stays its own editor; vesselV2State stays the source of truth. Dial edits go
 * through `api` (see scripts/vesselV2/vesselV2Main.js initDials()) and
 * `sync()` pushes state back after profile edits, selection, undo or load.
 */

import vesselV2State from '../../vesselV2/state/vesselV2State.js';
import { getWallSegments } from '../../vesselV2/ui/motifInspector.js';
import {
    MOTIF_TYPE_OPTIONS,
    MOTIF_RELIEF_OPTIONS,
    MOTIF_PROFILE_OPTIONS,
    MOTIF_DIRECTION_OPTIONS,
    MOTIF_VISIBLE_SUFFIXES,
    MOTIF_CONSTRAINTS
} from '../../geometry/surfacePatternOptions.js';
import { createDialHost } from './dialHost.js';

// Same ranges as the classic number fields
const CONSTRAINTS = {
    profileMode: {
        options: [
            { value: 'bezier', label: 'Bezier' },
            { value: 'straight-rounded', label: 'Straight' }
        ],
        default: 'bezier'
    },
    cornerRadius: { min: 0, max: 80, step: 0.5, default: 0 },
    wallThickness: { min: 1, max: 20, step: 0.5, default: 3 },
    radialSegments: { min: 32, max: 160, step: 8, default: 96 },
    allowFooterOverlap: { type: 'boolean', default: false },
    snapEnabled: { type: 'boolean', default: true },
    snapSize: { min: 1, max: 50, step: 1, default: 5 }
};

const NO_SEGMENT = 'none';

// Motif fields in inspector order; keys give DialKit labels ("lineCount" → "Line Count")
const MOTIF_FIELDS = [
    { suffix: 'Depth', field: 'depth', key: 'depth', constraints: MOTIF_CONSTRAINTS.depth },
    { suffix: 'Relief', field: 'relief', key: 'relief', options: MOTIF_RELIEF_OPTIONS },
    { suffix: 'Count', field: 'count', key: 'lineCount', constraints: MOTIF_CONSTRAINTS.count },
    { suffix: 'Pitch', field: 'pitch', key: 'pitch', constraints: MOTIF_CONSTRAINTS.pitch },
    { suffix: 'LineWidth', field: 'lineWidth', key: 'lineWidth', constraints: MOTIF_CONSTRAINTS.lineWidth },
    { suffix: 'Profile', field: 'profile', key: 'ridgeProfile', options: MOTIF_PROFILE_OPTIONS },
    { suffix: 'Angle', field: 'angle', key: 'angle', constraints: MOTIF_CONSTRAINTS.angle },
    { suffix: 'Direction', field: 'direction', key: 'direction', options: MOTIF_DIRECTION_OPTIONS }
];

function selectedPoint(state) {
    return state.profile.points.find((point) => point.id === state.ui.selectedPointId) || null;
}

/** Corner radius applies to the selected, unlocked point in straight mode. */
function cornerEditable(state) {
    const point = selectedPoint(state);
    return state.profile.mode === 'straight-rounded' && Boolean(point) && !point.locked;
}

/**
 * @param {Object} api - App hooks; see scripts/vesselV2/vesselV2Main.js initDials()
 * @returns {{ sync: Function, revealMotif: Function, element: HTMLElement }}
 */
export function initVesselV2Dials(api) {
    function buildVesselConfig(b) {
        const state = vesselV2State.getState();
        return {
            profileMode: b.control('profileMode', 'profileMode'),
            ...(cornerEditable(state) ? { cornerRadius: b.control('cornerRadius', 'cornerRadius') } : {}),
            footerOverlap: b.control('footerOverlap', 'allowFooterOverlap'),
            wallThickness: b.control('wallThickness', 'wallThickness'),
            radialSegments: b.control('radialSegments', 'radialSegments'),
            snapping: b.folder('snapping', {
                snapToGrid: b.control('snapping.snapToGrid', 'snapEnabled'),
                gridSize: b.control('snapping.gridSize', 'snapSize')
            })
        };
    }

    function readVessel({ param }) {
        const state = vesselV2State.getState();
        switch (param) {
            case 'profileMode': return state.profile.mode === 'straight-rounded' ? 'straight-rounded' : 'bezier';
            case 'cornerRadius': return Number(selectedPoint(state)?.cornerRadius || 0);
            case 'allowFooterOverlap': return state.profile.allowFooterOverlap === true;
            default: return state.global[param];
        }
    }

    function changeVessel({ param }, value, options) {
        if (param === 'profileMode') api.setProfileMode(value);
        else if (param === 'cornerRadius') api.setCornerRadius(value, options);
        else if (param === 'allowFooterOverlap') api.setFooterOverlap(value);
        else api.setGlobal(param, value);
    }

    function buildMotifConfig(b) {
        const state = vesselV2State.getState();
        const segments = getWallSegments(state.profile.points);
        b.bind('segment', '__segment');
        const config = {
            segment: {
                type: 'select',
                options: [
                    { value: NO_SEGMENT, label: 'None' },
                    ...segments.map(({ id, number, point }) => {
                        const type = point.motif?.type || 'none';
                        const motif = MOTIF_TYPE_OPTIONS.find((option) => option.value === type);
                        return { value: id, label: type === 'none' ? `Segment ${number}` : `Segment ${number} · ${motif.label}` };
                    })
                ],
                default: NO_SEGMENT
            }
        };

        const motif = api.motif.getMotif();
        if (!motif) return config;

        config.motif = b.control('motif', 'type', { constraints: { options: MOTIF_TYPE_OPTIONS, default: 'none' } });
        const visible = MOTIF_VISIBLE_SUFFIXES[motif.type] || [];
        MOTIF_FIELDS.forEach(({ suffix, field, key, constraints, options }) => {
            if (!visible.includes(suffix)) return;
            config[key] = b.control(key, field, {
                constraints: options ? { options, default: options[0].value } : constraints
            });
        });
        if (motif.type !== 'none') config.smooth = { type: 'action', label: 'Smooth (Clear Motif)' };
        config.copyToAdjacent = { type: 'action', label: 'Copy → Adjacent' };
        config.applyToAll = { type: 'action', label: 'Apply to All Segments' };
        return config;
    }

    function readMotif({ param }) {
        if (param === '__segment') {
            const id = vesselV2State.getState('ui.selectedSegmentId');
            return api.motif.getContext() ? id : NO_SEGMENT;
        }
        return api.motif.getMotif()?.[param];
    }

    function changeMotif({ param }, value, { interactive }) {
        if (param === '__segment') {
            api.selectSegment(value === NO_SEGMENT ? null : value);
            return;
        }
        api.motif.writeMotif({ [param]: param === 'count' ? Math.round(value) : value }, !interactive);
    }

    const host = createDialHost({
        container: api.container,
        constraints: CONSTRAINTS,
        className: 'vessel-v2-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: [
            {
                id: 'vessel-v2-vessel',
                name: 'Vessel',
                build: buildVesselConfig,
                read: readVessel,
                change: changeVessel
            },
            {
                id: 'vessel-v2-motif',
                name: 'Surface Motif',
                build: buildMotifConfig,
                read: readMotif,
                change: changeMotif,
                action: (name) => {
                    if (name === 'smooth') api.motif.smooth();
                    else if (name === 'copyToAdjacent') api.motif.copyToAdjacent();
                    else if (name === 'applyToAll') api.motif.applyToAll();
                }
            }
        ]
    });

    /** Open the Surface Motif panel (a segment was picked on the canvas). */
    function revealMotif() {
        host.panel('vessel-v2-motif')?.kit.setOpen(true);
    }

    return { sync: host.sync, revealMotif, element: host.element };
}
