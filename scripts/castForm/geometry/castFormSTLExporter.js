/**
 * Cast Form Generator - STL Exporter
 * Exports mold shell geometries as STL files
 */

import * as THREE from 'three';

export class CastFormSTLExporter {
    
    /**
     * Export single geometry to binary STL
     * @param {THREE.BufferGeometry} geometry - Geometry to export
     * @param {string} filename - Output filename
     */
    static exportBinary(geometry, filename) {
        const stlData = this.geometryToSTLBinary(geometry);
        this.downloadBlob(stlData, filename);
    }

    /**
     * Export all 4 mold parts as individual files
     * @param {{foot: THREE.BufferGeometry, walls: THREE.BufferGeometry[]}} parts 
     * @param {string} projectName 
     * @param {string[]} selectedParts - Array of part names to export
     */
    static exportSelected(parts, projectName, selectedParts) {
        const sanitizedName = this.sanitizeFilename(projectName);
        
        if (selectedParts.includes('foot') && parts.foot) {
            this.exportBinary(parts.foot, `${sanitizedName}_Shell_Foot.stl`);
        }
        
        parts.walls.forEach((wall, index) => {
            if (selectedParts.includes(`wall${index + 1}`) && wall) {
                this.exportBinary(wall, `${sanitizedName}_Shell_Wall_${index + 1}.stl`);
            }
        });
    }

    /**
     * Export all parts as ZIP archive
     * @param {{foot: THREE.BufferGeometry, walls: THREE.BufferGeometry[]}} parts 
     * @param {string} projectName 
     */
    static async exportAsZip(parts, projectName) {
        // Dynamic import of JSZip
        const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
        
        const zip = new JSZip();
        const sanitizedName = this.sanitizeFilename(projectName);
        
        // Add foot
        if (parts.foot) {
            const footBlob = this.geometryToSTLBinary(parts.foot);
            zip.file(`${sanitizedName}_Shell_Foot.stl`, footBlob);
        }
        
        // Add walls
        parts.walls.forEach((wall, index) => {
            if (wall) {
                const wallBlob = this.geometryToSTLBinary(wall);
                zip.file(`${sanitizedName}_Shell_Wall_${index + 1}.stl`, wallBlob);
            }
        });
        
        // Generate and download ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        this.downloadBlob(zipBlob, `${sanitizedName}_MoldShells.zip`);
    }

    /**
     * Convert geometry to binary STL format
     * @param {THREE.BufferGeometry} geometry 
     * @returns {Blob}
     */
    static geometryToSTLBinary(geometry) {
        // Ensure geometry has non-indexed format for STL
        let exportGeometry = geometry;
        if (geometry.index) {
            exportGeometry = geometry.toNonIndexed();
        }
        
        const position = exportGeometry.getAttribute('position');
        const normal = exportGeometry.getAttribute('normal');
        
        if (!position) {
            console.error('Geometry has no position attribute');
            return new Blob([]);
        }
        
        const triangleCount = Math.floor(position.count / 3);
        
        // STL binary format:
        // - 80 bytes header
        // - 4 bytes triangle count (uint32)
        // - For each triangle:
        //   - 12 bytes normal (3 floats)
        //   - 36 bytes vertices (9 floats)
        //   - 2 bytes attribute byte count
        
        const bufferSize = 80 + 4 + triangleCount * 50;
        const buffer = new ArrayBuffer(bufferSize);
        const dataView = new DataView(buffer);
        
        // Write header
        const header = 'Cast Form Generator STL Export';
        for (let i = 0; i < 80; i++) {
            dataView.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
        }
        
        // Write triangle count
        dataView.setUint32(80, triangleCount, true);
        
        let offset = 84;
        
        for (let i = 0; i < triangleCount; i++) {
            const baseIdx = i * 3;
            
            // Calculate or get normal
            let nx, ny, nz;
            
            if (normal) {
                // Average vertex normals for face normal
                nx = (normal.getX(baseIdx) + normal.getX(baseIdx + 1) + normal.getX(baseIdx + 2)) / 3;
                ny = (normal.getY(baseIdx) + normal.getY(baseIdx + 1) + normal.getY(baseIdx + 2)) / 3;
                nz = (normal.getZ(baseIdx) + normal.getZ(baseIdx + 1) + normal.getZ(baseIdx + 2)) / 3;
                
                // Normalize
                const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
                if (len > 0) {
                    nx /= len;
                    ny /= len;
                    nz /= len;
                }
            } else {
                // Calculate from vertices
                const v0 = new THREE.Vector3(
                    position.getX(baseIdx),
                    position.getY(baseIdx),
                    position.getZ(baseIdx)
                );
                const v1 = new THREE.Vector3(
                    position.getX(baseIdx + 1),
                    position.getY(baseIdx + 1),
                    position.getZ(baseIdx + 1)
                );
                const v2 = new THREE.Vector3(
                    position.getX(baseIdx + 2),
                    position.getY(baseIdx + 2),
                    position.getZ(baseIdx + 2)
                );
                
                const edge1 = v1.clone().sub(v0);
                const edge2 = v2.clone().sub(v0);
                const faceNormal = edge1.cross(edge2).normalize();
                
                nx = faceNormal.x;
                ny = faceNormal.y;
                nz = faceNormal.z;
            }
            
            // Write normal
            dataView.setFloat32(offset, nx, true); offset += 4;
            dataView.setFloat32(offset, ny, true); offset += 4;
            dataView.setFloat32(offset, nz, true); offset += 4;
            
            // Write vertices
            for (let j = 0; j < 3; j++) {
                dataView.setFloat32(offset, position.getX(baseIdx + j), true); offset += 4;
                dataView.setFloat32(offset, position.getY(baseIdx + j), true); offset += 4;
                dataView.setFloat32(offset, position.getZ(baseIdx + j), true); offset += 4;
            }
            
            // Write attribute byte count (0)
            dataView.setUint16(offset, 0, true); offset += 2;
        }
        
        return new Blob([buffer], { type: 'application/octet-stream' });
    }

    /**
     * Download blob as file
     * @param {Blob} blob 
     * @param {string} filename 
     */
    static downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
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
     * @param {THREE.BufferGeometry} geometry 
     * @returns {{vertices: number, triangles: number, estimatedFileSize: string}}
     */
    static getExportStats(geometry) {
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        
        const triangles = index 
            ? index.count / 3 
            : position.count / 3;
        
        // Estimate file size (header + triangles * 50 bytes)
        const bytes = 84 + triangles * 50;
        const kb = bytes / 1024;
        const mb = kb / 1024;
        
        return {
            vertices: position.count,
            triangles: Math.floor(triangles),
            estimatedFileSize: mb >= 1 
                ? `${mb.toFixed(2)} MB` 
                : `${kb.toFixed(0)} KB`
        };
    }
}

export default CastFormSTLExporter;



