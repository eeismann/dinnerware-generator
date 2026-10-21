import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const gates = [
    ['--test', 'scripts/tests/projectWorkflows.test.mjs'],
    ['--test', 'scripts/tests/footringWidth.test.mjs'],
    ['--test', 'scripts/tests/dinnerwareExportResolution.test.mjs'],
    ['--test', 'scripts/tests/dinnerwareFidelity.test.mjs'],
    ['--test', 'scripts/tests/dinnerwareInterface.test.mjs'],
    ['scripts/benchmarks/qualityPerfGate.mjs', '--correctness-only'],
    ...[
        'castFormTopologyGate', 'castFormCleanupGate', 'castFormWorkerStateGate',
        'vesselHandleImportGate', 'vesselHandlePreviewGate',
        'castFormPatternMoldGate', 'castFormMultiWallRegistrationKeyGate',
        'castFormTwoPartRegistrationKeyGate', 'castFormMaterialVolumeGate',
        'vesselV2MotifGate', 'vesselV3SpoutGate', 'vesselV3LidGate', 'handleMoldGeneratorGate',
        'stackedMoldSlicerGate', 'stackedMoldGeometryGate', 'stackedMoldSetGate'
    ].map(name => [`scripts/benchmarks/${name}.mjs`, ...(name === 'castFormPatternMoldGate' ? ['--correctness-only'] : [])])
];
let failures = 0;
for (const args of gates) {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
        failures++;
        console.error(`FAILED: ${args.join(' ')}${result.error ? `: ${result.error.message}` : ''}`);
    }
}
console.log(`\nRegression suite: ${gates.length - failures}/${gates.length} gates passed.`);
process.exitCode = failures ? 1 : 0;
