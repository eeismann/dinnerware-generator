/**
 * DialKit controls for Vessel Designer V2
 *
 * Panel definition for the shared DialKit host (dialHost.js): the
 * per-segment surface motif. Profile settings (mode, wall, segments, grid,
 * footer overlap, corner radius) sit in the profile editor panel; view
 * controls live in the view dock. The freeform profile canvas stays its own
 * editor; vesselV2State stays the source of truth. Dial edits go through
 * `api` (see scripts/vesselV2/vesselV2Main.js initDials()) and `sync()`
 * pushes state back after profile edits, selection, undo or load.
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

/**
 * @param {Object} api - App hooks; see scripts/vesselV2/vesselV2Main.js initDials()
 * @returns {{ sync: Function, revealMotif: Function, element: HTMLElement }}
 */
export function initVesselV2Dials(api) {
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
        className: 'vessel-v2-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: [
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
