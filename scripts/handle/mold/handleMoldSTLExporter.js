import {
    downloadBlob,
    geometryToBinarySTLBlob,
    geometryToBinarySTLBuffer,
    validateGeometryForSTL
} from '../../geometry/stlCore.js';
import { generateHandleMoldPackage, disposeHandleMoldPackage } from './handleMoldGenerator.js';
import { HANDLE_MOLD_PART_NAMES } from './handleMoldDefaults.js';

export { generateHandleMoldPackage, disposeHandleMoldPackage };

export function sanitizeHandleMoldFilename(name) {
    return String(name || 'Handle_Mold')
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50) || 'Handle_Mold';
}

export function getSuggestedMoldPackageFilename(projectName) {
    return `${sanitizeHandleMoldFilename(projectName)}_MoldKit.zip`;
}

export function getSuggestedMoldReadmeFilename(projectName) {
    return `${sanitizeHandleMoldFilename(projectName)}_readme.txt`;
}

function getSTLOptions(partName) {
    return {
        header: `Playground Ceramics Handle Mold - ${partName}`,
        logLabel: `handle-mold-${partName}`,
        validationMode: 'strict',
        validationOptions: {
            weldDecimalPlaces: 4,
            enforceOrientationConsistency: true
        },
        trackOrientationConflicts: true
    };
}

export function getHandleMoldFileEntries(pkg, projectName, options = {}) {
    const sanitized = sanitizeHandleMoldFilename(projectName);
    const entries = [];
    const asBlob = options.asBlob === true;

    Object.entries(HANDLE_MOLD_PART_NAMES).forEach(([key, partName]) => {
        const geometry = pkg.parts[key];
        if (!geometry) return;
        const filename = `${sanitized}_${partName}.stl`;
        const stlOptions = getSTLOptions(partName);
        const data = asBlob
            ? geometryToBinarySTLBlob(geometry, stlOptions)
            : geometryToBinarySTLBuffer(geometry, stlOptions);
        entries.push({
            key,
            filename,
            type: 'stl',
            data
        });
    });

    entries.push({
        key: 'readme',
        filename: getSuggestedMoldReadmeFilename(projectName),
        type: 'text',
        data: asBlob
            ? new Blob([pkg.readme], { type: 'text/plain' })
            : pkg.readme
    });

    return entries;
}

export function getHandleMoldExportStats(pkg) {
    return Object.entries(HANDLE_MOLD_PART_NAMES).map(([key, partName]) => {
        const geometry = pkg.parts[key];
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        const triangles = index ? index.count / 3 : position.count / 3;
        const validation = validateGeometryForSTL(geometry, {
            weldDecimalPlaces: 4,
            enforceOrientationConsistency: true
        });
        geometry.computeBoundingBox();
        return {
            key,
            partName,
            vertices: position.count,
            triangles: Math.floor(triangles),
            valid: validation.valid,
            warnings: validation.warnings,
            boundingBox: geometry.boundingBox.clone()
        };
    });
}

export async function exportHandleMoldPackageAsZip(handleParams, mugData, projectName, options = {}) {
    const pkg = generateHandleMoldPackage(handleParams, mugData, options);

    try {
        const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
        const zip = new JSZip();
        const entries = getHandleMoldFileEntries(pkg, projectName, { asBlob: false });

        entries.forEach((entry) => {
            zip.file(entry.filename, entry.data);
        });

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await downloadBlob(zipBlob, getSuggestedMoldPackageFilename(projectName));
        return {
            layout: pkg.layout,
            plaster: pkg.plaster,
            stats: getHandleMoldExportStats(pkg)
        };
    } finally {
        disposeHandleMoldPackage(pkg);
    }
}

export function createHandleMoldPackageForExport(handleParams, mugData, projectName, options = {}) {
    const pkg = generateHandleMoldPackage(handleParams, mugData, options);
    const entries = getHandleMoldFileEntries(pkg, projectName, { asBlob: false });
    const stats = getHandleMoldExportStats(pkg);
    return {
        ...pkg,
        entries,
        stats
    };
}
