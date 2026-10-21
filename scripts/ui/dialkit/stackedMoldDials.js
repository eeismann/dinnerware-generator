/**
 * DialKit controls for the Stacked Mold Generator
 *
 * Panel definitions for the shared DialKit host (dialHost.js): the universal
 * kit (standard cylinder diameter, tall-sleeve height, printer), mold
 * (shrinkage, plaster margin, footer, seam, well), slicing rules and printed
 * parts. View options live in the view dock. Stacked mold state stays the
 * source of truth; dial edits go through `api.setParam` (see
 * scripts/stackedMold/stackedMoldMain.js initDials()) and `sync()` pushes state
 * back after loads, new projects and source changes.
 */

import stackedMoldState from '../../stackedMold/state/stackedMoldState.js';
import { DEFAULT_PARAMS, PARAM_CONSTRAINTS } from '../../stackedMold/state/stackedMoldDefaults.js';
import { createDialHost } from './dialHost.js';

// Slider ranges keyed by state path ("params.mold.shrinkage")
const CONSTRAINTS = {};
Object.entries(PARAM_CONSTRAINTS).forEach(([key, c]) => {
    const [group, name] = key.split('.');
    CONSTRAINTS[`params.${key}`] = { ...c, default: DEFAULT_PARAMS[group][name] };
});

// DialKit labels come from config keys ("plasterMargin" → "Plaster Margin")
const PANELS = [
    {
        id: 'stackedmold-kit', name: 'Kit',
        keys: {
            cylinder: 'kit.diameter',
            sleeveHeight: 'kit.sleeveH',
            printer: 'kit.printer'
        }
    },
    {
        id: 'stackedmold-mold', name: 'Mold',
        keys: {
            shrinkage: 'mold.shrinkage',
            plasterMargin: 'mold.plasterMin',
            footerThickness: 'mold.footerT',
            footSeam: 'mold.footSeam',
            wellHeight: 'mold.wellH',
            ledgeWidth: 'mold.ledgeMin'
        }
    },
    {
        id: 'stackedmold-slicing', name: 'Slicing', collapsed: true,
        keys: {
            maxRingHeight: 'slicing.maxRingH',
            maxSplitHeight: 'slicing.maxSplitH',
            minDraft: 'slicing.minDraftDeg',
            maxFlatRun: 'slicing.maxFlatRun',
            minRingHeight: 'slicing.minRingH',
            seamAtFootCrease: 'slicing.seamAtCrease',
            maxFootSeam: 'slicing.footSeamMax'
        }
    },
    {
        id: 'stackedmold-parts', name: 'Printed Parts', collapsed: true,
        keys: {
            keyInset: 'parts.keyInset',
            sleeveWall: 'parts.sleeveWall',
            plateThickness: 'parts.plateT',
            strapGroove: 'parts.strapGroove'
        }
    }
];

/**
 * @param {Object} api - { container, setParam(path, value, { interactive }), onGestureStart, onGestureEnd }
 */
export function initStackedMoldDials(api) {
    const host = createDialHost({
        container: api.container,
        constraints: CONSTRAINTS,
        className: 'stacked-mold-dials',
        onGestureStart: api.onGestureStart,
        onGestureEnd: api.onGestureEnd,
        panels: PANELS.map(panel => ({
            id: panel.id,
            name: panel.name,
            collapsed: panel.collapsed,
            build: (b) => Object.fromEntries(Object.entries(panel.keys)
                .map(([key, path]) => [key, b.control(key, `params.${path}`)])),
            read: ({ param }) => stackedMoldState.getState(param),
            change: ({ param }, value, options) => api.setParam(param, value, options)
        }))
    });
    return { sync: host.sync, reveal: host.reveal, element: host.element };
}
