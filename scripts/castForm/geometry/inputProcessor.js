/**
 * Cast Form Generator - Input Processor
 * Handles STL/OBJ import and geometry validation
 */

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export class InputProcessor {
    
    /**
     * Load geometry from file
     * @param {File} file - STL or OBJ file
     * @returns {Promise<{geometry: THREE.BufferGeometry, errors: string[]}>}
     */
    static async loadFromFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        
        let geometry;
        
        try {
            if (extension === 'stl') {
                const loader = new STLLoader();
                geometry = loader.parse(arrayBuffer);
            } else if (extension === 'obj') {
                const loader = new OBJLoader();
                const text = new TextDecoder().decode(arrayBuffer);
                const group = loader.parse(text);
                geometry = this.mergeGroupGeometry(group);
            } else {
                throw new Error(`Unsupported file format: ${extension}`);
            }
        } catch (e) {
            return { geometry: null, errors: [`Failed to parse file: ${e.message}`] };
        }
        
        return this.processGeometry(geometry);
    }

    /**
     * Import geometry from platform app (vessel/dinnerware mesh group)
     * @param {THREE.Group} meshGroup - Mesh group from other app
     * @returns {{geometry: THREE.BufferGeometry, errors: string[]}}
     */
    static importFromPlatform(meshGroup) {
        try {
            const geometry = this.mergeGroupGeometry(meshGroup);
            return this.processGeometry(geometry);
        } catch (e) {
            return { geometry: null, errors: [`Failed to import: ${e.message}`] };
        }
    }

    /**
     * Process and validate geometry
     * @param {THREE.BufferGeometry} geometry 
     * @returns {{geometry: THREE.BufferGeometry, errors: string[]}}
     */
    static processGeometry(geometry) {
        const errors = [];
        
        if (!geometry) {
            return { geometry: null, errors: ['No geometry found'] };
        }
        
        // Ensure we have a BufferGeometry
        if (!geometry.isBufferGeometry) {
            return { geometry: null, errors: ['Invalid geometry type'] };
        }
        
        // Compute bounding box
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        
        // Center geometry on XZ plane, with bottom at Y=0
        const center = new THREE.Vector3();
        box.getCenter(center);
        geometry.translate(-center.x, -box.min.y, -center.z);
        
        // Recompute bounds after centering
        geometry.computeBoundingBox();
        
        // Validate geometry
        const validation = this.validateGeometry(geometry);
        if (!validation.isValid) {
            errors.push(...validation.errors);
        }
        
        // Compute normals if missing
        if (!geometry.getAttribute('normal')) {
            geometry.computeVertexNormals();
        }
        
        // Merge duplicate vertices for cleaner geometry
        try {
            geometry = mergeVertices(geometry);
            geometry.computeVertexNormals();
        } catch (e) {
            // Non-critical, continue with original geometry
        }
        
        return { geometry, errors };
    }

    /**
     * Validate geometry for mold generation
     * @param {THREE.BufferGeometry} geometry 
     * @returns {{isValid: boolean, errors: string[], warnings: string[]}}
     */
    static validateGeometry(geometry) {
        const errors = [];
        const warnings = [];
        
        const position = geometry.getAttribute('position');
        
        if (!position || position.count < 3) {
            errors.push('Geometry has insufficient vertices');
            return { isValid: false, errors, warnings };
        }
        
        // Check for degenerate triangles
        const triangleCount = geometry.index 
            ? geometry.index.count / 3 
            : position.count / 3;
        
        if (triangleCount < 4) {
            errors.push('Geometry has too few triangles');
            return { isValid: false, errors, warnings };
        }
        
        // Check bounding box is reasonable
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        
        if (size.x < 1 || size.y < 1 || size.z < 1) {
            warnings.push('Geometry is very small (< 1mm in a dimension)');
        }
        
        if (size.x > 500 || size.y > 500 || size.z > 500) {
            warnings.push('Geometry is very large (> 500mm in a dimension)');
        }
        
        // Basic manifold check (edge count)
        const manifoldResult = this.checkManifold(geometry);
        if (!manifoldResult.isManifold) {
            warnings.push('Geometry may not be watertight (non-manifold edges detected)');
        }
        
        return { 
            isValid: errors.length === 0, 
            errors, 
            warnings 
        };
    }

    /**
     * Check if geometry is manifold (watertight)
     * @param {THREE.BufferGeometry} geometry 
     * @returns {{isManifold: boolean, nonManifoldEdgeCount: number}}
     */
    static checkManifold(geometry) {
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        
        const edgeMap = new Map();
        const triangleCount = index 
            ? index.count / 3 
            : position.count / 3;
        
        // Build edge map
        for (let i = 0; i < triangleCount; i++) {
            const idx = i * 3;
            
            let i0, i1, i2;
            if (index) {
                i0 = index.getX(idx);
                i1 = index.getX(idx + 1);
                i2 = index.getX(idx + 2);
            } else {
                i0 = idx;
                i1 = idx + 1;
                i2 = idx + 2;
            }
            
            // Create edge keys (sorted to be direction-independent)
            const edges = [
                [Math.min(i0, i1), Math.max(i0, i1)],
                [Math.min(i1, i2), Math.max(i1, i2)],
                [Math.min(i2, i0), Math.max(i2, i0)]
            ];
            
            edges.forEach(([a, b]) => {
                const key = `${a}-${b}`;
                edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
            });
        }
        
        // Count non-manifold edges (should have exactly 2 adjacent faces)
        let nonManifoldEdgeCount = 0;
        edgeMap.forEach((count) => {
            if (count !== 2) nonManifoldEdgeCount++;
        });
        
        return {
            isManifold: nonManifoldEdgeCount === 0,
            nonManifoldEdgeCount
        };
    }

    /**
     * Auto-detect optimal orientation (open end up)
     * @param {THREE.BufferGeometry} geometry 
     * @returns {THREE.Euler} Rotation to apply
     */
    static detectOrientation(geometry) {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Assume tallest dimension should be vertical (Y)
        const dims = [
            { axis: 'x', size: size.x },
            { axis: 'y', size: size.y },
            { axis: 'z', size: size.z }
        ].sort((a, b) => b.size - a.size);
        
        // Return rotation needed to make tallest axis Y
        if (dims[0].axis === 'y') {
            return new THREE.Euler(0, 0, 0);
        } else if (dims[0].axis === 'x') {
            return new THREE.Euler(0, 0, Math.PI / 2);
        } else {
            return new THREE.Euler(Math.PI / 2, 0, 0);
        }
    }

    /**
     * Apply rotation to geometry
     * @param {THREE.BufferGeometry} geometry 
     * @param {THREE.Euler} rotation 
     */
    static applyRotation(geometry, rotation) {
        const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation);
        geometry.applyMatrix4(matrix);
        geometry.computeBoundingBox();
        geometry.computeVertexNormals();
    }

    /**
     * Merge all meshes in a group into a single geometry
     * @param {THREE.Group} group 
     * @returns {THREE.BufferGeometry}
     */
    static mergeGroupGeometry(group) {
        const geometries = [];
        
        group.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry.clone();
                
                // Apply mesh transform
                child.updateMatrixWorld(true);
                geo.applyMatrix4(child.matrixWorld);
                
                geometries.push(geo);
            }
        });
        
        if (geometries.length === 0) {
            throw new Error('No meshes found in group');
        }
        
        if (geometries.length === 1) {
            return geometries[0];
        }
        
        // Merge multiple geometries
        return this.mergeGeometries(geometries);
    }

    /**
     * Merge multiple geometries into one
     * @param {THREE.BufferGeometry[]} geometries 
     * @returns {THREE.BufferGeometry}
     */
    static mergeGeometries(geometries) {
        // Calculate total counts
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
        
        // Create merged arrays
        const positions = new Float32Array(totalVertices * 3);
        const normals = new Float32Array(totalVertices * 3);
        const indices = new Uint32Array(totalIndices);
        
        let vertexOffset = 0;
        let indexOffset = 0;
        let vertexIndexOffset = 0;
        
        geometries.forEach(geo => {
            const position = geo.getAttribute('position');
            const normal = geo.getAttribute('normal');
            const index = geo.index;
            
            // Copy positions
            for (let i = 0; i < position.count; i++) {
                positions[(vertexOffset + i) * 3] = position.getX(i);
                positions[(vertexOffset + i) * 3 + 1] = position.getY(i);
                positions[(vertexOffset + i) * 3 + 2] = position.getZ(i);
                
                if (normal) {
                    normals[(vertexOffset + i) * 3] = normal.getX(i);
                    normals[(vertexOffset + i) * 3 + 1] = normal.getY(i);
                    normals[(vertexOffset + i) * 3 + 2] = normal.getZ(i);
                }
            }
            
            // Copy indices
            if (index) {
                for (let i = 0; i < index.count; i++) {
                    indices[indexOffset + i] = index.getX(i) + vertexIndexOffset;
                }
                indexOffset += index.count;
            } else {
                for (let i = 0; i < position.count; i++) {
                    indices[indexOffset + i] = i + vertexIndexOffset;
                }
                indexOffset += position.count;
            }
            
            vertexIndexOffset += position.count;
            vertexOffset += position.count;
        });
        
        // Create merged geometry
        const merged = new THREE.BufferGeometry();
        merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        merged.setIndex(new THREE.BufferAttribute(indices, 1));
        
        // Compute normals if they were missing
        if (!geometries[0].getAttribute('normal')) {
            merged.computeVertexNormals();
        }
        
        return merged;
    }

    /**
     * Get geometry statistics
     * @param {THREE.BufferGeometry} geometry 
     * @returns {{vertices: number, triangles: number, bounds: {width: number, height: number, depth: number}}}
     */
    static getStats(geometry) {
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        
        geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        geometry.boundingBox.getSize(size);
        
        return {
            vertices: position ? position.count : 0,
            triangles: index ? index.count / 3 : (position ? position.count / 3 : 0),
            bounds: {
                width: size.x,
                height: size.y,
                depth: size.z
            }
        };
    }
}

export default InputProcessor;



