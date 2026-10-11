#!/usr/bin/env node
/**
 * Mesh diagnostics runner for baseline print-quality metrics.
 *
 * Usage:
 *   node scripts/geometry/meshDiagnostics.js
 *   node scripts/geometry/meshDiagnostics.js --include-castform
 */

import * as THREE from 'three';
import { ITEM_TYPES } from '../state/projectState.js';
import { generateItemMesh } from './meshGenerator.js';
import vesselState from '../vessel/state/vesselState.js';
import { VesselMeshGenerator } from '../vessel/geometry/vesselMeshGenerator.js';
import { DEFAULT_HANDLE_PARAMS } from '../handle/state/handleState.js';
import { generateHandleMesh } from '../handle/geometry/handleMeshGenerator.js';
import { validateGeometryForPrint, summarizeValidation } from './meshQuality.js';
import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { DEFAULT_PARAMS as DEFAULT_CAST_FORM_PARAMS } from '../castForm/state/castFormDefaults.js';

const includeCastForm = process.argv.includes('--include-castform');

function mergeGroupToGeometry(group) {
    const chunks = [];
    group.updateMatrixWorld(true);

    group.traverse((child) => {
        if (!child.isMesh || !child.geometry) return;

        const geometry = child.geometry.clone();
        geometry.applyMatrix4(child.matrixWorld);
        const nonIndexed = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
        chunks.push(nonIndexed.getAttribute('position').array);
    });

    if (chunks.length === 0) {
        return new THREE.BufferGeometry();
    }

    const totalFloats = chunks.reduce((sum, arr) => sum + arr.length, 0);
    const merged = new Float32Array(totalFloats);

    let offset = 0;
    for (const arr of chunks) {
        merged.set(arr, offset);
        offset += arr.length;
    }

    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(merged, 3));
    return out;
}

function printSection(title) {
    console.log(`\n${title}`);
}

function printResult(name, result) {
    console.log(`- ${name}: ${summarizeValidation(result)}`);
    if (!result.valid) {
        console.log(`  reasons: ${result.errors.join('; ')}`);
    }
}

function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function runDinnerwareDiagnostics() {
    printSection('Dinnerware');

    for (const itemType of ITEM_TYPES) {
        const geometry = generateItemMesh(itemType);
        const result = validateGeometryForPrint(geometry);
        printResult(itemType, result);
    }
}

function runVesselDiagnostics() {
    printSection('Vessel');

    const runVesselCase = (name, configureState = () => {}) => {
        const state = cloneJson(vesselState.getState());
        configureState(state);

        const generator = new VesselMeshGenerator(state);
        const group = generator.generate();
        const mergedGeometry = mergeGroupToGeometry(group);
        const result = validateGeometryForPrint(mergedGeometry);
        printResult(name, result);
    };

    runVesselCase('vessel_default');
    runVesselCase('vessel_collapsed_inner_base', (state) => {
        state.global.wallThickness = 15;
        state.sections.foot.enabled = false;
        state.sections.waist.enabled = false;
        state.sections.shoulder.enabled = false;
        state.sections.neck.enabled = false;
        state.sections.lip.enabled = false;
        state.sections.body.flatWall = true;
        state.sections.body.bottomDiameterLocked = false;
        state.sections.body.bottomDiameter = 30;
        state.sections.body.topDiameter = 40;
    });
}

function runHandleDiagnostics() {
    printSection('Handle');

    const mugData = {
        loaded: false,
        height: 95,
        topDiameter: 80,
        bottomDiameter: 60,
        wallThickness: 2.5,
        wallAngle: 5
    };

    const geometry = generateHandleMesh(DEFAULT_HANDLE_PARAMS, mugData);
    const result = validateGeometryForPrint(geometry);
    printResult('handle_default', result);
}

function runCastFormDiagnostics() {
    printSection('Cast Form');

    const input = new THREE.CylinderGeometry(40, 30, 95, 24, 24, false).toNonIndexed();
    input.translate(0, 95 / 2, 0);

    const generator = new MoldGenerator();
    const params = JSON.parse(JSON.stringify(DEFAULT_CAST_FORM_PARAMS));
    const qualityOptions = {
        weldDecimalPlaces: 5,
        enforceOrientationConsistency: true
    };

    const startedAt = Date.now();
    const parts = generator.generate(input, params);
    const elapsed = Date.now() - startedAt;

    console.log(`- generation_ms: ${elapsed}`);
    printResult('foot', validateGeometryForPrint(parts.foot, qualityOptions));
    parts.walls.forEach((wall, index) => {
        printResult(`wall_${index + 1}`, validateGeometryForPrint(wall, qualityOptions));
    });
}

function run() {
    console.log('Mesh diagnostics baseline');

    runDinnerwareDiagnostics();
    runVesselDiagnostics();
    runHandleDiagnostics();

    if (includeCastForm) {
        runCastFormDiagnostics();
    } else {
        console.log('\nCast Form');
        console.log('- skipped (run with --include-castform)');
    }
}

run();
