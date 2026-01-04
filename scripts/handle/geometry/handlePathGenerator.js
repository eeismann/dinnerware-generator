/**
 * Handle Path Generator
 * Generates a simple D-shape path for the mug handle
 * 
 * Simple D-shape:
 * - Path starts at mug wall at bottomAttachmentHeight
 * - Bottom horizontal arm going outward
 * - Lower corner curve
 * - Vertical back at outerX
 * - Upper corner curve
 * - Top horizontal arm going toward mug
 * - Path ends at mug wall at topAttachmentHeight
 * 
 * The fillet effect at mug attachment is created by offsetting cross-section
 * positions along a circular arc profile in the mesh generator. The
 * attachmentRadius parameter controls the fillet curve radius.
 */

import * as THREE from 'three';

/**
 * Create a quarter-circle bezier curve
 * Control point is at the corner for a proper circular arc approximation
 */
function createCornerBezier(start, end, cornerPoint) {
    return new THREE.QuadraticBezierCurve3(start, cornerPoint, end);
}

/**
 * Generate the handle path
 * Creates a simple D-shape with only 2 corners (at outer edge)
 * Path goes directly to mug wall - NO vertical fillet curves in path
 * Accounts for tapered mug walls - different radius at top vs bottom
 * 
 * The fillet effect at attachment points is created by offsetting cross-section
 * positions along a circular arc profile in the mesh generator.
 * 
 * @param {Object} params - Handle parameters
 * @param {Object} mugData - Mug reference data
 * @returns {THREE.CurvePath} - The handle path
 */
export function generateHandlePath(params, mugData) {
    const {
        handleProtrusion,
        topAttachmentHeight,
        bottomAttachmentHeight,
        upperCornerRadius,
        lowerCornerRadius,
        verticalArmAngle = 0,  // Angle of vertical arm in degrees
    } = params;
    
    // Calculate mug radius at each attachment height (accounting for taper)
    const mugTopRadius = mugData.loaded ? mugData.topDiameter / 2 : 40;
    const mugBottomRadius = mugData.loaded ? mugData.bottomDiameter / 2 : 30;
    const mugHeight = mugData.loaded ? mugData.height : 95;
    
    // Linear interpolation to get radius at any height
    // t=0 at bottom, t=1 at top
    const getRadiusAtHeight = (height) => {
        const t = Math.max(0, Math.min(1, height / mugHeight));
        return mugBottomRadius + (mugTopRadius - mugBottomRadius) * t;
    };
    
    // Get mug radius at each attachment point
    const topMugRadius = getRadiusAtHeight(topAttachmentHeight);
    const bottomMugRadius = getRadiusAtHeight(bottomAttachmentHeight);
    
    // Outer edge X is based on the larger radius plus protrusion
    const maxMugRadius = Math.max(topMugRadius, bottomMugRadius);
    const outerX = maxMugRadius + handleProtrusion;
    
    // Clamp corner radii to prevent overlap
    const handleHeight = topAttachmentHeight - bottomAttachmentHeight;
    const maxRadius = Math.min(handleProtrusion * 0.8, handleHeight / 2 * 0.8);
    
    const rUpper = Math.min(upperCornerRadius, maxRadius);
    const rLower = Math.min(lowerCornerRadius, maxRadius);
    
    // Key coordinates - D-SHAPE with different arm lengths
    const bottomY = bottomAttachmentHeight;
    const topY = topAttachmentHeight;
    
    // Calculate vertical arm angle
    // Angle is applied to the vertical arm - positive tilts top outward
    const angleRad = (verticalArmAngle || 0) * Math.PI / 180;
    
    // Arm direction unit vector (pointing upward along the angled arm)
    // At angle=0: (0, 1) - straight up
    // At angle>0: tilts right, so x component is positive
    const armDirX = Math.sin(angleRad);
    const armDirY = Math.cos(angleRad);
    
    // Corner centers
    const lowerCornerCenter = { x: outerX, y: bottomY };
    
    // For lower corner (center at outerX, bottomY):
    // P3 is offset from center in the arm direction by rLower
    const p3x = lowerCornerCenter.x + rLower * armDirX;
    const p3y = lowerCornerCenter.y + rLower * armDirY;
    
    // Distance from P3 to P4 along the arm direction:
    const armLength = (handleHeight - (rUpper + rLower) * armDirY) / armDirY;
    
    // P4 = P3 + armLength * (armDirX, armDirY)
    const p4x = p3x + armLength * armDirX;
    const p4y = p3y + armLength * armDirY;
    
    // Upper corner center: P4 is rUpper away from it in the -arm direction
    const upperCornerX = p4x + rUpper * armDirX;
    const upperCornerY = p4y + rUpper * armDirY;  // Should be close to topY
    
    // Build path from BOTTOM going clockwise
    const path = new THREE.CurvePath();
    
    // ===== POINT DEFINITIONS (NO VERTICAL FILLET CURVES) =====
    
    // Path starts/ends directly at the mug wall surface.
    // At horizontal attachment arms, the cross-section is oriented vertically
    // (perpendicular to the path), so it has no radial extent. The path centerline
    // should be AT the mug radius for the handle to connect flush with the mug.
    const bottomMugX = bottomMugRadius;
    const topMugX = topMugRadius;
    
    // P0: Start at mug wall, at bottom attachment height
    const p0 = new THREE.Vector3(bottomMugX, bottomY, 0);
    
    // P1: End of bottom horizontal (start of lower corner)
    const p1 = new THREE.Vector3(lowerCornerCenter.x - rLower, bottomY, 0);
    
    // P2: Corner control point for lower corner
    const lowerCorner = new THREE.Vector3(lowerCornerCenter.x, lowerCornerCenter.y, 0);
    
    // P3: End of lower corner (start of angled arm)
    const p3 = new THREE.Vector3(p3x, p3y, 0);
    
    // P4: Start of upper corner (end of angled arm)
    const p4 = new THREE.Vector3(p4x, p4y, 0);
    
    // P5: Corner control point for upper corner
    const upperCorner = new THREE.Vector3(upperCornerX, upperCornerY, 0);
    
    // P6: End of upper corner (start of top horizontal)
    const p6 = new THREE.Vector3(upperCornerX - rUpper, topY, 0);
    
    // P7: End at mug wall, at top attachment height
    const p7 = new THREE.Vector3(topMugX, topY, 0);
    
    // ===== BUILD PATH =====
    
    // Segment 1: Bottom horizontal (P0 → P1) - from mug wall outward
    path.add(new THREE.LineCurve3(p0, p1));
    
    // Segment 2: Lower corner curve (P1 → P3)
    path.add(createCornerBezier(p1, p3, lowerCorner));
    
    // Segment 3: Vertical/angled back (P3 → P4)
    path.add(new THREE.LineCurve3(p3, p4));
    
    // Segment 4: Upper corner curve (P4 → P6)
    path.add(createCornerBezier(p4, p6, upperCorner));
    
    // Segment 5: Top horizontal (P6 → P7) - toward mug wall
    path.add(new THREE.LineCurve3(p6, p7));
    
    return path;
}

/**
 * Get fillet zone information for a path
 * Returns the t-parameter ranges where circular arc fillet offset should occur
 * 
 * The fillet is a quarter-circle arc with radius = attachmentRadius.
 * For a quarter-circle, the arc spans approximately R distance along the path
 * (from the tangent point on the mug to where it meets the handle arm).
 * 
 * @param {THREE.CurvePath} path - The handle path
 * @param {Object} params - Handle parameters
 * @returns {Object} - Fillet zone information
 */
export function getFilletZones(path, params) {
    const totalLength = path.getLength();
    const attachmentRadius = params.attachmentRadius || 0;
    
    // If no fillet radius, return empty zones
    if (attachmentRadius <= 0.01) {
        return {
            bottom: { start: 0, end: 0 },
            top: { start: 1, end: 1 },
            filletZoneLength: 0,
            totalLength,
        };
    }
    
    // For a quarter-circle fillet with radius R, the fillet zone length
    // along the path is approximately R (the arc spans R in each direction
    // from the corner). We use 1.2*R to ensure smooth blending.
    const filletZoneLength = attachmentRadius * 1.2;
    
    // Calculate t-parameter ranges for fillet zones
    const bottomFilletEnd = filletZoneLength / totalLength;
    const topFilletStart = 1 - (filletZoneLength / totalLength);
    
    return {
        bottom: {
            start: 0,
            end: Math.min(bottomFilletEnd, 0.15),  // Cap at 15% of path
        },
        top: {
            start: Math.max(topFilletStart, 0.85),  // Start at least at 85% of path
            end: 1,
        },
        filletZoneLength,
        totalLength,
    };
}

/**
 * Generate evenly-spaced sample points along the path
 */
export function samplePathPoints(path, segments = 64) {
    const points = [];
    
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const position = path.getPointAt(t);
        const tangent = path.getTangentAt(t).normalize();
        
        // Normal perpendicular to tangent in XY plane
        const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
        
        // Binormal in Z direction
        const binormal = new THREE.Vector3(0, 0, 1);
        
        points.push({
            t,
            position,
            tangent,
            normal,
            binormal,
        });
    }
    
    return points;
}

/**
 * Get the path length
 */
export function getPathLength(path) {
    return path.getLength();
}

/**
 * Generate simplified path for preview
 */
export function generateSimplifiedPath(params, mugData) {
    const path = generateHandlePath(params, mugData);
    return path.getPoints(32);
}

/**
 * Calculate attachment zones on mug surface
 */
export function calculateAttachmentZones(params, mugData) {
    const { 
        topAttachmentHeight, 
        bottomAttachmentHeight, 
        attachmentWidth,
        attachmentRadius,
    } = params;
    
    const mugRadius = mugData.loaded 
        ? mugData.topDiameter / 2 
        : 40;
    
    const attachmentAngle = attachmentWidth / mugRadius;
    
    return {
        top: {
            height: topAttachmentHeight,
            radius: mugRadius,
            width: attachmentWidth,
            angle: attachmentAngle,
            blendRadius: attachmentRadius,
        },
        bottom: {
            height: bottomAttachmentHeight,
            radius: mugRadius,
            width: attachmentWidth,
            angle: attachmentAngle,
            blendRadius: attachmentRadius,
        },
    };
}
