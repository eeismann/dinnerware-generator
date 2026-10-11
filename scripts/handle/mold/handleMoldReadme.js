import * as THREE from 'three';

function boxVolumeMm3(box) {
    const size = new THREE.Vector3();
    box.getSize(size);
    return Math.max(0, size.x) * Math.max(0, size.y) * Math.max(0, size.z);
}

function roundUpTo(value, increment) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.ceil(value / increment) * increment;
}

function formatNumber(value, decimals = 2) {
    return Number(value.toFixed(decimals)).toString();
}

export function calculatePlasterEstimate(layout) {
    const { plaster } = layout.options;
    const outerMin = layout.boxes.wallA.min.clone();
    const outerMax = layout.boxes.wallB.max.clone();
    outerMax.z = Math.max(layout.boxes.wallA.max.z, layout.boxes.wallB.max.z);
    const outerBox = new THREE.Box3(outerMin, outerMax);

    const outerVolumeL = boxVolumeMm3(outerBox) / 1_000_000;
    const handleMoldVolumeL = boxVolumeMm3(layout.boxes.handleMold) / 1_000_000;
    const plasterVolumeL = Math.max(0, outerVolumeL - handleMoldVolumeL);
    const dryPlasterKg = roundUpTo(
        plasterVolumeL * plaster.dryPlasterKgPerLiter,
        plaster.dryPlasterRoundKg
    );
    const waterL = roundUpTo(
        dryPlasterKg * plaster.waterLiterPerKg,
        plaster.waterRoundLiter
    );

    return {
        outerVolumeL,
        handleMoldVolumeL,
        plasterVolumeL,
        dryPlasterKg,
        waterL
    };
}

export function createHandleMoldReadme(layout) {
    const estimate = calculatePlasterEstimate(layout);
    const slopeDegrees = layout.attachmentSlopeAngle * 180 / Math.PI;

    return [
        `Plaster volume ${formatNumber(estimate.plasterVolumeL)} L (for a single mold half)`,
        `Dry plaster (rounded) ${formatNumber(estimate.dryPlasterKg, 1)} kg`,
        `Water (rounded) ${formatNumber(estimate.waterL, 2)} L`,
        '',
        'Plaster:',
        'If available, use USG No 1. Pottery plaster. With that for 1L of volume to fill approx 1KG of dry plaster is needed and for each 1 KG of dry plaster, 0.7L of water. The software automatically calculates the plaster volume, rounds up slightly, and produces those numbers.',
        '',
        'Parts:',
        'Handle_Mold is the bisected handle former with attachment wells added at the two mug connection points.',
        'Bottom is the base plate with a matching former cutout.',
        'WallA and WallB wrap the base plate to create the plaster pour box.',
        'Proof is a reference copy of the generated handle, not one of the four functional mold parts.',
        '',
        'Assembly:',
        'Seat Handle_Mold into the Bottom cutout, align WallA and WallB around the base plate, then pour plaster into the wall box around the former.',
        '',
        'Generated mold dimensions:',
        `Proof ${formatNumber(layout.proofSize.x, 1)} x ${formatNumber(layout.proofSize.y, 1)} x ${formatNumber(layout.proofSize.z, 1)} mm`,
        `Handle mold ${formatNumber(layout.boxes.handleMold.max.x - layout.boxes.handleMold.min.x, 1)} x ${formatNumber(layout.boxes.handleMold.max.y - layout.boxes.handleMold.min.y, 1)} x ${formatNumber(layout.boxes.handleMold.max.z - layout.boxes.handleMold.min.z, 1)} mm`,
        `Attachment slope ${formatNumber(slopeDegrees, 2)} degrees`
    ].join('\n');
}
