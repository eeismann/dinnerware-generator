/**
 * Mesh Generator
 * Generates 3D meshes for dinnerware items using parametric profiles
 * 
 * Uses separate geometry segments at sharp angle transitions to maintain
 * crisp profile edges while allowing smooth circumferential shading.
 */

import * as THREE from 'three';
import { parameterResolver, ITEM_TYPES } from '../state/projectState.js';

// Resolution settings
const RADIAL_SEGMENTS = 64;
const CURVE_SEGMENTS = 16; // Number of segments for curved walls
const FILLET_SEGMENTS = 12; // Number of segments for corner fillets

/**
 * Quadratic Bezier interpolation
 * @param {THREE.Vector2} p0 - Start point
 * @param {THREE.Vector2} p1 - Control point
 * @param {THREE.Vector2} p2 - End point
 * @param {number} t - Parameter (0 to 1)
 * @returns {THREE.Vector2} - Interpolated point
 */
function quadraticBezier(p0, p1, p2, t) {
    const oneMinusT = 1 - t;
    const x = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x;
    const y = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y;
    return new THREE.Vector2(x, y);
}

/**
 * Generate curved profile points using quadratic Bezier
 * @param {THREE.Vector2} startPoint - Start of the curve
 * @param {THREE.Vector2} endPoint - End of the curve
 * @param {number} curveAmount - How much the curve deviates (positive = outward/convex, negative = inward/concave)
 * @param {number} curvePosition - Where along the height the apex occurs (0-1)
 * @param {number} segments - Number of interpolation segments
 * @returns {THREE.Vector2[]} - Array of points along the curve
 */
function generateCurvedProfile(startPoint, endPoint, curveAmount, curvePosition, segments = CURVE_SEGMENTS) {
    // If no curve, just return the two endpoints
    if (Math.abs(curveAmount) < 0.1) {
        return [startPoint, endPoint];
    }
    
    // Calculate control point position
    // The control point is offset perpendicular to the line between start and end
    const midY = startPoint.y + (endPoint.y - startPoint.y) * curvePosition;
    
    // Linear interpolation of radius at the curve position
    const midR = startPoint.x + (endPoint.x - startPoint.x) * curvePosition;
    
    // Offset the control point by curveAmount (positive = outward)
    const controlPoint = new THREE.Vector2(midR + curveAmount, midY);
    
    // Generate points along the curve
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        points.push(quadraticBezier(startPoint, controlPoint, endPoint, t));
    }
    
    return points;
}

/**
 * Generate a simple quarter-circle fillet for the bottom corner
 * This creates a smooth 90-degree arc transition from wall to base
 * 
 * For outer profiles: generates points from top (wall) to left (footring), going clockwise
 * For inner profiles: generates points from left (bottom) to top (wall), going counter-clockwise
 * 
 * @param {number} cornerR - The radius (x) at the original corner point
 * @param {number} cornerY - The Y position at the original corner point  
 * @param {number} filletRadius - The fillet radius
 * @param {boolean} isOuter - True for outer profile, false for inner profile
 * @param {number} segments - Number of arc segments
 * @returns {THREE.Vector2[]} - Array of points along the fillet arc
 */
function generateBottomFillet(cornerR, cornerY, filletRadius, isOuter = true, segments = FILLET_SEGMENTS) {
    if (filletRadius < 0.5) {
        return [];
    }
    
    const points = [];
    
    // Arc center is offset from the corner
    const centerR = cornerR - filletRadius;
    const centerY = cornerY + filletRadius;
    
    if (isOuter) {
        // Outer profile: generate from top (0°) to bottom (-90°) - going clockwise
        // This connects wall coming DOWN to footring going DOWN-LEFT
        // Start: (centerR + filletRadius, centerY) = (cornerR, cornerY + filletRadius)
        // End: (centerR, centerY - filletRadius) = (cornerR - filletRadius, cornerY)
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            // Interpolate angle from 0° (right) to -90° (bottom)
            const angle = -t * (Math.PI / 2);
            
            const r = centerR + Math.cos(angle) * filletRadius;
            const y = centerY + Math.sin(angle) * filletRadius;
            
            points.push(new THREE.Vector2(r, y));
        }
    } else {
        // Inner profile: generate from bottom (-90°) to top (0°) - going counter-clockwise
        // This connects bottom surface going RIGHT to wall going UP
        // Start: (centerR, centerY - filletRadius) = (cornerR - filletRadius, cornerY)
        // End: (centerR + filletRadius, centerY) = (cornerR, cornerY + filletRadius)
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            // Interpolate angle from -90° (bottom) to 0° (right/top)
            const angle = (-Math.PI / 2) + t * (Math.PI / 2);
            
            const r = centerR + Math.cos(angle) * filletRadius;
            const y = centerY + Math.sin(angle) * filletRadius;
            
            points.push(new THREE.Vector2(r, y));
        }
    }
    
    return points;
}

/**
 * Calculate common geometry values used across profile generation
 */
function calculateGeometryValues(params) {
    const { diameter, height } = params.dimensions;
    const radius = Math.max(diameter / 2, 10);
    const h = Math.max(height, 5);
    
    const wallAngleRad = (params.wallAngle * Math.PI) / 180;
    const footringHeight = Math.max(0, Math.min(params.footringOriginHeight, h * 0.8));
    const hasFootring = footringHeight > 0;
    
    const wallHeight = h - footringHeight;
    const wallRadiusChange = wallHeight * Math.tan(wallAngleRad);
    const radiusAtWallBottom = Math.max(radius - wallRadiusChange, 15);
    
    // Bottom corner radius - limit to reasonable values based on geometry
    const maxCornerRadius = Math.min(wallHeight * 0.8, radiusAtWallBottom * 0.5);
    const bottomCornerRadius = Math.min(params.bottomCornerRadius || 0, maxCornerRadius);
    
    // Calculate the radius where the fillet ends (or radiusAtWallBottom if no fillet)
    // This is where the footring wall (or base) actually starts
    let footringTopRadius = radiusAtWallBottom;
    if (bottomCornerRadius >= 0.5) {
        // When there's a fillet, calculate where it ends
        const filletTopY = footringHeight + bottomCornerRadius;
        // Wall radius at fillet top (accounting for wall angle)
        let wallRadiusAtFilletTop;
        if (wallHeight > 0) {
            const t = (filletTopY - footringHeight) / wallHeight;
            wallRadiusAtFilletTop = radiusAtWallBottom + t * (radius - radiusAtWallBottom);
        } else {
            wallRadiusAtFilletTop = radius;
        }
        footringTopRadius = wallRadiusAtFilletTop - bottomCornerRadius;
    }
    
    let footringOuterRadius = radiusAtWallBottom;
    let footringInnerRadius = 3;
    
    if (hasFootring) {
        const outerAngleRad = (params.outerFootringAngle * Math.PI) / 180;
        // Calculate footring base radius from where the footring wall actually starts
        const outerWallHorizontal = footringHeight * Math.tan(outerAngleRad);
        footringOuterRadius = Math.max(footringTopRadius - outerWallHorizontal, params.footringBaseWidth + 5);
        footringInnerRadius = Math.max(footringOuterRadius - params.footringBaseWidth, 3);
    }
    
    return {
        radius,
        h,
        footringHeight,
        hasFootring,
        wallHeight,
        radiusAtWallBottom,
        footringTopRadius, // Where the footring wall starts (after fillet if present)
        footringOuterRadius,
        footringInnerRadius,
        wallAngleRad,
        thickness: Math.max(params.wallThickness, 0.5),
        bottomCornerRadius
    };
}

/**
 * Generate the outer footring wall profile (separate segment for sharp angle)
 * From footring base to top of footring
 */
function generateOuterFootringWallProfile(params, geoVals) {
    if (!geoVals.hasFootring) return null;
    
    return [
        new THREE.Vector2(geoVals.footringOuterRadius, 0),
        new THREE.Vector2(geoVals.radiusAtWallBottom, geoVals.footringHeight)
    ];
}

/**
 * Generate the main outer wall profile (separate segment for sharp angle)
 * From top of footring (or fillet end) to rim
 * Supports curved walls via wallCurveAmount and wallCurvePosition
 * Supports filleted bottom corners via bottomCornerRadius
 */
function generateOuterMainWallProfile(params, geoVals) {
    const { diameter, height } = params.dimensions;
    
    if (!diameter || !height || diameter <= 0 || height <= 0) {
        return getDefaultProfile();
    }
    
    const curveAmount = params.wallCurveAmount || 0;
    const curvePosition = params.wallCurvePosition || 0.5;
    
    let startPoint, endPoint;
    
    if (geoVals.hasFootring) {
        // Wall from footring top to rim
        startPoint = new THREE.Vector2(geoVals.radiusAtWallBottom, geoVals.footringHeight);
        endPoint = new THREE.Vector2(geoVals.radius, geoVals.h);
    } else {
        // No footring - wall from base to rim
        startPoint = new THREE.Vector2(geoVals.radiusAtWallBottom, 0);
        endPoint = new THREE.Vector2(geoVals.radius, geoVals.h);
    }
    
    // Generate curved or straight profile
    return generateCurvedProfile(startPoint, endPoint, curveAmount, curvePosition);
}

/**
 * Calculate the radius of the wall at a given Y position, accounting for wall angle
 */
function getWallRadiusAtY(y, geoVals) {
    // Wall goes from (radius, h) at top to (radiusAtWallBottom, footringHeight) at bottom
    // Linear interpolation based on wall angle
    const wallHeight = geoVals.h - geoVals.footringHeight;
    if (wallHeight <= 0) return geoVals.radius;
    
    const t = (y - geoVals.footringHeight) / wallHeight;
    return geoVals.radiusAtWallBottom + t * (geoVals.radius - geoVals.radiusAtWallBottom);
}

/**
 * Generate the filleted corner between the main wall and footring
 * This creates a smooth curved transition at the bottom corner
 */
function generateOuterFilletProfile(params, geoVals) {
    if (!geoVals.bottomCornerRadius || geoVals.bottomCornerRadius < 0.5) {
        return null;
    }
    
    const filletRadius = geoVals.bottomCornerRadius;
    const cornerY = geoVals.footringHeight;
    
    // The fillet ends at footringTopRadius (pre-calculated)
    // Arc center is at (footringTopRadius, cornerY + filletRadius)
    const centerR = geoVals.footringTopRadius;
    const centerY = cornerY + filletRadius;
    
    // The fillet starts at the top of the arc (radius = centerR + filletRadius)
    const filletStartR = centerR + filletRadius;
    const filletStartY = centerY; // = cornerY + filletRadius
    
    const points = [];
    
    // Generate arc from 0° (right, connecting to wall) to -90° (bottom, connecting to footring/base)
    for (let i = 0; i <= FILLET_SEGMENTS; i++) {
        const t = i / FILLET_SEGMENTS;
        const angle = -t * (Math.PI / 2);
        
        const r = centerR + Math.cos(angle) * filletRadius;
        const y = centerY + Math.sin(angle) * filletRadius;
        
        points.push(new THREE.Vector2(r, y));
    }
    
    return points;
}

/**
 * Generate the wall segment from rim down to fillet start
 * Used when bottomCornerRadius > 0 to split the wall from the fillet
 */
function generateOuterWallToFilletProfile(params, geoVals) {
    const { diameter, height } = params.dimensions;
    
    if (!diameter || !height || diameter <= 0 || height <= 0) {
        return null;
    }
    
    if (!geoVals.bottomCornerRadius || geoVals.bottomCornerRadius < 0.5) {
        return null; // No fillet, use regular wall profile
    }
    
    const curveAmount = params.wallCurveAmount || 0;
    const curvePosition = params.wallCurvePosition || 0.5;
    
    // Fillet starts at the top of the arc
    // Arc center is at (footringTopRadius, footringHeight + filletRadius)
    // So the fillet start (top of arc) is at (footringTopRadius + filletRadius, footringHeight + filletRadius)
    const filletRadius = geoVals.bottomCornerRadius;
    const filletStartR = geoVals.footringTopRadius + filletRadius;
    const filletStartY = geoVals.footringHeight + filletRadius;
    
    const startPoint = new THREE.Vector2(filletStartR, filletStartY);
    const endPoint = new THREE.Vector2(geoVals.radius, geoVals.h);
    
    // Generate curved or straight profile from fillet start to rim
    return generateCurvedProfile(startPoint, endPoint, curveAmount, curvePosition);
}

/**
 * Generate the footring wall from fillet end to footring base
 * Used when bottomCornerRadius > 0
 * Uses pre-calculated footringTopRadius (fillet end) and footringOuterRadius (base)
 */
function generateOuterFootringFromFilletProfile(params, geoVals) {
    if (!geoVals.hasFootring) return null;
    if (!geoVals.bottomCornerRadius || geoVals.bottomCornerRadius < 0.5) return null;
    
    // Footring wall goes from fillet end (footringTopRadius) to footring base (footringOuterRadius)
    return [
        new THREE.Vector2(geoVals.footringTopRadius, geoVals.footringHeight),
        new THREE.Vector2(geoVals.footringOuterRadius, 0)
    ];
}

/**
 * Generate horizontal base surface from fillet end when there's no footring
 * Used when bottomCornerRadius > 0 and no footring
 */
function generateOuterBaseFromFilletProfile(params, geoVals) {
    if (geoVals.hasFootring) return null;
    if (!geoVals.bottomCornerRadius || geoVals.bottomCornerRadius < 0.5) return null;
    
    // Fillet ends at (footringTopRadius, footringHeight) = (footringTopRadius, 0) when no footring
    const filletEndR = geoVals.footringTopRadius;
    
    // Base goes from fillet end toward center
    // For no-footring case, we just need a small horizontal segment
    const innerR = Math.max(filletEndR - 5, 1);
    
    return [
        new THREE.Vector2(filletEndR, 0),
        new THREE.Vector2(innerR, 0)
    ];
}

/**
 * Generate the inner footring wall profile (from footring inner edge to base)
 * Separate segment to maintain sharp innerFootringAngle
 */
function generateInnerFootringWallProfile(params, geoVals) {
    if (!geoVals.hasFootring) return null;
    
    const innerAngleRad = (params.innerFootringAngle * Math.PI) / 180;
    
    // Base depth: positive = recess (below y=0), negative = raised (above y=0)
    const baseY = -params.baseRecessDepth;
    
    // Inner footring wall connects footring base to base plane
    const innerWallHeight = Math.abs(baseY);
    const innerWallHorizontal = innerWallHeight * Math.tan(innerAngleRad);
    
    let baseEdgeRadius;
    if (baseY >= 0) {
        // Raised or flush base - wall goes up from footring
        baseEdgeRadius = Math.max(geoVals.footringInnerRadius - innerWallHorizontal, 1);
    } else {
        // Recessed base - wall goes down from footring
        baseEdgeRadius = Math.max(geoVals.footringInnerRadius + innerWallHorizontal, 1);
    }
    
    if (baseY >= 0) {
        // Raised base: profile goes from footring inner (at y=0) up to base edge
        if (baseY > 0.1) {
            return [
                new THREE.Vector2(geoVals.footringInnerRadius, 0),
                new THREE.Vector2(baseEdgeRadius, baseY)
            ];
        }
        return null; // No significant wall for flush base
    } else {
        // Recessed base: profile goes from base edge (at baseY) up to footring inner
        return [
            new THREE.Vector2(baseEdgeRadius, baseY),
            new THREE.Vector2(geoVals.footringInnerRadius, 0)
        ];
    }
}

/**
 * Generate the base surface profile (horizontal bottom surface inside footring)
 */
function generateBaseSurfaceProfile(params, geoVals) {
    if (!geoVals.hasFootring) return null;
    
    const innerAngleRad = (params.innerFootringAngle * Math.PI) / 180;
    const baseY = -params.baseRecessDepth;
    
    const innerWallHeight = Math.abs(baseY);
    const innerWallHorizontal = innerWallHeight * Math.tan(innerAngleRad);
    
    let baseEdgeRadius;
    if (baseY >= 0) {
        baseEdgeRadius = Math.max(geoVals.footringInnerRadius - innerWallHorizontal, 1);
    } else {
        baseEdgeRadius = Math.max(geoVals.footringInnerRadius + innerWallHorizontal, 1);
    }
    
    const surfaceY = baseY >= 0 ? Math.max(baseY, 0.1) : baseY;
    
    return [
        new THREE.Vector2(0.1, surfaceY),
        new THREE.Vector2(baseEdgeRadius, surfaceY)
    ];
}

/**
 * Calculate the inner wall radius at a given Y position, accounting for wall angle and thickness
 */
function getInnerWallRadiusAtY(y, geoVals) {
    const outerRadius = getWallRadiusAtY(y, geoVals);
    return Math.max(outerRadius - geoVals.thickness, 5);
}

/**
 * Generate inner bottom surface profile (horizontal surface at bottom of vessel interior)
 * When fillet is applied, the bottom is smaller to accommodate the fillet
 */
function generateInnerBottomProfile(params, geoVals) {
    const innerRadiusAtWallBottom = Math.max(geoVals.radiusAtWallBottom - geoVals.thickness, 5);
    const innerBottomY = geoVals.footringHeight + geoVals.thickness;
    
    // Calculate inner fillet radius (slightly smaller to maintain wall thickness)
    const innerFilletRadius = Math.max(0, geoVals.bottomCornerRadius - geoVals.thickness * 0.5);
    
    if (innerFilletRadius >= 0.5) {
        // Bottom surface is smaller when there's a fillet
        // Calculate where the inner fillet ends (at the bottom of the arc)
        const innerFilletTopY = innerBottomY + innerFilletRadius;
        const innerWallRadiusAtFilletTop = getInnerWallRadiusAtY(innerFilletTopY, geoVals);
        const bottomEndRadius = Math.max(innerWallRadiusAtFilletTop - innerFilletRadius, 1);
        
        return [
            new THREE.Vector2(0.1, innerBottomY),
            new THREE.Vector2(bottomEndRadius, innerBottomY)
        ];
    }
    
    return [
        new THREE.Vector2(0.1, innerBottomY),
        new THREE.Vector2(innerRadiusAtWallBottom, innerBottomY)
    ];
}

/**
 * Generate inner fillet profile (smooth corner between inner bottom and inner wall)
 */
function generateInnerFilletProfile(params, geoVals) {
    const innerFilletRadius = Math.max(0, geoVals.bottomCornerRadius - geoVals.thickness * 0.5);
    
    if (innerFilletRadius < 0.5) {
        return null;
    }
    
    const innerBottomY = geoVals.footringHeight + geoVals.thickness;
    const innerFilletTopY = innerBottomY + innerFilletRadius;
    const innerWallRadiusAtFilletTop = getInnerWallRadiusAtY(innerFilletTopY, geoVals);
    
    // Arc center
    const centerR = innerWallRadiusAtFilletTop - innerFilletRadius;
    const centerY = innerBottomY + innerFilletRadius;
    
    const points = [];
    
    // Generate arc from -90° (bottom, connecting to inner bottom) to 0° (right, connecting to inner wall)
    for (let i = 0; i <= FILLET_SEGMENTS; i++) {
        const t = i / FILLET_SEGMENTS;
        const angle = (-Math.PI / 2) + t * (Math.PI / 2);
        
        const r = centerR + Math.cos(angle) * innerFilletRadius;
        const y = centerY + Math.sin(angle) * innerFilletRadius;
        
        points.push(new THREE.Vector2(r, y));
    }
    
    return points;
}

/**
 * Generate inner wall profile (the inside wall of the vessel)
 * Separate from bottom to maintain sharp wall angle
 * Supports curved walls - inner curve follows outer curve offset by wall thickness
 * When fillet is present, wall starts from fillet end instead of corner
 */
function generateInnerWallProfile(params, geoVals) {
    const { diameter, height } = params.dimensions;
    
    if (!diameter || !height || diameter <= 0 || height <= 0) {
        return getDefaultInnerProfile();
    }
    
    const innerRadiusAtWallBottom = Math.max(geoVals.radiusAtWallBottom - geoVals.thickness, 5);
    const innerRadiusAtRim = Math.max(geoVals.radius - geoVals.thickness, 5);
    const innerBottomY = geoVals.footringHeight + geoVals.thickness;
    
    const curveAmount = params.wallCurveAmount || 0;
    const curvePosition = params.wallCurvePosition || 0.5;
    
    const innerFilletRadius = Math.max(0, geoVals.bottomCornerRadius - geoVals.thickness * 0.5);
    
    let startPoint;
    
    if (innerFilletRadius >= 0.5) {
        // Wall starts at top of fillet arc
        const innerFilletTopY = innerBottomY + innerFilletRadius;
        const innerWallRadiusAtFilletTop = getInnerWallRadiusAtY(innerFilletTopY, geoVals);
        startPoint = new THREE.Vector2(innerWallRadiusAtFilletTop, innerFilletTopY);
    } else {
        startPoint = new THREE.Vector2(innerRadiusAtWallBottom, innerBottomY);
    }
    
    const endPoint = new THREE.Vector2(innerRadiusAtRim, geoVals.h);
    
    // Inner wall curve amount is the same as outer (maintains thickness along the curve)
    return generateCurvedProfile(startPoint, endPoint, curveAmount, curvePosition);
}

function getDefaultProfile() {
    return [
        new THREE.Vector2(50, 0),
        new THREE.Vector2(60, 25)
    ];
}

function getDefaultInnerProfile() {
    return [
        new THREE.Vector2(0.1, 2.5),
        new THREE.Vector2(45, 2.5),
        new THREE.Vector2(55, 25)
    ];
}

/**
 * Generate complete mesh for an item type
 * Uses separate geometry segments at sharp angle transitions to maintain
 * crisp profile edges (footring angles, wall angle) while having smooth
 * circumferential shading.
 */
export function generateItemMesh(itemType) {
    try {
        const params = parameterResolver.getAllParameters(itemType);
        
        if (!params || !params.dimensions) {
            console.error('Invalid parameters for', itemType);
            return createFallbackGeometry();
        }
        
        const { diameter, height } = params.dimensions;
        if (!diameter || !height || diameter <= 0 || height <= 0) {
            console.error('Invalid dimensions for', itemType);
            return createFallbackGeometry();
        }
        
        const geometries = [];
        const geoVals = calculateGeometryValues(params);
        const hasFilletedCorner = geoVals.bottomCornerRadius >= 0.5;
        
        // === OUTER SURFACE (split into segments for sharp angles) ===
        
        if (hasFilletedCorner) {
            // With fillet: Wall -> Fillet -> Footring (or base)
            
            // 1a. Wall from rim down to fillet start
            const wallToFilletPoints = generateOuterWallToFilletProfile(params, geoVals);
            if (wallToFilletPoints && wallToFilletPoints.length >= 2) {
                const geo = new THREE.LatheGeometry(wallToFilletPoints, RADIAL_SEGMENTS);
                geometries.push(geo);
            }
            
            // 1b. Fillet curve
            const filletPoints = generateOuterFilletProfile(params, geoVals);
            if (filletPoints && filletPoints.length >= 2) {
                const geo = new THREE.LatheGeometry(filletPoints, RADIAL_SEGMENTS);
                geometries.push(geo);
            }
            
            // 1c. Footring wall from fillet end to base (if has footring)
            if (geoVals.hasFootring) {
                const footringFromFilletPoints = generateOuterFootringFromFilletProfile(params, geoVals);
                if (footringFromFilletPoints && footringFromFilletPoints.length >= 2) {
                    const geo = new THREE.LatheGeometry(footringFromFilletPoints, RADIAL_SEGMENTS);
                    geometries.push(geo);
                }
            } else {
                // 1c-alt. Base surface from fillet end (if no footring)
                const baseFromFilletPoints = generateOuterBaseFromFilletProfile(params, geoVals);
                if (baseFromFilletPoints && baseFromFilletPoints.length >= 2) {
                    const geo = new THREE.LatheGeometry(baseFromFilletPoints, RADIAL_SEGMENTS);
                    geometries.push(geo);
                }
            }
        } else {
            // Without fillet: Original behavior
            
            // 1a. Outer footring wall (if has footring)
            if (geoVals.hasFootring) {
                const outerFootringWallPoints = generateOuterFootringWallProfile(params, geoVals);
                if (outerFootringWallPoints && outerFootringWallPoints.length >= 2) {
                    const geo = new THREE.LatheGeometry(outerFootringWallPoints, RADIAL_SEGMENTS);
                    geometries.push(geo);
                }
            }
            
            // 1b. Main outer wall
            const outerMainWallPoints = generateOuterMainWallProfile(params, geoVals);
            if (outerMainWallPoints && outerMainWallPoints.length >= 2) {
                const geo = new THREE.LatheGeometry(outerMainWallPoints, RADIAL_SEGMENTS);
                geometries.push(geo);
            }
        }
        
        // === FOOTRING/BASE AREA (if has footring) ===
        
        if (geoVals.hasFootring) {
            // 2a. Inner footring wall (maintains sharp innerFootringAngle)
            const innerFootringWallPoints = generateInnerFootringWallProfile(params, geoVals);
            if (innerFootringWallPoints && innerFootringWallPoints.length >= 2) {
                const geo = new THREE.LatheGeometry(innerFootringWallPoints, RADIAL_SEGMENTS);
                // Flip normals for recessed base (facing outward) or keep for raised base
                if (params.baseRecessDepth > 0) {
                    // Recessed base - normals point outward (default is correct)
                } else {
                    // Raised base - normals point inward
                    flipGeometryNormals(geo);
                }
                geometries.push(geo);
            }
            
            // 2b. Base surface (horizontal)
            const baseSurfacePoints = generateBaseSurfaceProfile(params, geoVals);
            if (baseSurfacePoints && baseSurfacePoints.length >= 2) {
                const geo = new THREE.LatheGeometry(baseSurfacePoints, RADIAL_SEGMENTS);
                if (params.baseRecessDepth <= 0) {
                    // Raised or flush base - surface faces down
                    flipGeometryNormals(geo);
                }
                geometries.push(geo);
            }
            
            // 2c. Footring bottom ring (the contact surface at y=0)
            const footringBottomGeo = createFootringBottomRing(params, geoVals);
            if (footringBottomGeo) {
                geometries.push(footringBottomGeo);
            }
        }
        
        // === INNER SURFACE (split for sharp wall angle) ===
        
        // Check if this is a saucer with a cup ring
        const isSaucerWithCupRing = itemType === 'saucer' && 
            params.cupRingDepth !== undefined && 
            params.cupRingDepth > 0 &&
            params.cupRingDiameter !== undefined;
        
        if (isSaucerWithCupRing) {
            // Generate saucer-specific inner surface with cup ring
            const cupRingGeometries = generateSaucerInnerSurface(params, geoVals);
            cupRingGeometries.forEach(geo => geometries.push(geo));
        } else {
            // Standard inner surface (no cup ring)
            const innerFilletRadius = Math.max(0, geoVals.bottomCornerRadius - geoVals.thickness * 0.5);
            const hasInnerFillet = innerFilletRadius >= 0.5;
            
            // 3a. Inner bottom surface
            const innerBottomPoints = generateInnerBottomProfile(params, geoVals);
            if (innerBottomPoints && innerBottomPoints.length >= 2) {
                const geo = new THREE.LatheGeometry(innerBottomPoints, RADIAL_SEGMENTS);
                flipGeometryNormals(geo); // Faces inward/down
                geometries.push(geo);
            }
            
            // 3b. Inner fillet (if present)
            if (hasInnerFillet) {
                const innerFilletPoints = generateInnerFilletProfile(params, geoVals);
                if (innerFilletPoints && innerFilletPoints.length >= 2) {
                    const geo = new THREE.LatheGeometry(innerFilletPoints, RADIAL_SEGMENTS);
                    flipGeometryNormals(geo); // Faces inward
                    geometries.push(geo);
                }
            }
            
            // 3c. Inner wall
            const innerWallPoints = generateInnerWallProfile(params, geoVals);
            if (innerWallPoints && innerWallPoints.length >= 2) {
                const geo = new THREE.LatheGeometry(innerWallPoints, RADIAL_SEGMENTS);
                flipGeometryNormals(geo); // Faces inward
                geometries.push(geo);
            }
            
            // 5. Bottom cap (inside bottom of vessel - closing the inner bottom)
            const innerBottomY = geoVals.footringHeight + geoVals.thickness;
            
            // When there's a fillet, the cap radius needs to match where the inner fillet ends
            let capRadius;
            if (hasInnerFillet) {
                const innerFilletTopY = innerBottomY + innerFilletRadius;
                const innerWallRadiusAtFilletTop = getInnerWallRadiusAtY(innerFilletTopY, geoVals);
                capRadius = Math.max(innerWallRadiusAtFilletTop - innerFilletRadius, 1);
            } else {
                capRadius = Math.max(geoVals.radiusAtWallBottom - geoVals.thickness, 5);
            }
            
            const bottomGeo = createBottomCap(
                new THREE.Vector2(0.1, innerBottomY),
                new THREE.Vector2(capRadius, innerBottomY),
                RADIAL_SEGMENTS
            );
            if (bottomGeo) geometries.push(bottomGeo);
        }
        
        // === CAPS ===
        
        // 4. Rim cap
        const rimGeo = createRimCap(
            new THREE.Vector2(geoVals.radius, geoVals.h),
            new THREE.Vector2(Math.max(geoVals.radius - geoVals.thickness, 5), geoVals.h),
            RADIAL_SEGMENTS
        );
        if (rimGeo) geometries.push(rimGeo);
        
        // Merge all geometries
        if (geometries.length === 0) {
            return createFallbackGeometry();
        }
        
        // Merge WITHOUT recomputing normals - each segment maintains its own normals
        // This preserves smooth circumference while keeping sharp profile angles
        const mergedGeometry = mergeBufferGeometries(geometries);
        
        return mergedGeometry;
        
    } catch (error) {
        console.error('Error generating mesh for', itemType, error);
        return createFallbackGeometry();
    }
}

/**
 * Generate saucer inner surface with cup ring indentation
 * The cup ring is a circular indented area where the cup base sits
 */
function generateSaucerInnerSurface(params, geoVals) {
    const geometries = [];
    
    const cupRingDepth = params.cupRingDepth;
    const cupRingDiameter = params.cupRingDiameter;
    // Indentation radius is cup ring diameter / 2 + 0.5mm clearance
    const indentRadius = (cupRingDiameter / 2) + 0.5;
    
    const innerBottomY = geoVals.footringHeight + geoVals.thickness;
    const innerRadiusAtRim = Math.max(geoVals.radius - geoVals.thickness, 5);
    
    // Calculate inner fillet parameters
    const innerFilletRadius = Math.max(0, geoVals.bottomCornerRadius - geoVals.thickness * 0.5);
    const hasInnerFillet = innerFilletRadius >= 0.5;
    
    // Calculate where the inner wall/fillet starts (accounting for fillet if present)
    let innerWallBottomRadius;
    let innerWallStartY;
    
    if (hasInnerFillet) {
        // Inner wall starts at top of fillet
        innerWallStartY = innerBottomY + innerFilletRadius;
        innerWallBottomRadius = getInnerWallRadiusAtY(innerWallStartY, geoVals);
        // The flat area ends where the fillet starts (at the bottom of the fillet)
        // Fillet bottom is at (innerWallBottomRadius - innerFilletRadius, innerBottomY)
    } else {
        innerWallStartY = innerBottomY;
        innerWallBottomRadius = Math.max(geoVals.radiusAtWallBottom - geoVals.thickness, 5);
    }
    
    // Where the flat area ends (either at fillet start or at wall start)
    const flatAreaEndRadius = hasInnerFillet 
        ? Math.max(innerWallBottomRadius - innerFilletRadius, 5)
        : innerWallBottomRadius;
    
    // Indentation bottom Y position
    const indentBottomY = innerBottomY - cupRingDepth;
    
    // Ensure indentation fits within the saucer
    const maxIndentRadius = flatAreaEndRadius - 2;
    const actualIndentRadius = Math.min(indentRadius, maxIndentRadius);
    
    // 1. Indented center area (flat bottom of the indentation)
    const indentBottomPoints = [
        new THREE.Vector2(0.1, indentBottomY),
        new THREE.Vector2(actualIndentRadius, indentBottomY)
    ];
    const indentBottomGeo = new THREE.LatheGeometry(indentBottomPoints, RADIAL_SEGMENTS);
    flipGeometryNormals(indentBottomGeo);
    geometries.push(indentBottomGeo);
    
    // Center cap for the indentation
    const indentCapGeo = createBottomCap(
        new THREE.Vector2(0.1, indentBottomY),
        new THREE.Vector2(actualIndentRadius, indentBottomY),
        RADIAL_SEGMENTS
    );
    if (indentCapGeo) geometries.push(indentCapGeo);
    
    // 2. Vertical wall of indentation (going up from indent bottom to main surface level)
    const indentWallPoints = [
        new THREE.Vector2(actualIndentRadius, indentBottomY),
        new THREE.Vector2(actualIndentRadius, innerBottomY)
    ];
    const indentWallGeo = new THREE.LatheGeometry(indentWallPoints, RADIAL_SEGMENTS);
    flipGeometryNormals(indentWallGeo);
    geometries.push(indentWallGeo);
    
    // 3. Outer flat area (from edge of indentation to fillet/wall start)
    if (actualIndentRadius < flatAreaEndRadius - 0.5) {
        const outerFlatPoints = [
            new THREE.Vector2(actualIndentRadius, innerBottomY),
            new THREE.Vector2(flatAreaEndRadius, innerBottomY)
        ];
        const outerFlatGeo = new THREE.LatheGeometry(outerFlatPoints, RADIAL_SEGMENTS);
        flipGeometryNormals(outerFlatGeo);
        geometries.push(outerFlatGeo);
    }
    
    // 4. Inner fillet (if present)
    if (hasInnerFillet) {
        const innerFilletPoints = generateInnerFilletProfile(params, geoVals);
        if (innerFilletPoints && innerFilletPoints.length >= 2) {
            const innerFilletGeo = new THREE.LatheGeometry(innerFilletPoints, RADIAL_SEGMENTS);
            flipGeometryNormals(innerFilletGeo);
            geometries.push(innerFilletGeo);
        }
    }
    
    // 5. Inner wall (from fillet top or bottom level up to rim)
    const curveAmount = params.wallCurveAmount || 0;
    const curvePosition = params.wallCurvePosition || 0.5;
    
    const innerWallStartPoint = new THREE.Vector2(innerWallBottomRadius, innerWallStartY);
    const innerWallEndPoint = new THREE.Vector2(innerRadiusAtRim, geoVals.h);
    
    const innerWallPoints = generateCurvedProfile(innerWallStartPoint, innerWallEndPoint, curveAmount, curvePosition);
    if (innerWallPoints && innerWallPoints.length >= 2) {
        const innerWallGeo = new THREE.LatheGeometry(innerWallPoints, RADIAL_SEGMENTS);
        flipGeometryNormals(innerWallGeo);
        geometries.push(innerWallGeo);
    }
    
    return geometries;
}

/**
 * Create the footring bottom ring (horizontal contact surface)
 */
function createFootringBottomRing(params, geoVals) {
    const footringOuterRadius = geoVals.footringOuterRadius;
    const footringInnerRadius = geoVals.footringInnerRadius;
    
    // Create ring at y=0 from inner to outer
    const vertices = [];
    const normals = [];
    const indices = [];
    
    for (let i = 0; i <= RADIAL_SEGMENTS; i++) {
        const angle = (i / RADIAL_SEGMENTS) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Inner vertex
        vertices.push(footringInnerRadius * cos, 0, footringInnerRadius * sin);
        normals.push(0, -1, 0); // Face down
        
        // Outer vertex
        vertices.push(footringOuterRadius * cos, 0, footringOuterRadius * sin);
        normals.push(0, -1, 0); // Face down
    }
    
    for (let i = 0; i < RADIAL_SEGMENTS; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        
        // Face down (y = -1 normal)
        indices.push(a, b, c);
        indices.push(b, d, c);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    return geometry;
}

/**
 * Flip geometry normals and face winding
 */
function flipGeometryNormals(geometry) {
    const normals = geometry.getAttribute('normal');
    if (normals) {
        const normalArray = normals.array;
        for (let i = 0; i < normalArray.length; i++) {
            normalArray[i] = -normalArray[i];
        }
        normals.needsUpdate = true;
    }
    
    const index = geometry.getIndex();
    if (index) {
        const indexArray = index.array;
        for (let i = 0; i < indexArray.length; i += 3) {
            const temp = indexArray[i];
            indexArray[i] = indexArray[i + 2];
            indexArray[i + 2] = temp;
        }
        index.needsUpdate = true;
    }
}

function createFallbackGeometry() {
    const points = [
        new THREE.Vector2(50, 0),
        new THREE.Vector2(60, 30)
    ];
    return new THREE.LatheGeometry(points, RADIAL_SEGMENTS);
}

function createRimCap(outerPoint, innerPoint, segments) {
    if (!outerPoint || !innerPoint) return null;
    
    const outerRadius = outerPoint.x;
    const innerRadius = innerPoint.x;
    const y = outerPoint.y;
    
    if (outerRadius <= innerRadius) return null;
    
    const vertices = [];
    const normals = [];
    const indices = [];
    
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        // Outer vertex
        vertices.push(outerRadius * cos, y, outerRadius * sin);
        normals.push(0, 1, 0); // Face up
        
        // Inner vertex
        vertices.push(innerRadius * cos, y, innerRadius * sin);
        normals.push(0, 1, 0); // Face up
    }
    
    for (let i = 0; i < segments; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        
        indices.push(a, c, b);
        indices.push(b, c, d);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    return geometry;
}

function createBottomCap(centerPoint, edgePoint, segments) {
    if (!centerPoint || !edgePoint) return null;
    
    const y = centerPoint.y;
    const innerRadius = edgePoint.x;
    
    const vertices = [0, y, 0];
    const normals = [0, -1, 0]; // Center faces down (into vessel)
    const indices = [];
    
    for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        vertices.push(innerRadius * Math.cos(angle), y, innerRadius * Math.sin(angle));
        normals.push(0, -1, 0); // Face down (into vessel)
    }
    
    for (let i = 1; i <= segments; i++) {
        indices.push(0, i + 1, i);
    }
    
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    
    return geometry;
}

function mergeBufferGeometries(geometries) {
    const validGeometries = geometries.filter(g => g && g.getAttribute('position') && g.getAttribute('position').count > 0);
    
    if (validGeometries.length === 0) {
        return createFallbackGeometry();
    }
    
    if (validGeometries.length === 1) {
        return validGeometries[0];
    }
    
    let totalPositions = 0;
    let totalIndices = 0;
    
    validGeometries.forEach(geo => {
        totalPositions += geo.getAttribute('position').count * 3;
        const index = geo.getIndex();
        if (index) {
            totalIndices += index.count;
        } else {
            totalIndices += geo.getAttribute('position').count;
        }
    });
    
    const mergedPositions = new Float32Array(totalPositions);
    const mergedNormals = new Float32Array(totalPositions);
    const mergedIndices = [];
    
    let positionOffset = 0;
    let vertexOffset = 0;
    
    validGeometries.forEach(geo => {
        const positions = geo.getAttribute('position');
        const normals = geo.getAttribute('normal');
        const index = geo.getIndex();
        
        for (let i = 0; i < positions.count; i++) {
            mergedPositions[positionOffset + i * 3] = positions.getX(i);
            mergedPositions[positionOffset + i * 3 + 1] = positions.getY(i);
            mergedPositions[positionOffset + i * 3 + 2] = positions.getZ(i);
            
            if (normals) {
                mergedNormals[positionOffset + i * 3] = normals.getX(i);
                mergedNormals[positionOffset + i * 3 + 1] = normals.getY(i);
                mergedNormals[positionOffset + i * 3 + 2] = normals.getZ(i);
            }
        }
        
        if (index) {
            for (let i = 0; i < index.count; i++) {
                mergedIndices.push(index.getX(i) + vertexOffset);
            }
        } else {
            for (let i = 0; i < positions.count; i++) {
                mergedIndices.push(i + vertexOffset);
            }
        }
        
        positionOffset += positions.count * 3;
        vertexOffset += positions.count;
    });
    
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(mergedPositions, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
    merged.setIndex(mergedIndices);
    
    return merged;
}

export function generateAllMeshes() {
    const meshes = {};
    ITEM_TYPES.forEach(itemType => {
        meshes[itemType] = generateItemMesh(itemType);
    });
    return meshes;
}

export function getItemDimensions(itemType) {
    const params = parameterResolver.getAllParameters(itemType);
    return {
        diameter: Math.round((params.dimensions?.diameter || 100) * 10) / 10,
        height: Math.round((params.dimensions?.height || 50) * 10) / 10
    };
}
