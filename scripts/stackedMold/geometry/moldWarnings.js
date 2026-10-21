/**
 * Stacked Cylinder Mold - warnings (PLAN.md §5)
 *
 * Each warning: { id, level: 'warn' | 'info', units?: [ids], text }.
 */

const TAN_70 = Math.tan(70 * Math.PI / 180);

export function collectWarnings(result, dims, src, params, built) {
    const out = [];
    const add = (id, level, text, units) => out.push({ id, level, text, ...(units ? { units } : {}) });
    const { units, r } = result;

    if (result.keyClear < 3) {
        add('key-bore', 'warn',
            `The top piece's sockets sit ${result.keyClear.toFixed(1)} mm from the well bore (needs ≥ 3 mm). Raise the plaster margin or lower the key inset.`);
    }

    const printer = dims.printer;
    const bed = Math.max(printer.x, printer.y);
    if (result.kitTooSmall) {
        add('kit-small', 'warn',
            `This ware needs at least a Ø${result.fittedS} cylinder, larger than the chosen kit; using a fitted Ø${result.S} instead.`);
    } else if (result.S !== result.fittedS) {
        add('kit-std', 'info',
            `Cast in the standard Ø${result.S} kit (the ware alone needs Ø${result.fittedS}): reuses the kit's plate, lid and sleeve at the cost of ${(result.S - result.fittedS) / 2} mm more plaster all round.`);
    }
    if (dims.plateTiles > 1 || dims.lidTiles > 1 || dims.segments > 2) {
        add('tiled', 'info',
            `Ø${result.S} is wider than the ${printer.label} bed: the kit prints the bed plate in ${dims.plateTiles}, the lid in ${dims.lidTiles} dovetailed tiles and the sleeve in ${dims.segments} segments. Tape the tile seams before pouring.`);
    }
    units.filter(u => u.kind === 'split').forEach(u => {
        const len = Math.max(u.h, 2 * dims.earOut);
        if (len > bed) {
            add(`split-bed-${u.id}`, 'warn',
                `${u.id}'s split inserts are ${len.toFixed(0)} mm long lying flat, more than the ${bed} mm bed.`, [u.id]);
        }
        if (dims.segments > 2) {
            add(`split-seg-${u.id}`, 'warn',
                `${u.id} is a split, but this kit's sleeve is in ${dims.segments} segments; a split needs a half sleeve. Wrap a cottle (a strapped plastic strip) on the open side instead.`, [u.id]);
        }
    });
    const tall = units.filter(u => u.h > dims.sleeveH);
    if (tall.length) {
        add('sleeve-short', 'warn',
            `${tall.map(u => u.id).join(', ')} ${tall.length > 1 ? 'are' : 'is'} taller than the kit's ${dims.sleeveH} mm sleeve. Choose a taller kit sleeve.`,
            tall.map(u => u.id));
    }
    if (built?.units.some(e => e.fused)) {
        add('fused-footer', 'warn',
            'The foot recess dips below the seam and the base doesn\'t flare high enough to lift it, so the footer needs its own fused plate instead of the kit plate.',
            [units[0].id]);
    }

    units.filter(u => u.kind === 'split' && u.noDraftRun > params.slicing.maxFlatRun).forEach(u => {
        add(`no-draft-${u.id}`, 'info',
            `${u.id} has ${u.noDraftRun.toFixed(0)} mm with less than ${params.slicing.minDraftDeg}° draft, so it splits. A 1.5° taper would let it cast as a one-piece ring.`, [u.id]);
    });

    units.filter(u => u.kind === 'ring' && u.h < params.slicing.minRingH).forEach(u => {
        add(`short-${u.id}`, 'warn',
            `${u.id} is only ${u.h.toFixed(1)} mm tall: its keys need about ${params.slicing.minRingH} mm.`, [u.id]);
    });

    // Near-horizontal core surfaces terrace in layer lines
    const steep = units.filter(u => (u.kind === 'ring' || u.kind === 'split') && (() => {
        for (let z = u.a; z < u.b; z += 0.5) {
            const s = Math.abs(r(Math.min(u.b, z + 0.5)) - r(z)) / 0.5;
            if (s > TAN_70) return true;
        }
        return false;
    })());
    if (steep.length) {
        add('terrace', 'info',
            `${steep.map(u => u.id).join(', ')} ${steep.length > 1 ? 'have' : 'has'} surfaces flatter than 20° (more than 70° from vertical). Print those cores at 0.12 mm layers to keep terracing off the ware.`,
            steep.map(u => u.id));
    }

    // Plaster heat (~45 °C) on PLA (softens ~60 °C): thick pieces
    const thick = units.filter(u => u.vol > 1.0 || u.kind === 'footer' && params.mold.footerT >= 40);
    if (thick.length) {
        add('heat', 'info',
            `${thick.map(u => `${u.id} (${u.vol.toFixed(2)} L)`).join(', ')}: thick plaster gets warm while it sets. Print those units with ≥ 4 perimeters, or in PETG.`,
            thick.map(u => u.id));
    }

    if (result.f === 0) {
        add('pedestal', 'info', 'Pedestal foot: the base narrows upward, so the footer seam sits at the base (f = 0).', [units[0].id]);
    }

    if (src?.asymmetry > 0.75) {
        add('asymmetry', 'warn',
            `The source isn't a clean surface of revolution (up to ${src.asymmetry.toFixed(1)} mm out of round). The mold follows the median radius; handles and surface patterns are left out.`);
    }

    if (built) {
        const bad = [...built.units.flatMap(e => e.parts), ...built.kit.parts].filter(p => !p.check.watertight);
        if (bad.length) add('manifold', 'warn', `${bad.length} part(s) are not watertight: ${bad.map(p => p.label).join(', ')}.`);
    }
    return out;
}
