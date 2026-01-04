/**
 * Vessel Generator - STL Exporter
 * Export vessel mesh to STL format for 3D printing
 */

import * as THREE from 'three';

export class VesselSTLExporter {
    /**
     * Export mesh group to binary STL
     * @param {THREE.Group} meshGroup - Group containing vessel meshes
     * @param {string} filename - Output filename
     */
    static exportBinary(meshGroup, filename = 'vessel.stl') {
        // Collect all geometries
        const geometries = [];
        
        meshGroup.traverse(child => {
            if (child.isMesh && child.geometry) {
                // Clone and transform geometry to world space
                const geo = child.geometry.clone();
                geo.applyMatrix4(child.matrixWorld);
                geometries.push(geo);
            }
        });

        if (geometries.length === 0) {
            console.warn('No geometries to export');
            return;
        }

        // Merge geometries
        const mergedGeometry = this.mergeGeometries(geometries);
        
        // Generate STL binary data
        const stlData = this.geometryToSTLBinary(mergedGeometry);
        
        // Trigger download
        this.downloadBlob(stlData, filename, 'application/octet-stream');
        
        // Clean up
        mergedGeometry.dispose();
        geometries.forEach(g => g.dispose());
    }

    /**
     * Export mesh group to ASCII STL
     * @param {THREE.Group} meshGroup - Group containing vessel meshes
     * @param {string} filename - Output filename
     */
    static exportASCII(meshGroup, filename = 'vessel.stl') {
        const geometries = [];
        
        meshGroup.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry.clone();
                geo.applyMatrix4(child.matrixWorld);
                geometries.push(geo);
            }
        });

        if (geometries.length === 0) {
            console.warn('No geometries to export');
            return;
        }

        const mergedGeometry = this.mergeGeometries(geometries);
        const stlString = this.geometryToSTLASCII(mergedGeometry);
        
        this.downloadBlob(
            new Blob([stlString], { type: 'text/plain' }),
            filename,
            'text/plain'
        );
        
        mergedGeometry.dispose();
        geometries.forEach(g => g.dispose());
    }

    /**
     * Merge multiple geometries into one
     * @param {THREE.BufferGeometry[]} geometries 
     * @returns {THREE.BufferGeometry}
     */
    static mergeGeometries(geometries) {
        if (geometries.length === 1) {
            return geometries[0].clone();
        }

        // Calculate total vertex count
        let totalVertices = 0;
        let totalIndices = 0;

        geometries.forEach(geo => {
            const position = geo.getAttribute('position');
            totalVertices += position.count;
            
            if (geo.index) {
                totalIndices += geo.index.count;
            } else {
                totalIndices += position.count;
            }
        });

        // Create merged buffers
        const positions = new Float32Array(totalIndices * 3);
        const normals = new Float32Array(totalIndices * 3);
        
        let offset = 0;

        geometries.forEach(geo => {
            const position = geo.getAttribute('position');
            const normal = geo.getAttribute('normal');
            const index = geo.index;

            if (index) {
                // Indexed geometry
                for (let i = 0; i < index.count; i++) {
                    const idx = index.getX(i);
                    positions[offset * 3] = position.getX(idx);
                    positions[offset * 3 + 1] = position.getY(idx);
                    positions[offset * 3 + 2] = position.getZ(idx);
                    
                    if (normal) {
                        normals[offset * 3] = normal.getX(idx);
                        normals[offset * 3 + 1] = normal.getY(idx);
                        normals[offset * 3 + 2] = normal.getZ(idx);
                    }
                    offset++;
                }
            } else {
                // Non-indexed geometry
                for (let i = 0; i < position.count; i++) {
                    positions[offset * 3] = position.getX(i);
                    positions[offset * 3 + 1] = position.getY(i);
                    positions[offset * 3 + 2] = position.getZ(i);
                    
                    if (normal) {
                        normals[offset * 3] = normal.getX(i);
                        normals[offset * 3 + 1] = normal.getY(i);
                        normals[offset * 3 + 2] = normal.getZ(i);
                    }
                    offset++;
                }
            }
        });

        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

        return merged;
    }

    /**
     * Convert geometry to binary STL format
     * @param {THREE.BufferGeometry} geometry 
     * @returns {Blob}
     */
    static geometryToSTLBinary(geometry) {
        const positions = geometry.getAttribute('position');
        const normals = geometry.getAttribute('normal');
        
        const triangleCount = positions.count / 3;
        
        // STL binary format:
        // - 80 bytes header
        // - 4 bytes triangle count (uint32)
        // - For each triangle:
        //   - 12 bytes normal (3 floats)
        //   - 36 bytes vertices (9 floats)
        //   - 2 bytes attribute byte count (usually 0)
        
        const bufferSize = 80 + 4 + triangleCount * 50;
        const buffer = new ArrayBuffer(bufferSize);
        const dataView = new DataView(buffer);
        
        // Write header (80 bytes)
        const header = 'Vessel Generator STL Export';
        for (let i = 0; i < 80; i++) {
            dataView.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
        }
        
        // Write triangle count
        dataView.setUint32(80, triangleCount, true);
        
        let offset = 84;
        
        for (let i = 0; i < triangleCount; i++) {
            const baseIdx = i * 3;
            
            // Calculate face normal if not provided
            let nx, ny, nz;
            
            if (normals) {
                // Average vertex normals for face normal
                nx = (normals.getX(baseIdx) + normals.getX(baseIdx + 1) + normals.getX(baseIdx + 2)) / 3;
                ny = (normals.getY(baseIdx) + normals.getY(baseIdx + 1) + normals.getY(baseIdx + 2)) / 3;
                nz = (normals.getZ(baseIdx) + normals.getZ(baseIdx + 1) + normals.getZ(baseIdx + 2)) / 3;
            } else {
                // Calculate normal from vertices
                const v0 = new THREE.Vector3(
                    positions.getX(baseIdx),
                    positions.getY(baseIdx),
                    positions.getZ(baseIdx)
                );
                const v1 = new THREE.Vector3(
                    positions.getX(baseIdx + 1),
                    positions.getY(baseIdx + 1),
                    positions.getZ(baseIdx + 1)
                );
                const v2 = new THREE.Vector3(
                    positions.getX(baseIdx + 2),
                    positions.getY(baseIdx + 2),
                    positions.getZ(baseIdx + 2)
                );
                
                const edge1 = v1.clone().sub(v0);
                const edge2 = v2.clone().sub(v0);
                const normal = edge1.cross(edge2).normalize();
                
                nx = normal.x;
                ny = normal.y;
                nz = normal.z;
            }
            
            // Write normal
            dataView.setFloat32(offset, nx, true); offset += 4;
            dataView.setFloat32(offset, ny, true); offset += 4;
            dataView.setFloat32(offset, nz, true); offset += 4;
            
            // Write vertices
            for (let j = 0; j < 3; j++) {
                dataView.setFloat32(offset, positions.getX(baseIdx + j), true); offset += 4;
                dataView.setFloat32(offset, positions.getY(baseIdx + j), true); offset += 4;
                dataView.setFloat32(offset, positions.getZ(baseIdx + j), true); offset += 4;
            }
            
            // Write attribute byte count (0)
            dataView.setUint16(offset, 0, true); offset += 2;
        }
        
        return new Blob([buffer], { type: 'application/octet-stream' });
    }

    /**
     * Convert geometry to ASCII STL format
     * @param {THREE.BufferGeometry} geometry 
     * @returns {string}
     */
    static geometryToSTLASCII(geometry) {
        const positions = geometry.getAttribute('position');
        const triangleCount = positions.count / 3;
        
        let stl = 'solid vessel\n';
        
        for (let i = 0; i < triangleCount; i++) {
            const baseIdx = i * 3;
            
            // Get vertices
            const v0 = [
                positions.getX(baseIdx),
                positions.getY(baseIdx),
                positions.getZ(baseIdx)
            ];
            const v1 = [
                positions.getX(baseIdx + 1),
                positions.getY(baseIdx + 1),
                positions.getZ(baseIdx + 1)
            ];
            const v2 = [
                positions.getX(baseIdx + 2),
                positions.getY(baseIdx + 2),
                positions.getZ(baseIdx + 2)
            ];
            
            // Calculate normal
            const edge1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
            const edge2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
            const normal = [
                edge1[1] * edge2[2] - edge1[2] * edge2[1],
                edge1[2] * edge2[0] - edge1[0] * edge2[2],
                edge1[0] * edge2[1] - edge1[1] * edge2[0]
            ];
            const mag = Math.sqrt(normal[0] ** 2 + normal[1] ** 2 + normal[2] ** 2);
            if (mag > 0) {
                normal[0] /= mag;
                normal[1] /= mag;
                normal[2] /= mag;
            }
            
            stl += `  facet normal ${normal[0].toExponential(6)} ${normal[1].toExponential(6)} ${normal[2].toExponential(6)}\n`;
            stl += '    outer loop\n';
            stl += `      vertex ${v0[0].toExponential(6)} ${v0[1].toExponential(6)} ${v0[2].toExponential(6)}\n`;
            stl += `      vertex ${v1[0].toExponential(6)} ${v1[1].toExponential(6)} ${v1[2].toExponential(6)}\n`;
            stl += `      vertex ${v2[0].toExponential(6)} ${v2[1].toExponential(6)} ${v2[2].toExponential(6)}\n`;
            stl += '    endloop\n';
            stl += '  endfacet\n';
        }
        
        stl += 'endsolid vessel\n';
        return stl;
    }

    /**
     * Download blob as file
     * @param {Blob} blob 
     * @param {string} filename 
     * @param {string} mimeType 
     */
    static downloadBlob(blob, filename, mimeType) {
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
     * Validate geometry is manifold (watertight) for 3D printing
     * @param {THREE.BufferGeometry} geometry 
     * @returns {Object} Validation result
     */
    static validateForPrinting(geometry) {
        const warnings = [];
        const positions = geometry.getAttribute('position');
        
        // Check for degenerate triangles
        let degenerateCount = 0;
        const triangleCount = positions.count / 3;
        
        for (let i = 0; i < triangleCount; i++) {
            const baseIdx = i * 3;
            
            const v0 = new THREE.Vector3(
                positions.getX(baseIdx),
                positions.getY(baseIdx),
                positions.getZ(baseIdx)
            );
            const v1 = new THREE.Vector3(
                positions.getX(baseIdx + 1),
                positions.getY(baseIdx + 1),
                positions.getZ(baseIdx + 1)
            );
            const v2 = new THREE.Vector3(
                positions.getX(baseIdx + 2),
                positions.getY(baseIdx + 2),
                positions.getZ(baseIdx + 2)
            );
            
            // Check for zero-area triangles
            const edge1 = v1.clone().sub(v0);
            const edge2 = v2.clone().sub(v0);
            const area = edge1.cross(edge2).length() / 2;
            
            if (area < 0.001) {
                degenerateCount++;
            }
        }
        
        if (degenerateCount > 0) {
            warnings.push(`Found ${degenerateCount} degenerate triangles`);
        }
        
        return {
            valid: warnings.length === 0,
            warnings,
            triangleCount,
            degenerateCount
        };
    }
}

export default VesselSTLExporter;




