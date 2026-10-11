/**
 * Cast Form Generator - STL Exporter
 * Exports mold shell geometries as STL files.
 */

import {
    downloadBlob,
    geometryToBinarySTLBlob,
    validateGeometryForSTL
} from '../../geometry/stlCore.js';

export class CastFormSTLExporter {
    /**
     * Export single geometry to binary STL
     * @param {import('three').BufferGeometry} geometry - Geometry to export
     * @param {string} filename - Output filename
     */
    static async exportBinary(geometry, filename) {
        const stlData = this.geometryToSTLBinary(geometry);
        return this.downloadBlob(stlData, filename);
    }

    /**
     * Export all 4 mold parts as individual files
     * @param {{foot: import('three').BufferGeometry, walls: import('three').BufferGeometry[]}} parts
     * @param {string} projectName
     * @param {string[]} selectedParts - Array of part names to export
     */
    static async exportSelected(parts, projectName, selectedParts) {
        const sanitizedName = this.sanitizeFilename(projectName);

        if (selectedParts.includes('foot') && parts.foot) {
            await this.exportBinary(parts.foot, `${sanitizedName}_Shell_Foot.stl`);
        }

        for (const [index, wall] of parts.walls.entries()) {
            if (selectedParts.includes(`wall${index + 1}`) && wall) {
                await this.exportBinary(wall, `${sanitizedName}_Shell_Wall_${index + 1}.stl`);
            }
        }

        if (selectedParts.includes('caseBoxWall') && parts.caseBoxes?.wall) {
            await this.exportBinary(parts.caseBoxes.wall, `${sanitizedName}_Case_Box_Wall.stl`);
        }

        if (selectedParts.includes('caseBoxFoot') && parts.caseBoxes?.foot) {
            await this.exportBinary(parts.caseBoxes.foot, `${sanitizedName}_Case_Box_Foot.stl`);
        }
    }

    /**
     * Export all parts as ZIP archive
     * @param {{foot: import('three').BufferGeometry, walls: import('three').BufferGeometry[]}} parts
     * @param {string} projectName
     */
    static async exportAsZip(parts, projectName) {
        const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;

        const zip = new JSZip();
        const sanitizedName = this.sanitizeFilename(projectName);

        if (parts.foot) {
            const footBlob = this.geometryToSTLBinary(parts.foot);
            zip.file(`${sanitizedName}_Shell_Foot.stl`, footBlob);
        }

        parts.walls.forEach((wall, index) => {
            if (wall) {
                const wallBlob = this.geometryToSTLBinary(wall);
                zip.file(`${sanitizedName}_Shell_Wall_${index + 1}.stl`, wallBlob);
            }
        });

        if (parts.caseBoxes?.wall) {
            zip.file(`${sanitizedName}_Case_Box_Wall.stl`, this.geometryToSTLBinary(parts.caseBoxes.wall));
        }
        if (parts.caseBoxes?.foot) {
            zip.file(`${sanitizedName}_Case_Box_Foot.stl`, this.geometryToSTLBinary(parts.caseBoxes.foot));
        }

        const zipBlob = await zip.generateAsync({ type: 'blob' });
        await this.downloadBlob(zipBlob, `${sanitizedName}_MoldShells.zip`);
    }

    /**
     * Convert geometry to binary STL format
     * @param {import('three').BufferGeometry} geometry
     * @returns {Blob}
     */
    static geometryToSTLBinary(geometry) {
        return geometryToBinarySTLBlob(geometry, {
            header: 'Cast Form Generator STL Export',
            logLabel: 'castform-export',
            validationMode: 'strict',
            validationOptions: {
                weldDecimalPlaces: 5,
                enforceOrientationConsistency: true
            }
        });
    }

    /**
     * Download blob as file
     * @param {Blob} blob
     * @param {string} filename
     */
    static downloadBlob(blob, filename) {
        return downloadBlob(blob, filename);
    }

    /**
     * Sanitize filename for safe export
     * @param {string} name
     * @returns {string}
     */
    static sanitizeFilename(name) {
        return name
            .replace(/[^a-zA-Z0-9\s-_]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50) || 'CastForm';
    }

    /**
     * Get geometry statistics for export preview
     * @param {import('three').BufferGeometry} geometry
     * @returns {{vertices: number, triangles: number, estimatedFileSize: string, valid: boolean, warnings: string[]}}
     */
    static getExportStats(geometry) {
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();

        const triangles = index
            ? index.count / 3
            : position.count / 3;

        const bytes = 84 + triangles * 50;
        const kb = bytes / 1024;
        const mb = kb / 1024;

        const validation = validateGeometryForSTL(geometry);

        return {
            vertices: position.count,
            triangles: Math.floor(triangles),
            estimatedFileSize: mb >= 1
                ? `${mb.toFixed(2)} MB`
                : `${kb.toFixed(0)} KB`,
            valid: validation.valid,
            warnings: validation.warnings
        };
    }
}

export default CastFormSTLExporter;
