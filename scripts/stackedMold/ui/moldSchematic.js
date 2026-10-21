/**
 * Stacked Cylinder Mold - 2D profile schematic
 *
 * Port of the concept page's "Profile analysis" panel (drawAnalysis in
 * stacked-cylinder-mold/concept.html): the ware's half section, surfaces
 * coloured by direction (accent = faces down, an overhang if printed
 * upright), turning points, cut lines, the well bore and pooling ledge, and a
 * label per unit with its release glyph. Colours come from CSS variables so
 * it follows the light/dark interface.
 */

const NS = 'http://www.w3.org/2000/svg';
const GLYPH = { footer: '⌴', up: '↑', down: '↓', split: '⟷' };

function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
}
const pts = arr => arr.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');

/**
 * @param {Object} result - sliceProfile result
 * @param {Object} [options] - { width, height, selected, onPick }
 */
export function drawProfileSchematic(result, { width = 260, height = 300, selected = null, onPick = null } = {}) {
    const { r, H, units, rMax, rLip, rw, turns, params } = result;
    const wellH = params.wellH;
    const spanMM = rMax + 46;
    const zMin = Math.min(-6, units[0].a);
    const zMax = H + wellH + 6;
    const s = Math.min((width - 16) / (spanMM * 2), (height - 16) / (zMax - zMin));
    const svg = el('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'sm-schematic', role: 'img', 'aria-label': 'Profile analysis' });
    const cx = width / 2 - 16 * s;
    const base = height - 8 + zMin * s;
    const X = x => cx + x * s;
    const Y = z => base - z * s;

    // Units as bands behind the profile (click to select)
    units.forEach(u => {
        const band = el('rect', {
            x: X(-rMax - 10), y: Y(Math.min(u.b, zMax)), width: (2 * rMax + 20) * s, height: Math.max(1, (Math.min(u.b, zMax) - Math.max(u.a, zMin)) * s),
            class: `sm-band${u.id === selected ? ' is-selected' : ''}${u.kind === 'split' ? ' is-split' : ''}`
        }, svg);
        if (onPick) {
            band.style.cursor = 'pointer';
            band.addEventListener('click', () => onPick(u.id));
        }
    });

    // Left half: faint
    const left = [];
    for (let z = 0; z <= H; z += 0.5) left.push([X(-r(z)), Y(z)]);
    el('polyline', { points: pts(left), class: 'sm-faint' }, svg);
    el('line', { x1: X(-r(0)), y1: Y(0), x2: X(r(0)), y2: Y(0), class: 'sm-faint' }, svg);
    el('line', { x1: X(0), y1: Y(zMin), x2: X(0), y2: Y(zMax), class: 'sm-axis' }, svg);

    // Right half: coloured by surface direction
    for (let z = 0; z < H; z += 0.5) {
        const down = (r(z + 0.5) - r(z)) / 0.5 > 0.02;
        el('line', { x1: X(r(z)), y1: Y(z), x2: X(r(Math.min(H, z + 0.5))), y2: Y(Math.min(H, z + 0.5)), class: down ? 'sm-ink sm-down' : 'sm-ink' }, svg);
    }
    // Well bore + ledge
    el('polyline', { points: pts([[X(rLip), Y(H)], [X(rw), Y(H)], [X(rw), Y(H + wellH)]]), class: 'sm-dash' }, svg);
    el('line', { x1: X(rLip), y1: Y(H), x2: X(rw), y2: Y(H), class: 'sm-ledge' }, svg);

    // Cuts
    const span = rMax + 10;
    [...new Set(units.slice(1).map(u => u.a))].forEach(z => {
        el('line', { x1: X(-span), y1: Y(z), x2: X(span), y2: Y(z), class: 'sm-cut' }, svg);
    });
    turns.forEach(t => el('circle', { cx: X(t.r), cy: Y(t.z), r: 2.6, class: 'sm-turn' }, svg));

    // Unit labels
    units.forEach(u => {
        const zm = (Math.max(u.a, zMin) + Math.min(u.b, zMax)) / 2;
        const t = el('text', { x: X(span) + 5, y: Y(zm) + 3.5, class: `sm-label${u.kind === 'split' ? ' is-split' : ''}` }, svg);
        t.textContent = `${u.id} ${GLYPH[u.release] || ''}`;
    });
    return svg;
}
