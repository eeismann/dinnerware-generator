/**
 * Handle STL Exporter
 * Exports handle geometry to STL format.
 */

import * as THREE from 'three';
import { generateHandleMesh } from './handleMeshGenerator.js';
import {
    downloadBlob,
    geometryToASCIISTLBlob,
    geometryToBinarySTLBlob
} from '../../geometry/stlCore.js';

/**
 * Export handle to STL format
 *
 * @param {Object} handleParams - Handle parameters
 * @param {Object} mugData - Mug reference data
 * @param {Object} options - Export options
 * @returns {Blob} - STL file as blob
 */
export function exportHandleToSTL(handleParams, mugData, options = {}) {
    const {
        orientation = 'mug-relative', // 'mug-relative' or 'centered'
        binary = true
    } = options;

    const geometry = generateHandleMesh(handleParams, mugData);

    try {
        if (orientation === 'centered') {
            geometry.computeBoundingBox();
            const center = new THREE.Vector3();
            geometry.boundingBox.getCenter(center);
            geometry.translate(-center.x, -center.y, -center.z);
        }

        if (binary) {
            return geometryToBinarySTLBlob(geometry, {
                header: 'Playground Ceramics Handle Generator - STL Export',
                logLabel: 'handle-export',
                validationMode: 'strict',
                trackOrientationConflicts: true
            });
        }

        return geometryToASCIISTLBlob(geometry, {
            solidName: 'handle',
            logLabel: 'handle-export-ascii',
            validationMode: 'strict',
            trackOrientationConflicts: true
        });
    } finally {
        geometry.dispose();
    }
}

/**
 * Trigger download of STL file
 *
 * @param {Blob} blob - The STL blob
 * @param {string} filename - The filename
 */
export function downloadSTL(blob, filename) {
    return downloadBlob(blob, filename);
}

/**
 * Get suggested filename for export
 *
 * @param {string} projectName - Project name
 * @returns {string} - Suggested filename
 */
export function getSuggestedFilename(projectName) {
    const sanitized = projectName
        .replace(/[^a-zA-Z0-9\s-_]/g, '')
        .replace(/\s+/g, '_')
        .toLowerCase();

    return `${sanitized}_handle.stl`;
}
