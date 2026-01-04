/**
 * Handle Mesh Generator
 * Main module that generates the complete handle mesh
 * by sweeping cross-sections along the handle path
 */

import * as THREE from 'three';
import { generateHandlePath, samplePathPoints, calculateAttachmentZones, getFilletZones } from './handlePathGenerator.js';
import { 
    generateCrossSection, 
    getCrossSectionPoints, 
    transformCrossSectionToPath
} from './handleCrossSectionBuilder.js';

/**
 * Generate the complete handle mesh
 * 
 * @param {Object} handleParams - Handle parameters
 * @param {Object} mugData - Mug reference data
 * @returns {THREE.BufferGeometry} - The handle geometry
 */
export function generateHandleMesh(handleParams, mugData) {
    const {
        crossSectionWidth,
        crossSectionHeight,
        crossSectionType = 'oval',
        crossSectionCornerRadius = 3,
        handleWidth,
        attachmentRadius = 8,
    } = handleParams;
    
    // Generate the path
    const path = generateHandlePath(handleParams, mugData);
    
    // Get fillet zone information
    const filletZones = getFilletZones(path, handleParams);
    
    // Sample points along the path - high density for smooth fillets
    const pathSegments = 96; // High density for smooth fillet curves
    const pathPoints = samplePathPoints(path, pathSegments);
    
    // Generate cross-section based on type
    const crossSectionSegments = 16;
    const crossSection2D = getCrossSectionPoints(
        crossSectionWidth, 
        crossSectionHeight, 
        crossSectionSegments,
        crossSectionType,
        crossSectionCornerRadius
    );
    
    // Calculate average cross-section radius for fillet scaling
    // This determines how much to scale the cross-section in the fillet zone
    const crossSectionRadius = (crossSectionWidth + crossSectionHeight) / 4;
    
    // Build the swept geometry with handle width and fillet radius
    // attachmentRadius controls the circular arc fillet curve
    const geometry = sweepCrossSectionAlongPath(
        crossSection2D,
        pathPoints,
        handleWidth,
        filletZones,
        attachmentRadius,      // Fillet curve radius
        crossSectionRadius     // Cross-section radius for scale calculation
    );
    
    return geometry;
}

/**
 * Calculate fillet scale factor based on position using circular arc profile
 * 
 * The fillet is created by SCALING the cross-section to create a 360-degree
 * fillet effect around the entire handle circumference. The scale follows
 * a circular arc profile for a smooth convex curve.
 * 
 * @param {number} t - Position along path (0 to 1)
 * @param {Object} filletZones - Fillet zone information
 * @param {number} filletRadius - Radius of the fillet curve (mm)
 * @param {number} crossSectionRadius - Average radius of cross-section (mm)
 * @returns {Object} - { scale, isInFillet, zone }
 */
function getFilletFactors(t, filletZones, filletRadius, crossSectionRadius) {
    // If fillet radius is 0 or very small, no fillet effect
    if (filletRadius <= 0.01) {
        return {
            scale: 1.0,
            isInFillet: false,
            zone: null,
        };
    }
    
    // Maximum scale factor: how much to expand cross-section at the mug
    // For a fillet of radius R on a cross-section of radius r:
    // the outer edge expands by R, so scale = (r + R) / r = 1 + R/r
    const maxScaleAddition = filletRadius / crossSectionRadius;
    
    // Check if in bottom fillet zone
    if (t <= filletZones.bottom.end) {
        const filletT = t / filletZones.bottom.end;  // 0 at mug, 1 at end of fillet
        
        // Circular arc profile for the fillet curve
        // Using: scale_addition = maxScaleAddition * (1 - sin(filletT * π/2))
        // At filletT=0 (mug): scale_addition = maxScaleAddition (full fillet)
        // At filletT=1 (end): scale_addition = 0 (normal size)
        const scaleAddition = maxScaleAddition * (1 - Math.sin(filletT * Math.PI / 2));
        
        return {
            scale: 1 + scaleAddition,
            isInFillet: true,
            zone: 'bottom',
        };
    }
    
    // Check if in top fillet zone
    if (t >= filletZones.top.start) {
        const filletT = (t - filletZones.top.start) / (1 - filletZones.top.start);  // 0 at start, 1 at mug
        
        // Same circular arc profile, filletT increases toward mug
        // At filletT=0 (start): scale_addition = 0 (normal size)
        // At filletT=1 (mug): scale_addition = maxScaleAddition (full fillet)
        const scaleAddition = maxScaleAddition * (1 - Math.sin((1 - filletT) * Math.PI / 2));
        
        return {
            scale: 1 + scaleAddition,
            isInFillet: true,
            zone: 'top',
        };
    }
    
    // Not in fillet zone - normal cross-section
    return {
        scale: 1.0,
        isInFillet: false,
        zone: null,
    };
}

/**
 * Sweep a 2D cross-section along a 3D path
 * Creates handle geometry with specified width in Z-direction
 * Uses cross-section scaling with circular arc profile for 360-degree fillets
 * 
 * @param {Array} crossSection2D - 2D cross-section points
 * @param {Array} pathPoints - Sampled path points with frames
 * @param {number} handleWidth - Width of handle in Z-direction (mm)
 * @param {Object} filletZones - Fillet zone information
 * @param {number} filletRadius - Radius of the fillet curve (mm)
 * @param {number} crossSectionRadius - Average radius of cross-section for fillet calculation
 * @returns {THREE.BufferGeometry}
 */
function sweepCrossSectionAlongPath(crossSection2D, pathPoints, handleWidth = 25, filletZones = null, filletRadius = 8, crossSectionRadius = 10) {
    const vertices = [];
    const indices = [];
    const normals = [];
    const uvs = [];
    
    const numPathPoints = pathPoints.length;
    const numCrossSectionPoints = crossSection2D.length;
    
    // Default fillet zones if not provided
    if (!filletZones) {
        filletZones = {
            bottom: { start: 0, end: 0 },
            top: { start: 1, end: 1 },
        };
    }
    
    // Generate vertices at each path point
    for (let i = 0; i < numPathPoints; i++) {
        const pathPoint = pathPoints[i];
        const t = pathPoint.t;
        
        // Get fillet factors for this position (circular arc scale)
        const fillet = getFilletFactors(t, filletZones, filletRadius, crossSectionRadius);
        
        // Scale the cross-section in the fillet zone
        // This creates the 360-degree fillet effect around the entire handle
        const scaledCrossSection = fillet.scale !== 1.0
            ? crossSection2D.map(p => ({ x: p.x * fillet.scale, y: p.y * fillet.scale }))
            : crossSection2D;
        
        // Transform scaled cross-section to path position
        const ring = transformCrossSectionToPath(
            scaledCrossSection,
            pathPoint.position,
            pathPoint.tangent,
            pathPoint.normal,
            pathPoint.binormal,
            1.0
        );
        
        // Add vertices for this ring, spreading in Z based on handleWidth
        for (let j = 0; j < numCrossSectionPoints; j++) {
            const vertex = ring[j];
            
            // Scale the Z coordinate based on handleWidth
            // Also apply fillet scale to Z for consistent 360-degree fillet
            const zSpreadScale = handleWidth / 25 * fillet.scale;
            const scaledZ = vertex.z * zSpreadScale;
            
            vertices.push(vertex.x, vertex.y, scaledZ);
            
            // Calculate normal (simplified - pointing outward from path)
            const toCenter = pathPoint.position.clone().sub(new THREE.Vector3(vertex.x, vertex.y, scaledZ)).normalize();
            const normal = toCenter.negate();
            normals.push(normal.x, normal.y, normal.z);
            
            // UV coordinates
            const u = j / (numCrossSectionPoints - 1);
            const v = i / (numPathPoints - 1);
            uvs.push(u, v);
        }
    }
    
    // Generate indices (connect adjacent rings)
    for (let i = 0; i < numPathPoints - 1; i++) {
        for (let j = 0; j < numCrossSectionPoints; j++) {
            const current = i * numCrossSectionPoints + j;
            const next = current + numCrossSectionPoints;
            const nextJ = (j + 1) % numCrossSectionPoints;
            const currentNextJ = i * numCrossSectionPoints + nextJ;
            const nextNextJ = next + (nextJ - j);
            
            // Two triangles per quad
            indices.push(current, next, currentNextJ);
            indices.push(currentNextJ, next, nextNextJ);
        }
    }
    
    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // Recompute normals for better shading
    geometry.computeVertexNormals();
    
    return geometry;
}


/**
 * Generate a simplified handle mesh for preview (fewer polygons)
 * 
 * @param {Object} handleParams - Handle parameters
 * @param {Object} mugData - Mug reference data
 * @returns {THREE.BufferGeometry}
 */
export function generateHandlePreviewMesh(handleParams, mugData) {
    const {
        crossSectionWidth,
        crossSectionHeight,
        crossSectionType = 'oval',
        crossSectionCornerRadius = 3,
        handleWidth,
        attachmentRadius = 8,
    } = handleParams;
    
    // Generate the path with fewer segments
    const path = generateHandlePath(handleParams, mugData);
    
    // Get fillet zone information
    const filletZones = getFilletZones(path, handleParams);
    
    const pathPoints = samplePathPoints(path, 32); // Fewer segments but enough for fillets
    
    // Generate cross-section with fewer segments based on type
    const crossSection2D = getCrossSectionPoints(
        crossSectionWidth, 
        crossSectionHeight, 
        8,
        crossSectionType,
        crossSectionCornerRadius
    );
    
    // Calculate average cross-section radius for fillet scaling
    const crossSectionRadius = (crossSectionWidth + crossSectionHeight) / 4;
    
    // Build the swept geometry with handle width and fillet radius
    return sweepCrossSectionAlongPath(
        crossSection2D,
        pathPoints,
        handleWidth,
        filletZones,
        attachmentRadius,      // Fillet curve radius
        crossSectionRadius     // Cross-section radius for scale calculation
    );
}

/**
 * Generate attachment zone visualization geometry
 * Creates wireframe outlines showing where handle attaches to mug
 * 
 * @param {Object} handleParams - Handle parameters
 * @param {Object} mugData - Mug reference data
 * @returns {THREE.Group} - Group containing attachment zone lines
 */
export function generateAttachmentZoneGeometry(handleParams, mugData) {
    const zones = calculateAttachmentZones(handleParams, mugData);
    const group = new THREE.Group();
    
    const lineMaterial = new THREE.LineBasicMaterial({ 
        color: 0xFFEB3B,
        opacity: 0.8,
        transparent: true,
        linewidth: 2,
    });
    
    // Generate ellipse for each attachment zone
    [zones.top, zones.bottom].forEach(zone => {
        const points = [];
        const segments = 32;
        const halfAngle = zone.angle / 2;
        
        for (let i = 0; i <= segments; i++) {
            const angle = -halfAngle + (zone.angle * i / segments);
            const x = Math.cos(angle) * zone.radius;
            const z = Math.sin(angle) * zone.radius;
            points.push(new THREE.Vector3(x, zone.height, z));
        }
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, lineMaterial);
        group.add(line);
    });
    
    return group;
}

/**
 * Generate a mug preview mesh from mug data
 * Creates a simplified mug shape for reference
 * 
 * @param {Object} mugData - Mug reference data
 * @returns {THREE.BufferGeometry}
 */
export function generateMugPreviewMesh(mugData) {
    if (!mugData.loaded) {
        // Return default mug shape
        const geometry = new THREE.CylinderGeometry(40, 30, 95, 32, 1, true);
        return geometry;
    }
    
    const {
        height,
        topDiameter,
        bottomDiameter,
        wallThickness,
    } = mugData;
    
    // Create a tapered cylinder (truncated cone) for the mug
    const topRadius = topDiameter / 2;
    const bottomRadius = bottomDiameter / 2;
    
    // Outer surface
    const outerGeometry = new THREE.CylinderGeometry(
        topRadius,
        bottomRadius,
        height,
        32,
        1,
        true // Open-ended
    );
    
    // Position so bottom is at y=0
    outerGeometry.translate(0, height / 2, 0);
    
    return outerGeometry;
}

/**
 * Calculate mesh statistics for display
 * 
 * @param {THREE.BufferGeometry} geometry - The mesh geometry
 * @returns {Object} - Statistics object
 */
export function getMeshStats(geometry) {
    const position = geometry.getAttribute('position');
    const index = geometry.getIndex();
    
    return {
        vertices: position ? position.count : 0,
        triangles: index ? index.count / 3 : 0,
    };
}

