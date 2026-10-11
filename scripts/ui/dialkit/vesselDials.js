/**
 * DialKit controls for the Vessel Generator
 *
 * Panel definitions for the shared DialKit host (dialHost.js): wall
 * thickness, one panel per anatomical section (lip, neck, shoulder, body,
 * waist, foot); view controls live in the view dock. Vessel state stays the source of truth; dial edits
 * go through `api` (see scripts/vessel/vesselMain.js initDials()) and
 * `sync()` pushes state back after loads, resets and linked-diameter updates.
 */

import vesselState from '../../vessel/state/vesselState.js';
import { VESSEL_DEFAULTS } from '../../vessel/state/vesselDefaults.js';
import { linkTarget } from '../../vessel/state/diameterLinks.js';
import { createDialHost, formatLabel } from './dialHost.js';

const LIP_STYLES = [
    { value: 'straight', label: 'Straight' },
    { value: 'flaredOut', label: 'Flared Outward' },
    { value: 'flaredIn', label: 'Flared Inward' },
    { value: 'rolledOut', label: 'Rolled Outward' },
    { value: 'rolledIn', label: 'Rolled Inward' },
    { value: 'beaded', label: 'Beaded' },
    { value: 'squared', label: 'Squared' }
];

// Slider ranges (mm, % for curvature, ° for angles) carried over from the
// classic panel. Diameter ranges differ per section.
const DIAMETER_RANGES = {
    lip: [20, 300],
    neck: [20, 300],
    shoulder: [20, 400],
    body: [30, 400],
    waist: [20, 300],
    foot: [15, 300]
};
const HEIGHT_RANGES = {
    lip: [2, 30],
    neck: [10, 150],
    shoulder: [10, 150],
    body: [20, 300],
    waist: [5, 100],
    foot: [5, 80]
};
const EXTRA_RANGES = {
    'global.wallThickness': [1, 15, 0.5],
    'sections.lip.thickness': [0, 10, 0.5],
    'sections.foot.footringWidth': [2, 30, 0.5],
    'sections.foot.innerFootringAngle': [-45, 45, 1],
    'sections.foot.baseRecessDepth': [-100, 0, 0.5]
};

function defaultAt(path) {
    return path.split('.').reduce((node, key) => node?.[key], VESSEL_DEFAULTS);
}

/** Constraints keyed by state path, defaults from VESSEL_DEFAULTS. */
function buildConstraints() {
    const table = {};
    const slider = (path, min, max, step = 1) => {
        table[path] = { min, max, step, default: defaultAt(path) };
    };
    Object.keys(DIAMETER_RANGES).forEach(section => {
        const base = `sections.${section}`;
        slider(`${base}.height`, ...HEIGHT_RANGES[section]);
        ['topDiameter', 'bottomDiameter', 'midDiameter'].forEach(prop => {
            slider(`${base}.${prop}`, ...DIAMETER_RANGES[section]);
        });
        if (section !== 'lip') slider(`${base}.curvature`, 0, 100);
        table[`${base}.flatWall`] = { type: 'boolean', default: Boolean(defaultAt(`${base}.flatWall`)) };
        table[`${base}.bottomDiameterLocked`] = { type: 'boolean', default: Boolean(defaultAt(`${base}.bottomDiameterLocked`)) };
        table[`${base}.enabled`] = { type: 'boolean', default: defaultAt(`${base}.enabled`) !== false };
    });
    Object.entries(EXTRA_RANGES).forEach(([path, range]) => slider(path, ...range));
    table['sections.lip.style'] = { options: LIP_STYLES, default: defaultAt('sections.lip.style') };
    return table;
}

const CONSTRAINTS = buildConstraints();

const SECTIONS = [
    { id: 'lip', name: 'Lip', optional: true },
    { id: 'neck', name: 'Neck', optional: true },
    { id: 'shoulder', name: 'Shoulder', optional: true },
    { id: 'body', name: 'Body', optional: false },
    { id: 'waist', name: 'Waist', optional: true },
    { id: 'foot', name: 'Foot', optional: true }
];

/**
 * @param {Object} api - App hooks; see scripts/vessel/vesselMain.js initDials()
 * @returns {{ sync: Function, element: HTMLElement }}
 */
export function initVesselDials(api) {
    function readState({ param }) {
        const value = vesselState.getState(param);
        const constraints = CONSTRAINTS[param];
        if (constraints?.type === 'boolean') {
            // Body has no enable flag; it is always part of the vessel
            return param.endsWith('.enabled') ? value !== false : Boolean(value);
        }
        return value;
    }

    function buildGlobalConfig(b) {
        return {
            wallThickness: b.control('wallThickness', 'global.wallThickness')
        };
    }

    /**
     * One section's rows. Optional sections lead with an Enabled toggle and
     * hide the rest while off; Flat Wall hides the curve rows; the link
     * toggle is named after the section it currently follows.
     */
    function buildSectionConfig(section, b) {
        const base = `sections.${section.id}`;
        const data = vesselState.getState(base) || {};
        const config = {};
        if (section.optional) {
            config.enabled = b.control('enabled', `${base}.enabled`);
            if (data.enabled === false) return config;
        }
        if (section.id === 'lip') {
            config.style = b.control('style', `${base}.style`);
        }
        config.height = b.control('height', `${base}.height`);
        config.topDiameter = b.control('topDiameter', `${base}.topDiameter`);
        config.bottomDiameter = b.control('bottomDiameter', `${base}.bottomDiameter`);
        if (section.id === 'lip') {
            config.midDiameter = b.control('midDiameter', `${base}.midDiameter`);
            config.extraThickness = b.control('extraThickness', `${base}.thickness`);
            return config;
        }
        config.flatWall = b.control('flatWall', `${base}.flatWall`);
        if (!data.flatWall) {
            config.midDiameter = b.control('midDiameter', `${base}.midDiameter`);
            config.curvature = b.control('curvature', `${base}.curvature`);
        }
        if ('bottomDiameterLocked' in data) {
            const target = linkTarget(vesselState.getState(), section.id);
            const key = `linkTo${formatLabel(target).replace(/\s/g, '')}`;
            config[key] = b.control(key, `${base}.bottomDiameterLocked`, { link: true });
        }
        if (section.id === 'foot') {
            config.footringWidth = b.control('footringWidth', `${base}.footringWidth`);
            config.innerFootringAngle = b.control('innerFootringAngle', `${base}.innerFootringAngle`);
            config.baseRecessDepth = b.control('baseRecessDepth', `${base}.baseRecessDepth`);
        }
        return config;
    }

    const host = createDialHost({
        container: api.container,
        constraints: CONSTRAINTS,
        className: 'vessel-dials',
        panels: [
            {
                id: 'vessel-global',
                name: 'Global',
                build: buildGlobalConfig,
                read: readState,
                change: ({ param }, value) => api.setParam(param, value)
            },
            ...SECTIONS.map(section => ({
                id: `vessel-${section.id}`,
                name: section.name,
                // Body is the one section every vessel has; open it first
                collapsed: section.id !== 'body',
                build: (b) => buildSectionConfig(section, b),
                read: readState,
                change: ({ param, link }, value) => {
                    if (link) api.setLinked(section.id, value);
                    else api.setParam(param, value);
                }
            }))
        ]
    });

    return { sync: host.sync, reveal: host.reveal, element: host.element };
}
