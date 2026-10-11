import * as THREE from 'three';

export const MOLD_CONSTRUCTION_PARTS = ['proof', 'handleMold', 'wallA', 'wallB', 'bottom'];

export const DEFAULT_MOLD_CONSTRUCTION_VIEW = {
    explode: 0,
    opacity: 0.68,
    showProof: true,
    showHandleMold: true,
    showWalls: true,
    showBottom: true
};

function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.min(max, Math.max(min, value));
}

function getBoxSize(box) {
    const size = new THREE.Vector3();
    box.getSize(size);
    return size;
}

export function mergeMoldConstructionViewSettings(settings = {}) {
    return {
        ...DEFAULT_MOLD_CONSTRUCTION_VIEW,
        ...settings,
        explode: clamp(settings.explode ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.explode, 0, 1),
        opacity: clamp(settings.opacity ?? DEFAULT_MOLD_CONSTRUCTION_VIEW.opacity, 0.15, 1)
    };
}

export function isMoldConstructionPartVisible(partKey, settings = {}) {
    const merged = mergeMoldConstructionViewSettings(settings);

    if (partKey === 'proof') return merged.showProof;
    if (partKey === 'handleMold') return merged.showHandleMold;
    if (partKey === 'wallA' || partKey === 'wallB') return merged.showWalls;
    if (partKey === 'bottom') return merged.showBottom;
    return true;
}

export function calculateMoldExplodeOffsets(layout) {
    const bottomSize = getBoxSize(layout.boxes.bottom);
    const handleMoldSize = getBoxSize(layout.boxes.handleMold);
    const xGap = Math.max(18, bottomSize.x * 0.22);
    const zGap = Math.max(18, handleMoldSize.z * 1.8);

    return {
        proof: new THREE.Vector3(0, 0, 0),
        handleMold: new THREE.Vector3(0, 0, zGap * 1.35),
        wallA: new THREE.Vector3(-xGap, 0, 0),
        wallB: new THREE.Vector3(xGap, 0, 0),
        bottom: new THREE.Vector3(0, 0, -zGap)
    };
}

export function getMoldConstructionPartPosition(partKey, layout, settings = {}) {
    const merged = mergeMoldConstructionViewSettings(settings);
    const offsets = calculateMoldExplodeOffsets(layout);
    const offset = offsets[partKey] || new THREE.Vector3();
    return offset.clone().multiplyScalar(merged.explode);
}

export function transformProductProofGeometryToMoldSpace(proofGeometry, layout) {
    const transformed = proofGeometry.clone();
    const position = transformed.getAttribute('position');
    const referenceX = layout.productProofTransform?.referenceX ?? layout.frame?.referenceX;
    const centerY = layout.productProofTransform?.centerY ?? layout.frame?.centerY ?? 0;

    if (!Number.isFinite(referenceX)) {
        transformed.computeBoundingBox();
        transformed.computeBoundingSphere();
        transformed.computeVertexNormals();
        return transformed;
    }

    for (let i = 0; i < position.count; i++) {
        position.setXYZ(
            i,
            referenceX - position.getX(i),
            position.getY(i) - centerY,
            position.getZ(i)
        );
    }

    position.needsUpdate = true;
    transformed.computeBoundingBox();
    transformed.computeBoundingSphere();
    transformed.computeVertexNormals();
    return transformed;
}

export function calculateMoldFitDiagnostics(pkg) {
    const proof = transformProductProofGeometryToMoldSpace(pkg.parts.proof, pkg.layout);
    const handleMold = pkg.parts.handleMold;

    proof.computeBoundingBox();
    handleMold.computeBoundingBox();

    const proofBox = proof.boundingBox;
    const moldBox = handleMold.boundingBox;
    const splitPlaneZ = pkg.layout.bisection?.planeZ ?? (proofBox.min.z + proofBox.max.z) / 2;
    const keepPositive = (pkg.layout.bisection?.keep ?? 'positive') === 'positive';
    const retainedProofBox = proofBox.clone();

    if (keepPositive) {
        retainedProofBox.min.z = splitPlaneZ;
    } else {
        retainedProofBox.max.z = splitPlaneZ;
    }

    const clearances = {
        back: retainedProofBox.min.x - moldBox.min.x,
        attachment: moldBox.max.x - retainedProofBox.max.x,
        bottomEnd: retainedProofBox.min.y - moldBox.min.y,
        topEnd: moldBox.max.y - retainedProofBox.max.y,
        splitFace: keepPositive
            ? retainedProofBox.min.z - moldBox.min.z
            : moldBox.max.z - retainedProofBox.max.z,
        retainedSide: keepPositive
            ? moldBox.max.z - retainedProofBox.max.z
            : retainedProofBox.min.z - moldBox.min.z
    };
    const minClearance = Math.min(...Object.values(clearances));
    const formerContainsProofHalf = moldBox.containsBox(retainedProofBox);

    const diagnostics = {
        formerContainsProof: formerContainsProofHalf,
        formerContainsProofHalf,
        minClearance,
        clearances,
        splitPlaneZ,
        wallContactOk: Math.abs(pkg.layout.wallContact?.clearance ?? Infinity) <= 0.01,
        wellWallGap: pkg.layout.wallContact?.clearance,
        wallThickness: pkg.layout.wallThickness,
        attachmentDeltaX: pkg.layout.attachmentDeltaX,
        attachmentSlopeDegrees: pkg.layout.attachmentSlopeAngle * 180 / Math.PI
    };

    proof.dispose();
    return diagnostics;
}
