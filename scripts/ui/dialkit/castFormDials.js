/**
 * DialKit controls for the Cast Form Generator
 *
 * Panel definitions for the shared DialKit host (dialHost.js): mold setup,
 * polymer case box and view. Cast form state stays the source of truth;
 * dial edits go through `api` (see castFormMain.js initDials()) and `sync()`
 * pushes state back after load, new project or source import.
 */

import castFormState from '../../castForm/state/castFormState.js';
import { DEFAULT_PARAMS, PARAM_CONSTRAINTS } from '../../castForm/state/castFormDefaults.js';
import { createDialHost } from './dialHost.js';

// Slider ranges by state path, from the cast form constraint table
const CONSTRAINTS = {};
Object.entries(PARAM_CONSTRAINTS).forEach(([key, { min, max, step }]) => {
    const [group, name] = key.split('.');
    CONSTRAINTS[`params.${key}`] = { min, max, step, default: DEFAULT_PARAMS[group][name] };
});
Object.assign(CONSTRAINTS, {
    'view.explosionDistance': { min: 0, max: 150, step: 5, default: 40 },
    'view.crossSectionAngle': { min: 0, max: 360, step: 5, default: 0 },
    'view.mode': {
        options: [
            { value: 'exploded', label: 'Exploded' },
            { value: 'assembly', label: 'Assembly' },
            { value: 'crossSection', label: 'Cross Section' }
        ],
        default: 'exploded'
    },
    'view.caseBoxPreview.target': {
        options: [
            { value: 'wall', label: 'Wall Box' },
            { value: 'foot', label: 'Foot Box' }
        ],
        default: 'wall'
    },
    'view.caseBoxPreview.enabled': { type: 'boolean', default: false },
    'view.showGrid': { type: 'boolean', default: true }
});

// DialKit derives labels from config keys ("spareHeight" → "Spare Height")
const CASE_BOX_KEYS = {
    sideGap: 'gap',
    headspaceAboveForm: 'headspace',
    boxWallThickness: 'wallThickness',
    floorThickness: 'floorThickness',
    indentDepth: 'indentDepth',
    indentFitClearance: 'fitClearance'
};

const CAMERA_ACTIONS = {
    front: { label: 'Front', preset: 'front' },
    side: { label: 'Side', preset: 'side' },
    threeQuarter: { label: '3/4', preset: 'threeQuarter' },
    top: { label: 'Top', preset: 'top' }
};

function wallDisplayCount() {
    const generated = (castFormState.getState('output.wallShells') || []).filter(Boolean).length;
    if (generated > 0) return generated;
    return Math.max(1, Math.min(4, Math.round(castFormState.getState('params.mold.wallCount') || 2)));
}

/**
 * @param {Object} api - App hooks; see castFormMain.js initDials()
 * @returns {{ sync: Function, element: HTMLElement }}
 */
export function initCastFormDials(api) {
    function readState({ param, name }) {
        if (param === 'debug') return api.isDebugMode();
        if (param === 'partVisible') return api.isPartVisible(name);
        return castFormState.getState(param);
    }

    function buildMoldConfig(b) {
        return {
            plasterWallThickness: b.control('plasterWallThickness', 'params.mold.plasterWallThickness'),
            spareHeight: b.control('spareHeight', 'params.mold.spareHeight'),
            wallSections: b.control('wallSections', 'params.mold.wallCount')
        };
    }

    function buildCaseBoxConfig(b) {
        const previewing = Boolean(castFormState.getState('view.caseBoxPreview.enabled'));
        const config = {
            previewCaseBox: b.control('previewCaseBox', 'view.caseBoxPreview.enabled')
        };
        if (previewing) {
            config.box = b.control('box', 'view.caseBoxPreview.target');
            Object.entries(CASE_BOX_KEYS).forEach(([key, name]) => {
                config[key] = b.control(key, `params.caseBox.${name}`);
            });
        }
        return config;
    }

    function buildViewConfig(b) {
        const mode = castFormState.getState('view.mode') || 'exploded';
        const camera = {};
        Object.entries(CAMERA_ACTIONS).forEach(([key, { label }]) => {
            camera[key] = { type: 'action', label };
        });

        const parts = {};
        const partNames = [['foot', 'foot'], ...Array.from({ length: wallDisplayCount() }, (_, index) =>
            [`wall ${index + 1}`, `wall${index + 1}`]), ['inputVessel', 'inputPreview']];
        partNames.forEach(([key, name]) => {
            parts[key] = true;
            b.bind(`parts.${key}`, 'partVisible', { name });
        });

        return {
            camera: b.folder('camera', camera),
            viewMode: b.control('viewMode', 'view.mode'),
            ...(mode === 'exploded' ? {
                explosionDistance: b.control('explosionDistance', 'view.explosionDistance')
            } : {}),
            ...(mode === 'crossSection' ? {
                sectionAngle: b.control('sectionAngle', 'view.crossSectionAngle')
            } : {}),
            showGrid: b.control('showGrid', 'view.showGrid'),
            parts: b.folder('parts', parts, { collapsed: true }),
            debugShellCaps: b.control('debugShellCaps', 'debug', { constraints: { type: 'boolean', default: false } })
        };
    }

    function changeView({ param, name }, value) {
        if (param === 'partVisible') api.setPartVisible(name, value);
        else if (param === 'debug') api.setDebugMode(value);
        else api.setView(param, value);
    }

    const host = createDialHost({
        container: api.container,
        constraints: CONSTRAINTS,
        className: 'cast-form-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: [
            {
                id: 'castform-mold',
                name: 'Mold',
                build: buildMoldConfig,
                read: readState,
                change: ({ param }, value, options) => api.setParam(param, value, options)
            },
            {
                id: 'castform-case-box',
                name: 'Polymer Case Box',
                build: buildCaseBoxConfig,
                read: readState,
                change: ({ param }, value, options) => {
                    if (param.startsWith('view.')) api.setView(param, value);
                    else api.setParam(param, value, options);
                }
            },
            {
                id: 'castform-view',
                name: 'View',
                collapsed: true,
                build: buildViewConfig,
                read: readState,
                change: changeView,
                action: (name) => {
                    if (CAMERA_ACTIONS[name]) api.setCamera(CAMERA_ACTIONS[name].preset);
                }
            }
        ]
    });

    return { sync: host.sync, reveal: host.reveal, element: host.element };
}
