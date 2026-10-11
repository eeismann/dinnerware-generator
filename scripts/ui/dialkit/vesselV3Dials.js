/**
 * DialKit controls for Vessel Designer V3
 *
 * Panel definitions for the shared DialKit host (dialHost.js): profile and
 * canvas settings, the per-segment surface motif, the spout and the lid (view
 * controls live in the view dock). vesselV3State stays the source of truth; dial edits go through `api`
 * (see scripts/vesselV3/vesselV3Main.js initDials()) and `sync()` pushes
 * state back after loads, undo and profile-editor edits.
 */

import vesselV3State from '../../vesselV3/state/vesselV3State.js';
import {
    MOTIF_TYPE_OPTIONS,
    MOTIF_RELIEF_OPTIONS,
    MOTIF_PROFILE_OPTIONS,
    MOTIF_DIRECTION_OPTIONS,
    MOTIF_VISIBLE_SUFFIXES,
    MOTIF_CONSTRAINTS
} from '../../geometry/surfacePatternOptions.js';
import { createDialHost } from './dialHost.js';

const FLAT_EPS = 1e-6;

// Ranges match the old inspector inputs and the state normalizers
export const VESSEL_V3_CONSTRAINTS = {
    profileMode: {
        options: [{ value: 'bezier', label: 'Bezier' }, { value: 'straight-rounded', label: 'Straight' }],
        default: 'bezier'
    },
    cornerRadius: { min: 0, max: 80, step: 0.5, default: 0 },
    allowFooterOverlap: { type: 'boolean', default: false },
    wallThickness: { min: 1, max: 20, step: 0.5, default: 3 },
    radialSegments: { min: 32, max: 160, step: 8, default: 96 },
    snapEnabled: { type: 'boolean', default: true },
    snapSize: { min: 1, max: 50, step: 1, default: 5 },

    motifType: { options: MOTIF_TYPE_OPTIONS, default: 'none' },
    motifRelief: { options: MOTIF_RELIEF_OPTIONS, default: 'raised' },
    motifProfile: { options: MOTIF_PROFILE_OPTIONS, default: 'rounded' },
    motifDirection: { options: MOTIF_DIRECTION_OPTIONS, default: 'right' },
    motifDepth: MOTIF_CONSTRAINTS.depth,
    motifCount: MOTIF_CONSTRAINTS.count,
    motifPitch: MOTIF_CONSTRAINTS.pitch,
    motifLineWidth: MOTIF_CONSTRAINTS.lineWidth,
    motifAngle: MOTIF_CONSTRAINTS.angle,

    spoutEnabled: { type: 'boolean', default: false },
    spoutAngle: { min: 0, max: 360, step: 1, default: 0 },
    spoutWidth: { min: 10, max: 120, step: 1, default: 30 },
    spoutLength: { min: 5, max: 40, step: 0.5, default: 18 },
    spoutDrop: { min: 0, max: 20, step: 0.5, default: 6 },
    spoutWallThickness: { min: 1.2, max: 4, step: 0.1, default: 2.2 },

    lidEnabled: { type: 'boolean', default: false },
    lidPreviewMode: {
        options: [{ value: 'seated', label: 'Seated' }, { value: 'standalone', label: 'Standalone' }],
        default: 'seated'
    },
    lidFit: {
        options: [{ value: 'inset', label: 'Inset' }, { value: 'overcap', label: 'Overcap' }],
        default: 'inset'
    },
    lidDomeHeight: { min: 5, max: 40, step: 1, default: 20 },
    lidWallThickness: { min: 1.5, max: 4, step: 0.1, default: 2.4 },
    lidClearance: { min: 0.1, max: 1, step: 0.05, default: 0.4 },
    lidKnobStyle: {
        options: [{ value: 'ball', label: 'Ball' }, { value: 'loop', label: 'Loop' }, { value: 'flat', label: 'Flat' }],
        default: 'ball'
    },
    lidKnobHeight: { min: 4, max: 24, step: 1, default: 10 },
    lidKnobWidth: { min: 6, max: 30, step: 1, default: 12 },
    lidFlangeDepth: { min: 2, max: 20, step: 1, default: 8 }
};

// Motif fields in display order: [state field, config key, constraint, visibility suffix]
const MOTIF_FIELDS = [
    ['depth', 'depth', 'motifDepth', 'Depth'],
    ['relief', 'relief', 'motifRelief', 'Relief'],
    ['count', 'lineCount', 'motifCount', 'Count'],
    ['pitch', 'pitch', 'motifPitch', 'Pitch'],
    ['lineWidth', 'lineWidth', 'motifLineWidth', 'LineWidth'],
    ['profile', 'ridgeProfile', 'motifProfile', 'Profile'],
    ['angle', 'angle', 'motifAngle', 'Angle'],
    ['direction', 'direction', 'motifDirection', 'Direction']
];

/**
 * Wall (non-flat) segments in profile order. Each point owns the segment
 * beneath it; p0 owns none.
 */
export function wallSegments(points = vesselV3State.getState('profile.points')) {
    const segments = [];
    for (let i = 1; i < points.length; i++) {
        if (Math.abs((points[i].h || 0) - (points[i - 1].h || 0)) < FLAT_EPS) continue;
        segments.push({ id: points[i].id, index: i, number: segments.length + 1 });
    }
    return segments;
}

const segmentOptions = (segments) => segments.map(segment => ({
    value: segment.id,
    label: `Segment ${segment.number}`
}));

/**
 * @param {Object} api - App hooks; see vesselV3Main.js initDials()
 * @returns {{ sync: Function, activeSegmentId: Function, element: HTMLElement }}
 */
export function initVesselV3Dials(api) {
    // The motif panel edits this segment; it follows the canvas selection
    // but stays put when the selection is cleared (like Dinnerware's item picker).
    let motifSegmentId = null;

    function activeSegmentId() {
        const segments = wallSegments();
        const selected = vesselV3State.getState('ui.selectedSegmentId');
        if (segments.some(segment => segment.id === selected)) motifSegmentId = selected;
        if (!segments.some(segment => segment.id === motifSegmentId)) {
            motifSegmentId = segments[0]?.id ?? null;
        }
        return motifSegmentId;
    }

    function selectedPoint() {
        const state = vesselV3State.getState();
        return state.profile.points.find(point => point.id === state.ui.selectedPointId) || null;
    }

    // --- Profile -------------------------------------------------------------

    function buildProfileConfig(b) {
        const state = vesselV3State.getState();
        const point = selectedPoint();
        const straight = state.profile.mode === 'straight-rounded';
        return {
            mode: b.control('mode', 'profileMode'),
            ...(straight && point && !point.locked
                ? { cornerRadius: b.control('cornerRadius', 'cornerRadius') }
                : {}),
            wallThickness: b.control('wallThickness', 'wallThickness'),
            radialSegments: b.control('radialSegments', 'radialSegments'),
            footerOverlap: b.control('footerOverlap', 'allowFooterOverlap'),
            canvas: b.folder('canvas', {
                snapToGrid: b.control('canvas.snapToGrid', 'snapEnabled'),
                gridSize: b.control('canvas.gridSize', 'snapSize')
            })
        };
    }

    function readProfile({ param }) {
        const state = vesselV3State.getState();
        switch (param) {
            case 'profileMode': return state.profile.mode === 'straight-rounded' ? 'straight-rounded' : 'bezier';
            case 'cornerRadius': return Number(selectedPoint()?.cornerRadius || 0);
            case 'allowFooterOverlap': return state.profile.allowFooterOverlap === true;
            default: return state.global[param];
        }
    }

    function changeProfile({ param }, value, { interactive }) {
        if (param === 'profileMode') api.setProfileMode(value);
        else if (param === 'cornerRadius') api.setCornerRadius(value, { interactive });
        else if (param === 'allowFooterOverlap') api.setFooterOverlap(value);
        else api.setGlobal(param, value);
    }

    // --- Surface motif ---------------------------------------------------------

    function segmentMotif(segmentId) {
        const point = vesselV3State.getState('profile.points').find(entry => entry.id === segmentId);
        return point?.motif || null;
    }

    function buildMotifConfig(b) {
        const segments = wallSegments();
        const segmentId = activeSegmentId();
        b.bind('segment', '__segment');
        if (!segmentId) {
            return {
                segment: { type: 'select', options: [{ value: '', label: 'No wall segments' }], default: '' }
            };
        }
        const motif = segmentMotif(segmentId);
        const type = motif?.type || 'none';
        const visible = MOTIF_VISIBLE_SUFFIXES[type] || [];
        const config = {
            segment: { type: 'select', options: segmentOptions(segments), default: segments[0].id },
            motif: b.control('motif', 'motifType', { field: 'type' })
        };
        MOTIF_FIELDS.forEach(([field, key, constraint, suffix]) => {
            if (visible.includes(suffix)) config[key] = b.control(key, constraint, { field });
        });
        config.actions = b.folder('actions', {
            smooth: { type: 'action', label: 'Smooth Segment' },
            copyToAdjacent: { type: 'action', label: 'Copy to Adjacent' },
            applyToAll: { type: 'action', label: 'Apply to All Segments' }
        }, { collapsed: true });
        return config;
    }

    function readMotif({ param, field }) {
        if (param === '__segment') return activeSegmentId() ?? '';
        const motif = segmentMotif(activeSegmentId());
        return motif ? motif[field] : undefined;
    }

    function changeMotif({ param, field }, value, { interactive }) {
        if (param === '__segment') {
            if (!value) return;
            motifSegmentId = value;
            api.selectSegment(value);
            return;
        }
        const segmentId = activeSegmentId();
        if (!segmentId) return;
        api.setMotif(segmentId, { [field]: field === 'count' ? Math.round(value) : value }, { interactive });
    }

    // --- Spout -------------------------------------------------------------------

    function buildSpoutConfig(b) {
        const spout = vesselV3State.getState('spout') || {};
        const config = { enabled: b.control('enabled', 'spoutEnabled', { field: 'enabled' }) };
        if (spout.enabled !== true) return config;
        const segments = wallSegments();
        b.bind('segment', '__segment');
        return {
            ...config,
            ...(segments.length
                ? { segment: { type: 'select', options: segmentOptions(segments), default: segments.at(-1).id } }
                : {}),
            angle: b.control('angle', 'spoutAngle', { field: 'angle' }),
            width: b.control('width', 'spoutWidth', { field: 'width' }),
            length: b.control('length', 'spoutLength', { field: 'length' }),
            drop: b.control('drop', 'spoutDrop', { field: 'drop' }),
            tipWallThickness: b.control('tipWallThickness', 'spoutWallThickness', { field: 'wallThickness' })
        };
    }

    // The mesh falls back to the top wall segment when the stored id is stale
    function spoutSegmentId() {
        const segments = wallSegments();
        const stored = vesselV3State.getState('spout.segmentId');
        return segments.some(segment => segment.id === stored) ? stored : segments.at(-1)?.id;
    }

    function readSpout({ param, field }) {
        if (param === '__segment') return spoutSegmentId();
        const spout = vesselV3State.getState('spout') || {};
        return field === 'enabled' ? spout.enabled === true : spout[field];
    }

    function changeSpout({ param, field }, value) {
        if (param === '__segment') {
            api.setSpout({ segmentId: value });
        } else if (field === 'enabled') {
            // Enabling pulls the spout from the selected wall segment, else
            // keeps its previous segment, else the rim segment
            const selected = vesselV3State.getState('ui.selectedSegmentId');
            const segments = wallSegments();
            const segmentId = segments.some(segment => segment.id === selected) ? selected : spoutSegmentId();
            api.setSpout(value ? { enabled: true, segmentId: segmentId ?? null } : { enabled: false });
        } else {
            api.setSpout({ [field]: value });
        }
    }

    // --- Lid -----------------------------------------------------------------------

    function buildLidConfig(b) {
        const lid = vesselV3State.getState('lid') || {};
        const config = { enabled: b.control('enabled', 'lidEnabled', { field: 'enabled' }) };
        if (lid.enabled !== true) return config;
        return {
            ...config,
            preview: b.control('preview', 'lidPreviewMode', { field: '__preview' }),
            fit: b.control('fit', 'lidFit', { field: 'fit' }),
            domeHeight: b.control('domeHeight', 'lidDomeHeight', { field: 'domeHeight' }),
            wallThickness: b.control('wallThickness', 'lidWallThickness', { field: 'wallThickness' }),
            clearance: b.control('clearance', 'lidClearance', { field: 'clearance' }),
            ...(lid.fit === 'inset'
                ? { flangeDepth: b.control('flangeDepth', 'lidFlangeDepth', { field: 'flangeDepth' }) }
                : {}),
            knob: b.folder('knob', {
                knobStyle: b.control('knob.knobStyle', 'lidKnobStyle', { knob: 'style' }),
                knobHeight: b.control('knob.knobHeight', 'lidKnobHeight', { knob: 'height' }),
                knobWidth: b.control('knob.knobWidth', 'lidKnobWidth', { knob: 'width' })
            })
        };
    }

    function readLid({ field, knob }) {
        const lid = vesselV3State.getState('lid') || {};
        if (knob) return lid.knob?.[knob];
        if (field === '__preview') return vesselV3State.getState('ui.lidPreviewMode') || 'seated';
        return field === 'enabled' ? lid.enabled === true : lid[field];
    }

    function changeLid({ field, knob }, value) {
        if (knob) api.setLid({ knob: { [knob]: value } });
        else if (field === '__preview') api.setLidPreviewMode(value);
        else api.setLid({ [field]: value });
    }

    const host = createDialHost({
        container: api.container,
        constraints: VESSEL_V3_CONSTRAINTS,
        className: 'vessel-v3-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: [
            {
                id: 'vessel-v3-profile',
                name: 'Profile',
                build: buildProfileConfig,
                read: readProfile,
                change: changeProfile
            },
            {
                id: 'vessel-v3-motif',
                name: 'Surface Motif',
                build: buildMotifConfig,
                read: readMotif,
                change: changeMotif,
                action: (name) => {
                    const segmentId = activeSegmentId();
                    if (!segmentId) return;
                    if (name === 'smooth') api.setMotif(segmentId, { type: 'none' }, { interactive: false });
                    else if (name === 'copyToAdjacent') api.copyMotifToAdjacent(segmentId);
                    else if (name === 'applyToAll') api.applyMotifToAll(segmentId);
                }
            },
            {
                id: 'vessel-v3-spout',
                name: 'Spout',
                collapsed: true,
                build: buildSpoutConfig,
                read: readSpout,
                change: changeSpout
            },
            {
                id: 'vessel-v3-lid',
                name: 'Lid',
                collapsed: true,
                build: buildLidConfig,
                read: readLid,
                change: changeLid
            }
        ]
    });

    return { sync: host.sync, activeSegmentId, reveal: host.reveal, element: host.element };
}
