// Temporary smoke test for surface patterns (run: node scripts/benchmarks/surfacePatternGate.mjs)
import { stateManager } from '../../scripts/state/projectState.js';
import { generateItemMesh } from '../../scripts/geometry/meshGenerator.js';
import { validateGeometryForPrint } from '../../scripts/geometry/meshQuality.js';

const TYPES = ['vertical', 'horizontal', 'diagonal', 'crosshatch', 'knurl'];
const ITEMS = ['mug', 'plate', 'soup_bowl', 'saucer'];

let failures = 0;

function run(label, itemType) {
    const geo = generateItemMesh(itemType);
    const v = validateGeometryForPrint(geo);
    const tris = v.triangleCount;
    if (!v.valid) {
        failures++;
        console.log(`FAIL  ${label} [${itemType}] tris=${tris} -> ${v.errors.join('; ')}`);
    } else {
        console.log(`ok    ${label} [${itemType}] tris=${tris}`);
    }
}

// Baseline (smooth)
run('smooth', 'mug');
run('smooth', 'saucer');

for (const type of TYPES) {
    for (const relief of ['raised', 'recessed']) {
        stateManager.setState('globalParameters.wallPatternType', type);
        stateManager.setState('globalParameters.wallPatternRelief', relief);
        stateManager.setState('globalParameters.footringPatternType', type);
        stateManager.setState('globalParameters.footringPatternRelief', relief);
        for (const item of ITEMS) {
            run(`${type}/${relief}`, item);
        }
    }
}

// Fillet + curved wall + pattern (stress case)
stateManager.setState('globalParameters.bottomCornerRadius', 8);
stateManager.setState('globalParameters.wallCurveAmount', 15);
stateManager.setState('globalParameters.wallPatternType', 'knurl');
stateManager.setState('globalParameters.footringPatternType', 'vertical');
for (const item of ITEMS) {
    run('fillet+curve+knurl', item);
}

// No footring case
stateManager.setState('globalParameters.footringOriginHeight', 0);
run('no-footring+knurl', 'mug');

// Dense pattern (resolution cap)
stateManager.setState('globalParameters.footringOriginHeight', 8);
stateManager.setState('globalParameters.wallPatternCount', 160);
run('dense-160-knurl', 'plate');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
