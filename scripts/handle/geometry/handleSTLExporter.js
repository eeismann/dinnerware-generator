/**
 * Handle STL Exporter
 * Exports handle geometry to STL format
 */

import * as THREE from 'three';
import { generateHandleMesh } from './handleMeshGenerator.js';

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
        binary = true,
    } = options;
    
    // Generate the handle mesh
    const geometry = generateHandleMesh(handleParams, mugData);
    
    // Apply orientation transformation if needed
    if (orientation === 'centered') {
        // Center the geometry at origin
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
    }
    
    // Convert to STL
    if (binary) {
        return exportToBinarySTL(geometry);
    } else {
        return exportToASCIISTL(geometry);
    }
}

/**
 * Export geometry to binary STL format
 * 
 * @param {THREE.BufferGeometry} geometry - The geometry to export
 * @returns {Blob} - Binary STL file
 */
function exportToBinarySTL(geometry) {
    // Ensure we have indices
    let vertices, indices;
    
    const positionAttribute = geometry.getAttribute('position');
    vertices = positionAttribute.array;
    
    if (geometry.getIndex()) {
        indices = geometry.getIndex().array;
    } else {
        // Create sequential indices
        indices = new Uint32Array(positionAttribute.count);
        for (let i = 0; i < positionAttribute.count; i++) {
            indices[i] = i;
        }
    }
    
    const numTriangles = indices.length / 3;
    
    // STL binary format:
    // 80 bytes header
    // 4 bytes number of triangles
    // For each triangle:
    //   12 bytes normal (3 floats)
    //   36 bytes vertices (3 vertices * 3 floats)
    //   2 bytes attribute byte count (unused, set to 0)
    
    const bufferLength = 80 + 4 + (numTriangles * (12 + 36 + 2));
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const dataView = new DataView(arrayBuffer);
    
    // Header (80 bytes) - can be anything
    const header = 'Playground Ceramics Handle Generator - STL Export';
    for (let i = 0; i < 80; i++) {
        dataView.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
    }
    
    // Number of triangles
    dataView.setUint32(80, numTriangles, true);
    
    let offset = 84;
    
    // Write triangles
    for (let i = 0; i < numTriangles; i++) {
        const i0 = indices[i * 3];
        const i1 = indices[i * 3 + 1];
        const i2 = indices[i * 3 + 2];
        
        // Get vertices
        const v0 = new THREE.Vector3(
            vertices[i0 * 3],
            vertices[i0 * 3 + 1],
            vertices[i0 * 3 + 2]
        );
        const v1 = new THREE.Vector3(
            vertices[i1 * 3],
            vertices[i1 * 3 + 1],
            vertices[i1 * 3 + 2]
        );
        const v2 = new THREE.Vector3(
            vertices[i2 * 3],
            vertices[i2 * 3 + 1],
            vertices[i2 * 3 + 2]
        );
        
        // Calculate normal
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
        
        // Write normal
        dataView.setFloat32(offset, normal.x, true); offset += 4;
        dataView.setFloat32(offset, normal.y, true); offset += 4;
        dataView.setFloat32(offset, normal.z, true); offset += 4;
        
        // Write vertices
        dataView.setFloat32(offset, v0.x, true); offset += 4;
        dataView.setFloat32(offset, v0.y, true); offset += 4;
        dataView.setFloat32(offset, v0.z, true); offset += 4;
        
        dataView.setFloat32(offset, v1.x, true); offset += 4;
        dataView.setFloat32(offset, v1.y, true); offset += 4;
        dataView.setFloat32(offset, v1.z, true); offset += 4;
        
        dataView.setFloat32(offset, v2.x, true); offset += 4;
        dataView.setFloat32(offset, v2.y, true); offset += 4;
        dataView.setFloat32(offset, v2.z, true); offset += 4;
        
        // Attribute byte count (unused)
        dataView.setUint16(offset, 0, true); offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'application/octet-stream' });
}

/**
 * Export geometry to ASCII STL format
 * 
 * @param {THREE.BufferGeometry} geometry - The geometry to export
 * @returns {Blob} - ASCII STL file
 */
function exportToASCIISTL(geometry) {
    let vertices, indices;
    
    const positionAttribute = geometry.getAttribute('position');
    vertices = positionAttribute.array;
    
    if (geometry.getIndex()) {
        indices = geometry.getIndex().array;
    } else {
        indices = new Uint32Array(positionAttribute.count);
        for (let i = 0; i < positionAttribute.count; i++) {
            indices[i] = i;
        }
    }
    
    const numTriangles = indices.length / 3;
    
    let output = 'solid handle\n';
    
    for (let i = 0; i < numTriangles; i++) {
        const i0 = indices[i * 3];
        const i1 = indices[i * 3 + 1];
        const i2 = indices[i * 3 + 2];
        
        const v0 = new THREE.Vector3(
            vertices[i0 * 3],
            vertices[i0 * 3 + 1],
            vertices[i0 * 3 + 2]
        );
        const v1 = new THREE.Vector3(
            vertices[i1 * 3],
            vertices[i1 * 3 + 1],
            vertices[i1 * 3 + 2]
        );
        const v2 = new THREE.Vector3(
            vertices[i2 * 3],
            vertices[i2 * 3 + 1],
            vertices[i2 * 3 + 2]
        );
        
        const edge1 = new THREE.Vector3().subVectors(v1, v0);
        const edge2 = new THREE.Vector3().subVectors(v2, v0);
        const normal = new THREE.Vector3().crossVectors(edge1, edge2).normalize();
        
        output += `  facet normal ${normal.x} ${normal.y} ${normal.z}\n`;
        output += '    outer loop\n';
        output += `      vertex ${v0.x} ${v0.y} ${v0.z}\n`;
        output += `      vertex ${v1.x} ${v1.y} ${v1.z}\n`;
        output += `      vertex ${v2.x} ${v2.y} ${v2.z}\n`;
        output += '    endloop\n';
        output += '  endfacet\n';
    }
    
    output += 'endsolid handle\n';
    
    return new Blob([output], { type: 'text/plain' });
}

/**
 * Trigger download of STL file
 * 
 * @param {Blob} blob - The STL blob
 * @param {string} filename - The filename
 */
export function downloadSTL(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
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




