/**
 * DialKit controls for the Cast Form Generator
 *
 * Panel definitions for the shared DialKit host (dialHost.js): mold setup,
 * polymer case box (view controls live in the view dock). Cast form state
 * stays the source of truth;
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
    'view.caseBoxPreview.target': {
        options: [
            { value: 'wall', label: 'Wall Box' },
            { value: 'foot', label: 'Foot Box' }
        ],
        default: 'wall'
    },
    'view.caseBoxPreview.enabled': { type: 'boolean', default: false }
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

/**
 * @param {Object} api - App hooks; see castFormMain.js initDials()
 * @returns {{ sync: Function, element: HTMLElement }}
 */
export function initCastFormDials(api) {
    function readState({ param }) {
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
            }
        ]
    });

    return { sync: host.sync, reveal: host.reveal, element: host.element };
}
