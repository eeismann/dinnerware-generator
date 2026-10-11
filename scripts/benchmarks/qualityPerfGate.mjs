#!/usr/bin/env node
/**
 * Release gate: topology, STL validation, and cast-form latency budgets.
 */

import { performance } from 'node:perf_hooks';
import * as THREE from 'three';

import { ITEM_TYPES } from '../state/projectState.js';
import { generateItemMesh } from '../geometry/meshGenerator.js';
import { validateGeometryForPrint, detectCoplanarOverlap } from '../geometry/meshQuality.js';
import { validateGeometryForSTL, groupToMergedGeometry } from '../geometry/stlCore.js';
import vesselState from '../vessel/state/vesselState.js';
import { getDefaultState as getDefaultVesselState } from '../vessel/state/vesselDefaults.js';
import { VesselMeshGenerator } from '../vessel/geometry/vesselMeshGenerator.js';
import { getDefaultVesselV2State } from '../vesselV2/state/vesselV2Defaults.js';
import { VesselV2MeshGenerator } from '../vesselV2/geometry/vesselV2MeshGenerator.js';
import { validateVesselV2Profile } from '../vesselV2/geometry/profileSampler.js';
import { DEFAULT_HANDLE_PARAMS } from '../handle/state/handleState.js';
import { generateHandleMesh } from '../handle/geometry/handleMeshGenerator.js';
import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { DEFAULT_PARAMS as DEFAULT_CAST_FORM_PARAMS } from '../castForm/state/castFormDefaults.js';

const BUDGETS = {
    topology: {
        maxDegenerate: 0,
        maxBoundary: 0,
        maxOverConnected: 0,
        maxOrientationConflict: 0
    },
    castFormLatencyMs: {
        previewSimple: 2000,
        previewComplex: 1500,
        exportSimple: 3500
    }
};

function cloneParams() {
    return JSON.parse(JSON.stringify(DEFAULT_CAST_FORM_PARAMS));
}

function createSimpleCastFormInput() {
    const geometry = new THREE.CylinderGeometry(40, 30, 95, 24, 24, false).toNonIndexed();
    geometry.translate(0, 95 / 2, 0);
    return geometry;
}

function createComplexCastFormInput() {
    const points = [];
    const profileSteps = 96;

    for (let i = 0; i <= profileSteps; i++) {
        const t = i / profileSteps;
        const y = t * 130;
        const radius =
            24 +
            16 * Math.sin(t * Math.PI * 0.95) +
            4 * Math.sin(t * Math.PI * 7) +
            (t > 0.72 ? 6 * ((t - 0.72) / 0.28) : 0);

        points.push(new THREE.Vector2(Math.max(12, radius), y));
    }

    return new THREE.LatheGeometry(points, 220).toNonIndexed();
}

function summarizeQuality(name, result) {
    return `${name}: triangles=${result.triangleCount}, degenerate=${result.degenerateCount}, boundary=${result.boundaryEdges}, over2=${result.overConnectedEdges}, orient=${result.orientationConflictEdges}`;
}

function assertTopologyBudget(name, result, failures, options = {}) {
    const checkOrientation = options.checkOrientation === true;
    const overDegenerate = result.degenerateCount > BUDGETS.topology.maxDegenerate;
    const overBoundary = result.boundaryEdges > BUDGETS.topology.maxBoundary;
    const overConnected = result.overConnectedEdges > BUDGETS.topology.maxOverConnected;
    const overOrientation = result.orientationConflictEdges > BUDGETS.topology.maxOrientationConflict;

    const failed = overDegenerate || overBoundary || overConnected || (checkOrientation && overOrientation);
    if (failed) {
        const orientationPart = checkOrientation
            ? `, orient=${result.orientationConflictEdges}`
            : '';

        failures.push(
            `${name} topology budget failed: degenerate=${result.degenerateCount}, boundary=${result.boundaryEdges}, over2=${result.overConnectedEdges}${orientationPart}`
        );
    }
}

function assertStlValid(name, geometry, failures, validationOptions = {}) {
    const validation = validateGeometryForSTL(geometry, validationOptions);
    if (!validation.valid) {
        failures.push(`${name} STL validation failed: ${validation.warnings.join('; ')}`);
    }
}

function assertLatency(label, elapsedMs, budgetMs, failures) {
    if (elapsedMs > budgetMs) {
        failures.push(`${label} latency ${elapsedMs.toFixed(1)}ms exceeds budget ${budgetMs}ms`);
    }
}

function disposeGroup(group) {
    group?.traverse((child) => {
        if (child?.isMesh) {
            child.geometry?.dispose?.();

            if (Array.isArray(child.material)) {
                child.material.forEach((material) => material?.dispose?.());
            } else {
                child.material?.dispose?.();
            }
        }
    });
}

function assertNoCoplanarOverlap(name, geometry, failures, options = {}) {
    const result = detectCoplanarOverlap(geometry, options);
    if (result.overlappingPairs > 0) {
        failures.push(
            `${name} has ${result.overlappingPairs} coplanar overlapping face pair(s) — opposing normals on the same plane will cancel in slicer`
        );
    }
}

function validateAndReport(name, geometry, failures, options = {}) {
    const {
        qualityOptions = {},
        topologyOptions = {},
        stlOptions = {},
        checkCoplanarOverlap = false
    } = options;

    const quality = validateGeometryForPrint(geometry, qualityOptions);
    console.log(`- ${summarizeQuality(name, quality)}`);
    assertTopologyBudget(name, quality, failures, topologyOptions);
    assertStlValid(name, geometry, failures, stlOptions);
    if (checkCoplanarOverlap) {
        assertNoCoplanarOverlap(name, geometry, failures, qualityOptions);
    }
}

function measureCastFormLatency(inputGeometry, quality) {
    const generator = new MoldGenerator();
    const params = cloneParams();

    const timings = {};
    for (const phase of ['cold', 'edit', 'cacheHit']) {
        if (phase === 'edit') params.shell.wallThickness += 0.5;
        const startedAt = performance.now();
        const parts = generator.generate(inputGeometry, params, { quality });
        timings[phase] = performance.now() - startedAt;
        parts.foot?.dispose();
        parts.walls?.forEach(wall => wall?.dispose());
    }
    generator.dispose?.();
    return timings;
}

function createVesselV2Case(mutator) {
    const state = getDefaultVesselV2State();
    mutator?.(state);
    return state;
}

function runVesselV2Case(name, state, failures) {
    const validation = validateVesselV2Profile(state);
    if (!validation.valid) {
        failures.push(`${name} profile validation failed: ${validation.errors.join('; ')}`);
        return;
    }

    const generator = new VesselV2MeshGenerator(state);
    const group = generator.generate();
    const geometry = groupToMergedGeometry(group);
    validateAndReport(name, geometry, failures);
    geometry.dispose();
    disposeGroup(group);
}

function runVesselV2Checks(failures) {
    runVesselV2Case('vessel-v2/default', createVesselV2Case(), failures);

    runVesselV2Case('vessel-v2/straight-cylinder', createVesselV2Case((state) => {
        state.profile.points = [
            { id: 'p0', r: 0, h: 0, inHandle: null, outHandle: null, kind: 'corner', locked: true },
            { id: 'p1', r: 36, h: 0, inHandle: null, outHandle: null, kind: 'corner' },
            { id: 'p2', r: 36, h: 125, inHandle: null, outHandle: null, kind: 'corner' }
        ];
    }), failures);

    runVesselV2Case('vessel-v2/curved-vase', createVesselV2Case((state) => {
        state.profile.points = [
            { id: 'p0', r: 0, h: 0, inHandle: null, outHandle: null, kind: 'corner', locked: true },
            { id: 'p1', r: 28, h: 0, inHandle: null, outHandle: { r: 24, h: 20 }, kind: 'corner' },
            { id: 'p2', r: 66, h: 70, inHandle: { r: -18, h: -28 }, outHandle: { r: 8, h: 28 }, kind: 'smooth' },
            { id: 'p3', r: 30, h: 145, inHandle: { r: 26, h: -24 }, outHandle: null, kind: 'smooth' }
        ];
    }), failures);

    runVesselV2Case('vessel-v2/narrow-neck', createVesselV2Case((state) => {
        state.global.wallThickness = 2.5;
        state.profile.points = [
            { id: 'p0', r: 0, h: 0, inHandle: null, outHandle: null, kind: 'corner', locked: true },
            { id: 'p1', r: 40, h: 0, inHandle: null, outHandle: { r: 18, h: 18 }, kind: 'corner' },
            { id: 'p2', r: 58, h: 88, inHandle: { r: -10, h: -40 }, outHandle: { r: -4, h: 28 }, kind: 'smooth' },
            { id: 'p3', r: 12, h: 148, inHandle: { r: 28, h: -14 }, outHandle: null, kind: 'smooth' }
        ];
    }), failures);

    runVesselV2Case('vessel-v2/straight-rounded-corners', createVesselV2Case((state) => {
        state.profile.mode = 'straight-rounded';
        state.profile.points = [
            { id: 'p0', r: 0, h: 0, inHandle: null, outHandle: null, kind: 'corner', cornerRadius: 0, locked: true },
            { id: 'p1', r: 38, h: 0, inHandle: null, outHandle: null, kind: 'corner', cornerRadius: 12 },
            { id: 'p2', r: 62, h: 72, inHandle: null, outHandle: null, kind: 'corner', cornerRadius: 18 },
            { id: 'p3', r: 34, h: 142, inHandle: null, outHandle: null, kind: 'corner', cornerRadius: 10 }
        ];
    }), failures);

    runVesselV2Case('vessel-v2/footer-overlap', createVesselV2Case((state) => {
        state.profile.allowFooterOverlap = true;
        state.global.wallThickness = 2.5;
        state.profile.points = [
            { id: 'p0', r: 0, h: 20, inHandle: null, outHandle: null, kind: 'corner', cornerRadius: 0, locked: true },
            { id: 'p1', r: 28, h: 4, inHandle: null, outHandle: { r: 14, h: -4 }, kind: 'corner', cornerRadius: 0 },
            { id: 'p2', r: 44, h: 18, inHandle: { r: -10, h: -8 }, outHandle: { r: 16, h: 24 }, kind: 'smooth', cornerRadius: 0 },
            { id: 'p3', r: 62, h: 86, inHandle: { r: -6, h: -30 }, outHandle: { r: -4, h: 22 }, kind: 'smooth', cornerRadius: 0 },
            { id: 'p4', r: 34, h: 142, inHandle: { r: 20, h: -18 }, outHandle: null, kind: 'smooth', cornerRadius: 0 }
        ];
    }), failures);

    const invalidState = createVesselV2Case((state) => {
        state.global.wallThickness = 8;
        state.profile.points = [
            { id: 'p0', r: 0, h: 0, inHandle: null, outHandle: null, kind: 'corner', locked: true },
            { id: 'p1', r: 5, h: 80, inHandle: null, outHandle: null, kind: 'corner' }
        ];
    });
    const invalidValidation = validateVesselV2Profile(invalidState);
    if (invalidValidation.valid) {
        failures.push('vessel-v2/invalid-profile unexpectedly passed validation');
    } else {
        console.log(`- vessel-v2/invalid-profile: blocked (${invalidValidation.errors.join('; ')})`);
    }
}

function runQualityChecks(failures) {
    console.log('\nQuality checks');

    for (const itemType of ITEM_TYPES) {
        const geometry = generateItemMesh(itemType);
        validateAndReport(`dinnerware/${itemType}`, geometry, failures);
        geometry.dispose();
    }

    const vesselGenerator = new VesselMeshGenerator(vesselState.getState());
    const vesselGroup = vesselGenerator.generate();
    const vesselGeometry = groupToMergedGeometry(vesselGroup);
    validateAndReport('vessel/default', vesselGeometry, failures);
    vesselGeometry.dispose();
    disposeGroup(vesselGroup);

    const footlessVesselState = getDefaultVesselState();
    footlessVesselState.sections.foot.enabled = false;
    footlessVesselState.sections.lip.enabled = false;
    footlessVesselState.sections.neck.enabled = false;
    footlessVesselState.sections.shoulder.enabled = false;
    footlessVesselState.sections.waist.enabled = false;
    footlessVesselState.sections.body.flatWall = true;
    const footlessVesselGenerator = new VesselMeshGenerator(footlessVesselState);
    const footlessVesselGroup = footlessVesselGenerator.generate();
    const footlessVesselGeometry = groupToMergedGeometry(footlessVesselGroup);
    validateAndReport('vessel/footless-flat', footlessVesselGeometry, failures);
    footlessVesselGeometry.dispose();
    disposeGroup(footlessVesselGroup);

    runVesselV2Checks(failures);

    const mugData = {
        loaded: false,
        height: 95,
        topDiameter: 80,
        bottomDiameter: 60,
        wallThickness: 2.5,
        wallAngle: 5
    };

    const handleGeometry = generateHandleMesh(DEFAULT_HANDLE_PARAMS, mugData);
    validateAndReport('handle/default', handleGeometry, failures);
    handleGeometry.dispose();

    const castInput = createSimpleCastFormInput();
    const castGenerator = new MoldGenerator();
    const castParts = castGenerator.generate(castInput, cloneParams(), { quality: 'preview' });
    const castFormQualityOptions = {
        weldDecimalPlaces: 5,
        enforceOrientationConsistency: true
    };
    const castFormValidationOptions = {
        qualityOptions: castFormQualityOptions,
        topologyOptions: { checkOrientation: true },
        stlOptions: castFormQualityOptions,
        checkCoplanarOverlap: true
    };

    validateAndReport('cast-form/foot', castParts.foot, failures, castFormValidationOptions);
    castParts.walls.forEach((wall, index) => {
        validateAndReport(`cast-form/wall-${index + 1}`, wall, failures, castFormValidationOptions);
    });

    castParts.foot?.dispose();
    castParts.walls?.forEach((wall) => wall?.dispose());
    castInput.dispose();
}

function runLatencyChecks(failures) {
    console.log('\nLatency checks');

    const simple = createSimpleCastFormInput();
    const complex = createComplexCastFormInput();

    for (const [label, input, quality, budget] of [
        ['preview (simple)', simple, 'preview', BUDGETS.castFormLatencyMs.previewSimple],
        ['preview (complex)', complex, 'preview', BUDGETS.castFormLatencyMs.previewComplex],
        ['export (simple)', simple, 'export', BUDGETS.castFormLatencyMs.exportSimple]
    ]) {
        const timings = measureCastFormLatency(input, quality);
        console.log(`- cast-form ${label}: cold=${timings.cold.toFixed(1)}ms edit=${timings.edit.toFixed(1)}ms cache-hit=${timings.cacheHit.toFixed(1)}ms (cold/edit budget ${budget}ms)`);
        assertLatency(`${label} cold`, timings.cold, budget, failures);
        assertLatency(`${label} edit`, timings.edit, budget, failures);
    }

    simple.dispose();
    complex.dispose();
}

function main() {
    const failures = [];

    console.log('Quality and performance gate');
    console.log(`Budgets: topology degenerate<=${BUDGETS.topology.maxDegenerate}, boundary<=${BUDGETS.topology.maxBoundary}, over2<=${BUDGETS.topology.maxOverConnected}, orient(cast-form)<=${BUDGETS.topology.maxOrientationConflict}`);

    runQualityChecks(failures);
    if (!process.argv.includes('--correctness-only')) runLatencyChecks(failures);

    if (failures.length > 0) {
        console.error('\nGate failed');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
        return;
    }

    console.log('\nGate passed');
}

main();
