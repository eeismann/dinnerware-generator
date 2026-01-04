/**
 * Vessel Generator - Bezier Curve Utilities
 * Cubic bezier curve mathematics for profile generation
 */

export class BezierCurve {
    /**
     * Evaluate cubic bezier at parameter t
     * P(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
     * 
     * @param {number} t - Parameter 0 to 1
     * @param {Object} p0 - Start point {x, y}
     * @param {Object} p1 - Control point 1 {x, y}
     * @param {Object} p2 - Control point 2 {x, y}
     * @param {Object} p3 - End point {x, y}
     * @returns {Object} Point {x, y}
     */
    static evaluate(t, p0, p1, p2, p3) {
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;

        return {
            x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
            y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
        };
    }

    /**
     * Get tangent vector at parameter t
     * @param {number} t - Parameter 0 to 1
     * @param {Object} p0 - Start point
     * @param {Object} p1 - Control point 1
     * @param {Object} p2 - Control point 2
     * @param {Object} p3 - End point
     * @returns {Object} Tangent vector {x, y}
     */
    static tangent(t, p0, p1, p2, p3) {
        const t2 = t * t;
        const mt = 1 - t;
        const mt2 = mt * mt;

        return {
            x: 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
            y: 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y)
        };
    }

    /**
     * Get normal vector at parameter t (perpendicular to tangent)
     * @param {number} t - Parameter 0 to 1
     * @param {Object} p0 - Start point
     * @param {Object} p1 - Control point 1
     * @param {Object} p2 - Control point 2
     * @param {Object} p3 - End point
     * @returns {Object} Normal vector {x, y}
     */
    static normal(t, p0, p1, p2, p3) {
        const tang = this.tangent(t, p0, p1, p2, p3);
        const mag = Math.sqrt(tang.x * tang.x + tang.y * tang.y);
        
        if (mag === 0) return { x: 1, y: 0 };
        
        // Rotate tangent 90 degrees
        return {
            x: -tang.y / mag,
            y: tang.x / mag
        };
    }

    /**
     * Sample curve at n evenly-spaced points
     * @param {Object} p0 - Start point
     * @param {Object} p1 - Control point 1
     * @param {Object} p2 - Control point 2
     * @param {Object} p3 - End point
     * @param {number} numPoints - Number of sample points
     * @returns {Array} Array of {x, y} points
     */
    static sample(p0, p1, p2, p3, numPoints = 50) {
        const points = [];
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            points.push(this.evaluate(t, p0, p1, p2, p3));
        }
        return points;
    }

    /**
     * Adaptive sampling based on curvature
     * More points where curve bends more
     * @param {Object} p0 - Start point
     * @param {Object} p1 - Control point 1
     * @param {Object} p2 - Control point 2
     * @param {Object} p3 - End point
     * @param {number} tolerance - Distance tolerance for subdivision
     * @returns {Array} Array of {x, y} points
     */
    static adaptiveSample(p0, p1, p2, p3, tolerance = 0.5) {
        const points = [p0];
        this._subdivide(p0, p1, p2, p3, 0, 1, points, tolerance);
        points.push(p3);
        return points;
    }

    static _subdivide(p0, p1, p2, p3, t0, t1, points, tolerance) {
        const tMid = (t0 + t1) / 2;
        const pMid = this.evaluate(tMid, p0, p1, p2, p3);
        const pStart = this.evaluate(t0, p0, p1, p2, p3);
        const pEnd = this.evaluate(t1, p0, p1, p2, p3);

        // Check if midpoint is close enough to linear interpolation
        const linearMid = {
            x: (pStart.x + pEnd.x) / 2,
            y: (pStart.y + pEnd.y) / 2
        };
        
        const dist = Math.sqrt(
            Math.pow(pMid.x - linearMid.x, 2) + 
            Math.pow(pMid.y - linearMid.y, 2)
        );

        if (dist > tolerance && t1 - t0 > 0.01) {
            this._subdivide(p0, p1, p2, p3, t0, tMid, points, tolerance);
            points.push(pMid);
            this._subdivide(p0, p1, p2, p3, tMid, t1, points, tolerance);
        }
    }

    /**
     * Convert normalized handle coordinates to absolute coordinates
     * Handles are normalized 0-1 relative to the section bounding box
     * 
     * @param {Object} handle - Normalized handle {x: 0-1, y: 0-1}
     * @param {Object} start - Start point {x: radius, y: height}
     * @param {Object} end - End point {x: radius, y: height}
     * @param {number} intensity - Curve intensity multiplier (0-100)
     * @returns {Object} Absolute handle position {x, y}
     */
    static handleToAbsolute(handle, start, end, intensity = 100) {
        const dr = end.x - start.x;  // Radius difference
        const dh = end.y - start.y;  // Height difference (negative for going down)
        
        // Scale handle offset by intensity
        const scaledX = handle.x * (intensity / 100);
        
        // Handle x affects radius: positive = outward bulge, negative = inward
        // Handle y is position along the section height
        return {
            x: start.x + scaledX * Math.abs(dr) + handle.y * dr,
            y: start.y + handle.y * dh
        };
    }

    /**
     * Create control points for a section curve
     * @param {Object} start - Start point {r, h}
     * @param {Object} end - End point {r, h}
     * @param {Object} handles - Bezier handles {h1: {x, y}, h2: {x, y}}
     * @param {number} intensity - Curve intensity (0-100)
     * @returns {Object} {p0, p1, p2, p3} for bezier evaluation
     */
    static createControlPoints(start, end, handles, intensity = 100) {
        const p0 = { x: start.r, y: start.h };
        const p3 = { x: end.r, y: end.h };
        
        // Calculate control points from handles
        const dh = end.h - start.h;
        const dr = end.r - start.r;
        const scale = intensity / 100;

        // For a straight line, control points should lie on the line between start and end
        // The handle.y value determines position along the line (0-1)
        // The handle.x value (scaled by intensity) adds curvature offset
        
        // Handle h1 controls curve near start
        const p1 = {
            x: start.r + handles.h1.y * dr + handles.h1.x * Math.max(20, Math.abs(dr)) * scale,
            y: start.h + handles.h1.y * dh
        };

        // Handle h2 controls curve near end
        const p2 = {
            x: start.r + handles.h2.y * dr + handles.h2.x * Math.max(20, Math.abs(dr)) * scale,
            y: start.h + handles.h2.y * dh
        };

        return { p0, p1, p2, p3 };
    }

    /**
     * Get curve length approximation
     * @param {Object} p0 - Start point
     * @param {Object} p1 - Control point 1
     * @param {Object} p2 - Control point 2
     * @param {Object} p3 - End point
     * @param {number} segments - Number of segments for approximation
     * @returns {number} Approximate curve length
     */
    static approximateLength(p0, p1, p2, p3, segments = 100) {
        let length = 0;
        let prevPoint = p0;

        for (let i = 1; i <= segments; i++) {
            const t = i / segments;
            const point = this.evaluate(t, p0, p1, p2, p3);
            length += Math.sqrt(
                Math.pow(point.x - prevPoint.x, 2) + 
                Math.pow(point.y - prevPoint.y, 2)
            );
            prevPoint = point;
        }

        return length;
    }

    /**
     * Create bezier handles for common curve types
     * @param {string} curveType - 'straight'|'concave'|'convex'|'sCurve'
     * @param {number} intensity - Curve intensity 0-100
     * @returns {Object} Handles {h1: {x, y}, h2: {x, y}}
     */
    static getPresethHandles(curveType, intensity = 50) {
        const scale = intensity / 100;
        
        switch (curveType) {
            case 'straight':
                return {
                    h1: { x: 0, y: 0.33 },
                    h2: { x: 0, y: 0.67 }
                };
            
            case 'concave':
                return {
                    h1: { x: -0.3 * scale, y: 0.2 },
                    h2: { x: -0.3 * scale, y: 0.8 }
                };
            
            case 'convex':
                return {
                    h1: { x: 0.3 * scale, y: 0.2 },
                    h2: { x: 0.3 * scale, y: 0.8 }
                };
            
            case 'sCurve':
                return {
                    h1: { x: 0.3 * scale, y: 0.25 },
                    h2: { x: -0.3 * scale, y: 0.75 }
                };
            
            default:
                return {
                    h1: { x: 0, y: 0.33 },
                    h2: { x: 0, y: 0.67 }
                };
        }
    }
}

export default BezierCurve;

