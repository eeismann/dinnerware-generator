/**
 * Vessel Generator - STL Exporter
 * Export vessel mesh to STL format for 3D printing.
 */

import {
    downloadBlob,
    geometryToASCIISTLBlob,
    geometryToBinarySTLBlob,
    groupToMergedGeometry,
    validateGeometryForSTL
} from '../../geometry/stlCore.js';

export class VesselSTLExporter {
    /**
     * Export mesh group to binary STL
     * @param {import('three').Group} meshGroup - Group containing vessel meshes
     * @param {string} filename - Output filename
     * @param {{trackOrientationConflicts?: boolean}} options - Export diagnostics
     */
    static async exportBinary(meshGroup, filename = 'vessel.stl', options = {}) {
        const mergedGeometry = groupToMergedGeometry(meshGroup);

        try {
            if (!mergedGeometry.getAttribute('position')) {
                console.warn('No geometries to export');
                return;
            }

            const blob = geometryToBinarySTLBlob(mergedGeometry, {
                header: 'Vessel Generator STL Export',
                logLabel: 'vessel-export',
                validationMode: 'strict',
                trackOrientationConflicts: options.trackOrientationConflicts ?? true
            });

            return await downloadBlob(blob, filename);
        } finally {
            mergedGeometry.dispose();
        }
    }

    /**
     * Export mesh group to ASCII STL
     * @param {import('three').Group} meshGroup - Group containing vessel meshes
     * @param {string} filename - Output filename
     * @param {{trackOrientationConflicts?: boolean}} options - Export diagnostics
     */
    static async exportASCII(meshGroup, filename = 'vessel.stl', options = {}) {
        const mergedGeometry = groupToMergedGeometry(meshGroup);

        try {
            if (!mergedGeometry.getAttribute('position')) {
                console.warn('No geometries to export');
                return;
            }

            const blob = geometryToASCIISTLBlob(mergedGeometry, {
                logLabel: 'vessel-export-ascii',
                solidName: 'vessel',
                validationMode: 'strict',
                trackOrientationConflicts: options.trackOrientationConflicts ?? true
            });

            return await downloadBlob(blob, filename);
        } finally {
            mergedGeometry.dispose();
        }
    }

    /**
     * Validate geometry is manifold (watertight) for 3D printing
     * @param {import('three').BufferGeometry} geometry
     * @returns {{valid: boolean, warnings: string[], triangleCount: number, degenerateCount: number}}
     */
    static validateForPrinting(geometry) {
        const validation = validateGeometryForSTL(geometry);

        return {
            valid: validation.valid,
            warnings: [...validation.warnings],
            triangleCount: validation.triangleCount,
            degenerateCount: validation.details.degenerateCount
        };
    }
}

export default VesselSTLExporter;
