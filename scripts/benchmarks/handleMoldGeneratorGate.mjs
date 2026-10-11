import * as THREE from 'three';
import { generateHandleMesh } from '../handle/geometry/handleMeshGenerator.js';
import { generateHandleMoldPackage, disposeHandleMoldPackage } from '../handle/mold/handleMoldGenerator.js';
import { createHandleMoldPackageForExport } from '../handle/mold/handleMoldSTLExporter.js';
import {
    calculateMoldExplodeOffsets,
    calculateMoldFitDiagnostics,
    getMoldConstructionPartPosition,
    isMoldConstructionPartVisible,
    mergeMoldConstructionViewSettings,
    transformProductProofGeometryToMoldSpace
} from '../handle/mold/handleMoldConstructionView.js';
import { validateGeometryForPrint, summarizeValidation } from '../geometry/meshQuality.js';

const BASE_PARAMS = {
    handleProtrusion: 35,
    handleWidth: 25,
    crossSectionType: 'oval',
    crossSectionWidth: 10,
    crossSectionHeight: 20,
    crossSectionCornerRadius: 3,
    topAttachmentHeight: 85,
    bottomAttachmentHeight: 15,
    attachmentRadius: 0,
    upperCornerRadius: 15,
    lowerCornerRadius: 15,
    verticalArmAngle: 0
};

const STRAIGHT_MUG = {
    loaded: true,
    height: 100,
    topDiameter: 80,
    bottomDiameter: 80,
    wallThickness: 2.5,
    wallAngle: 0
};

const TAPERED_MUG = {
    loaded: true,
    height: 100,
    topDiameter: 90,
    bottomDiameter: 65,
    wallThickness: 2.5,
    wallAngle: 7
};

const CASES = [
    {
        name: 'dura-reference',
        params: {
            ...BASE_PARAMS,
            handleProtrusion: 30,
            handleWidth: 25,
            topAttachmentHeight: 90,
            bottomAttachmentHeight: 10
        },
        mugData: STRAIGHT_MUG,
        expected: {
            proof: [35, 90, 20],
            handleMold: [70, 123.6, 11.8],
            wallA: [57, 187.6, 31.5],
            wallB: [57, 187.6, 31.5],
            bottom: [114, 187.6, 6],
            plasterVolumeL: 0.57,
            attachmentSlopeMinDegrees: 0,
            attachmentSlopeMaxDegrees: 0.01
        }
    },
    {
        name: 'tapered-mug-sloped-attachment',
        params: {
            ...BASE_PARAMS,
            handleProtrusion: 35,
            verticalArmAngle: 7
        },
        mugData: TAPERED_MUG,
        expected: {
            attachmentSlopeMinDegrees: 5,
            attachmentSlopeMaxDegrees: 9
        }
    },
    {
        name: 'reverse-taper-stl-float-mug',
        params: {
            ...BASE_PARAMS,
            verticalArmAngle: 0
        },
        mugData: {
            loaded: true,
            height: 100,
            topDiameter: 90.00000366394266,
            bottomDiameter: 191.99287276550854,
            wallThickness: 2.5000035756649552,
            wallAngle: -27.01996038539878
        },
        expected: {
            attachmentSlopeMinDegrees: -28,
            attachmentSlopeMaxDegrees: -26
        }
    },
    {
        name: 'reverse-taper-exact-fitted-angle',
        params: {
            ...BASE_PARAMS,
            verticalArmAngle: -28.451474596184287
        },
        mugData: {
            loaded: true,
            height: 100,
            topDiameter: 90.00000366394266,
            bottomDiameter: 191.99287276550854,
            wallThickness: 2.5000035756649552,
            wallAngle: -27.01996038539878
        },
        expected: {
            attachmentSlopeMinDegrees: -28,
            attachmentSlopeMaxDegrees: -26
        }
    },
    {
        name: 'reverse-taper-profile-fitted-angle',
        params: {
            ...BASE_PARAMS,
            verticalArmAngle: -28.451474596184287
        },
        mugData: {
            loaded: true,
            height: 100,
            topDiameter: 90.00000366394266,
            bottomDiameter: 191.99287276550854,
            wallThickness: 2.5000035756649552,
            wallAngle: -27.01996038539878,
            radiusProfile: [
                { y: 0, radius: 93.852841 },
                { y: 8, radius: 95.996436 },
                { y: 10.5, radius: 93.496436 },
                { y: 100, radius: 45.000002 }
            ]
        },
        expected: {
            attachmentSlopeMinDegrees: -29,
            attachmentSlopeMaxDegrees: -28
        }
    },
    {
        name: 'filleted-attachment-endpoint',
        params: {
            ...BASE_PARAMS,
            attachmentRadius: 8
        },
        mugData: {
            ...STRAIGHT_MUG,
            height: 95,
            topDiameter: 80,
            bottomDiameter: 60
        }
    },
    {
        name: 'min-parameter-handle',
        params: {
            ...BASE_PARAMS,
            handleProtrusion: 20,
            handleWidth: 15,
            crossSectionWidth: 8,
            crossSectionHeight: 8,
            topAttachmentHeight: 30,
            bottomAttachmentHeight: 5,
            upperCornerRadius: 5,
            lowerCornerRadius: 5,
            attachmentRadius: 0
        },
        mugData: STRAIGHT_MUG
    },
    {
        name: 'max-parameter-handle',
        params: {
            ...BASE_PARAMS,
            handleProtrusion: 80,
            handleWidth: 50,
            crossSectionWidth: 30,
            crossSectionHeight: 25,
            topAttachmentHeight: 120,
            bottomAttachmentHeight: 5,
            upperCornerRadius: 40,
            lowerCornerRadius: 40,
            attachmentRadius: 0,
            verticalArmAngle: 30
        },
        mugData: {
            ...TAPERED_MUG,
            height: 130,
            topDiameter: 110,
            bottomDiameter: 70
        }
    }
];

function getCase(name) {
    const testCase = CASES.find((item) => item.name === name);
    assert(testCase, `missing test case ${name}`);
    return testCase;
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertNear(actual, expected, tolerance, message) {
    assert(
        Math.abs(actual - expected) <= tolerance,
        `${message}: expected ${expected} +/- ${tolerance}, got ${actual}`
    );
}

function getSize(geometry) {
    geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    geometry.boundingBox.getSize(size);
    return size;
}

function getTriangleCount(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    return Math.floor((index ? index.count : position.count) / 3);
}

function forEachTriangle(geometry, callback) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const readVertex = (vertexIndex) => new THREE.Vector3(
        position.getX(vertexIndex),
        position.getY(vertexIndex),
        position.getZ(vertexIndex)
    );

    if (index) {
        for (let i = 0; i < index.count; i += 3) {
            callback(
                readVertex(index.getX(i)),
                readVertex(index.getX(i + 1)),
                readVertex(index.getX(i + 2))
            );
        }
        return;
    }

    for (let i = 0; i < position.count; i += 3) {
        callback(readVertex(i), readVertex(i + 1), readVertex(i + 2));
    }
}

function triangleArea2(a, b, c) {
    return b.clone().sub(a).cross(c.clone().sub(a)).length();
}

function assertFiniteGeometry(geometry, label) {
    const position = geometry.getAttribute('position');
    assert(position?.count > 0, `${label} has no positions`);

    for (let i = 0; i < position.array.length; i++) {
        assert(Number.isFinite(position.array[i]), `${label} contains non-finite vertex data`);
    }
}

function validatePart(geometry, label) {
    assertFiniteGeometry(geometry, label);
    const result = validateGeometryForPrint(geometry, {
        weldDecimalPlaces: 4,
        enforceOrientationConsistency: true
    });
    assert(result.valid, `${label} failed validation: ${summarizeValidation(result)}`);
}

function createMoldSpaceProof(pkg) {
    return transformProductProofGeometryToMoldSpace(pkg.parts.proof, pkg.layout);
}

function assertAttachmentSurfaceCovered(pkg, key, label) {
    const { footprint } = pkg.layout;
    const surface = footprint.attachmentSurfaces[key];
    const radii = footprint.attachmentWellRadii[key];
    const center = key === 'top' ? footprint.wellCenters[0] : footprint.wellCenters[1];

    assert(surface.vertexCount > 0, `${label}: no terminal face vertices measured`);
    assert(
        radii.radiusY >= surface.radiusY + footprint.attachmentPadding - 1e-6,
        `${label}: well radiusY does not surround terminal face`
    );
    assert(
        radii.radiusZ >= surface.radiusZ + footprint.attachmentPadding - 1e-6,
        `${label}: well radiusZ does not surround terminal face`
    );

    const proof = createMoldSpaceProof(pkg);

    try {
        proof.computeBoundingBox();
        const tolerance = Math.max(0.08, pkg.layout.handleDepth * 0.003);
        const position = proof.getAttribute('position');
        let checked = 0;

        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            if (x < surface.minX - tolerance || x > surface.maxX + tolerance) continue;

            const y = position.getY(i);
            if (y < surface.minY - tolerance || y > surface.maxY + tolerance) continue;

            const closerToTop = Math.abs(y - footprint.wellCenters[0].y) <= Math.abs(y - footprint.wellCenters[1].y);
            if ((key === 'top') !== closerToTop) continue;

            const z = position.getZ(i);
            const dy = y - center.y;
            const dz = z - surface.centerZ;
            const normalized =
                (dy * dy) / (radii.radiusY * radii.radiusY)
                + (dz * dz) / (radii.radiusZ * radii.radiusZ);

            assert(normalized <= 1 + 1e-6, `${label}: terminal face vertex falls outside well envelope`);
            checked++;
        }

        assert(checked > 0, `${label}: terminal face coverage checked no vertices`);
    } finally {
        proof.dispose();
    }
}

function getAttachmentBoundaryEnvelope(footprint, key) {
    const attachmentRadii = footprint.attachmentWellRadii[key];
    return {
        x: footprint.attachmentSideX,
        radiusY: Math.max(footprint.footprintRadius, attachmentRadii.radiusY),
        radiusZ: Math.max(footprint.footprintRadius, attachmentRadii.radiusZ)
    };
}

function sampleAttachmentBoundaryProfileX(profile, y, fallbackX) {
    if (!profile?.samples?.length || y < profile.minY || y > profile.maxY) {
        return fallbackX;
    }

    const samples = profile.samples;
    if (y <= samples[0].y) return samples[0].x;

    for (let i = 0; i < samples.length - 1; i++) {
        const current = samples[i];
        const next = samples[i + 1];
        if (y > next.y) continue;

        const t = (y - current.y) / Math.max(1e-6, next.y - current.y);
        const interpolated = current.x + (next.x - current.x) * t;
        return Math.max(interpolated, current.x, next.x);
    }

    return samples[samples.length - 1].x;
}

function assertAttachmentEndpointCaptured(pkg, key, label) {
    const { footprint } = pkg.layout;
    const surface = footprint.attachmentSurfaces[key];
    const center = key === 'top' ? footprint.wellCenters[0] : footprint.wellCenters[1];
    const proof = createMoldSpaceProof(pkg);
    const position = proof.getAttribute('position');
    const captureDepthX = footprint.attachmentCaptureDepthX;
    const captureRadiusY = footprint.attachmentCaptureRadiusY;
    const centerX = footprint.attachmentCenters?.[key]?.x ?? surface.centerX;
    let checked = 0;
    let contactVertices = 0;

    assert(
        footprint.wellStartX >= surface.maxX - 1e-6,
        `${label}: fill throat should not start behind its attachment boundary`
    );

    try {
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            if (Math.abs(x - centerX) > captureDepthX + 1e-6) continue;

            const y = position.getY(i);
            if (Math.abs(y - center.y) > captureRadiusY + 1e-6) continue;

            const closerToTop = Math.abs(y - footprint.wellCenters[0].y) <= Math.abs(y - footprint.wellCenters[1].y);
            if ((key === 'top') !== closerToTop) continue;

            const z = position.getZ(i);
            const envelope = getAttachmentBoundaryEnvelope(footprint, key);
            const boundaryX = sampleAttachmentBoundaryProfileX(
                surface.boundaryProfile,
                y,
                centerX
            );
            const dy = y - center.y;
            const dz = z - surface.centerZ;
            const normalized =
                (dy * dy) / (envelope.radiusY * envelope.radiusY)
                + (dz * dz) / (envelope.radiusZ * envelope.radiusZ);

            assert(
                normalized <= 1 + 1e-6,
                `${label}: projected attachment shoulder falls outside the boundary fill face`
            );
            assert(
                boundaryX >= x - 0.08,
                `${label}: sloped boundary throat falls behind the handle endpoint`
            );
            if (Math.abs(boundaryX - x) <= 0.12) {
                contactVertices++;
            }
            checked++;
        }

        assert(checked > 0, `${label}: projected attachment shoulder coverage checked no vertices`);
        assert(contactVertices > 0, `${label}: sloped boundary throat should touch the endpoint silhouette`);
    } finally {
        proof.dispose();
    }
}

function createEdgeUseMap(geometry, decimalPlaces = 4) {
    const position = geometry.getAttribute('position');
    const scale = 10 ** decimalPlaces;
    const pointKey = (point) => [
        Math.round(point.x * scale),
        Math.round(point.y * scale),
        Math.round(point.z * scale)
    ].join(',');
    const readVertex = (index) => new THREE.Vector3(
        position.getX(index),
        position.getY(index),
        position.getZ(index)
    );
    const edgeKey = (aKey, bKey) => (
        aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
    );
    const edgeMap = new Map();
    const addUse = (a, b, c) => {
        const aKey = pointKey(a);
        const bKey = pointKey(b);
        if (aKey === bKey) return;

        const key = edgeKey(aKey, bKey);
        if (!edgeMap.has(key)) edgeMap.set(key, []);
        edgeMap.get(key).push({ a, b, third: c });
    };

    forEachTriangle(geometry, (a, b, c) => {
        addUse(a, b, c);
        addUse(b, c, a);
        addUse(c, a, b);
    });

    return {
        edgeMap,
        getEdgeUses(a, b) {
            return edgeMap.get(edgeKey(pointKey(a), pointKey(b))) || [];
        }
    };
}

function assertAttachmentLoopUniformlyConnected(pkg, key, label) {
    const loop = pkg.layout.footprint.attachmentLoops?.[key] || [];
    const planeZ = pkg.layout.bisection?.planeZ ?? 0;
    const keepPositive = (pkg.layout.bisection?.keep ?? 'positive') === 'positive';
    const edgeUses = createEdgeUseMap(pkg.parts.handleMold, 4);
    let checkedEdges = 0;
    let fillConnectedEdges = 0;

    assert(loop.length >= 3, `${label}: missing measured attachment connection loop`);

    for (let i = 0; i < loop.length; i++) {
        const a = loop[i];
        const b = loop[(i + 1) % loop.length];
        const retained = keepPositive
            ? a.z > planeZ + 1e-4 && b.z > planeZ + 1e-4
            : a.z < planeZ - 1e-4 && b.z < planeZ - 1e-4;
        if (!retained) continue;

        const uses = edgeUses.getEdgeUses(a, b);
        assert(
            uses.length === 2,
            `${label}: attachment loop edge should be welded to exactly two faces, got ${uses.length}`
        );

        const edgeMaxX = Math.max(a.x, b.x);
        assert(
            uses.some((use) => use.third.x > edgeMaxX + 0.12),
            `${label}: attachment loop edge is not connected into the fill throat`
        );
        checkedEdges++;
        fillConnectedEdges++;
    }

    assert(checkedEdges > 0, `${label}: no retained attachment loop edges were checked`);
    assert(fillConnectedEdges === checkedEdges, `${label}: not every endpoint edge reaches the fill throat`);
}

function assertAttachmentWellProfileCoversLoop(pkg, key, label) {
    const { footprint } = pkg.layout;
    const profile = footprint.attachmentWellProfiles?.[key];
    const surface = footprint.attachmentSurfaces[key];
    const loop = footprint.attachmentLoops?.[key] || [];
    const padding = footprint.attachmentPadding;

    assert(profile, `${label}: missing independent well profile`);
    assert(loop.length >= 3, `${label}: missing attachment loop for well profile`);

    const loopBounds = loop.reduce((bounds, point) => ({
        minY: Math.min(bounds.minY, point.y),
        maxY: Math.max(bounds.maxY, point.y),
        minZ: Math.min(bounds.minZ, point.z),
        maxZ: Math.max(bounds.maxZ, point.z)
    }), {
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity
    });
    const loopRadiusY = Math.max(
        profile.centerY - loopBounds.minY,
        loopBounds.maxY - profile.centerY
    );
    const loopRadiusZ = Math.max(
        profile.centerZ - loopBounds.minZ,
        loopBounds.maxZ - profile.centerZ
    );

    assertNear(profile.loopRadiusY, loopRadiusY, 1e-6, `${label}: profile loop radiusY mismatch`);
    assertNear(profile.loopRadiusZ, loopRadiusZ, 1e-6, `${label}: profile loop radiusZ mismatch`);
    assert(
        profile.radiusY >= surface.radiusY + padding - 1e-6,
        `${label}: well profile is not tall enough for attachment surface`
    );
    assert(
        profile.radiusZ >= surface.radiusZ + padding - 1e-6,
        `${label}: well profile is not wide enough for attachment surface`
    );

    loop.forEach((point) => {
        const normalized =
            ((point.y - profile.centerY) ** 2) / (profile.radiusY ** 2)
            + ((point.z - profile.centerZ) ** 2) / (profile.radiusZ ** 2);
        assert(normalized <= 1 + 1e-6, `${label}: endpoint loop falls outside its own well profile`);
    });
}

function assertWellWallAssemblyDatum(pkg, label) {
    const { layout } = pkg;
    const contact = layout.wallContact;
    const tolerance = 1e-6;

    assert(contact, `${label}: missing well-to-wall assembly datum`);
    assert(contact.side === 'positiveX', `${label}: expected positive-X wall contact side`);
    assertNear(
        contact.wallInnerFaceX,
        layout.footprint.wellEndX,
        tolerance,
        `${label}: wall inner face should land on the well terminal plane`
    );
    assertNear(
        contact.wellTerminalX,
        layout.footprint.wellEndX,
        tolerance,
        `${label}: datum terminal should track the measured well end`
    );
    assertNear(
        contact.wallOuterFaceX - contact.wallInnerFaceX,
        layout.wallThickness,
        tolerance,
        `${label}: contact wall stock should equal the solved wall thickness`
    );
    assertNear(
        layout.boxes.bottom.max.x - layout.footprint.wellEndX,
        layout.wallThickness,
        tolerance,
        `${label}: bottom plate should leave exactly one wall thickness outside the wells`
    );
    assertNear(
        layout.boxes.wallB.max.x - layout.wallThickness,
        layout.footprint.wellEndX,
        tolerance,
        `${label}: WallB inner rail should be adjacent to the wells`
    );
    assertNear(
        layout.boxes.handleMold.max.x,
        layout.footprint.wellEndX,
        tolerance,
        `${label}: handle mold box should terminate at the well-wall datum`
    );
}

function assertContactWallDoesNotInvadeWells(pkg, label) {
    const { layout } = pkg;
    const contact = layout.wallContact;
    const wall = contact.side === 'positiveX' ? pkg.parts.wallB : pkg.parts.wallA;
    const position = wall.getAttribute('position');
    const profiles = [
        layout.footprint.attachmentWellProfiles.top,
        layout.footprint.attachmentWellProfiles.bottom
    ];
    let checked = 0;
    let minContactX = Infinity;

    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        const z = position.getZ(i);
        const withinAWell = profiles.some((profile) => (
            Math.abs(y - profile.centerY) <= profile.radiusY + 1
            && z >= layout.options.base.wallOverlap - 0.5
            && z <= layout.wallHeight + 0.5
        ));

        if (!withinAWell) continue;

        checked++;
        minContactX = Math.min(minContactX, position.getX(i));
    }

    assert(checked > 0, `${label}: contact wall vertices were not sampled near the wells`);
    assert(
        minContactX >= contact.wallInnerFaceX - 1,
        `${label}: contact wall intrudes too far through the well terminal plane`
    );
}

function distanceFromCircleToRect(center, radius, rect) {
    const dx = Math.max(rect.minX - center.x, 0, center.x - rect.maxX);
    const dy = Math.max(rect.minY - center.y, 0, center.y - rect.maxY);
    return Math.hypot(dx, dy) - radius;
}

function assertHasVertexNear(geometry, target, tolerance, message) {
    const position = geometry.getAttribute('position');

    for (let i = 0; i < position.count; i++) {
        const dx = position.getX(i) - target.x;
        const dy = position.getY(i) - target.y;
        const dz = position.getZ(i) - target.z;
        if (Math.hypot(dx, dy, dz) <= tolerance) {
            return;
        }
    }

    throw new Error(message);
}

function countVerticesMatching(geometry, predicate) {
    const position = geometry.getAttribute('position');
    let count = 0;

    for (let i = 0; i < position.count; i++) {
        if (predicate(
            position.getX(i),
            position.getY(i),
            position.getZ(i)
        )) {
            count++;
        }
    }

    return count;
}

function assertReceiverHoleGeometry(pkg, point, label) {
    const wall = pkg.parts[point.wallKey];
    const footerHeight = pkg.layout.wallPlateInterlock.footerHeight;
    const ringVertices = countVerticesMatching(wall, (x, y, z) => {
        const distance = Math.hypot(x - point.center.x, y - point.center.y);
        return z >= -0.01
            && z <= footerHeight + 0.01
            && Math.abs(distance - point.radius) <= 0.08;
    });

    assert(ringVertices >= 12, `${label}: receiver hole ring was not generated for ${point.wallKey}:${point.role}`);
}

function assertBottomKeyGeometry(pkg, point, label) {
    const bottom = pkg.parts.bottom;
    const interlock = pkg.layout.wallPlateInterlock;
    const keyTopZ = pkg.layout.boxes.bottom.max.z;
    const topVertices = countVerticesMatching(bottom, (x, y, z) => {
        const distance = Math.hypot(x - point.center.x, y - point.center.y);
        return Math.abs(z - keyTopZ) <= 0.01
            && distance <= interlock.keyRadius + 0.08;
    });

    assert(topVertices >= 8, `${label}: bottom key was not generated at ${point.wallKey}:${point.role}`);
}

function assertHoleWebClearance(pkg, point, label) {
    const interlock = pkg.layout.wallPlateInterlock;
    const wall = interlock.walls[point.wallKey];
    const clearances = Object.entries(wall.webs)
        .filter(([, rect]) => rect && typeof rect.minX === 'number')
        .map(([name, rect]) => ({
            name,
            clearance: distanceFromCircleToRect(point.center, point.radius, rect)
        }));
    const min = clearances.reduce((best, item) => (
        item.clearance < best.clearance ? item : best
    ), clearances[0]);

    assert(
        min.clearance >= interlock.minimumHoleWebClearance - 1e-6,
        `${label}: ${point.wallKey}:${point.role} overlaps or crowds ${min.name}; clearance ${min.clearance}`
    );
}

function assertCenterBayClear(pkg, label) {
    const bay = pkg.layout.handleClearanceBay;
    assert(bay, `${label}: missing handle/former keep-out bay`);

    ['wallA', 'wallB'].forEach((key) => {
        const invadingVertices = countVerticesMatching(pkg.parts[key], (x, y, z) => (
            x > bay.minX
            && x < bay.maxX
            && y > bay.minY
            && y < bay.maxY
            && z > bay.minZ + 0.05
        ));

        assert(invadingVertices === 0, `${label}:${key} generated wall geometry in the handle/former bay`);
    });
}

function pointInsideRect(x, y, rect, tolerance = 0) {
    return x >= rect.minX - tolerance
        && x <= rect.maxX + tolerance
        && y >= rect.minY - tolerance
        && y <= rect.maxY + tolerance;
}

function getStraightWallWebOutlinePoints(webs, wallKey) {
    const { sideWeb, bottomWeb, topWeb } = webs;

    if (wallKey === 'wallA') {
        return [
            new THREE.Vector2(sideWeb.minX, bottomWeb.minY),
            new THREE.Vector2(bottomWeb.maxX, bottomWeb.minY),
            new THREE.Vector2(bottomWeb.maxX, bottomWeb.maxY),
            new THREE.Vector2(sideWeb.maxX, bottomWeb.maxY),
            new THREE.Vector2(sideWeb.maxX, topWeb.minY),
            new THREE.Vector2(topWeb.maxX, topWeb.minY),
            new THREE.Vector2(topWeb.maxX, topWeb.maxY),
            new THREE.Vector2(sideWeb.minX, topWeb.maxY)
        ];
    }

    return [
        new THREE.Vector2(bottomWeb.minX, bottomWeb.minY),
        new THREE.Vector2(bottomWeb.maxX, bottomWeb.minY),
        new THREE.Vector2(topWeb.maxX, topWeb.maxY),
        new THREE.Vector2(topWeb.minX, topWeb.maxY),
        new THREE.Vector2(topWeb.minX, topWeb.minY),
        new THREE.Vector2(sideWeb.minX, topWeb.minY),
        new THREE.Vector2(sideWeb.minX, bottomWeb.maxY),
        new THREE.Vector2(bottomWeb.minX, bottomWeb.maxY)
    ];
}

function assertStraightWallWebs(pkg, wallKey, label) {
    const wall = pkg.parts[wallKey];
    const interlock = pkg.layout.wallPlateInterlock;
    const webs = Object.entries(interlock.walls[wallKey].webs)
        .filter(([, rect]) => rect && Number.isFinite(rect.minX));
    const outlinePoints = getStraightWallWebOutlinePoints(interlock.walls[wallKey].webs, wallKey);

    assert(
        interlock.baseCurveHeight === undefined && interlock.baseCurveReach === undefined,
        `${label}:${wallKey} should not carry base-curve layout fields`
    );

    const footerHeight = interlock.footerHeight;
    const webBaseZ = Math.max(0, footerHeight - 0.05);

    [webBaseZ, pkg.layout.wallHeight].forEach((z) => {
        outlinePoints.forEach((point) => {
            assertHasVertexNear(
                wall,
                new THREE.Vector3(point.x, point.y, z),
                0.08,
                `${label}:${wallKey} should be a straight U-shaped web seated in the footer`
            );
        });
    });

    const position = wall.getAttribute('position');
    let checked = 0;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);

        if (z <= footerHeight + 0.05 || z > pkg.layout.wallHeight + 0.05) continue;

        checked++;
        assert(
            webs.some(([, rect]) => pointInsideRect(x, y, rect, 0.06)),
            `${label}:${wallKey} contains a flared wall vertex outside the straight web footprint`
        );
    }

    assert(
        checked > 0,
        `${label}:${wallKey} did not expose wall web vertices above the footer for straightness checks`
    );
}

function assertHandleMoldDirectWallAdjacency(pkg, label) {
    const { layout } = pkg;
    const contact = layout.wallContact;
    const wallKey = contact.side === 'positiveX' ? 'wallB' : 'wallA';
    const contactWall = pkg.parts[wallKey];
    const sideWeb = layout.wallPlateInterlock.walls[wallKey].webs.sideWeb;
    const former = pkg.parts.handleMold;
    former.computeBoundingBox();

    const formerContactX = contact.side === 'positiveX'
        ? former.boundingBox.max.x
        : former.boundingBox.min.x;

    assertNear(
        formerContactX,
        contact.wallInnerFaceX,
        0.05,
        `${label}: handle mold should sit directly adjacent to the contact wall`
    );

    const contactVertices = countVerticesMatching(contactWall, (x, y, z) => (
        Math.abs(x - contact.wallInnerFaceX) <= 0.02
        && y >= sideWeb.minY - 0.02
        && y <= sideWeb.maxY + 0.02
        && z >= -0.02
        && z <= layout.wallHeight + 0.02
    ));

    assert(
        contactVertices >= 4,
        `${label}: contact wall should expose a straight face at the handle mold datum`
    );
}

function assertWallPlateInterlock(pkg, label) {
    const interlock = pkg.layout.wallPlateInterlock;
    assert(interlock, `${label}: missing shared wall/plate interlock layout`);
    assert(interlock.points.length === 8, `${label}: expected eight wall/plate registration points`);

    ['wallA', 'wallB'].forEach((wallKey) => {
        assert(
            interlock.points.filter((point) => point.wallKey === wallKey).length === 4,
            `${label}:${wallKey} should have four receiver holes`
        );
    });

    interlock.points.forEach((point) => {
        assertReceiverHoleGeometry(pkg, point, label);
        assertBottomKeyGeometry(pkg, point, label);
        assertHoleWebClearance(pkg, point, label);
    });

    assertCenterBayClear(pkg, label);
    assertStraightWallWebs(pkg, 'wallA', label);
    assertStraightWallWebs(pkg, 'wallB', label);
    assertHandleMoldDirectWallAdjacency(pkg, label);
}

function assertFormerBisected(pkg, label) {
    const former = pkg.parts.handleMold;
    const proof = createMoldSpaceProof(pkg);
    const splitPlaneZ = pkg.layout.bisection?.planeZ ?? 0;
    const keepPositive = (pkg.layout.bisection?.keep ?? 'positive') === 'positive';
    const tolerance = 0.003;

    try {
        former.computeBoundingBox();
        proof.computeBoundingBox();

        if (keepPositive) {
            assert(
                former.boundingBox.min.z >= splitPlaneZ - tolerance,
                `${label}: handle mold should remove the negative half`
            );
            assertNear(
                former.boundingBox.min.z,
                splitPlaneZ,
                0.01,
                `${label}: handle mold should start on the split plane`
            );
            assert(
                former.boundingBox.max.z > proof.boundingBox.max.z,
                `${label}: attachment wells should add stock beyond the retained proof half`
            );
        } else {
            assert(
                former.boundingBox.max.z <= splitPlaneZ + tolerance,
                `${label}: handle mold should remove the positive half`
            );
            assertNear(
                former.boundingBox.max.z,
                splitPlaneZ,
                0.01,
                `${label}: handle mold should end on the split plane`
            );
            assert(
                former.boundingBox.min.z < proof.boundingBox.min.z,
                `${label}: attachment wells should add stock beyond the retained proof half`
            );
        }
    } finally {
        proof.dispose();
    }

    let splitPlaneVertices = 0;
    let splitCapTriangles = 0;
    const position = former.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
        const z = position.getZ(i);
        if (keepPositive) {
            assert(z >= splitPlaneZ - tolerance, `${label}: found discarded-side vertex below split plane`);
        } else {
            assert(z <= splitPlaneZ + tolerance, `${label}: found discarded-side vertex above split plane`);
        }

        if (Math.abs(z - splitPlaneZ) <= tolerance) {
            splitPlaneVertices++;
        }
    }

    forEachTriangle(former, (a, b, c) => {
        const onSplitPlane =
            Math.abs(a.z - splitPlaneZ) <= tolerance
            && Math.abs(b.z - splitPlaneZ) <= tolerance
            && Math.abs(c.z - splitPlaneZ) <= tolerance;

        if (onSplitPlane && triangleArea2(a, b, c) > 1e-4) {
            splitCapTriangles++;
        }
    });

    assert(splitPlaneVertices > 0, `${label}: bisection should create vertices on the split plane`);
    assert(splitCapTriangles > 0, `${label}: bisection should cap the flat split face`);
}

function assertRetainedHandleHalfWidth(pkg, label) {
    const proof = createMoldSpaceProof(pkg);
    const former = pkg.parts.handleMold;
    const splitPlaneZ = pkg.layout.bisection?.planeZ ?? 0;
    const keepPositive = (pkg.layout.bisection?.keep ?? 'positive') === 'positive';

    try {
        proof.computeBoundingBox();
        former.computeBoundingBox();

        const fullHandleWidth = proof.boundingBox.max.z - proof.boundingBox.min.z;
        const retainedHandleWidth = keepPositive
            ? proof.boundingBox.max.z - splitPlaneZ
            : splitPlaneZ - proof.boundingBox.min.z;
        const retainedProofBox = proof.boundingBox.clone();

        if (keepPositive) {
            retainedProofBox.min.z = splitPlaneZ;
            assertNear(
                former.boundingBox.min.z,
                splitPlaneZ,
                0.01,
                `${label}: handle mold indentation should not lift the retained handle half off the split plane`
            );
        } else {
            retainedProofBox.max.z = splitPlaneZ;
            assertNear(
                former.boundingBox.max.z,
                splitPlaneZ,
                0.01,
                `${label}: handle mold indentation should not lower the retained handle half off the split plane`
            );
        }

        assertNear(
            retainedHandleWidth,
            fullHandleWidth / 2,
            Math.max(0.01, fullHandleWidth * 0.001),
            `${label}: retained handle geometry should be exactly half of the full handle width`
        );
        assert(
            former.boundingBox.containsBox(retainedProofBox),
            `${label}: handle mold former must contain the exact retained handle half`
        );

        const bottomSeatZ = pkg.layout.boxes.bottom.max.z - pkg.layout.wallPlateInterlock.keyHeight;
        assertNear(
            bottomSeatZ,
            splitPlaneZ,
            0.01,
            `${label}: bottom registration indentation should align to the split plane without reducing handle width`
        );
        assert(
            pkg.layout.boxes.bottom.max.z >= splitPlaneZ,
            `${label}: raised plate registration may surround the former but must not redefine the handle split plane`
        );
    } finally {
        proof.dispose();
    }
}

function assertProofPreservesProductHandle(testCase, pkg) {
    const product = generateHandleMesh(testCase.params, testCase.mugData);
    const comparableProduct = product.getIndex() ? product.toNonIndexed() : product.clone();
    const comparableProof = pkg.parts.proof.getIndex() ? pkg.parts.proof.toNonIndexed() : pkg.parts.proof.clone();

    try {
        const productSize = getSize(product);
        const proofSize = getSize(pkg.parts.proof);
        assertNear(proofSize.x, productSize.x, 0.01, `${testCase.name}: proof should preserve product handle depth`);
        assertNear(proofSize.y, productSize.y, 0.01, `${testCase.name}: proof should preserve product handle span`);
        assertNear(proofSize.z, productSize.z, 0.01, `${testCase.name}: proof should preserve product handle width`);

        const productPosition = comparableProduct.getAttribute('position');
        const proofPosition = comparableProof.getAttribute('position');
        assert(
            productPosition.count === proofPosition.count,
            `${testCase.name}: proof should preserve product handle vertex count`
        );

        for (let i = 0; i < productPosition.count; i++) {
            assertNear(proofPosition.getX(i), productPosition.getX(i), 0.001, `${testCase.name}: proof vertex ${i} x`);
            assertNear(proofPosition.getY(i), productPosition.getY(i), 0.001, `${testCase.name}: proof vertex ${i} y`);
            assertNear(proofPosition.getZ(i), productPosition.getZ(i), 0.001, `${testCase.name}: proof vertex ${i} z`);
        }
    } finally {
        comparableProof.dispose();
        comparableProduct.dispose();
        product.dispose();
    }
}

for (const testCase of CASES) {
    const pkg = generateHandleMoldPackage(testCase.params, testCase.mugData);

    try {
        console.log(`checking ${testCase.name}`);

        Object.entries(pkg.parts).forEach(([partName, geometry]) => {
            validatePart(geometry, `${testCase.name}:${partName}`);
        });
        assertProofPreservesProductHandle(testCase, pkg);

        const slopeDegrees = pkg.layout.attachmentSlopeAngle * 180 / Math.PI;
        if (testCase.expected?.attachmentSlopeMinDegrees !== undefined) {
            assert(
                slopeDegrees >= testCase.expected.attachmentSlopeMinDegrees,
                `${testCase.name} attachment slope too low: ${slopeDegrees}`
            );
        }
        if (testCase.expected?.attachmentSlopeMaxDegrees !== undefined) {
            assert(
                slopeDegrees <= testCase.expected.attachmentSlopeMaxDegrees,
                `${testCase.name} attachment slope too high: ${slopeDegrees}`
            );
        }

        ['proof', 'handleMold', 'wallA', 'wallB', 'bottom'].forEach((key) => {
            const expectedSize = testCase.expected?.[key];
            if (!expectedSize) return;
            const size = getSize(pkg.parts[key]);
            assertNear(size.x, expectedSize[0], 0.2, `${testCase.name}:${key} width`);
            assertNear(size.y, expectedSize[1], 0.2, `${testCase.name}:${key} length`);
            assertNear(size.z, expectedSize[2], 0.2, `${testCase.name}:${key} height`);
        });

        if (testCase.expected?.plasterVolumeL !== undefined) {
            assertNear(
                pkg.plaster.plasterVolumeL,
                testCase.expected.plasterVolumeL,
                0.01,
                `${testCase.name} plaster volume`
            );
        }

        const moldSpaceProof = createMoldSpaceProof(pkg);
        try {
            pkg.parts.handleMold.computeBoundingBox();
            moldSpaceProof.computeBoundingBox();
            const retainedProofBox = moldSpaceProof.boundingBox.clone();
            if ((pkg.layout.bisection?.keep ?? 'positive') === 'positive') {
                retainedProofBox.min.z = pkg.layout.bisection?.planeZ ?? 0;
            } else {
                retainedProofBox.max.z = pkg.layout.bisection?.planeZ ?? 0;
            }
            assert(
                pkg.parts.handleMold.boundingBox.containsBox(retainedProofBox),
                `${testCase.name}: handle mold former must contain retained proof-half bounds`
            );
            assert(
                Math.abs(pkg.parts.handleMold.boundingBox.min.x - moldSpaceProof.boundingBox.min.x) < 0.05,
                `${testCase.name}: handle mold former must preserve the handle back edge instead of scaling the handle`
            );
            assert(
                pkg.parts.handleMold.boundingBox.max.x > moldSpaceProof.boundingBox.max.x + pkg.layout.handleDepth * 0.8,
                `${testCase.name}: handle mold former must add attachment-side well stock`
            );
        } finally {
            moldSpaceProof.dispose();
        }
        assertFormerBisected(pkg, testCase.name);
        assertRetainedHandleHalfWidth(pkg, testCase.name);

        const { footprint } = pkg.layout;
        const bottomEndpoint = footprint.centerline[0];
        const topEndpoint = footprint.centerline[footprint.centerline.length - 1];
        assertNear(
            footprint.wellCenters[0].y,
            topEndpoint.y,
            0.01,
            `${testCase.name}: top well should align to top attachment point`
        );
        assertNear(
            footprint.wellCenters[1].y,
            bottomEndpoint.y,
            0.01,
            `${testCase.name}: bottom well should align to bottom attachment point`
        );
        assert(
            footprint.wellCenters.every((center) => center.x > pkg.layout.proofBox.max.x),
            `${testCase.name}: attachment wells should sit on the attachment side of the handle`
        );
        assert(
            footprint.wellEndX < pkg.layout.boxes.bottom.max.x,
            `${testCase.name}: bottom plate must leave stock outside the well cutout`
        );
        assert(
            Math.abs(footprint.wellCenters[0].y - footprint.wellCenters[1].y)
                > (footprint.wellRadiusY + pkg.layout.options.clearance + 0.25) * 2,
            `${testCase.name}: attachment wells should not overlap in the bottom cutout`
        );
        assert(
            Math.abs(footprint.wellStartX - footprint.attachmentSideX) <= 1e-6
                && footprint.wellNeckX > footprint.attachmentSideX,
            `${testCase.name}: well loft should start at the attachment plane without overlapping the handle`
        );
        assertAttachmentSurfaceCovered(pkg, 'top', `${testCase.name}:top`);
        assertAttachmentSurfaceCovered(pkg, 'bottom', `${testCase.name}:bottom`);
        assertAttachmentEndpointCaptured(pkg, 'top', `${testCase.name}:top`);
        assertAttachmentEndpointCaptured(pkg, 'bottom', `${testCase.name}:bottom`);
        assertAttachmentLoopUniformlyConnected(pkg, 'top', `${testCase.name}:top`);
        assertAttachmentLoopUniformlyConnected(pkg, 'bottom', `${testCase.name}:bottom`);
        assertAttachmentWellProfileCoversLoop(pkg, 'top', `${testCase.name}:top`);
        assertAttachmentWellProfileCoversLoop(pkg, 'bottom', `${testCase.name}:bottom`);
        assertWellWallAssemblyDatum(pkg, testCase.name);
        assertContactWallDoesNotInvadeWells(pkg, testCase.name);
        assertWallPlateInterlock(pkg, testCase.name);

        const diagnostics = calculateMoldFitDiagnostics(pkg);
        assert(
            diagnostics.formerContainsProofHalf,
            `${testCase.name}: visualizer fit diagnostics should contain the retained proof half`
        );
        assert(
            diagnostics.wallContactOk,
            `${testCase.name}: visualizer fit diagnostics should report solved well-wall contact`
        );
        assert(
            diagnostics.minClearance >= 0,
            `${testCase.name}: visualizer fit diagnostics should report non-negative clearance`
        );

        if (testCase.name === 'dura-reference') {
            ['wallA', 'wallB', 'bottom'].forEach((key) => {
                assert(
                    getTriangleCount(pkg.parts[key]) > 500,
                    `${testCase.name}:${key} should include rounded frame and registration detail`
                );
            });

            const assembled = getMoldConstructionPartPosition('wallA', pkg.layout, { explode: 0 });
            const exploded = getMoldConstructionPartPosition('wallA', pkg.layout, { explode: 1 });
            const offsets = calculateMoldExplodeOffsets(pkg.layout);
            assert(assembled.length() === 0, 'assembled visualizer parts should share one coordinate system');
            assert(exploded.distanceTo(offsets.wallA) < 1e-6, 'exploded visualizer position should match offset map');
            assert(offsets.wallA.x < 0 && offsets.wallB.x > 0, 'wall explode directions should separate halves');
            assert(offsets.handleMold.z > 0 && offsets.bottom.z < 0, 'former and bottom should separate vertically');

            const hiddenWalls = mergeMoldConstructionViewSettings({ showWalls: false });
            assert(!isMoldConstructionPartVisible('wallA', hiddenWalls), 'wall visibility control should hide WallA');
            assert(!isMoldConstructionPartVisible('wallB', hiddenWalls), 'wall visibility control should hide WallB');
            assert(isMoldConstructionPartVisible('proof', hiddenWalls), 'wall visibility control should not hide proof');
        }
    } finally {
        disposeHandleMoldPackage(pkg);
    }
}

const minCase = getCase('min-parameter-handle');
const maxCase = getCase('max-parameter-handle');
const minPackage = generateHandleMoldPackage(minCase.params, minCase.mugData);
const maxPackage = generateHandleMoldPackage(maxCase.params, maxCase.mugData);

try {
    const minMoldSize = getSize(minPackage.parts.handleMold);
    const maxMoldSize = getSize(maxPackage.parts.handleMold);
    assert(maxMoldSize.x > minMoldSize.x, 'handle mold depth should scale with handle protrusion');
    assert(maxMoldSize.y > minMoldSize.y, 'handle mold length should scale with attachment span');
    assert(maxMoldSize.z > minMoldSize.z, 'handle mold width should scale with handle width');
} finally {
    disposeHandleMoldPackage(minPackage);
    disposeHandleMoldPackage(maxPackage);
}

const taperedCase = getCase('tapered-mug-sloped-attachment');
const taperedPackage = generateHandleMoldPackage(taperedCase.params, taperedCase.mugData);

try {
    const frame = taperedPackage.layout.frame;
    assert(
        Math.abs(frame.topX - frame.bottomX) > 1,
        'tapered mug attachments should not be treated as coplanar'
    );
    assertNear(
        taperedPackage.layout.attachmentDeltaX,
        frame.topX - frame.bottomX,
        1e-6,
        'attachment delta should come from mug taper radii'
    );
} finally {
    disposeHandleMoldPackage(taperedPackage);
}

const ovalPackage = generateHandleMoldPackage(CASES[0].params, CASES[0].mugData);
const rectangularPackage = generateHandleMoldPackage(
    {
        ...CASES[0].params,
        crossSectionType: 'rectangular'
    },
    CASES[0].mugData
);

try {
    const ovalPositions = ovalPackage.parts.handleMold.getAttribute('position').array;
    const rectangularPositions = rectangularPackage.parts.handleMold.getAttribute('position').array;
    const sharedLength = Math.min(ovalPositions.length, rectangularPositions.length);
    let differingValues = Math.abs(ovalPositions.length - rectangularPositions.length);

    for (let i = 0; i < sharedLength; i++) {
        if (Math.abs(ovalPositions[i] - rectangularPositions[i]) > 1e-6) {
            differingValues++;
        }
    }

    assert(
        differingValues > 0,
        'handle mold former should change when the handle cross-section geometry changes'
    );
} finally {
    disposeHandleMoldPackage(ovalPackage);
    disposeHandleMoldPackage(rectangularPackage);
}

const exportPackage = createHandleMoldPackageForExport(
    CASES[0].params,
    CASES[0].mugData,
    'Dura_90x35'
);

try {
    const functionalMoldParts = ['handleMold', 'wallA', 'wallB', 'bottom'];
    assert(
        functionalMoldParts.every((key) => exportPackage.parts[key]),
        'export must include the four functional mold parts'
    );
    assert(exportPackage.parts.proof, 'export should include Proof as a reference part');

    const expectedFiles = new Set([
        'Dura_90x35_Proof.stl',
        'Dura_90x35_Handle_Mold.stl',
        'Dura_90x35_WallA.stl',
        'Dura_90x35_WallB.stl',
        'Dura_90x35_Bottom.stl',
        'Dura_90x35_readme.txt'
    ]);

    assert(exportPackage.entries.length === expectedFiles.size, 'unexpected export file count');
    exportPackage.entries.forEach((entry) => {
        assert(expectedFiles.has(entry.filename), `unexpected export file ${entry.filename}`);
        if (entry.type === 'stl') {
            assert(entry.data.byteLength > 84, `${entry.filename} STL buffer is empty`);
            const view = new DataView(entry.data);
            const triangles = view.getUint32(80, true);
            assert(entry.data.byteLength === 84 + triangles * 50, `${entry.filename} STL byte count mismatch`);
        } else {
            assert(
                entry.data.includes('Plaster volume 0.57 L'),
                'readme plaster estimate missing expected value'
            );
        }
    });
} finally {
    disposeHandleMoldPackage(exportPackage);
}

console.log('handle mold generator gate: PASS');
