/**
 * Dinnerware performance benchmark.
 * Times preview, interactive (drag) and export mesh generation, export
 * validation and STL serialization for all seven items across patterns.
 *
 * Run: node scripts/benchmarks/dinnerwarePerfBench.mjs [--json]
 */

import { ITEM_TYPES, stateManager } from '../state/projectState.js';
import { generateItemMesh, generateItemExportMesh } from '../geometry/meshGenerator.js';
import { validateGeometryForPrint } from '../geometry/meshQuality.js';
import { exportToBinarySTL } from '../geometry/stlExporter.js';

const CASES = [
    ['smooth', {}],
    ['vertical', { wallPatternType: 'vertical', wallPatternCount: 96 }],
    ['knurl', { wallPatternType: 'knurl', wallPatternCount: 96 }],
    ['knurl-160', { wallPatternType: 'knurl', wallPatternCount: 160 }]
];

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[sorted.length >> 1];
}

function time(fn, runs = 3) {
    const samples = [];
    let result;
    for (let i = 0; i < runs; i++) {
        const start = performance.now();
        result = fn();
        samples.push(performance.now() - start);
    }
    return { ms: median(samples), result };
}

function vertexCount(geometries) {
    return geometries.reduce((sum, g) => sum + g.getAttribute('position').count, 0);
}

const rows = [];
for (const [name, parameters] of CASES) {
    stateManager.state = stateManager.getInitialState();
    Object.assign(stateManager.state.globalParameters, parameters);

    const build = (options) => ITEM_TYPES.map(item => generateItemMesh(item, options));
    const dispose = (geometries) => geometries.forEach(g => g.dispose());

    // Warm the JIT
    dispose(build());

    const preview = time(() => { const g = build(); const v = vertexCount(g); dispose(g); return v; });
    const interactive = time(() => { const g = build({ interactive: true }); const v = vertexCount(g); dispose(g); return v; });
    const exported = ITEM_TYPES.map(item => generateItemExportMesh(item));
    const exportBuild = time(() => { const g = ITEM_TYPES.map(item => generateItemExportMesh(item)); const v = vertexCount(g); dispose(g); return v; }, 2);
    const validate = time(() => exported.forEach(g => validateGeometryForPrint(g, { enforceOrientationConsistency: true })), 2);
    const serialize = time(() => exported.forEach((g, i) => exportToBinarySTL(g, ITEM_TYPES[i])), 2);
    dispose(exported);

    rows.push({
        case: name,
        previewVerts: preview.result,
        previewMs: preview.ms,
        interactiveVerts: interactive.result,
        interactiveMs: interactive.ms,
        exportVerts: exportBuild.result,
        exportBuildMs: exportBuild.ms,
        validateMs: validate.ms,
        stlMs: serialize.ms
    });
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2));
} else {
    const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
    const headers = Object.keys(rows[0]);
    console.log(headers.join('\t'));
    rows.forEach(row => console.log(headers.map(h => (typeof row[h] === 'number' ? fmt(row[h]) : row[h])).join('\t')));
    console.log('\n(stlMs includes the strict validation gate run by the exporter)');
}
