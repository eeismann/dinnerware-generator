/**
 * Set Layouts
 * Places the items of a set for the "stacked" and "table setting" views.
 * Pieces rest on one another using their real cross-sections: an upper piece
 * is lifted until its underside clears the lower piece's top surface at
 * every radius (a mug drops onto a saucer's floor, a bowl nests on a plate).
 */

const SAMPLE_STEP = 0.5; // mm between radial samples
const REST_GAP = 1.0; // mm clearance, covers raised surface patterns

/**
 * Lowest and highest boundary height of a revolved section at each sampled
 * radius. For a closed section these are the solid's underside and top.
 * @param {{chains: Array<{points: Array<{x:number,y:number}>}>}} section
 */
export function sectionEnvelope(section) {
    let maxR = 0;
    section.chains.forEach(chain => chain.points.forEach(p => { maxR = Math.max(maxR, p.x); }));
    const count = Math.ceil(maxR / SAMPLE_STEP) + 1;
    const bottom = new Float64Array(count).fill(Infinity);
    const top = new Float64Array(count).fill(-Infinity);

    section.chains.forEach(chain => {
        const points = chain.points;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const r0 = Math.min(a.x, b.x);
            const r1 = Math.max(a.x, b.x);
            const k0 = Math.ceil(r0 / SAMPLE_STEP);
            const k1 = Math.floor(r1 / SAMPLE_STEP);
            for (let k = k0; k <= k1; k++) {
                const r = k * SAMPLE_STEP;
                const s = r1 - r0 > 1e-9 ? (r - a.x) / (b.x - a.x) : 0;
                const y = r1 - r0 > 1e-9 ? a.y + (b.y - a.y) * s : Math.min(a.y, b.y);
                const yMax = r1 - r0 > 1e-9 ? y : Math.max(a.y, b.y);
                bottom[k] = Math.min(bottom[k], y);
                top[k] = Math.max(top[k], yMax);
            }
        }
    });
    // The centerline seam leaves the axis sample empty; borrow its neighbour
    if (!Number.isFinite(bottom[0]) && count > 1) {
        bottom[0] = bottom[1];
        top[0] = top[1];
    }
    return { bottom, top, maxR };
}

/**
 * Height at which `upper` rests on `lower` (both standing on y = 0).
 */
export function restingHeight(lowerSection, upperSection, gap = REST_GAP) {
    const lower = sectionEnvelope(lowerSection);
    const upper = sectionEnvelope(upperSection);
    let lift = 0;
    const count = Math.min(lower.top.length, upper.bottom.length);
    for (let k = 0; k < count; k++) {
        if (!Number.isFinite(lower.top[k]) || !Number.isFinite(upper.bottom[k])) continue;
        lift = Math.max(lift, lower.top[k] - upper.bottom[k]);
    }
    return lift + gap;
}

// Stacks rest pieces bottom-to-top; hidden pieces are skipped.
const STACKS = {
    stack: [
        ['plate', 'pasta_bowl', 'soup_bowl'],
        ['saucer', 'mug'],
        ['serving_bowl'],
        ['tumbler']
    ],
    table: [
        ['plate', 'soup_bowl'],
        ['saucer', 'mug'],
        ['tumbler'],
        ['pasta_bowl'],
        ['serving_bowl']
    ]
};

function resolveStacks(mode, sections, visible) {
    return STACKS[mode]
        .map(stack => stack.filter(item => visible.includes(item) && sections[item]))
        .filter(stack => stack.length > 0)
        .map(stack => {
            let base = 0;
            return stack.map((item, index) => {
                if (index > 0) base += restingHeight(sections[stack[index - 1]], sections[item]);
                return { item, y: index === 0 ? 0 : base };
            });
        });
}

/**
 * Plan positions for a set view.
 * @param {'stack'|'table'} mode
 * @param {Object<string, Object>} sections - Cross-section per item type
 * @param {string[]} visible - Visible item types
 * @returns {Object<string, {x:number, y:number, z:number}>}
 */
export function planSetLayout(mode, sections, visible) {
    const positions = {};
    const radiusOf = (item) => sectionEnvelope(sections[item]).maxR;
    const stacks = resolveStacks(mode, sections, visible);
    if (stacks.length === 0) return positions;
    const stackRadius = (stack) => Math.max(...stack.map(({ item }) => radiusOf(item)));

    if (mode === 'stack') {
        // Stacks side by side on one baseline
        const gap = 40;
        const widths = stacks.map(stack => stackRadius(stack) * 2);
        let x = -(widths.reduce((a, b) => a + b, 0) + gap * (stacks.length - 1)) / 2;
        stacks.forEach((stack, i) => {
            const cx = x + widths[i] / 2;
            stack.forEach(({ item, y }) => { positions[item] = { x: cx, y, z: 0 }; });
            x += widths[i] + gap;
        });
        return positions;
    }

    // Table setting: the plate stack in front, cup and glass to its right,
    // the pasta bowl to its left and the serving bowl behind.
    const anchor = stacks.find(stack => stack.some(({ item }) => item === 'plate' || item === 'soup_bowl')) ?? stacks[0];
    const anchorR = stackRadius(anchor);
    const place = (stack, x, z) => stack.forEach(({ item, y }) => { positions[item] = { x, y, z }; });
    place(anchor, 0, 0);
    stacks.filter(stack => stack !== anchor).forEach(stack => {
        const r = stackRadius(stack);
        const first = stack[0].item;
        if (first === 'saucer' || first === 'mug') place(stack, anchorR + r + 40, anchorR * 0.45);
        else if (first === 'tumbler') place(stack, anchorR + r + 30, -anchorR * 0.65);
        else if (first === 'pasta_bowl') place(stack, -(anchorR + r + 40), -anchorR * 0.2);
        else place(stack, 0, -(anchorR + r + 60));
    });
    return positions;
}
