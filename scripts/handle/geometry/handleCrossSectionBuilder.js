/**
 * Handle Cross-Section Builder
 * Generates 2D cross-section profiles for the handle
 */

import * as THREE from 'three';

/**
 * Generate a 2D cross-section shape
 * 
 * @param {number} width - Width of cross-section (mm)
 * @param {number} height - Height of cross-section (mm)
 * @param {number} segments - Number of segments for curves
 * @param {string} type - 'oval' or 'rectangular'
 * @param {number} cornerRadius - Corner radius for rectangular type (mm)
 * @returns {THREE.Shape} - 2D shape for extrusion
 */
export function generateCrossSection(width, height, segments = 16, type = 'oval', cornerRadius = 3) {
    if (type === 'rectangular') {
        return generateRectangularCrossSection(width, height, cornerRadius, segments);
    }
    return generateOvalCrossSection(width, height, segments);
}

/**
 * Generate oval cross-section (ellipse)
 */
function generateOvalCrossSection(width, height, segments) {
    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Generate ellipse points
    shape.moveTo(halfWidth, 0);
    
    for (let i = 1; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * halfWidth;
        const y = Math.sin(angle) * halfHeight;
        shape.lineTo(x, y);
    }
    
    return shape;
}

/**
 * Generate rectangular cross-section with rounded corners
 * 
 * @param {number} width - Width of cross-section (mm)
 * @param {number} height - Height of cross-section (mm)
 * @param {number} cornerRadius - Radius of corners (mm)
 * @param {number} segments - Number of segments for curves
 */
function generateRectangularCrossSection(width, height, cornerRadius, segments) {
    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Clamp corner radius to maximum possible (half of smaller dimension)
    const maxRadius = Math.min(halfWidth, halfHeight);
    const r = Math.min(cornerRadius, maxRadius);
    const cornerSegments = Math.max(4, Math.floor(segments / 4));
    
    // Start at top-right, just after the corner curve starts
    shape.moveTo(halfWidth, halfHeight - r);
    
    // Top-right corner (quarter circle from right to top)
    if (r > 0) {
        for (let i = 1; i <= cornerSegments; i++) {
            const angle = (Math.PI / 2) * (i / cornerSegments);
            const x = halfWidth - r + Math.cos(angle) * r;
            const y = halfHeight - r + Math.sin(angle) * r;
            shape.lineTo(x, y);
        }
    } else {
        shape.lineTo(halfWidth, halfHeight);
    }
    
    // Top edge to top-left corner
    shape.lineTo(-halfWidth + r, halfHeight);
    
    // Top-left corner
    if (r > 0) {
        for (let i = 1; i <= cornerSegments; i++) {
            const angle = Math.PI / 2 + (Math.PI / 2) * (i / cornerSegments);
            const x = -halfWidth + r + Math.cos(angle) * r;
            const y = halfHeight - r + Math.sin(angle) * r;
            shape.lineTo(x, y);
        }
    } else {
        shape.lineTo(-halfWidth, halfHeight);
    }
    
    // Left edge to bottom-left corner
    shape.lineTo(-halfWidth, -halfHeight + r);
    
    // Bottom-left corner
    if (r > 0) {
        for (let i = 1; i <= cornerSegments; i++) {
            const angle = Math.PI + (Math.PI / 2) * (i / cornerSegments);
            const x = -halfWidth + r + Math.cos(angle) * r;
            const y = -halfHeight + r + Math.sin(angle) * r;
            shape.lineTo(x, y);
        }
    } else {
        shape.lineTo(-halfWidth, -halfHeight);
    }
    
    // Bottom edge to bottom-right corner
    shape.lineTo(halfWidth - r, -halfHeight);
    
    // Bottom-right corner
    if (r > 0) {
        for (let i = 1; i <= cornerSegments; i++) {
            const angle = -Math.PI / 2 + (Math.PI / 2) * (i / cornerSegments);
            const x = halfWidth - r + Math.cos(angle) * r;
            const y = -halfHeight + r + Math.sin(angle) * r;
            shape.lineTo(x, y);
        }
    } else {
        shape.lineTo(halfWidth, -halfHeight);
    }
    
    // Close path back to start
    shape.lineTo(halfWidth, halfHeight - r);
    
    return shape;
}

/**
 * Generate round cross-section (circle)
 */
function generateRoundCrossSection(diameter, segments) {
    const shape = new THREE.Shape();
    const radius = diameter / 2;
    
    // Generate circle points
    shape.moveTo(radius, 0);
    
    for (let i = 1; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        shape.lineTo(x, y);
    }
    
    return shape;
}

/**
 * Generate squared cross-section (rounded rectangle)
 */
function generateSquaredCrossSection(width, height, segments) {
    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const cornerRadius = Math.min(width, height) * 0.2; // 20% of smaller dimension
    const cornerSegments = Math.max(4, Math.floor(segments / 4));
    
    // Start at top-right, just before corner
    shape.moveTo(halfWidth - cornerRadius, halfHeight);
    
    // Top-right corner
    for (let i = 0; i <= cornerSegments; i++) {
        const angle = Math.PI / 2 - (Math.PI / 2) * (i / cornerSegments);
        const x = halfWidth - cornerRadius + Math.cos(angle) * cornerRadius;
        const y = halfHeight - cornerRadius + Math.sin(angle) * cornerRadius;
        shape.lineTo(x, y);
    }
    
    // Bottom-right corner
    for (let i = 0; i <= cornerSegments; i++) {
        const angle = 0 - (Math.PI / 2) * (i / cornerSegments);
        const x = halfWidth - cornerRadius + Math.cos(angle) * cornerRadius;
        const y = -halfHeight + cornerRadius + Math.sin(angle) * cornerRadius;
        shape.lineTo(x, y);
    }
    
    // Bottom-left corner
    for (let i = 0; i <= cornerSegments; i++) {
        const angle = -Math.PI / 2 - (Math.PI / 2) * (i / cornerSegments);
        const x = -halfWidth + cornerRadius + Math.cos(angle) * cornerRadius;
        const y = -halfHeight + cornerRadius + Math.sin(angle) * cornerRadius;
        shape.lineTo(x, y);
    }
    
    // Top-left corner
    for (let i = 0; i <= cornerSegments; i++) {
        const angle = Math.PI - (Math.PI / 2) * (i / cornerSegments);
        const x = -halfWidth + cornerRadius + Math.cos(angle) * cornerRadius;
        const y = halfHeight - cornerRadius + Math.sin(angle) * cornerRadius;
        shape.lineTo(x, y);
    }
    
    // Close back to start
    shape.lineTo(halfWidth - cornerRadius, halfHeight);
    
    return shape;
}

/**
 * Generate D-profile cross-section (flat on one side)
 * The flat side faces the palm when gripping
 */
function generateDProfileCrossSection(width, height, segments) {
    const shape = new THREE.Shape();
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    
    // Flat side at negative X (facing palm)
    shape.moveTo(-halfWidth * 0.3, halfHeight);
    shape.lineTo(-halfWidth * 0.3, -halfHeight);
    
    // Curved side (outer)
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const angle = -Math.PI / 2 + Math.PI * t;
        const x = Math.cos(angle) * halfWidth;
        const y = Math.sin(angle) * halfHeight;
        shape.lineTo(x, y);
    }
    
    // Close back to start
    shape.lineTo(-halfWidth * 0.3, halfHeight);
    
    return shape;
}

/**
 * Get cross-section points as array (for 2D canvas preview)
 * 
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {number} segments - Number of segments
 * @param {string} type - 'oval' or 'rectangular'
 * @param {number} cornerRadius - Corner radius for rectangular type
 * @returns {Array<{x: number, y: number}>} - Array of 2D points
 */
export function getCrossSectionPoints(width, height, segments = 32, type = 'oval', cornerRadius = 3) {
    const threeShape = generateCrossSection(width, height, segments, type, cornerRadius);
    const points = threeShape.getPoints(segments);
    
    return points.map(p => ({ x: p.x, y: p.y }));
}


/**
 * Transform cross-section points to 3D space at a path point
 * 
 * @param {Array<{x: number, y: number}>} points2D - 2D cross-section points
 * @param {THREE.Vector3} position - Position on path
 * @param {THREE.Vector3} tangent - Path tangent
 * @param {THREE.Vector3} normal - Path normal
 * @param {THREE.Vector3} binormal - Path binormal
 * @param {number} scale - Scale factor for taper
 * @returns {THREE.Vector3[]} - 3D points
 */
export function transformCrossSectionToPath(points2D, position, tangent, normal, binormal, scale = 1.0) {
    return points2D.map(p => {
        // Cross-section X maps to path normal, Y maps to binormal
        const offset = new THREE.Vector3()
            .addScaledVector(normal, p.x * scale)
            .addScaledVector(binormal, p.y * scale);
        
        return position.clone().add(offset);
    });
}

/**
 * Get cross-section area for weight estimation
 * 
 * @param {number} width - Width
 * @param {number} height - Height
 * @param {string} type - 'oval' or 'rectangular'
 * @param {number} cornerRadius - Corner radius for rectangular type
 * @returns {number} - Approximate area in mm²
 */
export function getCrossSectionArea(width, height, type = 'oval', cornerRadius = 3) {
    if (type === 'rectangular') {
        // Rectangle area minus corners plus quarter circles
        const r = Math.min(cornerRadius, Math.min(width / 2, height / 2));
        return width * height - (4 * r * r) + (Math.PI * r * r);
    }
    // Oval area
    return Math.PI * (width / 2) * (height / 2);
}

/**
 * Wrap a 2D cross-section to conform to a cylindrical surface
 * Creates a subtle curving effect for fillet attachment zones
 * 
 * @param {Array<{x: number, y: number}>} points2D - 2D cross-section points
 * @param {number} cylinderRadius - Radius of the mug cylinder (mm)
 * @param {number} wrapIntensity - How much to wrap (0 = none, 1 = full)
 * @returns {Array<{x: number, y: number}>} - Wrapped cross-section points
 */
export function wrapCrossSectionToCylinder(points2D, cylinderRadius, wrapIntensity = 0.3) {
    if (wrapIntensity <= 0 || cylinderRadius <= 0) {
        return points2D;
    }
    
    // Clamp wrap intensity for subtle effect
    const intensity = Math.min(wrapIntensity, 1.0);
    
    return points2D.map(p => {
        // The Y coordinate (in cross-section space) maps to the circumference of the cylinder
        // This creates the "wrapping around" effect
        // Points further from center Y get pushed outward (larger X) to follow cylinder curve
        
        // Calculate how far this point is from the cross-section center (in Y)
        const yOffset = p.y;
        
        // Calculate the angular displacement on the cylinder
        // Small angle approximation for subtle wrapping
        const arcAngle = (yOffset / cylinderRadius) * intensity;
        
        // Push the X coordinate outward based on the cylinder curvature
        // This simulates the cross-section "hugging" the cylinder surface
        const xAdjustment = cylinderRadius * (1 - Math.cos(arcAngle)) * intensity;
        
        return {
            x: p.x + xAdjustment,
            y: p.y,  // Y stays the same in 2D space
        };
    });
}

