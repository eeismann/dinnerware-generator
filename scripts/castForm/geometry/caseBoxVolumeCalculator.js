import {
    DEFAULT_CASE_BOX_PARAMS,
    measureFootFootprint,
    measureWallLaidFlat
} from './caseBoxGenerator.js';
import { computeMoldPartFillVolumeMm3 } from './moldVolumeCalculator.js';

const CUBIC_MILLIMETERS_PER_MILLILITER = 1000;
const formVolumeCache = new WeakMap();
const footMeasurementCache = new WeakMap();
const wallMeasurementCache = new WeakMap();

function getFormVolumeMm3(geometry) {
    if (!formVolumeCache.has(geometry)) {
        formVolumeCache.set(geometry, computeMoldPartFillVolumeMm3(geometry));
    }
    return formVolumeCache.get(geometry);
}

function getFootMeasurement(geometry) {
    if (!footMeasurementCache.has(geometry)) {
        footMeasurementCache.set(geometry, measureFootFootprint(geometry));
    }
    return footMeasurementCache.get(geometry);
}

function getWallMeasurement(geometry, wallCount) {
    let byWallCount = wallMeasurementCache.get(geometry);
    if (!byWallCount) {
        byWallCount = new Map();
        wallMeasurementCache.set(geometry, byWallCount);
    }
    if (!byWallCount.has(wallCount)) {
        byWallCount.set(wallCount, measureWallLaidFlat(geometry, wallCount));
    }
    return byWallCount.get(wallCount);
}

function resolveParams(params) {
    return { ...DEFAULT_CASE_BOX_PARAMS, ...(params || {}) };
}

function calculateSteppedCavityVolumeMm3(pocketArea, interiorArea, interiorHeight, indentDepth) {
    const ledgeHeight = Math.min(Math.max(indentDepth, 0), Math.max(interiorHeight, 0));
    return (
        pocketArea * ledgeHeight
        + interiorArea * Math.max(0, interiorHeight - ledgeHeight)
    );
}

function calculateWallBoxFillMm3(wallGeometry, wallCount, params) {
    const form = getWallMeasurement(wallGeometry, wallCount);
    const pocketArea = 4
        * (form.baseHalfWidth + params.fitClearance)
        * (form.baseHalfLength + params.fitClearance);
    const interiorArea = 4
        * (form.halfWidth + params.gap)
        * (form.halfLength + params.gap);
    const cavityVolume = calculateSteppedCavityVolumeMm3(
        pocketArea,
        interiorArea,
        form.height + params.headspace,
        params.indentDepth
    );
    return Math.max(0, cavityVolume - getFormVolumeMm3(wallGeometry));
}

function calculateCircularBoxFillMm3(formGeometry, params) {
    const form = getFootMeasurement(formGeometry);
    const pocketRadius = form.baseRadius + params.fitClearance;
    const interiorRadius = form.radius + params.gap;
    const cavityVolume = calculateSteppedCavityVolumeMm3(
        Math.PI * pocketRadius ** 2,
        Math.PI * interiorRadius ** 2,
        form.height + params.headspace,
        params.indentDepth
    );
    return Math.max(0, cavityVolume - getFormVolumeMm3(formGeometry));
}

/**
 * Calculate the polymer required to fill every generated master-mold case box
 * to its brim. The generated form displaces material from the stepped box
 * cavity. Split walls use one reusable box but require one pour per wall.
 *
 * @param {{foot?: import('three').BufferGeometry | null, walls?: Array<import('three').BufferGeometry | null>}} parts
 * @param {object} caseBoxParams
 */
export function calculateCaseBoxMaterialVolume(parts = {}, caseBoxParams = {}) {
    const params = resolveParams(caseBoxParams);
    const walls = (parts.walls || []).filter(Boolean);
    const wallCount = walls.length;
    const footMm3 = parts.foot
        ? calculateCircularBoxFillMm3(parts.foot, params)
        : 0;
    const wallEachMm3 = wallCount > 0
        ? (wallCount === 1
            ? calculateCircularBoxFillMm3(walls[0], params)
            : calculateWallBoxFillMm3(walls[0], wallCount, params))
        : 0;
    const wallPartsMm3 = walls.map(() => wallEachMm3);
    const wallsMm3 = wallEachMm3 * wallCount;
    const totalMm3 = footMm3 + wallsMm3;

    return {
        totalMm3,
        totalMl: totalMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        footMm3,
        footMl: footMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        wallsMm3,
        wallsMl: wallsMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        wallEachMm3,
        wallEachMl: wallEachMm3 / CUBIC_MILLIMETERS_PER_MILLILITER,
        wallPartsMm3,
        wallPartsMl: wallPartsMm3.map((volume) => volume / CUBIC_MILLIMETERS_PER_MILLILITER)
    };
}
