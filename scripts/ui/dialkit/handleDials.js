/**
 * DialKit controls for the Handle Generator
 *
 * Panel definitions for the shared DialKit host (dialHost.js): handle shape,
 * cross-section, attachment points and corner radii; the mold kit
 * visualization (view options live in the view dock). Handle state stays the
 * source of truth;
 * dial edits go through `api` (see scripts/handle/handleMain.js initDials())
 * and `sync()` pushes state back after loads, new projects and source imports.
 */

import {
    handleStateManager,
    DEFAULT_HANDLE_PARAMS,
    PARAM_CONSTRAINTS
} from '../../handle/state/handleState.js';
import { DEFAULT_MOLD_CONSTRUCTION_VIEW } from '../../handle/mold/handleMoldConstructionView.js';
import { createDialHost, formatLabel } from './dialHost.js';

const CROSS_SECTION_OPTIONS = [
    { value: 'oval', label: 'Oval' },
    { value: 'rectangular', label: 'Rectangular' }
];

// Also offered by the view dock (handleMain.js initViewDock())
export const MUG_DISPLAY_OPTIONS = [
    { value: 'transparent', label: 'Semi-Transparent' },
    { value: 'wireframe', label: 'Wireframe' },
    { value: 'solid', label: 'Solid' },
    { value: 'hidden', label: 'Hidden' }
];

// Mold explode/opacity are stored as 0-1 fractions and dialled in percent
const MOLD_PERCENT_SETTINGS = ['moldExplode', 'moldOpacity'];
const MOLD_SETTING_KEYS = {
    moldExplode: 'explode',
    moldOpacity: 'opacity',
    moldShowProof: 'showProof',
    moldShowHandleMold: 'showHandleMold',
    moldShowWalls: 'showWalls',
    moldShowBottom: 'showBottom'
};

const toggle = (value) => ({ type: 'boolean', default: value });

// Slider/select/toggle constraints with defaults, keyed by state name
const CONSTRAINTS = {
    ...Object.fromEntries(Object.entries(PARAM_CONSTRAINTS)
        .map(([param, constraints]) => [param, { ...constraints, default: DEFAULT_HANDLE_PARAMS[param] }])),
    crossSectionType: { options: CROSS_SECTION_OPTIONS, default: DEFAULT_HANDLE_PARAMS.crossSectionType },
    matchMugWallAngle: toggle(DEFAULT_HANDLE_PARAMS.matchMugWallAngle),
    showMoldPreview: toggle(false),
    moldExplode: { min: 0, max: 100, step: 1, default: Math.round(DEFAULT_MOLD_CONSTRUCTION_VIEW.explode * 100) },
    moldOpacity: { min: 20, max: 100, step: 1, default: Math.round(DEFAULT_MOLD_CONSTRUCTION_VIEW.opacity * 100) },
    moldShowProof: toggle(true),
    moldShowHandleMold: toggle(true),
    moldShowWalls: toggle(true),
    moldShowBottom: toggle(true)
};

/**
 * @param {Object} api - App hooks; see scripts/handle/handleMain.js initDials()
 * @returns {{ sync: Function, revealParam: Function, element: HTMLElement }}
 */
export function initHandleDials(api) {
    const labels = new Map();

    function control(b, path, param, binding = {}) {
        labels.set(param, formatLabel(path.split('.').pop()));
        return b.control(path, param, binding);
    }

    function buildHandleConfig(b) {
        const params = handleStateManager.getState().handleParams;
        const rectangular = params.crossSectionType === 'rectangular';
        return {
            shape: b.folder('shape', {
                protrusion: control(b, 'shape.protrusion', 'handleProtrusion'),
                // Matching the mug's taper drives the arm angle
                ...(params.matchMugWallAngle ? {} : {
                    verticalArmAngle: control(b, 'shape.verticalArmAngle', 'verticalArmAngle')
                }),
                matchMugWallAngle: control(b, 'shape.matchMugWallAngle', 'matchMugWallAngle')
            }),
            crossSection: b.folder('crossSection', {
                profile: control(b, 'crossSection.profile', 'crossSectionType'),
                // crossSectionWidth is the profile's height in the UI and vice versa
                height: control(b, 'crossSection.height', 'crossSectionWidth'),
                width: control(b, 'crossSection.width', 'crossSectionHeight'),
                ...(rectangular ? {
                    cornerRadius: control(b, 'crossSection.cornerRadius', 'crossSectionCornerRadius')
                } : {})
            }),
            attachmentPoints: b.folder('attachmentPoints', {
                topHeight: control(b, 'attachmentPoints.topHeight', 'topAttachmentHeight'),
                bottomHeight: control(b, 'attachmentPoints.bottomHeight', 'bottomAttachmentHeight')
            }),
            cornerRadii: b.folder('cornerRadii', {
                attachmentRadius: control(b, 'cornerRadii.attachmentRadius', 'attachmentRadius'),
                upperCorner: control(b, 'cornerRadii.upperCorner', 'upperCornerRadius'),
                lowerCorner: control(b, 'cornerRadii.lowerCorner', 'lowerCornerRadius')
            }, { collapsed: true })
        };
    }

    function buildMoldConfig(b) {
        const visible = handleStateManager.getState().viewSettings.showMoldPreview === true;
        return {
            visualization: b.control('visualization', 'showMoldPreview'),
            ...(visible ? {
                explode: b.control('explode', 'moldExplode'),
                opacity: b.control('opacity', 'moldOpacity'),
                parts: b.folder('parts', {
                    proof: b.control('parts.proof', 'moldShowProof'),
                    handleMold: b.control('parts.handleMold', 'moldShowHandleMold'),
                    walls: b.control('parts.walls', 'moldShowWalls'),
                    bottom: b.control('parts.bottom', 'moldShowBottom')
                })
            } : {})
        };
    }

    function readHandle({ param }) {
        const value = handleStateManager.getState().handleParams[param];
        return typeof value === 'number' ? Number(value.toFixed(2)) : value;
    }

    function readView({ param }) {
        if (param in MOLD_SETTING_KEYS) {
            const value = api.getMoldSettings()[MOLD_SETTING_KEYS[param]];
            return MOLD_PERCENT_SETTINGS.includes(param) ? Math.round(value * 100) : value;
        }
        return handleStateManager.getState().viewSettings[param];
    }

    const host = createDialHost({
        container: api.container,
        constraints: CONSTRAINTS,
        className: 'handle-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: [
            {
                id: 'handle-shape',
                name: 'Handle',
                build: buildHandleConfig,
                read: readHandle,
                change: ({ param }, value, options) => {
                    if (param === 'matchMugWallAngle') api.setMatchMugWallAngle(value);
                    else api.setParam(param, value, options);
                }
            },
            {
                id: 'handle-mold',
                name: 'Mold Kit',
                build: buildMoldConfig,
                read: readView,
                change: ({ param }, value) => {
                    if (param === 'showMoldPreview') api.setMoldPreview(value);
                    else api.setMoldSetting(param, MOLD_PERCENT_SETTINGS.includes(param) ? value / 100 : value);
                }
            }
        ]
    });

    /** Open the Handle panel and flash the control for a handle parameter. */
    function revealParam(param) {
        const label = labels.get(param);
        if (!label) return;
        host.panel('handle-shape').kit.setOpen(true);
        requestAnimationFrame(() => host.revealLabel(label));
    }

    return { sync: host.sync, revealParam, element: host.element };
}
