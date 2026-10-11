const EPSILON = 1e-6;

function wallCornerPoint(wallDistance, wallNormalAngle, radialAngle) {
    const angleDiff = radialAngle - wallNormalAngle;
    const cosDiff = Math.cos(angleDiff);

    if (Math.abs(cosDiff) < 0.001) {
        return {
            x: wallDistance * Math.cos(radialAngle),
            z: wallDistance * Math.sin(radialAngle)
        };
    }

    const t = wallDistance / cosDiff;
    return {
        x: t * Math.cos(radialAngle),
        z: t * Math.sin(radialAngle)
    };
}

function planeFor(angle, distance, name) {
    return {
        name,
        angle,
        normal: {
            x: Math.cos(angle),
            z: Math.sin(angle)
        },
        distance
    };
}

export function computeWallSideCutPlanes({
    wallIndex = 0,
    wallCount = 2,
    startAngle = null,
    endAngle = null,
    outerWallDistance,
    maxVesselRadius = 0,
    moldWallOffset = 0,
    cornerCutWidth = 0
}) {
    const segmentAngle = (Math.PI * 2) / Math.max(1, wallCount);
    const resolvedStartAngle = Number.isFinite(startAngle) ? startAngle : wallIndex * segmentAngle;
    const resolvedEndAngle = Number.isFinite(endAngle) ? endAngle : (wallIndex + 1) * segmentAngle;
    const wallNormalAngle = (resolvedStartAngle + resolvedEndAngle) * 0.5;
    const resolvedOuterWallDistance = Number.isFinite(outerWallDistance)
        ? outerWallDistance
        : maxVesselRadius + moldWallOffset;
    const cutWidth = Math.max(0, cornerCutWidth || 0);

    const startCorner = wallCornerPoint(
        resolvedOuterWallDistance,
        wallNormalAngle,
        resolvedStartAngle
    );
    const endCorner = wallCornerPoint(
        resolvedOuterWallDistance,
        wallNormalAngle,
        resolvedEndAngle
    );
    const startCornerDistance = Math.hypot(startCorner.x, startCorner.z);
    const endCornerDistance = Math.hypot(endCorner.x, endCorner.z);
    const startCutDistance = Math.max(
        resolvedOuterWallDistance,
        startCornerDistance - cutWidth
    );
    const endCutDistance = Math.max(
        resolvedOuterWallDistance,
        endCornerDistance - cutWidth
    );

    return {
        start: planeFor(resolvedStartAngle, startCutDistance, 'start'),
        end: planeFor(resolvedEndAngle, endCutDistance, 'end'),
        outerWallDistance: resolvedOuterWallDistance,
        wallNormalAngle,
        startCornerDistance,
        endCornerDistance
    };
}

/**
 * Compact-block lateral cut planes.
 *
 * Two vertical planes parallel to the wall's bisector at +/- halfWidth. They clip
 * the legacy triangle-wedge corners into a compact block whose side faces are
 * exactly perpendicular to the flat outer face — so the part can lie outer-face-down
 * and release straight up out of a cast polymer case mold (zero undercuts along the
 * bisector).
 *
 * Plane convention matches computeWallSideCutPlanes / collectCutPlaneViolations:
 * a point p is inside when p.x * normal.x + p.z * normal.z <= distance.
 */
export function computeWallLateralPlanes({ wallNormalAngle, halfWidth }) {
    const sin = Math.sin(wallNormalAngle);
    const cos = Math.cos(wallNormalAngle);

    return {
        // Tangent direction t = (-sin, cos); interior condition |p . t| <= halfWidth.
        start: {
            name: 'lateralStart',
            angle: wallNormalAngle - Math.PI * 0.5,
            normal: { x: sin, z: -cos },
            distance: halfWidth
        },
        end: {
            name: 'lateralEnd',
            angle: wallNormalAngle + Math.PI * 0.5,
            normal: { x: -sin, z: cos },
            distance: halfWidth
        },
        halfWidth,
        wallNormalAngle
    };
}

export function collectCutPlaneViolations(geometry, planes, options = {}) {
    const tolerance = options.tolerance ?? 1e-4;
    const maxSamples = options.maxSamples ?? 80;
    const position = geometry?.getAttribute?.('position');
    const planeList = Array.isArray(planes) ? planes : [planes?.start, planes?.end].filter(Boolean);
    const planeResults = planeList.map((plane) => ({
        plane,
        vertexCount: 0,
        maxSignedDistance: 0,
        minY: Infinity,
        maxY: -Infinity,
        samples: []
    }));

    if (!position || planeResults.length === 0) {
        return {
            valid: true,
            tolerance,
            vertexCount: 0,
            violationCount: 0,
            maxSignedDistance: 0,
            minY: null,
            maxY: null,
            planes: planeResults
        };
    }

    let violationCount = 0;
    let maxSignedDistance = 0;
    let minY = Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);

        for (const result of planeResults) {
            const signedDistance =
                x * result.plane.normal.x
                + z * result.plane.normal.z
                - result.plane.distance;

            if (signedDistance <= tolerance + EPSILON) continue;

            result.vertexCount += 1;
            result.maxSignedDistance = Math.max(result.maxSignedDistance, signedDistance);
            result.minY = Math.min(result.minY, y);
            result.maxY = Math.max(result.maxY, y);
            maxSignedDistance = Math.max(maxSignedDistance, signedDistance);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            violationCount += 1;

            if (result.samples.length < maxSamples) {
                result.samples.push({ x, y, z, signedDistance });
            }
        }
    }

    return {
        valid: violationCount === 0,
        tolerance,
        vertexCount: position.count,
        violationCount,
        maxSignedDistance,
        minY: Number.isFinite(minY) ? minY : null,
        maxY: Number.isFinite(maxY) ? maxY : null,
        planes: planeResults.map((result) => ({
            ...result,
            minY: Number.isFinite(result.minY) ? result.minY : null,
            maxY: Number.isFinite(result.maxY) ? result.maxY : null
        }))
    };
}

export function validateGeometryInsideCutPlanes(geometry, planes, options = {}) {
    return collectCutPlaneViolations(geometry, planes, options).valid;
}
