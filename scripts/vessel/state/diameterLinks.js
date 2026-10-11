/**
 * Vessel Generator - Linked Diameters
 *
 * A section's `bottomDiameterLocked` flag ties its bottom diameter to the top
 * diameter of the section below it, in both directions. Body links to the
 * waist when the waist is enabled, otherwise to the foot. Formerly part of
 * the classic parameter panel; it lives with the state so it applies however
 * the values change (dials, loads, scripts).
 */

// Section with the lock → section whose top diameter it follows
const LINK_TARGETS = {
    neck: 'shoulder',
    shoulder: 'body',
    body: null, // waist or foot, see linkTarget()
    waist: 'foot'
};

export const LINKABLE_SECTIONS = Object.keys(LINK_TARGETS);

/** Section below `sectionName` that its bottom diameter is linked to. */
export function linkTarget(state, sectionName) {
    if (sectionName === 'body') return state.sections.waist?.enabled ? 'waist' : 'foot';
    return LINK_TARGETS[sectionName] ?? null;
}

/**
 * Updates that make a link agree, copying from the source's bottom diameter
 * (`'bottom'`) or the target's top diameter (`'top'`).
 */
function linkUpdates(state, sectionName, source) {
    const target = linkTarget(state, sectionName);
    if (!target) return [];
    if (source === 'bottom') {
        const value = state.sections[sectionName]?.bottomDiameter;
        return value === undefined ? [] : [{ path: `sections.${target}.topDiameter`, value }];
    }
    const value = state.sections[target]?.topDiameter;
    return value === undefined ? [] : [{ path: `sections.${sectionName}.bottomDiameter`, value }];
}

/** Apply a link immediately (e.g. when it is switched on). */
export function syncLinkedDiameters(vesselState, sectionName, source = 'bottom') {
    const updates = linkUpdates(vesselState.getState(), sectionName, source);
    if (updates.length) vesselState.batchUpdate(updates);
}

/**
 * Keep linked diameters in step with every state change.
 * @returns {Function} Unsubscribe
 */
export function initDiameterLinks(vesselState) {
    return vesselState.subscribe('*', (state, changedPaths) => {
        if (!Array.isArray(changedPaths)) return;
        const changed = (fragment) => changedPaths.some(path => path.includes(fragment));
        const updates = [];

        // Switching the waist on/off moves the body's link target
        if (changed('waist.enabled') && state.sections.body.bottomDiameterLocked) {
            updates.push(...linkUpdates(state, 'body', 'bottom'));
        }

        LINKABLE_SECTIONS.forEach(sectionName => {
            if (!state.sections[sectionName]?.bottomDiameterLocked) return;
            if (changed(`${sectionName}.bottomDiameter`)) {
                updates.push(...linkUpdates(state, sectionName, 'bottom'));
            } else if (changed(`${linkTarget(state, sectionName)}.topDiameter`)) {
                updates.push(...linkUpdates(state, sectionName, 'top'));
            }
        });

        // Listeners run inside the state's update pass, which would only
        // queue these; apply them once it has finished. The follow-up
        // notification finds both sides equal, so it does not loop.
        if (updates.length) queueMicrotask(() => vesselState.batchUpdate(updates));
    });
}
