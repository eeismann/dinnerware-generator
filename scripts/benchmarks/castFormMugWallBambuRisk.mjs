#!/usr/bin/env node
/**
 * Mug wall slicer-risk diagnostic.
 *
 * This is intentionally different from the slice parity gate: it checks the
 * STL as a slicer sees it, looking for nested closed shells and down-facing
 * feature islands that Bambu Studio reports as floating regions.
 */

import fs from 'fs';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

import { MoldGenerator } from '../castForm/geometry/moldGenerator.js';
import { InputProcessor } from '../castForm/geometry/inputProcessor.js';
import { DEFAULT_PARAMS } from '../castForm/state/castFormDefaults.js';
import { validateGeometryForPrint, summarizeValidation } from '../geometry/meshQuality.js';
import { geometryToBinarySTLBuffer } from '../geometry/stlCore.js';

const DEFAULT_INPUT = '/Users/ethan.eismann/Downloads/Untitled_mug (6).stl';

function readArg(name, fallback = null) {
    const prefix = `--${name}=`;
    const match = process.argv.find((arg) => arg.startsWith(prefix));
    return match ? match.slice(prefix.length) : fallback;
}

function loadStl(path) {
    const data = fs.readFileSync(path);
    const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    return new STLLoader().parse(arrayBuffer);
}

function loadProcessedInput(path) {
    const raw = loadStl(path);
    const processed = InputProcessor.processGeometry(raw);
    if (!processed.geometry) {
        throw new Error(`Could not process input STL: ${processed.errors.join('; ')}`);
    }
    return processed.geometry;
}

function triangleIndices(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = [];

    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            triangles.push([index.getX(i), index.getX(i + 1), index.getX(i + 2)]);
        }
        return triangles;
    }

    for (let i = 0; i < position.count; i += 3) {
        triangles.push([i, i + 1, i + 2]);
    }
    return triangles;
}

function vertexKey(position, vertexIndex, decimalPlaces = 4) {
    const scale = 10 ** decimalPlaces;
    return [
        Math.round(position.getX(vertexIndex) * scale),
        Math.round(position.getY(vertexIndex) * scale),
        Math.round(position.getZ(vertexIndex) * scale)
    ].join(',');
}

function vectorKey(vector, decimalPlaces = 3) {
    const scale = 10 ** decimalPlaces;
    return [
        Math.round(vector.x * scale),
        Math.round(vector.y * scale),
        Math.round(vector.z * scale)
    ].join(',');
}

function buildTriangleAdjacencyFromVertexKeys(triangles, vertexKeys) {
    const edgeMap = new Map();
    const addEdge = (triIndex, keyA, keyB) => {
        const lo = keyA < keyB ? keyA : keyB;
        const hi = keyA < keyB ? keyB : keyA;
        const edgeKey = `${lo}|${hi}`;
        let owners = edgeMap.get(edgeKey);
        if (!owners) {
            owners = [];
            edgeMap.set(edgeKey, owners);
        }
        owners.push(triIndex);
    };

    triangles.forEach((triangle, triIndex) => {
        const keys = triangle.map((vertexIndex) => vertexKeys[vertexIndex]);
        addEdge(triIndex, keys[0], keys[1]);
        addEdge(triIndex, keys[1], keys[2]);
        addEdge(triIndex, keys[2], keys[0]);
    });

    const adjacency = Array.from({ length: triangles.length }, () => []);
    for (const owners of edgeMap.values()) {
        if (owners.length < 2) continue;
        for (let i = 0; i < owners.length; i++) {
            for (let j = i + 1; j < owners.length; j++) {
                adjacency[owners[i]].push(owners[j]);
                adjacency[owners[j]].push(owners[i]);
            }
        }
    }

    return adjacency;
}

function summarizeTriangleComponent(geometry, triangles, members) {
    const position = geometry.getAttribute('position');
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let area = 0;
    let signedVolume = 0;

    for (const triIndex of members) {
        const triangle = triangles[triIndex];
        const vertices = triangle.map((vertexIndex) => new THREE.Vector3(
            position.getX(vertexIndex),
            position.getY(vertexIndex),
            position.getZ(vertexIndex)
        ));

        for (const vertex of vertices) {
            min[0] = Math.min(min[0], vertex.x);
            min[1] = Math.min(min[1], vertex.y);
            min[2] = Math.min(min[2], vertex.z);
            max[0] = Math.max(max[0], vertex.x);
            max[1] = Math.max(max[1], vertex.y);
            max[2] = Math.max(max[2], vertex.z);
        }

        const ab = vertices[1].clone().sub(vertices[0]);
        const ac = vertices[2].clone().sub(vertices[0]);
        area += ab.cross(ac).length() * 0.5;
        signedVolume += vertices[0].dot(vertices[1].clone().cross(vertices[2])) / 6;
    }

    return {
        triangles: members.length,
        area,
        signedVolume,
        absVolume: Math.abs(signedVolume),
        min,
        max,
        size: max.map((value, index) => value - min[index]),
        center: max.map((value, index) => (value + min[index]) * 0.5)
    };
}

function connectedSurfaceComponents(geometry, decimalPlaces = 4) {
    const position = geometry.getAttribute('position');
    const triangles = triangleIndices(geometry);
    const vertexKeys = new Array(position.count);

    for (let i = 0; i < position.count; i++) {
        vertexKeys[i] = vertexKey(position, i, decimalPlaces);
    }

    const adjacency = buildTriangleAdjacencyFromVertexKeys(triangles, vertexKeys);
    const seen = new Uint8Array(triangles.length);
    const components = [];

    for (let i = 0; i < triangles.length; i++) {
        if (seen[i]) continue;
        const stack = [i];
        const members = [];
        seen[i] = 1;

        while (stack.length) {
            const current = stack.pop();
            members.push(current);

            for (const next of adjacency[current]) {
                if (seen[next]) continue;
                seen[next] = 1;
                stack.push(next);
            }
        }

        components.push(summarizeTriangleComponent(geometry, triangles, members));
    }

    return components.sort((a, b) => b.triangles - a.triangles);
}

function collectDownFacingComponents(geometry, options = {}) {
    const {
        normalYThreshold = -0.35,
        minHorizontalArea = 0.0005,
        bedClearance = 0.35,
        decimalPlaces = 3
    } = options;

    geometry.computeBoundingBox();
    const bedY = geometry.boundingBox.min.y;
    const position = geometry.getAttribute('position');
    const sourceTriangles = triangleIndices(geometry);
    const downTriangles = [];
    const downVertexKeys = [];

    for (const triangle of sourceTriangles) {
        const vertices = triangle.map((vertexIndex) => new THREE.Vector3(
            position.getX(vertexIndex),
            position.getY(vertexIndex),
            position.getZ(vertexIndex)
        ));

        const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0]));
        const area2 = normal.length();
        if (area2 <= 1e-9) continue;

        normal.normalize();
        const area = area2 * 0.5;
        const horizontalArea = Math.abs(normal.y) * area;
        const minY = Math.min(vertices[0].y, vertices[1].y, vertices[2].y);

        if (normal.y >= normalYThreshold || minY <= bedY + bedClearance || horizontalArea <= minHorizontalArea) {
            continue;
        }

        const baseIndex = downVertexKeys.length;
        downTriangles.push([baseIndex, baseIndex + 1, baseIndex + 2]);
        downVertexKeys.push(...vertices.map((vertex) => vectorKey(vertex, decimalPlaces)));
    }

    const adjacency = buildTriangleAdjacencyFromVertexKeys(downTriangles, downVertexKeys);
    const seen = new Uint8Array(downTriangles.length);
    const components = [];

    for (let i = 0; i < downTriangles.length; i++) {
        if (seen[i]) continue;
        const stack = [i];
        const members = [];
        seen[i] = 1;

        while (stack.length) {
            const current = stack.pop();
            members.push(current);

            for (const next of adjacency[current]) {
                if (seen[next]) continue;
                seen[next] = 1;
                stack.push(next);
            }
        }

        components.push(summarizeTriangleComponent({
            getAttribute() {
                return {
                    getX(index) {
                        return Number(downVertexKeys[index].split(',')[0]) / (10 ** decimalPlaces);
                    },
                    getY(index) {
                        return Number(downVertexKeys[index].split(',')[1]) / (10 ** decimalPlaces);
                    },
                    getZ(index) {
                        return Number(downVertexKeys[index].split(',')[2]) / (10 ** decimalPlaces);
                    }
                };
            }
        }, downTriangles, members));
    }

    return components.sort((a, b) => b.area - a.area);
}

function roundList(values, decimalPlaces = 3) {
    return values.map((value) => Number(value.toFixed(decimalPlaces)));
}

function printComponents(label, components, count = 8) {
    console.log(`${label}: ${components.length}`);
    components.slice(0, count).forEach((component, index) => {
        console.log(`  ${index}: triangles=${component.triangles} area=${component.area.toFixed(2)} volume=${component.signedVolume.toFixed(2)} min=${roundList(component.min)} max=${roundList(component.max)} size=${roundList(component.size)}`);
    });
}

function analyzeGeometry(label, geometry) {
    geometry.computeBoundingBox();
    const validation = validateGeometryForPrint(geometry, {
        weldDecimalPlaces: 5,
        enforceOrientationConsistency: true
    });
    const surfaceComponents = connectedSurfaceComponents(geometry, 5);
    const downFacing = collectDownFacingComponents(geometry);

    console.log(`\n${label}`);
    console.log(`validation: ${summarizeValidation(validation)}`);
    console.log(`bbox: min=${roundList(geometry.boundingBox.min.toArray())} max=${roundList(geometry.boundingBox.max.toArray())}`);
    printComponents('surface components', surfaceComponents, 6);
    printComponents('down-facing components', downFacing.filter((component) => component.area >= 5), 12);

    return { validation, surfaceComponents, downFacing };
}

function withWallIndexSuffix(path, index, total) {
    if (total <= 1) return path;
    if (path.includes('{index}')) {
        return path.replace('{index}', String(index + 1));
    }

    const dotIndex = path.toLowerCase().lastIndexOf('.stl');
    if (dotIndex === -1) {
        return `${path}_wall_${index + 1}.stl`;
    }

    return `${path.slice(0, dotIndex)}_wall_${index + 1}${path.slice(dotIndex)}`;
}

function generateWallsFromInput(inputPath, options = {}) {
    const input = loadProcessedInput(inputPath);
    const params = JSON.parse(JSON.stringify(DEFAULT_PARAMS));

    if (Number.isFinite(options.wallCount)) {
        params.mold.wallCount = options.wallCount;
    }
    if (Number.isFinite(options.cornerCutWidth)) {
        params.mold.cornerCutWidth = options.cornerCutWidth;
    }

    const generator = new MoldGenerator();
    const result = generator.generate(input, params, {
        quality: 'export',
        natchesEnabled: false
    });

    if (Number.isFinite(options.wallCount) && result.walls.length !== options.wallCount) {
        throw new Error(`Generated ${result.walls.length} walls, expected ${options.wallCount}`);
    }

    return { walls: result.walls, cleanup: () => {
        result.foot?.dispose?.();
        result.walls?.forEach((part) => part?.dispose?.());
        input.dispose?.();
    } };
}

function main() {
    const inputPath = readArg('input', DEFAULT_INPUT);
    const existingPath = readArg('existing');
    const exportPath = readArg('export');
    const wallCount = Math.max(1, Math.min(4, Math.round(Number(readArg('wall-count', '3')) || 3)));
    const cornerCutArg = readArg('corner-cut');
    const cornerCutWidth = cornerCutArg === null ? NaN : Number(cornerCutArg);

    console.log('Cast-form mug wall Bambu-risk diagnostic');
    console.log(`input: ${inputPath}`);
    console.log(`wall-count: ${wallCount}`);
    if (Number.isFinite(cornerCutWidth)) {
        console.log(`corner-cut-width: ${cornerCutWidth}`);
    }
    console.log('registration keys: off');

    if (existingPath) {
        analyzeGeometry(`existing ${existingPath}`, loadStl(existingPath));
    }

    const generated = generateWallsFromInput(inputPath, {
        wallCount,
        cornerCutWidth: Number.isFinite(cornerCutWidth) ? cornerCutWidth : undefined
    });

    generated.walls.forEach((wall, index) => {
        analyzeGeometry(`generated wall ${index + 1}/${generated.walls.length}`, wall);
    });

    if (exportPath) {
        generated.walls.forEach((wall, index) => {
            const wallExportPath = withWallIndexSuffix(exportPath, index, generated.walls.length);
            fs.writeFileSync(wallExportPath, Buffer.from(geometryToBinarySTLBuffer(wall, {
                validationMode: 'off'
            })));
            console.log(`exported: ${wallExportPath}`);
        });
    }

    generated.cleanup();
}

main();
