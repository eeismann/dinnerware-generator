import * as THREE from 'three';
import { createHandleMoldLayout } from './handleMoldLayout.js';
import { createHandleMoldReadme, calculatePlasterEstimate } from './handleMoldReadme.js';

function sizeFromBox(box) {
    const size = new THREE.Vector3();
    box.getSize(size);
    return size;
}

function centerFromBox(box) {
    const center = new THREE.Vector3();
    box.getCenter(center);
    return center;
}

export function createBoxGeometryFromBox(box) {
    const size = sizeFromBox(box);
    const center = centerFromBox(box);
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z, 1, 1, 1);
    geometry.translate(center.x, center.y, center.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function createRoundedRectShape(minX, minY, maxX, maxY, radius) {
    const width = maxX - minX;
    const height = maxY - minY;
    const r = clamp(radius, 0, Math.min(width, height) / 2);
    const shape = new THREE.Shape();

    shape.moveTo(minX + r, minY);
    shape.lineTo(maxX - r, minY);
    shape.quadraticCurveTo(maxX, minY, maxX, minY + r);
    shape.lineTo(maxX, maxY - r);
    shape.quadraticCurveTo(maxX, maxY, maxX - r, maxY);
    shape.lineTo(minX + r, maxY);
    shape.quadraticCurveTo(minX, maxY, minX, maxY - r);
    shape.lineTo(minX, minY + r);
    shape.quadraticCurveTo(minX, minY, minX + r, minY);

    return shape;
}

function createCircleHole(centerX, centerY, radius) {
    const path = new THREE.Path();
    path.absellipse(centerX, centerY, radius, radius, 0, Math.PI * 2, true);
    return path;
}

function createPathFromVector2Points(points) {
    const path = new THREE.Path();
    const filtered = simplifyPolygonPoints(points).filter((point, index, source) => {
        if (index === 0) return true;
        if (point.distanceToSquared(source[index - 1]) <= 1e-8) return false;
        if (index === source.length - 1 && point.distanceToSquared(source[0]) <= 1e-8) return false;
        return true;
    });

    filtered.forEach((point, index) => {
        if (index === 0) {
            path.moveTo(point.x, point.y);
        } else {
            path.lineTo(point.x, point.y);
        }
    });

    path.closePath();
    return path;
}

function simplifyPolygonPoints(points, collinearEpsilon = 1e-7) {
    let simplified = points.filter((point, index) => {
        if (index === 0) return true;
        return point.distanceToSquared(points[index - 1]) > 1e-8;
    });

    let changed = true;
    while (changed && simplified.length > 3) {
        changed = false;
        const next = [];

        for (let i = 0; i < simplified.length; i++) {
            const previous = simplified[(i - 1 + simplified.length) % simplified.length];
            const current = simplified[i];
            const following = simplified[(i + 1) % simplified.length];
            const ax = current.x - previous.x;
            const ay = current.y - previous.y;
            const bx = following.x - current.x;
            const by = following.y - current.y;
            const cross = Math.abs(ax * by - ay * bx);
            const dot = ax * bx + ay * by;

            if (cross <= collinearEpsilon && dot >= 0) {
                changed = true;
                continue;
            }

            next.push(current);
        }

        simplified = next;
    }

    return simplified;
}

function polygonHasSelfIntersections(points) {
    const orient = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const intersects = (a, b, c, d) => {
        const epsilon = 1e-7;
        const o1 = orient(a, b, c);
        const o2 = orient(a, b, d);
        const o3 = orient(c, d, a);
        const o4 = orient(c, d, b);
        return o1 * o2 < -epsilon && o3 * o4 < -epsilon;
    };

    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];

        for (let j = i + 2; j < points.length; j++) {
            if ((j + 1) % points.length === i) continue;
            const c = points[j];
            const d = points[(j + 1) % points.length];

            if (intersects(a, b, c, d)) {
                return true;
            }
        }
    }

    return false;
}

function createHandleTubeFootprintPoints(layout, extraClearance = 0) {
    const { centerline, normals, footprintRadius } = layout.footprint;
    const radius = footprintRadius + extraClearance;
    const leftSide = centerline.map((point, index) => point.clone().add(normals[index].clone().multiplyScalar(radius)));
    const rightSide = centerline.map((point, index) => point.clone().sub(normals[index].clone().multiplyScalar(radius)));
    return { leftSide, rightSide, radius };
}

function createHandleFormerFootprintPoints(layout, extraClearance = 0) {
    const { centerline, wellRadiusY, wellNeckX, wellEndX } = layout.footprint;
    const { leftSide, rightSide, radius } = createHandleTubeFootprintPoints(layout, extraClearance);
    const bottom = centerline[0];
    const top = centerline[centerline.length - 1];
    const topRight = rightSide[rightSide.length - 1];
    const bottomRight = rightSide[0];
    const wellR = wellRadiusY + extraClearance;
    const wellCapX = wellEndX + extraClearance;
    const wellShoulderX = wellNeckX;
    const points = [
        new THREE.Vector2(wellCapX, bottom.y - wellR),
        new THREE.Vector2(wellShoulderX, bottom.y - wellR),
        leftSide[0],
        ...leftSide.slice(1),
        new THREE.Vector2(wellShoulderX, top.y + wellR),
        new THREE.Vector2(wellCapX, top.y + wellR),
        new THREE.Vector2(wellCapX, top.y - wellR),
        new THREE.Vector2(wellShoulderX, top.y - wellR),
        topRight
    ];

    for (let i = rightSide.length - 2; i >= 0; i--) {
        points.push(rightSide[i]);
    }

    points.push(
        bottomRight,
        new THREE.Vector2(wellShoulderX, bottom.y + wellR),
        new THREE.Vector2(wellCapX, bottom.y + wellR)
    );

    if (!polygonHasSelfIntersections(points)) {
        return points;
    }

    const innerX = Math.min(...rightSide.map((point) => point.x));
    return [
        new THREE.Vector2(wellCapX, bottom.y - wellR),
        new THREE.Vector2(wellShoulderX, bottom.y - wellR),
        leftSide[0],
        ...leftSide.slice(1),
        new THREE.Vector2(wellShoulderX, top.y + wellR),
        new THREE.Vector2(wellCapX, top.y + wellR),
        new THREE.Vector2(wellCapX, top.y - wellR),
        new THREE.Vector2(wellShoulderX, top.y - wellR),
        topRight,
        new THREE.Vector2(innerX, top.y - radius),
        new THREE.Vector2(innerX, bottom.y + radius),
        bottomRight,
        new THREE.Vector2(wellShoulderX, bottom.y + wellR),
        new THREE.Vector2(wellCapX, bottom.y + wellR)
    ];
}

function createHandleFootprintHolePath(layout, extraClearance = 0) {
    return createPathFromVector2Points(createHandleFormerFootprintPoints(layout, extraClearance));
}

function addRegistrationHoles(shape, box, holeCenters, radius) {
    const usableRadius = Math.max(0, radius);
    if (usableRadius <= 0) return;

    holeCenters.forEach(([x, y]) => {
        if (
            x - usableRadius <= box.min.x ||
            x + usableRadius >= box.max.x ||
            y - usableRadius <= box.min.y ||
            y + usableRadius >= box.max.y
        ) {
            return;
        }

        shape.holes.push(createCircleHole(x, y, usableRadius));
    });
}

export function createRoundedPlateGeometryFromBox(box, layout, options = {}) {
    const size = sizeFromBox(box);
    const featureScale = Math.min(size.x, size.y);
    const cornerRadius = clamp(options.cornerRadius ?? featureScale * 0.055, 2, 12);
    const holeRadius = clamp(options.holeRadius ?? featureScale * 0.032, 2.5, 5);
    const shape = createRoundedRectShape(box.min.x, box.min.y, box.max.x, box.max.y, cornerRadius);

    addRegistrationHoles(shape, box, options.holes || [], holeRadius);
    (options.holePaths || []).forEach((holePath) => {
        shape.holes.push(holePath);
    });

    const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: size.z,
        steps: 1,
        bevelEnabled: false,
        curveSegments: 24
    });

    geometry.translate(0, 0, box.min.z);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

function getCornerHoleCenters(box, inset) {
    return [
        [box.min.x + inset, box.min.y + inset],
        [box.min.x + inset, box.max.y - inset],
        [box.max.x - inset, box.min.y + inset],
        [box.max.x - inset, box.max.y - inset]
    ];
}

function createOpenWallFrameShape(box, thickness, isLeftWall) {
    const minX = box.min.x;
    const maxX = box.max.x;
    const minY = box.min.y;
    const maxY = box.max.y;
    const t = Math.min(thickness, (maxX - minX) * 0.45, (maxY - minY) * 0.45);
    const points = isLeftWall
        ? [
            new THREE.Vector2(minX, minY),
            new THREE.Vector2(maxX, minY),
            new THREE.Vector2(maxX, minY + t),
            new THREE.Vector2(minX + t, minY + t),
            new THREE.Vector2(minX + t, maxY - t),
            new THREE.Vector2(maxX, maxY - t),
            new THREE.Vector2(maxX, maxY),
            new THREE.Vector2(minX, maxY)
        ]
        : [
            new THREE.Vector2(minX, minY),
            new THREE.Vector2(maxX, minY),
            new THREE.Vector2(maxX, maxY),
            new THREE.Vector2(minX, maxY),
            new THREE.Vector2(minX, maxY - t),
            new THREE.Vector2(maxX - t, maxY - t),
            new THREE.Vector2(maxX - t, minY + t),
            new THREE.Vector2(minX, minY + t)
        ];

    return new THREE.Shape(points);
}

function getWallInterlock(layout, wallKey) {
    return layout.wallPlateInterlock?.walls?.[wallKey];
}

function getWallRegistrationPoints(layout, wallKey) {
    return (layout.wallPlateInterlock?.points || [])
        .filter((point) => point.wallKey === wallKey);
}

function createWallFooterGeometry(box, layout, wallKey, isLeftWall) {
    const footerHeight = layout.wallPlateInterlock?.footerHeight ?? layout.options.base.wallOverlap;
    const footerShape = createOpenWallFrameShape(box, layout.wallThickness, isLeftWall);

    getWallRegistrationPoints(layout, wallKey).forEach((point) => {
        footerShape.holes.push(createCircleHole(point.center.x, point.center.y, point.radius));
    });

    const geometry = new THREE.ExtrudeGeometry(footerShape, {
        depth: Math.max(0.1, footerHeight),
        steps: 1,
        bevelEnabled: false,
        curveSegments: 24
    });

    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

function createWallWebShape(webs, isLeftWall) {
    const { sideWeb, bottomWeb, topWeb } = webs;
    if (!sideWeb || !bottomWeb || !topWeb) return null;

    const points = isLeftWall
        ? [
            new THREE.Vector2(sideWeb.minX, bottomWeb.minY),
            new THREE.Vector2(bottomWeb.maxX, bottomWeb.minY),
            new THREE.Vector2(bottomWeb.maxX, bottomWeb.maxY),
            new THREE.Vector2(sideWeb.maxX, bottomWeb.maxY),
            new THREE.Vector2(sideWeb.maxX, topWeb.minY),
            new THREE.Vector2(topWeb.maxX, topWeb.minY),
            new THREE.Vector2(topWeb.maxX, topWeb.maxY),
            new THREE.Vector2(sideWeb.minX, topWeb.maxY)
        ]
        : [
            new THREE.Vector2(bottomWeb.minX, bottomWeb.minY),
            new THREE.Vector2(bottomWeb.maxX, bottomWeb.minY),
            new THREE.Vector2(topWeb.maxX, topWeb.maxY),
            new THREE.Vector2(topWeb.minX, topWeb.maxY),
            new THREE.Vector2(topWeb.minX, topWeb.minY),
            new THREE.Vector2(sideWeb.minX, topWeb.minY),
            new THREE.Vector2(sideWeb.minX, bottomWeb.maxY),
            new THREE.Vector2(bottomWeb.minX, bottomWeb.maxY)
        ];

    return new THREE.Shape(points);
}

function createWallWebGeometry(layout, wallKey, isLeftWall) {
    const webs = getWallInterlock(layout, wallKey)?.webs;
    const webShape = webs ? createWallWebShape(webs, isLeftWall) : null;
    if (!webShape) return null;

    const footerHeight = layout.wallPlateInterlock?.footerHeight ?? layout.options.base.wallOverlap;
    const webBaseZ = Math.max(0, footerHeight - 0.05);
    const geometry = new THREE.ExtrudeGeometry(webShape, {
        depth: Math.max(0.1, layout.wallHeight - webBaseZ),
        steps: 1,
        bevelEnabled: false,
        curveSegments: 1
    });

    geometry.translate(0, 0, webBaseZ);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

export function createWallGeometryFromBox(box, layout) {
    const isLeftWall = box.max.x <= layout.wallSplitX + 1e-6;
    const wallKey = isLeftWall ? 'wallA' : 'wallB';
    const pieces = [
        createWallFooterGeometry(box, layout, wallKey, isLeftWall),
        createWallWebGeometry(layout, wallKey, isLeftWall)
    ].filter(Boolean);

    const merged = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    return merged;
}

export function createBottomGeometryFromBox(box, layout) {
    const size = sizeFromBox(box);
    const inset = clamp(Math.min(size.x, size.y) * 0.11, 8, 12);
    const keyHeight = layout.wallPlateInterlock?.keyHeight ?? layout.options.base.wallOverlap;
    const baseBox = box.clone();
    baseBox.max.z = Math.max(box.min.z + 0.1, box.max.z - keyHeight);
    const holePaths = [createHandleFootprintHolePath(layout, layout.options.clearance + 0.25)];
    const base = createRoundedPlateGeometryFromBox(baseBox, layout, {
        cornerRadius: inset,
        holePaths
    });
    const keys = (layout.wallPlateInterlock?.points || []).map((point) => (
        createCylinderZGeometry(
            point.center.x,
            point.center.y,
            baseBox.max.z,
            baseBox.max.z + keyHeight,
            layout.wallPlateInterlock.keyRadius,
            32
        )
    ));
    const pieces = [base, ...keys];
    const merged = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    return merged;
}

function createCylinderZGeometry(centerX, centerY, minZ, maxZ, radius, segments = 32) {
    const height = Math.max(0.1, maxZ - minZ);
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(centerX, centerY, (minZ + maxZ) / 2);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

function createCylinderXGeometry(minX, maxX, centerY, centerZ, radius, segments = 32, radiusEnd = radius) {
    const length = Math.max(0.1, maxX - minX);
    const geometry = new THREE.CylinderGeometry(radiusEnd, radius, length, segments, 1, false);
    geometry.rotateZ(Math.PI / 2);
    geometry.translate((minX + maxX) / 2, centerY, centerZ);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

function sampleBoundaryProfileX(profile, y, fallbackX) {
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

function getSectionXAtPoint(section, y) {
    return sampleBoundaryProfileX(section.boundaryProfile, y, section.x);
}

function createSectionRingPoints(section, centerY, centerZ, segments) {
    if (section.points?.length) {
        return section.points.map((point) => point.clone());
    }

    const points = [];

    for (let i = 0; i < segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const y = centerY + Math.cos(angle) * section.radiusY;
        const z = centerZ + Math.sin(angle) * section.radiusZ;
        points.push(new THREE.Vector3(
            getSectionXAtPoint(section, y),
            y,
            z
        ));
    }

    return points;
}

function createEllipticalLoftXGeometry(sections, centerY, centerZ, segments = 40, options = {}) {
    const vertices = [];
    const indices = [];
    const ringCenters = [];
    const ringSegments = sections.find((section) => section.points?.length)?.points.length || segments;

    sections.forEach((section) => {
        const ring = createSectionRingPoints(section, centerY, centerZ, ringSegments);
        const ringStart = vertices.length / 3;

        for (let i = 0; i < ringSegments; i++) {
            pushVector(vertices, ring[i]);
        }

        const center = new THREE.Vector3();
        for (let i = 0; i < ringSegments; i++) {
            const offset = (ringStart + i) * 3;
            center.x += vertices[offset];
            center.y += vertices[offset + 1];
            center.z += vertices[offset + 2];
        }
        center.divideScalar(ringSegments);
        ringCenters.push(center);
    });

    for (let ring = 0; ring < sections.length - 1; ring++) {
        const currentStart = ring * ringSegments;
        const nextStart = (ring + 1) * ringSegments;

        for (let i = 0; i < ringSegments; i++) {
            const next = (i + 1) % ringSegments;
            const a0 = currentStart + i;
            const a1 = currentStart + next;
            const b0 = nextStart + i;
            const b1 = nextStart + next;

            indices.push(a0, a1, b0);
            indices.push(a1, b1, b0);
        }
    }

    if (options.capStart !== false) {
        const minCenter = vertices.length / 3;
        vertices.push(ringCenters[0].x, ringCenters[0].y, ringCenters[0].z);

        for (let i = 0; i < ringSegments; i++) {
            const next = (i + 1) % ringSegments;
            indices.push(minCenter, next, i);
        }
    }

    if (options.capEnd !== false) {
        const maxCenter = vertices.length / 3;
        const lastCenter = ringCenters[ringCenters.length - 1];
        vertices.push(lastCenter.x, lastCenter.y, lastCenter.z);

        const lastRingStart = (sections.length - 1) * ringSegments;
        for (let i = 0; i < ringSegments; i++) {
            const next = (i + 1) % ringSegments;
            indices.push(maxCenter, lastRingStart + i, lastRingStart + next);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
}

function createPlanarWellSectionFromLoop(loop, x, profile, radiusY, radiusZ) {
    const scaleY = radiusY / Math.max(1e-6, profile.loopRadiusY ?? profile.contactRadiusY);
    const scaleZ = radiusZ / Math.max(1e-6, profile.loopRadiusZ ?? profile.contactRadiusZ);

    return {
        points: loop.map((point) => {
            const dy = point.y - profile.centerY;
            const dz = point.z - profile.centerZ;
            return new THREE.Vector3(
                x,
                profile.centerY + dy * scaleY,
                profile.centerZ + dz * scaleZ
            );
        })
    };
}

function getAttachmentWellProfile(layout, key, center, attachmentSurface) {
    return layout.footprint.attachmentWellProfiles?.[key] || {
        centerX: center.x,
        centerY: center.y,
        centerZ: attachmentSurface.centerZ ?? 0,
        contactRadiusY: Math.max(layout.footprint.footprintRadius, attachmentSurface.radiusY),
        contactRadiusZ: Math.max(layout.footprint.footprintRadius, attachmentSurface.radiusZ),
        radiusY: layout.footprint.wellRadiusY,
        radiusZ: layout.footprint.wellRadiusZ
    };
}

function createAttachmentWellGeometries(layout) {
    const proofCenter = layout.proofBox.getCenter(new THREE.Vector3());
    const tubeRadius = layout.footprint.footprintRadius;
    const wellEndX = layout.footprint.wellEndX;
    const wellStartX = layout.footprint.wellStartX;
    const neckEndX = layout.footprint.wellNeckX;
    const pieces = [];

    layout.footprint.wellCenters.forEach((center, index) => {
        const key = index === 0 ? 'top' : 'bottom';
        const attachmentRadii = layout.footprint.attachmentWellRadii[key];
        const attachmentSurface = layout.footprint.attachmentSurfaces[key];
        const profile = getAttachmentWellProfile(layout, key, center, attachmentSurface);
        const attachmentLoopSource = layout.footprint.attachmentLoops?.[key] || [];
        const attachmentLoop = key === 'top'
            ? [...attachmentLoopSource].reverse()
            : attachmentLoopSource;
        const attachmentRadiusY = Math.max(tubeRadius, attachmentRadii.radiusY);
        const attachmentRadiusZ = Math.max(tubeRadius, attachmentRadii.radiusZ);
        const radiusY = Math.max(profile.radiusY, attachmentRadiusY);
        const radiusZ = Math.max(profile.radiusZ, attachmentRadiusZ);
        const contactRadiusY = Math.max(profile.contactRadiusY, tubeRadius);
        const contactRadiusZ = Math.max(profile.contactRadiusZ, tubeRadius);
        const transitionLength = Math.min(
            Math.max(layout.footprint.attachmentPadding * 1.8, 1),
            Math.max(1, (neckEndX - wellStartX) * 0.5)
        );
        const transitionMidX = wellStartX + transitionLength * 0.45;
        const transitionX = wellStartX + transitionLength;
        const sections = [];

        if (attachmentLoop.length >= 3) {
            appendUniqueLoftSection(sections, { points: attachmentLoop });
            appendUniqueLoftSection(sections, createPlanarWellSectionFromLoop(
                attachmentLoop,
                transitionMidX,
                profile,
                contactRadiusY + (radiusY - contactRadiusY) * 0.65,
                contactRadiusZ + (radiusZ - contactRadiusZ) * 0.65
            ));
            appendUniqueLoftSection(sections, createPlanarWellSectionFromLoop(
                attachmentLoop,
                transitionX,
                profile,
                radiusY,
                radiusZ
            ));
            appendUniqueLoftSection(sections, createPlanarWellSectionFromLoop(
                attachmentLoop,
                neckEndX,
                profile,
                radiusY,
                radiusZ
            ));
            appendUniqueLoftSection(sections, createPlanarWellSectionFromLoop(
                attachmentLoop,
                wellEndX,
                profile,
                radiusY,
                radiusZ
            ));
        } else {
            appendUniqueLoftSection(sections, {
                x: wellStartX,
                radiusY: attachmentRadiusY,
                radiusZ: attachmentRadiusZ,
                boundaryProfile: attachmentSurface.boundaryProfile
            });
            appendUniqueLoftSection(sections, {
                x: neckEndX,
                radiusY,
                radiusZ
            });
            appendUniqueLoftSection(sections, {
                x: wellEndX,
                radiusY,
                radiusZ
            });
        }

        pieces.push(createEllipticalLoftXGeometry(
            sections,
            profile.centerY,
            profile.centerZ ?? attachmentSurface.centerZ ?? proofCenter.z,
            48,
            { capStart: attachmentLoop.length < 3 }
        ));
    });

    return pieces;
}

function appendUniqueLoftSection(sections, section) {
    const previous = sections[sections.length - 1];
    if (
        previous
        && !previous.points
        && !section.points
        && Math.abs(previous.x - section.x) <= 1e-6
        && Math.abs(previous.radiusY - section.radiusY) <= 1e-6
        && Math.abs(previous.radiusZ - section.radiusZ) <= 1e-6
    ) {
        return;
    }

    sections.push(section);
}

function mergeGeometries(geometries) {
    const positions = [];

    geometries.forEach((geometry) => {
        const source = geometry.getIndex() ? geometry.toNonIndexed() : geometry.clone();
        const position = source.getAttribute('position');
        positions.push(...position.array);
        source.dispose();
    });

    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    merged.computeVertexNormals();
    return merged;
}

const BISECTION_EPSILON = 1e-6;

function pushVector(positions, vector) {
    positions.push(vector.x, vector.y, vector.z);
}

function triangleArea2(a, b, c) {
    const ab = b.clone().sub(a);
    const ac = c.clone().sub(a);
    return ab.cross(ac).length();
}

function pushTriangleIfValid(positions, a, b, c) {
    if (triangleArea2(a, b, c) <= BISECTION_EPSILON) return;

    pushVector(positions, a);
    pushVector(positions, b);
    pushVector(positions, c);
}

function snapToBisectionPlane(vertex, planeZ) {
    const snapped = vertex.clone();
    if (Math.abs(snapped.z - planeZ) <= BISECTION_EPSILON) {
        snapped.z = planeZ;
    }
    return snapped;
}

function isPointKeptByBisection(vertex, planeZ, keep) {
    return keep === 'positive'
        ? vertex.z >= planeZ - BISECTION_EPSILON
        : vertex.z <= planeZ + BISECTION_EPSILON;
}

function intersectEdgeAtZ(a, b, planeZ) {
    const denominator = b.z - a.z;
    if (Math.abs(denominator) <= BISECTION_EPSILON) {
        return snapToBisectionPlane(a, planeZ);
    }

    const t = clamp((planeZ - a.z) / denominator, 0, 1);
    return new THREE.Vector3(
        a.x + (b.x - a.x) * t,
        a.y + (b.y - a.y) * t,
        planeZ
    );
}

function clipPolygonAtZ(points, planeZ, keep) {
    const clipped = [];

    for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const previous = points[(i - 1 + points.length) % points.length];
        const currentInside = isPointKeptByBisection(current, planeZ, keep);
        const previousInside = isPointKeptByBisection(previous, planeZ, keep);

        if (currentInside) {
            if (!previousInside) {
                clipped.push(intersectEdgeAtZ(previous, current, planeZ));
            }
            clipped.push(snapToBisectionPlane(current, planeZ));
        } else if (previousInside) {
            clipped.push(intersectEdgeAtZ(previous, current, planeZ));
        }
    }

    return clipped.filter((point, index, source) => {
        if (index === 0) return true;
        return point.distanceToSquared(source[index - 1]) > BISECTION_EPSILON * BISECTION_EPSILON;
    });
}

function capPointKey(point) {
    const scale = 1e5;
    return `${Math.round(point.x * scale)},${Math.round(point.y * scale)}`;
}

function addCapSegment(capSegments, pointsOnPlane) {
    if (pointsOnPlane.length < 2) return;

    let bestA = pointsOnPlane[0];
    let bestB = pointsOnPlane[1];
    let bestDistance = bestA.distanceToSquared(bestB);

    for (let i = 0; i < pointsOnPlane.length; i++) {
        for (let j = i + 1; j < pointsOnPlane.length; j++) {
            const distance = pointsOnPlane[i].distanceToSquared(pointsOnPlane[j]);
            if (distance > bestDistance) {
                bestA = pointsOnPlane[i];
                bestB = pointsOnPlane[j];
                bestDistance = distance;
            }
        }
    }

    if (bestDistance <= BISECTION_EPSILON * BISECTION_EPSILON) return;
    capSegments.push([bestA.clone(), bestB.clone()]);
}

function collectCapSegment(capSegments, clipped, hadDiscardedSide, planeZ) {
    if (!hadDiscardedSide) return;

    const pointsOnPlane = [];
    const seen = new Set();

    clipped.forEach((point) => {
        if (Math.abs(point.z - planeZ) > BISECTION_EPSILON) return;

        const key = capPointKey(point);
        if (seen.has(key)) return;

        seen.add(key);
        pointsOnPlane.push(point);
    });

    addCapSegment(capSegments, pointsOnPlane);
}

function pointOnSegment2D(point, a, b) {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const apX = point.x - a.x;
    const apY = point.y - a.y;
    const lengthSq = abX * abX + abY * abY;
    if (lengthSq <= BISECTION_EPSILON * BISECTION_EPSILON) return false;

    const cross = Math.abs(abX * apY - abY * apX);
    const tolerance = Math.max(1e-5, Math.sqrt(lengthSq) * 1e-5);
    if (cross > tolerance) return false;

    const dot = apX * abX + apY * abY;
    return dot > BISECTION_EPSILON && dot < lengthSq - BISECTION_EPSILON;
}

function createSplitCapSegments(capSegments) {
    const pointByKey = new Map();
    const rawSegments = [];

    capSegments.forEach(([a, b]) => {
        const aKey = capPointKey(a);
        const bKey = capPointKey(b);
        if (aKey === bKey) return;

        pointByKey.set(aKey, a);
        pointByKey.set(bKey, b);
        rawSegments.push([aKey, bKey]);
    });

    const allPointKeys = Array.from(pointByKey.keys());
    const segmentByKey = new Map();
    const addSegment = (aKey, bKey) => {
        if (aKey === bKey) return;

        const segmentKey = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
        if (!segmentByKey.has(segmentKey)) {
            segmentByKey.set(segmentKey, [aKey, bKey]);
        }
    };

    rawSegments.forEach(([aKey, bKey]) => {
        const a = pointByKey.get(aKey);
        const b = pointByKey.get(bKey);
        const splitPoints = [
            { key: aKey, t: 0 },
            { key: bKey, t: 1 }
        ];
        const abX = b.x - a.x;
        const abY = b.y - a.y;
        const lengthSq = abX * abX + abY * abY;

        allPointKeys.forEach((key) => {
            if (key === aKey || key === bKey) return;

            const point = pointByKey.get(key);
            if (!pointOnSegment2D(point, a, b)) return;

            const t = ((point.x - a.x) * abX + (point.y - a.y) * abY) / lengthSq;
            splitPoints.push({ key, t });
        });

        splitPoints
            .sort((left, right) => left.t - right.t)
            .forEach((point, index, source) => {
                if (index === 0) return;
                addSegment(source[index - 1].key, point.key);
            });
    });

    return {
        pointByKey,
        segments: Array.from(segmentByKey.values()).map(([aKey, bKey], index) => ({
            index,
            aKey,
            bKey
        }))
    };
}

function createCapLoops(capSegments) {
    const { pointByKey, segments } = createSplitCapSegments(capSegments);
    const adjacency = new Map();

    segments.forEach((segment) => {
        [segment.aKey, segment.bKey].forEach((key) => {
            if (!adjacency.has(key)) adjacency.set(key, []);
            adjacency.get(key).push(segment);
        });
    });

    const used = new Set();
    const loops = [];

    segments.forEach((segment) => {
        if (used.has(segment.index)) return;

        used.add(segment.index);
        const startKey = segment.aKey;
        let previousKey = segment.aKey;
        let currentKey = segment.bKey;
        const path = [startKey, currentKey];

        for (let guard = 0; guard < segments.length + 2 && currentKey !== startKey; guard++) {
            const candidates = (adjacency.get(currentKey) || [])
                .filter((candidate) => !used.has(candidate.index));
            if (candidates.length === 0) break;

            const nextSegment = candidates.find((candidate) => {
                const otherKey = candidate.aKey === currentKey ? candidate.bKey : candidate.aKey;
                return otherKey !== previousKey;
            }) || candidates[0];

            used.add(nextSegment.index);
            const nextKey = nextSegment.aKey === currentKey ? nextSegment.bKey : nextSegment.aKey;
            previousKey = currentKey;
            currentKey = nextKey;
            path.push(currentKey);
        }

        if (currentKey !== startKey || path.length < 4) return;

        const loop = path.slice(0, -1).map((key) => pointByKey.get(key));
        if (loop.length >= 3) loops.push(loop);
    });

    return loops;
}

function pushOrientedCapTriangle(positions, a, b, c, keep) {
    const normalZ = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const shouldFaceNegativeZ = keep === 'positive';

    if ((shouldFaceNegativeZ && normalZ > 0) || (!shouldFaceNegativeZ && normalZ < 0)) {
        pushTriangleIfValid(positions, a, c, b);
    } else {
        pushTriangleIfValid(positions, a, b, c);
    }
}

function getEdgeSplitPoints(a, b, contourPoints) {
    const abX = b.x - a.x;
    const abY = b.y - a.y;
    const lengthSq = abX * abX + abY * abY;

    if (lengthSq <= BISECTION_EPSILON * BISECTION_EPSILON) return [];

    const splitEpsilon = Math.max(BISECTION_EPSILON * 10, 1e-5);

    return contourPoints
        .filter((point) => pointOnSegment2D(point, a, b))
        .map((point) => ({
            point,
            t: ((point.x - a.x) * abX + (point.y - a.y) * abY) / lengthSq
        }))
        .filter(({ t }) => t > splitEpsilon && t < 1 - splitEpsilon)
        .sort((left, right) => left.t - right.t)
        .filter((entry, index, entries) => (
            index === 0
            || Math.abs(entry.t - entries[index - 1].t) > splitEpsilon
        ))
        .map(({ point }) => point);
}

function pushCapTriangleWithBoundarySplits(positions, a, b, c, contourPoints, keep, depth = 0, visited = new Set()) {
    const triangleKey = [capPointKey(a), capPointKey(b), capPointKey(c)]
        .sort()
        .join('|');
    if (visited.has(triangleKey)) {
        return;
    }
    visited.add(triangleKey);

    if (depth > 12) {
        pushOrientedCapTriangle(positions, a, b, c, keep);
        return;
    }

    const edges = [
        [a, b, c],
        [b, c, a],
        [c, a, b]
    ];

    for (const [edgeA, edgeB, opposite] of edges) {
        const splitPoints = getEdgeSplitPoints(edgeA, edgeB, contourPoints);
        if (splitPoints.length === 0) continue;

        const chain = [edgeA, ...splitPoints, edgeB];
        for (let i = 0; i < chain.length - 1; i++) {
            pushCapTriangleWithBoundarySplits(
                positions,
                chain[i],
                chain[i + 1],
                opposite,
                contourPoints,
                keep,
                depth + 1,
                visited
            );
        }
        return;
    }

    pushOrientedCapTriangle(positions, a, b, c, keep);
}

function pushCapTriangles(positions, capSegments, planeZ, keep) {
    const loops = createCapLoops(capSegments);

    loops.forEach((loop) => {
        const contour = loop.map((point) => new THREE.Vector2(point.x, point.y));
        const contourPoints = contour.map((point) => new THREE.Vector3(point.x, point.y, planeZ));
        const faces = THREE.ShapeUtils.triangulateShape(contour, []);

        faces.forEach(([aIndex, bIndex, cIndex]) => {
            const a = new THREE.Vector3(contour[aIndex].x, contour[aIndex].y, planeZ);
            const b = new THREE.Vector3(contour[bIndex].x, contour[bIndex].y, planeZ);
            const c = new THREE.Vector3(contour[cIndex].x, contour[cIndex].y, planeZ);
            pushCapTriangleWithBoundarySplits(positions, a, b, c, contourPoints, keep);
        });
    });
}

function deduplicateTrianglePositions(positions) {
    const scale = 1e5;
    const seen = new Set();
    const unique = [];

    for (let i = 0; i < positions.length; i += 9) {
        const keys = [
            `${Math.round(positions[i] * scale)},${Math.round(positions[i + 1] * scale)},${Math.round(positions[i + 2] * scale)}`,
            `${Math.round(positions[i + 3] * scale)},${Math.round(positions[i + 4] * scale)},${Math.round(positions[i + 5] * scale)}`,
            `${Math.round(positions[i + 6] * scale)},${Math.round(positions[i + 7] * scale)},${Math.round(positions[i + 8] * scale)}`
        ].sort().join('|');

        if (seen.has(keys)) continue;

        seen.add(keys);
        unique.push(
            positions[i],
            positions[i + 1],
            positions[i + 2],
            positions[i + 3],
            positions[i + 4],
            positions[i + 5],
            positions[i + 6],
            positions[i + 7],
            positions[i + 8]
        );
    }

    return unique;
}

function createTriangleRecordsFromPositions(positions, decimalPlaces = 4) {
    const scale = 10 ** decimalPlaces;
    const vertexKey = (offset) => [
        Math.round(positions[offset] * scale),
        Math.round(positions[offset + 1] * scale),
        Math.round(positions[offset + 2] * scale)
    ].join(',');
    const edgeKey = (a, b) => {
        const low = a < b ? a : b;
        const high = a < b ? b : a;
        return `${low}|${high}`;
    };
    const records = [];
    const edgeCounts = new Map();

    for (let i = 0; i < positions.length; i += 9) {
        const keys = [vertexKey(i), vertexKey(i + 3), vertexKey(i + 6)];
        const edges = [
            edgeKey(keys[0], keys[1]),
            edgeKey(keys[1], keys[2]),
            edgeKey(keys[2], keys[0])
        ];
        const values = positions.slice(i, i + 9);

        edges.forEach((key) => {
            edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
        });

        records.push({
            values,
            edges
        });
    }

    return { records, edgeCounts };
}

function removeNonManifoldCapArtifacts(positions, planeZ) {
    let cleaned = positions;

    for (let pass = 0; pass < 4; pass++) {
        const { records, edgeCounts } = createTriangleRecordsFromPositions(cleaned, 4);
        const remove = new Set();

        records.forEach((record, index) => {
            const values = record.values;
            const onCap =
                Math.abs(values[2] - planeZ) <= 1e-4
                && Math.abs(values[5] - planeZ) <= 1e-4
                && Math.abs(values[8] - planeZ) <= 1e-4;
            if (!onCap) return;

            const valences = record.edges.map((key) => edgeCounts.get(key) || 0);
            if (valences.some((value) => value === 1) && valences.some((value) => value > 2)) {
                remove.add(index);
            }
        });

        if (remove.size === 0) return cleaned;

        cleaned = records
            .filter((_, index) => !remove.has(index))
            .flatMap((record) => record.values);
    }

    return cleaned;
}

function addTriangleEdge(edgeMap, pointByKey, a, b) {
    const aKey = capPointKey(a);
    const bKey = capPointKey(b);
    if (aKey === bKey) return;

    pointByKey.set(aKey, a);
    pointByKey.set(bKey, b);

    const edgeKey = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    let edge = edgeMap.get(edgeKey);
    if (!edge) {
        edge = { aKey, bKey, count: 0 };
        edgeMap.set(edgeKey, edge);
    }
    edge.count++;
}

function closePlanarBoundaryHoles(positions, planeZ, keep) {
    const pointByKey = new Map();
    const edgeMap = new Map();
    const readPoint = (offset) => new THREE.Vector3(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2]
    );

    for (let i = 0; i < positions.length; i += 9) {
        const a = readPoint(i);
        const b = readPoint(i + 3);
        const c = readPoint(i + 6);
        addTriangleEdge(edgeMap, pointByKey, a, b);
        addTriangleEdge(edgeMap, pointByKey, b, c);
        addTriangleEdge(edgeMap, pointByKey, c, a);
    }

    const capSegments = [];
    edgeMap.forEach((edge) => {
        if (edge.count !== 1) return;

        const a = pointByKey.get(edge.aKey);
        const b = pointByKey.get(edge.bKey);
        if (
            Math.abs(a.z - planeZ) > 1e-4
            || Math.abs(b.z - planeZ) > 1e-4
        ) {
            return;
        }

        capSegments.push([a, b]);
    });

    if (capSegments.length === 0) return positions;

    const patched = [...positions];
    pushCapTriangles(
        patched,
        capSegments,
        planeZ,
        keep === 'positive' ? 'negative' : 'positive'
    );
    return patched;
}

function bisectGeometryAtZ(geometry, planeZ = 0, keep = 'positive') {
    const source = geometry.getIndex() ? geometry.toNonIndexed() : geometry.clone();
    const position = source.getAttribute('position');
    const positions = [];
    const capSegments = [];

    for (let i = 0; i < position.count; i += 3) {
        const triangle = [
            new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)),
            new THREE.Vector3(position.getX(i + 1), position.getY(i + 1), position.getZ(i + 1)),
            new THREE.Vector3(position.getX(i + 2), position.getY(i + 2), position.getZ(i + 2))
        ];
        const triangleOnSplitPlane = triangle.every(
            (point) => Math.abs(point.z - planeZ) <= BISECTION_EPSILON
        );
        if (triangleOnSplitPlane) continue;

        const keptCount = triangle.filter((point) => isPointKeptByBisection(point, planeZ, keep)).length;
        const hadDiscardedSide = keptCount < 3;
        const clipped = clipPolygonAtZ(triangle, planeZ, keep);

        if (clipped.length >= 3) {
            for (let j = 1; j < clipped.length - 1; j++) {
                pushTriangleIfValid(positions, clipped[0], clipped[j], clipped[j + 1]);
            }
        }

        collectCapSegment(capSegments, clipped, hadDiscardedSide, planeZ);
    }

    pushCapTriangles(positions, capSegments, planeZ, keep);
    source.dispose();

    const bisected = new THREE.BufferGeometry();
    const deduplicated = deduplicateTrianglePositions(positions);
    const cleaned = removeNonManifoldCapArtifacts(deduplicated, planeZ);
    const closed = closePlanarBoundaryHoles(cleaned, planeZ, keep);
    const finalPositions = removeNonManifoldCapArtifacts(
        deduplicateTrianglePositions(closed),
        planeZ
    );
    bisected.setAttribute('position', new THREE.Float32BufferAttribute(finalPositions, 3));
    bisected.computeBoundingBox();
    bisected.computeBoundingSphere();
    bisected.computeVertexNormals();
    return bisected;
}

export function createHandleMoldFormerGeometry(layout, proofGeometry, formerGeometry = proofGeometry) {
    const geometry = formerGeometry.clone();
    const normalized = geometry.getIndex() ? geometry.toNonIndexed() : geometry;
    normalized.computeBoundingBox();
    normalized.computeBoundingSphere();
    normalized.computeVertexNormals();

    if (normalized !== geometry) {
        geometry.dispose();
    }

    const wells = createAttachmentWellGeometries(layout);
    const planeZ = layout.bisection?.planeZ ?? 0;
    const keep = layout.bisection?.keep ?? 'positive';
    const connectedFormer = mergeGeometries([normalized, ...wells]);
    const merged = bisectGeometryAtZ(connectedFormer, planeZ, keep);

    normalized.dispose();
    wells.forEach((well) => well.dispose());
    connectedFormer.dispose();

    return merged;
}

function cloneProofGeometry(proofGeometry) {
    const geometry = proofGeometry.clone();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    geometry.computeVertexNormals();
    return geometry;
}

export function generateHandleMoldPackage(handleParams, mugData, options = {}) {
    const { productProofGeometry, proofGeometry, formerGeometry, layout } = createHandleMoldLayout(handleParams, mugData, options);

    const parts = {
        proof: cloneProofGeometry(productProofGeometry || proofGeometry),
        handleMold: createHandleMoldFormerGeometry(layout, proofGeometry, formerGeometry),
        wallA: createWallGeometryFromBox(layout.boxes.wallA, layout),
        wallB: createWallGeometryFromBox(layout.boxes.wallB, layout),
        bottom: createBottomGeometryFromBox(layout.boxes.bottom, layout)
    };

    productProofGeometry?.dispose?.();
    proofGeometry.dispose();
    formerGeometry.dispose();

    return {
        parts,
        layout,
        readme: createHandleMoldReadme(layout),
        plaster: calculatePlasterEstimate(layout)
    };
}

export function disposeHandleMoldPackage(pkg) {
    Object.values(pkg?.parts || {}).forEach((geometry) => geometry?.dispose?.());
}

export function getHandleMoldPartStats(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    const triangles = index ? index.count / 3 : position.count / 3;
    geometry.computeBoundingBox();
    const size = sizeFromBox(geometry.boundingBox);

    return {
        vertices: position.count,
        triangles: Math.floor(triangles),
        size: {
            x: size.x,
            y: size.y,
            z: size.z
        }
    };
}
