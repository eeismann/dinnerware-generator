import * as THREE from 'three';
import { generateHandleMesh } from '../geometry/handleMeshGenerator.js';
import { generateHandlePath, getMugRadiusAtHeight, samplePathPoints } from '../geometry/handlePathGenerator.js';
import { mergeHandleMoldOptions } from './handleMoldDefaults.js';

function roundFinite(value, decimalPlaces = 3) {
    if (!Number.isFinite(value)) return value;
    const scale = 10 ** decimalPlaces;
    const rounded = Math.round(value * scale) / scale;
    return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeMugDataForHandleMold(mugData = {}) {
    const radiusProfile = Array.isArray(mugData.radiusProfile)
        ? mugData.radiusProfile
            .map((point) => ({
                ...point,
                y: roundFinite(Number(point.y ?? point.height)),
                radius: roundFinite(Number(point.radius))
            }))
            .filter((point) => Number.isFinite(point.y) && Number.isFinite(point.radius))
        : mugData.radiusProfile;

    return {
        ...mugData,
        height: roundFinite(mugData.height),
        topDiameter: roundFinite(mugData.topDiameter),
        bottomDiameter: roundFinite(mugData.bottomDiameter),
        wallThickness: roundFinite(mugData.wallThickness),
        wallAngle: roundFinite(mugData.wallAngle),
        radiusProfile
    };
}

export function normalizeHandleParamsForHandleMold(handleParams = {}) {
    return Object.fromEntries(
        Object.entries(handleParams).map(([key, value]) => [
            key,
            Number.isFinite(value) ? roundFinite(value) : value
        ])
    );
}

function getRadiusAtHeight(height, mugData) {
    return getMugRadiusAtHeight(mugData, height);
}

export function computeHandleAttachmentFrame(handleParams, mugData) {
    const bottomY = handleParams.bottomAttachmentHeight;
    const topY = handleParams.topAttachmentHeight;
    const span = Math.max(1e-6, topY - bottomY);
    const bottomX = getRadiusAtHeight(bottomY, mugData);
    const topX = getRadiusAtHeight(topY, mugData);
    const centerY = (topY + bottomY) / 2;

    return {
        bottom: new THREE.Vector3(bottomX, bottomY, 0),
        top: new THREE.Vector3(topX, topY, 0),
        bottomX,
        topX,
        referenceX: Math.max(bottomX, topX),
        bottomY,
        topY,
        centerY,
        span,
        deltaX: topX - bottomX,
        slopeAngle: Math.atan2(topX - bottomX, span)
    };
}

export function attachmentXAtY(y, frame) {
    const t = (y - frame.bottomY) / frame.span;
    return frame.bottomX + frame.deltaX * t;
}

export function normalizeHandleGeometryToMold(geometry, frame, options = {}) {
    const source = geometry.clone();
    const normalized = options.preserveSweepOrder
        ? source
        : source.getIndex()
            ? source.toNonIndexed()
            : source;
    normalized.userData = {
        ...(source.userData || {}),
        ...(normalized.userData || {})
    };

    if (normalized !== source) {
        source.dispose();
    }

    const position = normalized.getAttribute('position');
    const array = position.array;

    for (let i = 0; i < array.length; i += 3) {
        const worldX = array[i];
        const worldY = array[i + 1];

        array[i] = frame.referenceX - worldX;
        array[i + 1] = worldY - frame.centerY;
    }

    position.needsUpdate = true;
    normalized.computeBoundingBox();
    normalized.computeBoundingSphere();
    normalized.computeVertexNormals();
    return normalized;
}

function extractAttachmentLoopsFromSweepGeometry(geometry) {
    const sweep = geometry.userData?.handleSweep;
    const position = geometry.getAttribute('position');
    const crossSectionPointCount = sweep?.crossSectionPointCount;
    const pathPointCount = sweep?.pathPointCount;

    if (!crossSectionPointCount || !pathPointCount) {
        return { top: [], bottom: [] };
    }

    const readRing = (ringIndex) => {
        const ringStart = ringIndex * crossSectionPointCount;
        const points = [];

        for (let i = 0; i < crossSectionPointCount; i++) {
            const index = ringStart + i;
            points.push(new THREE.Vector3(
                position.getX(index),
                position.getY(index),
                position.getZ(index)
            ));
        }

        return points;
    };

    return {
        bottom: readRing(0),
        top: readRing(pathPointCount - 1)
    };
}

function getPointBounds(points, fallbackCenterY, fallbackCenterZ = 0) {
    if (!points?.length) {
        return {
            minY: fallbackCenterY,
            maxY: fallbackCenterY,
            minZ: fallbackCenterZ,
            maxZ: fallbackCenterZ,
            centerY: fallbackCenterY,
            centerZ: fallbackCenterZ,
            radiusY: 0,
            radiusZ: 0
        };
    }

    const box = new THREE.Box3().setFromPoints(points);
    const center = box.getCenter(new THREE.Vector3());

    return {
        minY: box.min.y,
        maxY: box.max.y,
        minZ: box.min.z,
        maxZ: box.max.z,
        centerY: center.y,
        centerZ: center.z,
        radiusY: Math.max(center.y - box.min.y, box.max.y - center.y),
        radiusZ: Math.max(center.z - box.min.z, box.max.z - center.z)
    };
}

function createWellProfileForAttachment(footprint, key, fallbackCenterY) {
    const surface = footprint.attachmentSurfaces[key];
    const loopBounds = getPointBounds(
        footprint.attachmentLoops?.[key] || [],
        surface?.centerY ?? fallbackCenterY,
        surface?.centerZ ?? 0
    );
    const centerY = Number.isFinite(loopBounds.centerY)
        ? loopBounds.centerY
        : surface.centerY;
    const centerZ = Number.isFinite(loopBounds.centerZ)
        ? loopBounds.centerZ
        : surface.centerZ;
    const contactRadiusY = Math.max(
        footprint.footprintRadius,
        surface.radiusY,
        loopBounds.radiusY
    );
    const contactRadiusZ = Math.max(
        footprint.footprintRadius,
        surface.radiusZ,
        loopBounds.radiusZ
    );
    const radiusY = Math.max(
        footprint.wellRadiusY,
        contactRadiusY + footprint.attachmentPadding
    );
    const radiusZ = Math.max(
        footprint.wellRadiusZ,
        contactRadiusZ + footprint.attachmentPadding
    );

    return {
        centerX: footprint.wellCenters[key === 'top' ? 0 : 1].x,
        centerY,
        centerZ,
        loopRadiusY: loopBounds.radiusY,
        loopRadiusZ: loopBounds.radiusZ,
        contactRadiusY,
        contactRadiusZ,
        radiusY,
        radiusZ,
        minY: centerY - radiusY,
        maxY: centerY + radiusY,
        minZ: centerZ - radiusZ,
        maxZ: centerZ + radiusZ
    };
}

function applyAttachmentWellProfiles(layout) {
    const { footprint } = layout;
    const profiles = {
        top: createWellProfileForAttachment(footprint, 'top', footprint.wellCenters[0].y),
        bottom: createWellProfileForAttachment(footprint, 'bottom', footprint.wellCenters[1].y)
    };
    const maxRadiusY = Math.max(profiles.top.radiusY, profiles.bottom.radiusY);
    const maxRadiusZ = Math.max(profiles.top.radiusZ, profiles.bottom.radiusZ);

    footprint.attachmentWellProfiles = profiles;
    footprint.wellRadiusY = maxRadiusY;
    footprint.wellRadiusZ = maxRadiusZ;
    footprint.wellRadius = maxRadiusZ;
}

function getBoxSize(box) {
    const size = new THREE.Vector3();
    box.getSize(size);
    return size;
}

function numberOrMinimum(value, minimum) {
    if (!Number.isFinite(value)) return minimum;
    return Math.max(value, minimum);
}

export function calculateHandleMoldLayoutFromProof(proofGeometry, frame, options = {}) {
    const params = mergeHandleMoldOptions(options);
    proofGeometry.computeBoundingBox();
    const proofBox = proofGeometry.boundingBox.clone();
    const proofSize = getBoxSize(proofBox);

    const handleDepth = Math.max(1, proofSize.x);
    const handleSpan = Math.max(1, proofSize.y);
    const handleWidth = Math.max(1, proofSize.z);
    const splitPlaneZ = (proofBox.min.z + proofBox.max.z) / 2;

    const insertAttachmentStock = numberOrMinimum(
        handleDepth * params.insert.backStockScale,
        params.insert.minBackStock
    );
    const insertBackStock = Math.max(0, params.insert.backStock ?? 0);
    const insertEndStock = numberOrMinimum(
        handleDepth * params.insert.endStockScale,
        params.insert.minEndStock
    );
    const insertSideStock = numberOrMinimum(
        handleWidth * params.insert.sideStockScale,
        params.insert.minSideStock
    );

    const insertMinX = proofBox.min.x - insertBackStock;
    const insertMaxX = Math.max(0, proofBox.max.x) + insertAttachmentStock;
    const insertMinY = proofBox.min.y - insertEndStock;
    const insertMaxY = proofBox.max.y + insertEndStock;
    const insertMinZ = splitPlaneZ;
    const insertMaxZ = proofBox.max.z + insertSideStock;

    const outerEndStock = numberOrMinimum(
        handleDepth * params.outer.endStockScale,
        params.outer.minEndStock
    );
    const outerAttachmentStock = numberOrMinimum(
        handleDepth * params.outer.attachmentStockScale,
        params.outer.minAttachmentStock
    );
    const wallThickness = numberOrMinimum(
        handleDepth * params.walls.thicknessScale,
        params.walls.minThickness
    );
    const outerBackStock = outerAttachmentStock;
    const outerWellWallStock = wallThickness;

    const outerMinX = insertMinX - outerBackStock;
    const outerMaxX = insertMaxX + outerWellWallStock;
    const outerMinY = insertMinY - outerEndStock;
    const outerMaxY = insertMaxY + outerEndStock;
    const wallSplitX = (outerMinX + outerMaxX) / 2;
    const wallTopStock = numberOrMinimum(
        handleWidth * params.walls.topStockScale,
        params.walls.minTopStock
    );
    const wallHeight = handleWidth + wallTopStock;

    const boxes = {
        proof: proofBox,
        handleMold: new THREE.Box3(
            new THREE.Vector3(insertMinX, insertMinY, insertMinZ),
            new THREE.Vector3(insertMaxX, insertMaxY, insertMaxZ)
        ),
        wallA: new THREE.Box3(
            new THREE.Vector3(outerMinX, outerMinY, 0),
            new THREE.Vector3(wallSplitX, outerMaxY, wallHeight)
        ),
        wallB: new THREE.Box3(
            new THREE.Vector3(wallSplitX, outerMinY, 0),
            new THREE.Vector3(outerMaxX, outerMaxY, wallHeight)
        ),
        bottom: new THREE.Box3(
            new THREE.Vector3(outerMinX, outerMinY, -params.base.belowDatum),
            new THREE.Vector3(outerMaxX, outerMaxY, params.base.wallOverlap)
        )
    };

    return {
        frame,
        options: params,
        proofBox,
        proofSize,
        handleDepth,
        handleSpan,
        handleWidth,
        attachmentDeltaX: frame.deltaX,
        attachmentSlopeAngle: frame.slopeAngle,
        bisection: {
            axis: 'z',
            planeZ: splitPlaneZ,
            keep: 'positive'
        },
        stock: {
            insertAttachmentStock,
            insertBackStock,
            insertEndStock,
            insertSideStock,
            outerEndStock,
            outerAttachmentStock,
            outerBackStock,
            outerWellWallStock,
            wallThickness,
            wallTopStock
        },
        wallSplitX,
        wallThickness,
        wallHeight,
        wallContact: {
            side: 'positiveX',
            wellTerminalX: insertMaxX,
            wallInnerFaceX: outerMaxX - wallThickness,
            wallOuterFaceX: outerMaxX,
            clearance: outerMaxX - wallThickness - insertMaxX
        },
        boxes
    };
}

function getAttachmentProfileBounds(footprint, proofBox) {
    const profiles = Object.values(footprint.attachmentWellProfiles || {});
    const minY = Math.min(
        proofBox.min.y,
        ...profiles.map((profile) => profile.minY).filter(Number.isFinite)
    );
    const maxY = Math.max(
        proofBox.max.y,
        ...profiles.map((profile) => profile.maxY).filter(Number.isFinite)
    );
    const maxZ = Math.max(
        proofBox.max.z,
        ...profiles.map((profile) => profile.maxZ).filter(Number.isFinite)
    );

    return { minY, maxY, maxZ };
}

function rect(minX, minY, maxX, maxY) {
    return {
        minX: Math.min(minX, maxX),
        minY: Math.min(minY, maxY),
        maxX: Math.max(minX, maxX),
        maxY: Math.max(minY, maxY)
    };
}

function createWallWebFootprints(box, layout, isLeftWall) {
    const { registration } = layout.options;
    const wallThickness = layout.wallThickness;
    const webThickness = Math.min(
        registration.webThickness,
        Math.max(1, wallThickness * 0.4)
    );
    const sideWeb = isLeftWall
        ? rect(
            box.min.x + wallThickness - webThickness,
            box.min.y + wallThickness,
            box.min.x + wallThickness,
            box.max.y - wallThickness
        )
        : rect(
            box.max.x - wallThickness,
            box.min.y + wallThickness,
            box.max.x - wallThickness + webThickness,
            box.max.y - wallThickness
        );
    const bottomWeb = rect(
        isLeftWall ? box.min.x + wallThickness - webThickness : box.min.x,
        box.min.y + wallThickness - webThickness,
        isLeftWall ? box.max.x : box.max.x - wallThickness + webThickness,
        box.min.y + wallThickness
    );
    const topWeb = rect(
        isLeftWall ? box.min.x + wallThickness - webThickness : box.min.x,
        box.max.y - wallThickness,
        isLeftWall ? box.max.x : box.max.x - wallThickness + webThickness,
        box.max.y - wallThickness + webThickness
    );

    return {
        sideWeb,
        bottomWeb,
        topWeb,
        webThickness
    };
}

function createWallRegistrationPoints(box, layout, wallKey, isLeftWall) {
    const { registration } = layout.options;
    const radius = registration.receiverHoleDiameter / 2;
    const wellYs = [...layout.footprint.wellCenters]
        .map((center) => center.y)
        .sort((left, right) => left - right);
    const clampY = (value) => Math.min(
        box.max.y - layout.wallThickness - radius - registration.minimumHoleWebClearance,
        Math.max(
            box.min.y + layout.wallThickness + radius + registration.minimumHoleWebClearance,
            value
        )
    );
    const sideX = isLeftWall
        ? box.min.x + registration.sideHoleInset
        : box.max.x - registration.sideHoleInset;
    const innerX = isLeftWall
        ? box.max.x - registration.innerHoleInset
        : box.min.x + registration.innerHoleInset;

    return [
        {
            wallKey,
            role: 'side-lower',
            center: new THREE.Vector2(sideX, clampY(wellYs[0] ?? layout.proofBox.min.y)),
            radius
        },
        {
            wallKey,
            role: 'side-upper',
            center: new THREE.Vector2(sideX, clampY(wellYs[1] ?? layout.proofBox.max.y)),
            radius
        },
        {
            wallKey,
            role: 'end-lower',
            center: new THREE.Vector2(innerX, box.min.y + registration.endHoleInset),
            radius
        },
        {
            wallKey,
            role: 'end-upper',
            center: new THREE.Vector2(innerX, box.max.y - registration.endHoleInset),
            radius
        }
    ];
}

function createWallPlateInterlock(layout) {
    const { registration } = layout.options;
    const walls = {
        wallA: {
            box: layout.boxes.wallA,
            isLeftWall: true,
            webs: createWallWebFootprints(layout.boxes.wallA, layout, true)
        },
        wallB: {
            box: layout.boxes.wallB,
            isLeftWall: false,
            webs: createWallWebFootprints(layout.boxes.wallB, layout, false)
        }
    };
    const points = [
        ...createWallRegistrationPoints(layout.boxes.wallA, layout, 'wallA', true),
        ...createWallRegistrationPoints(layout.boxes.wallB, layout, 'wallB', false)
    ];
    const keyRadius = Math.max(0.4, registration.receiverHoleDiameter / 2 - registration.keyClearance);

    return {
        footerHeight: registration.footerHeight,
        receiverHoleDiameter: registration.receiverHoleDiameter,
        receiverHoleRadius: registration.receiverHoleDiameter / 2,
        keyRadius,
        keyHeight: registration.footerHeight,
        minimumHoleWebClearance: registration.minimumHoleWebClearance,
        points,
        walls
    };
}

function createHandleClearanceBay(layout) {
    const minY = Math.min(
        layout.boxes.wallA.min.y,
        layout.boxes.wallB.min.y
    ) + layout.wallThickness + layout.options.registration.receiverHoleDiameter;
    const maxY = Math.max(
        layout.boxes.wallA.max.y,
        layout.boxes.wallB.max.y
    ) - layout.wallThickness - layout.options.registration.receiverHoleDiameter;
    const halfWidth = Math.max(
        layout.options.registration.webThickness + 0.5,
        layout.options.registration.receiverHoleDiameter * 0.45
    );

    return {
        minX: layout.wallSplitX - halfWidth,
        maxX: layout.wallSplitX + halfWidth,
        minY,
        maxY,
        minZ: layout.options.registration.footerHeight,
        maxZ: layout.wallHeight
    };
}

function finalizeHandleMoldAssemblyLayout(layout) {
    const { footprint, proofBox, stock, options } = layout;
    const profileBounds = getAttachmentProfileBounds(footprint, proofBox);
    const insertMinX = Math.min(proofBox.min.x - stock.insertBackStock, proofBox.min.x);
    const insertMaxX = footprint.wellEndX;
    const insertMinY = Math.min(proofBox.min.y - stock.insertEndStock, profileBounds.minY);
    const insertMaxY = Math.max(proofBox.max.y + stock.insertEndStock, profileBounds.maxY);
    const insertMinZ = layout.bisection.planeZ;
    const insertMaxZ = Math.max(proofBox.max.z + stock.insertSideStock, profileBounds.maxZ);
    const wallThickness = stock.wallThickness;
    const outerMinX = insertMinX - stock.outerBackStock;
    const outerMaxX = insertMaxX + stock.outerWellWallStock;
    const outerMinY = insertMinY - stock.outerEndStock;
    const outerMaxY = insertMaxY + stock.outerEndStock;
    const wallSplitX = (outerMinX + outerMaxX) / 2;

    layout.wallSplitX = wallSplitX;
    layout.wallThickness = wallThickness;
    layout.wallContact = {
        side: 'positiveX',
        wellTerminalX: insertMaxX,
        wallInnerFaceX: outerMaxX - wallThickness,
        wallOuterFaceX: outerMaxX,
        clearance: outerMaxX - wallThickness - insertMaxX
    };
    layout.boxes = {
        proof: proofBox,
        handleMold: new THREE.Box3(
            new THREE.Vector3(insertMinX, insertMinY, insertMinZ),
            new THREE.Vector3(insertMaxX, insertMaxY, insertMaxZ)
        ),
        wallA: new THREE.Box3(
            new THREE.Vector3(outerMinX, outerMinY, 0),
            new THREE.Vector3(wallSplitX, outerMaxY, layout.wallHeight)
        ),
        wallB: new THREE.Box3(
            new THREE.Vector3(wallSplitX, outerMinY, 0),
            new THREE.Vector3(outerMaxX, outerMaxY, layout.wallHeight)
        ),
        bottom: new THREE.Box3(
            new THREE.Vector3(outerMinX, outerMinY, -options.base.belowDatum),
            new THREE.Vector3(outerMaxX, outerMaxY, options.base.wallOverlap)
        )
    };
    layout.wallPlateInterlock = createWallPlateInterlock(layout);
    layout.handleClearanceBay = createHandleClearanceBay(layout);

    return layout;
}

function normalizePathPointToMold(point, frame) {
    return new THREE.Vector2(
        frame.referenceX - point.x,
        point.y - frame.centerY
    );
}

function simplifyFootprintPoints(points, minDistance = 1.2) {
    const simplified = [];

    points.forEach((point) => {
        const previous = simplified[simplified.length - 1];
        if (!previous || previous.distanceTo(point) >= minDistance) {
            simplified.push(point);
        }
    });

    return simplified;
}

function calculateNormalsForPolyline(points) {
    return points.map((point, index) => {
        const previous = points[Math.max(0, index - 1)];
        const next = points[Math.min(points.length - 1, index + 1)];
        const tangent = next.clone().sub(previous);

        if (tangent.lengthSq() < 1e-8) {
            return new THREE.Vector2(1, 0);
        }

        tangent.normalize();
        return new THREE.Vector2(-tangent.y, tangent.x).normalize();
    });
}

function createEmptySurfaceBounds(centerY, proofBox, centerX = proofBox.max.x) {
    const centerZ = (proofBox.min.z + proofBox.max.z) / 2;
    return {
        minX: centerX,
        maxX: centerX,
        minY: centerY,
        maxY: centerY,
        minZ: centerZ,
        maxZ: centerZ,
        centerX,
        centerY,
        centerZ,
        depthX: 0,
        radiusY: 0,
        radiusZ: 0,
        vertexCount: 0,
        sampledVertices: []
    };
}

function createAttachmentBoundaryProfile(surface, fallbackX, binCount = 28) {
    const span = Math.max(1e-6, surface.maxY - surface.minY);
    const bins = Array.from({ length: binCount }, (_, index) => ({
        y: surface.minY + (index + 0.5) / binCount * span,
        x: Number.NEGATIVE_INFINITY,
        count: 0
    }));

    surface.sampledVertices.forEach((vertex) => {
        const t = (vertex.y - surface.minY) / span;
        const index = Math.max(0, Math.min(binCount - 1, Math.floor(t * binCount)));
        bins[index].x = Math.max(bins[index].x, vertex.x);
        bins[index].count++;
    });

    const known = bins
        .map((bin, index) => ({ ...bin, index }))
        .filter((bin) => bin.count > 0 && Number.isFinite(bin.x));

    if (known.length === 0) {
        return {
            fallbackX,
            minY: surface.minY,
            maxY: surface.maxY,
            samples: [
                { y: surface.minY, x: fallbackX },
                { y: surface.maxY, x: fallbackX }
            ]
        };
    }

    bins.forEach((bin, index) => {
        if (bin.count > 0 && Number.isFinite(bin.x)) return;

        let left = null;
        let right = null;

        for (let i = index - 1; i >= 0; i--) {
            if (bins[i].count > 0 && Number.isFinite(bins[i].x)) {
                left = bins[i];
                break;
            }
        }

        for (let i = index + 1; i < bins.length; i++) {
            if (bins[i].count > 0 && Number.isFinite(bins[i].x)) {
                right = bins[i];
                break;
            }
        }

        if (left && right) {
            const t = (bin.y - left.y) / Math.max(1e-6, right.y - left.y);
            bin.x = left.x + (right.x - left.x) * t;
        } else {
            bin.x = left?.x ?? right?.x ?? fallbackX;
        }
    });

    return {
        fallbackX,
        minY: surface.minY,
        maxY: surface.maxY,
        samples: [
            { y: surface.minY, x: known[0].x },
            ...bins.map(({ y, x }) => ({ y, x })),
            { y: surface.maxY, x: known[known.length - 1].x }
        ]
    };
}

function measureAttachmentSurfaceBounds(
    proofGeometry,
    layout,
    bottomAttachmentY,
    topAttachmentY,
    bottomAttachmentX,
    topAttachmentX,
    searchRadiusY,
    attachmentDepthX
) {
    const top = createEmptySurfaceBounds(topAttachmentY, layout.proofBox, topAttachmentX);
    const bottom = createEmptySurfaceBounds(bottomAttachmentY, layout.proofBox, bottomAttachmentX);
    const position = proofGeometry.getAttribute('position');
    const updateBounds = (surface, x, y, z) => {
        if (surface.vertexCount === 0) {
            surface.minX = x;
            surface.maxX = x;
            surface.minY = y;
            surface.maxY = y;
            surface.minZ = z;
            surface.maxZ = z;
        } else {
            surface.minX = Math.min(surface.minX, x);
            surface.maxX = Math.max(surface.maxX, x);
            surface.minY = Math.min(surface.minY, y);
            surface.maxY = Math.max(surface.maxY, y);
            surface.minZ = Math.min(surface.minZ, z);
            surface.maxZ = Math.max(surface.maxZ, z);
        }
        surface.vertexCount++;
        surface.sampledVertices.push({ x, y, z });
    };

    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        const y = position.getY(i);

        if (
            Math.abs(x - topAttachmentX) <= attachmentDepthX
            && Math.abs(y - topAttachmentY) <= searchRadiusY
        ) {
            updateBounds(top, x, y, position.getZ(i));
        }

        if (
            Math.abs(x - bottomAttachmentX) <= attachmentDepthX
            && Math.abs(y - bottomAttachmentY) <= searchRadiusY
        ) {
            updateBounds(bottom, x, y, position.getZ(i));
        }
    }

    [top, bottom].forEach((surface) => {
        surface.centerX = (surface.minX + surface.maxX) / 2;
        surface.centerY = (surface.minY + surface.maxY) / 2;
        surface.centerZ = (surface.minZ + surface.maxZ) / 2;
        surface.depthX = Math.max(surface.centerX - surface.minX, surface.maxX - surface.centerX);
        surface.radiusY = Math.max(surface.maxY - surface.centerY, surface.centerY - surface.minY);
        surface.radiusZ = Math.max(surface.maxZ - surface.centerZ, surface.centerZ - surface.minZ);
        surface.boundaryProfile = createAttachmentBoundaryProfile(surface, surface.centerX);
        delete surface.sampledVertices;
    });

    return { top, bottom };
}

export function createHandleMoldFootprint(handleParams, mugData, frame, layout, proofGeometry) {
    const path = generateHandlePath(handleParams, mugData);
    const centerline = simplifyFootprintPoints(
        samplePathPoints(path, 96).map((sample) => normalizePathPointToMold(sample.position, frame)),
        0.9
    );
    const normals = calculateNormalsForPolyline(centerline);
    const handleFootprintRadius = Math.max(1, (handleParams.crossSectionWidth || 8) / 2);
    const handleVerticalRadius = Math.max(1, layout.proofSize.z / 2);
    const footprintRadius = handleFootprintRadius + layout.options.clearance;
    const bottomAttachmentY = centerline[0]?.y ?? layout.proofBox.min.y;
    const topAttachmentY = centerline[centerline.length - 1]?.y ?? layout.proofBox.max.y;
    const bottomAttachmentX = centerline[0]?.x ?? layout.proofBox.max.x;
    const topAttachmentX = centerline[centerline.length - 1]?.x ?? layout.proofBox.max.x;
    const endpointSpan = Math.max(1, Math.abs(topAttachmentY - bottomAttachmentY));
    const attachmentRadius = Math.max(0, handleParams.attachmentRadius || 0);
    const attachmentCaptureRadiusY = Math.min(
        Math.max(footprintRadius + 1.1, footprintRadius + attachmentRadius),
        Math.max(footprintRadius * 1.2, endpointSpan * 0.35)
    );
    const attachmentCaptureDepthX = Math.min(
        Math.max(footprintRadius * 0.65, attachmentRadius + footprintRadius * 0.35),
        Math.max(footprintRadius * 0.8, layout.handleDepth * 0.45)
    );
    const attachmentSurfaces = measureAttachmentSurfaceBounds(
        proofGeometry,
        layout,
        bottomAttachmentY,
        topAttachmentY,
        bottomAttachmentX,
        topAttachmentX,
        attachmentCaptureRadiusY,
        attachmentCaptureDepthX
    );
    const wellRadiusY = Math.min(
        Math.max(footprintRadius * 1.65, layout.stock.insertEndStock + handleFootprintRadius),
        Math.max(footprintRadius * 1.2, endpointSpan * 0.4)
    );
    const wellRadiusZ = Math.max(
        handleVerticalRadius + layout.stock.insertSideStock,
        footprintRadius * 1.3
    );
    const wellLength = layout.stock.insertAttachmentStock;
    const attachmentSideX = Math.max(
        0,
        attachmentSurfaces.top.maxX,
        attachmentSurfaces.bottom.maxX,
        topAttachmentX,
        bottomAttachmentX
    );
    const attachmentPadding = Math.max(layout.options.clearance + 0.35, 0.55);
    const wellStartX = attachmentSideX;
    const wellNeckX = attachmentSideX + Math.min(wellLength * 0.22, wellRadiusZ);
    const wellEndX = attachmentSideX + wellLength;
    const wellCenterX = (wellStartX + wellEndX) / 2;
    const attachmentWellRadii = {
        top: {
            radiusY: Math.max(footprintRadius, attachmentSurfaces.top.radiusY + attachmentPadding),
            radiusZ: Math.max(footprintRadius, attachmentSurfaces.top.radiusZ + attachmentPadding)
        },
        bottom: {
            radiusY: Math.max(footprintRadius, attachmentSurfaces.bottom.radiusY + attachmentPadding),
            radiusZ: Math.max(footprintRadius, attachmentSurfaces.bottom.radiusZ + attachmentPadding)
        }
    };

    return {
        centerline,
        normals,
        handleFootprintRadius,
        footprintRadius,
        wellRadius: wellRadiusZ,
        wellRadiusY,
        wellRadiusZ,
        wellLength,
        wellCenters: [
            new THREE.Vector2(wellCenterX, topAttachmentY),
            new THREE.Vector2(wellCenterX, bottomAttachmentY)
        ],
        attachmentCenters: {
            top: new THREE.Vector2(topAttachmentX, topAttachmentY),
            bottom: new THREE.Vector2(bottomAttachmentX, bottomAttachmentY)
        },
        attachmentCaptureDepthX,
        attachmentCaptureRadiusY,
        attachmentSurfaces,
        attachmentWellRadii,
        attachmentPadding,
        attachmentSideX,
        wellStartX,
        wellNeckX,
        wellEndX
    };
}

export function createHandleMoldLayout(handleParams, mugData, options = {}) {
    const moldMugData = normalizeMugDataForHandleMold(mugData);
    const moldHandleParams = normalizeHandleParamsForHandleMold(handleParams);
    const productGeometry = generateHandleMesh(moldHandleParams, moldMugData);
    const formerProductGeometry = generateHandleMesh(moldHandleParams, moldMugData, { capEnds: false });
    const frame = computeHandleAttachmentFrame(moldHandleParams, moldMugData);
    const proofGeometry = normalizeHandleGeometryToMold(productGeometry, frame);
    const formerGeometry = normalizeHandleGeometryToMold(
        formerProductGeometry,
        frame,
        { preserveSweepOrder: true }
    );
    formerProductGeometry.dispose();

    const layout = calculateHandleMoldLayoutFromProof(proofGeometry, frame, options);
    layout.productProofTransform = {
        referenceX: frame.referenceX,
        centerY: frame.centerY
    };
    layout.footprint = createHandleMoldFootprint(moldHandleParams, moldMugData, frame, layout, proofGeometry);
    layout.footprint.attachmentLoops = extractAttachmentLoopsFromSweepGeometry(formerGeometry);
    applyAttachmentWellProfiles(layout);
    finalizeHandleMoldAssemblyLayout(layout);
    return {
        productProofGeometry: productGeometry,
        proofGeometry,
        formerGeometry,
        layout
    };
}
