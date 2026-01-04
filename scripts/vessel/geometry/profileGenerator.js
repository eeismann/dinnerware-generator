/**
 * Vessel Generator - Profile Generator
 * Generates 2D profile curves from vessel parameters
 */

import { BezierCurve } from './bezierCurve.js';

/**
 * Profile point with metadata
 * @typedef {Object} ProfilePoint
 * @property {number} r - Radius (mm)
 * @property {number} h - Height (mm, 0 at base)
 * @property {string} section - Section name
 * @property {boolean} isTransition - Whether this is a transition point
 */

// Smoothing mode options:
// 'none' - No smoothing (original behavior with visible seams)
// 'tangent' - G1 continuity via tangent matching between sections
// 'smooth' - Post-process profile smoothing around section boundaries
// 'catmull' - Catmull-Rom spline interpolation through section endpoints
export const SMOOTHING_MODE = 'tangent'; // Change this to switch between solutions

export class ProfileGenerator {
    constructor(state) {
        this.state = state;
        this.samplesPerSection = 50;
        this.lastExitTangent = null; // For G1 continuity
    }

    /**
     * Generate complete outer profile from state
     * @returns {ProfilePoint[]} Array of profile points from base to top
     */
    generate() {
        const profile = [];
        const sections = this.state.sections;
        const global = this.state.global;
        
        // Reset tangent tracking for G1 continuity
        this.lastExitTangent = null;
        
        // Apply diameter locks before generating profile
        this.applyDiameterLocks();
        
        let currentHeight = 0;
        let currentRadius = sections.foot.bottomDiameter / 2;

        // Order of sections from bottom to top:
        // Foot -> Waist -> Body -> Shoulder -> Neck -> Lip

        // 1. FOOT
        if (sections.foot.enabled) {
            const footProfile = this.generateFootSection(
                currentHeight,
                currentRadius
            );
            profile.push(...footProfile.points);
            currentHeight = footProfile.endHeight;
            currentRadius = footProfile.endRadius;
        }

        // 2. WAIST (if enabled, between foot and body)
        if (sections.waist.enabled) {
            const waistProfile = this.generateWaistSection(
                currentHeight,
                currentRadius
            );
            profile.push(...waistProfile.points);
            currentHeight = waistProfile.endHeight;
            currentRadius = waistProfile.endRadius;
        }

        // 3. BODY (multiple sections possible)
        const bodyProfile = this.generateBodySection(
            currentHeight,
            currentRadius
        );
        profile.push(...bodyProfile.points);
        currentHeight = bodyProfile.endHeight;
        currentRadius = bodyProfile.endRadius;

        // 4. SHOULDER
        if (sections.shoulder.enabled) {
            const shoulderProfile = this.generateShoulderSection(
                currentHeight,
                currentRadius
            );
            profile.push(...shoulderProfile.points);
            currentHeight = shoulderProfile.endHeight;
            currentRadius = shoulderProfile.endRadius;
        }

        // 5. NECK
        if (sections.neck.enabled) {
            const neckProfile = this.generateNeckSection(
                currentHeight,
                currentRadius
            );
            profile.push(...neckProfile.points);
            currentHeight = neckProfile.endHeight;
            currentRadius = neckProfile.endRadius;
        }

        // 6. LIP
        if (sections.lip.enabled) {
            const lipProfile = this.generateLipSection(
                currentHeight,
                currentRadius
            );
            profile.push(...lipProfile.points);
        }

        // Apply post-processing based on smoothing mode
        if (SMOOTHING_MODE === 'smooth') {
            return this.applySmoothingPass(profile);
        } else if (SMOOTHING_MODE === 'catmull') {
            return this.applyCatmullRomSmoothing(profile);
        }

        return profile;
    }

    /**
     * SOLUTION 2: Apply smoothing pass to eliminate tangent discontinuities
     * Uses Chaikin's corner-cutting algorithm around section boundaries
     * @param {ProfilePoint[]} profile - Original profile
     * @returns {ProfilePoint[]} Smoothed profile
     */
    applySmoothingPass(profile) {
        if (profile.length < 3) return profile;
        
        const smoothed = [...profile];
        
        // Find section boundaries (where section name changes)
        const boundaries = [];
        for (let i = 1; i < profile.length; i++) {
            if (profile[i].section !== profile[i - 1].section) {
                boundaries.push(i);
            }
        }
        
        // Apply local smoothing around each boundary
        const smoothingRadius = 5; // Number of points to smooth on each side
        const smoothingStrength = 0.25; // How much to blend (0-0.5)
        
        for (const boundaryIdx of boundaries) {
            const startIdx = Math.max(1, boundaryIdx - smoothingRadius);
            const endIdx = Math.min(profile.length - 2, boundaryIdx + smoothingRadius);
            
            for (let i = startIdx; i <= endIdx; i++) {
                // Distance from boundary (0 at boundary, 1 at edge of smoothing region)
                const distFromBoundary = Math.abs(i - boundaryIdx) / smoothingRadius;
                // Smoothing weight falls off with distance from boundary
                const weight = smoothingStrength * (1 - distFromBoundary);
                
                // Average with neighbors
                const prev = profile[i - 1];
                const curr = profile[i];
                const next = profile[i + 1];
                
                smoothed[i] = {
                    ...curr,
                    r: curr.r * (1 - weight) + ((prev.r + next.r) / 2) * weight
                };
            }
        }
        
        return smoothed;
    }

    /**
     * SOLUTION 3: Apply Catmull-Rom spline smoothing
     * Creates a smooth curve through the profile points using centripetal Catmull-Rom
     * @param {ProfilePoint[]} profile - Original profile
     * @returns {ProfilePoint[]} Smoothed profile
     */
    applyCatmullRomSmoothing(profile) {
        if (profile.length < 4) return profile;
        
        // Find section boundary points to use as control points
        const controlPoints = [profile[0]];
        let lastSection = profile[0].section;
        
        for (let i = 1; i < profile.length; i++) {
            if (profile[i].section !== lastSection) {
                // Add point just before boundary
                if (i > 0) controlPoints.push(profile[i - 1]);
                // Add point at boundary
                controlPoints.push(profile[i]);
                lastSection = profile[i].section;
            }
        }
        controlPoints.push(profile[profile.length - 1]);
        
        // Now interpolate between control points using Catmull-Rom
        const smoothed = [];
        const samplesPerSegment = Math.ceil(this.samplesPerSection / 2);
        
        for (let i = 0; i < controlPoints.length - 1; i++) {
            // Get 4 control points for Catmull-Rom (clamp at ends)
            const p0 = controlPoints[Math.max(0, i - 1)];
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];
            const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];
            
            // Sample Catmull-Rom curve
            for (let j = 0; j <= samplesPerSegment; j++) {
                if (i > 0 && j === 0) continue; // Skip duplicate points
                
                const t = j / samplesPerSegment;
                const point = this.catmullRomInterpolate(p0, p1, p2, p3, t);
                
                smoothed.push({
                    r: point.r,
                    h: point.h,
                    section: p1.section,
                    isTransition: false
                });
            }
        }
        
        return smoothed;
    }

    /**
     * Catmull-Rom spline interpolation (centripetal)
     */
    catmullRomInterpolate(p0, p1, p2, p3, t) {
        // Using centripetal Catmull-Rom (alpha = 0.5)
        const alpha = 0.5;
        
        const getT = (t, p0, p1) => {
            const d = Math.sqrt(Math.pow(p1.r - p0.r, 2) + Math.pow(p1.h - p0.h, 2));
            return Math.pow(d, alpha) + t;
        };
        
        const t0 = 0;
        const t1 = getT(t0, p0, p1);
        const t2 = getT(t1, p1, p2);
        const t3 = getT(t2, p2, p3);
        
        // Remap t to t1-t2 range
        const tt = t1 + t * (t2 - t1);
        
        // Catmull-Rom calculation
        const A1r = (t1 - tt) / (t1 - t0) * p0.r + (tt - t0) / (t1 - t0) * p1.r;
        const A1h = (t1 - tt) / (t1 - t0) * p0.h + (tt - t0) / (t1 - t0) * p1.h;
        
        const A2r = (t2 - tt) / (t2 - t1) * p1.r + (tt - t1) / (t2 - t1) * p2.r;
        const A2h = (t2 - tt) / (t2 - t1) * p1.h + (tt - t1) / (t2 - t1) * p2.h;
        
        const A3r = (t3 - tt) / (t3 - t2) * p2.r + (tt - t2) / (t3 - t2) * p3.r;
        const A3h = (t3 - tt) / (t3 - t2) * p2.h + (tt - t2) / (t3 - t2) * p3.h;
        
        const B1r = (t2 - tt) / (t2 - t0) * A1r + (tt - t0) / (t2 - t0) * A2r;
        const B1h = (t2 - tt) / (t2 - t0) * A1h + (tt - t0) / (t2 - t0) * A2h;
        
        const B2r = (t3 - tt) / (t3 - t1) * A2r + (tt - t1) / (t3 - t1) * A3r;
        const B2h = (t3 - tt) / (t3 - t1) * A2h + (tt - t1) / (t3 - t1) * A3h;
        
        const Cr = (t2 - tt) / (t2 - t1) * B1r + (tt - t1) / (t2 - t1) * B2r;
        const Ch = (t2 - tt) / (t2 - t1) * B1h + (tt - t1) / (t2 - t1) * B2h;
        
        return { r: Cr, h: Ch };
    }

    /**
     * Apply diameter locks - ensures locked bottom diameters match target top diameters
     * This is called before profile generation to ensure continuity
     */
    applyDiameterLocks() {
        const sections = this.state.sections;
        
        // Waist bottom locks to Foot top
        if (sections.waist.bottomDiameterLocked && sections.foot.enabled) {
            sections.waist.bottomDiameter = sections.foot.topDiameter;
        }
        
        // Body bottom locks to Waist top (or Foot top if waist disabled)
        if (sections.body.bottomDiameterLocked) {
            if (sections.waist.enabled) {
                sections.body.bottomDiameter = sections.waist.topDiameter;
            } else if (sections.foot.enabled) {
                sections.body.bottomDiameter = sections.foot.topDiameter;
            }
        }
        
        // Shoulder bottom locks to Body top
        if (sections.shoulder.bottomDiameterLocked) {
            sections.shoulder.bottomDiameter = sections.body.topDiameter;
        }
        
        // Neck bottom locks to Shoulder top (or Body top if shoulder disabled)
        if (sections.neck.bottomDiameterLocked) {
            if (sections.shoulder.enabled) {
                sections.neck.bottomDiameter = sections.shoulder.topDiameter;
            } else {
                sections.neck.bottomDiameter = sections.body.topDiameter;
            }
        }
    }

    /**
     * Generate inner profile (accounting for wall thickness)
     * @returns {ProfilePoint[]} Inner profile points
     */
    generateInnerProfile() {
        const outerProfile = this.generate();
        const wallThickness = this.state.global.wallThickness;
        const innerProfile = [];

        // Offset each point inward by wall thickness
        for (let i = 0; i < outerProfile.length; i++) {
            const point = outerProfile[i];
            
            // Calculate local normal direction
            let normal = { r: -1, h: 0 }; // Default: point inward
            
            if (i > 0 && i < outerProfile.length - 1) {
                const prev = outerProfile[i - 1];
                const next = outerProfile[i + 1];
                const dr = next.r - prev.r;
                const dh = next.h - prev.h;
                const len = Math.sqrt(dr * dr + dh * dh);
                if (len > 0) {
                    // Normal is perpendicular to tangent, pointing inward
                    normal = { r: -dh / len, h: dr / len };
                }
            }

            innerProfile.push({
                r: Math.max(0, point.r - wallThickness * Math.abs(normal.r)),
                h: point.h,
                section: point.section,
                isTransition: point.isTransition
            });
        }

        return innerProfile;
    }

    /**
     * Generate foot section profile
     * Uses dinnerware generator architecture for footring geometry:
     * - footringWidth: width of the contact ring at y=0
     * - innerFootringAngle: angle of inner wall to base surface
     * - baseRecessDepth: positive = recessed below y=0, negative = raised above y=0
     * - sharpFootringCorners: if true, duplicates corner vertices for sharp edges
     */
    generateFootSection(startHeight, startRadius) {
        const foot = this.state.sections.foot;
        const points = [];
        
        const endHeight = startHeight + foot.height;
        const footTopRadius = foot.topDiameter / 2;
        const footBottomRadius = foot.bottomDiameter / 2; // Outer edge of footring at y=0
        const midRadius = foot.midDiameter / 2;
        
        // Footring geometry calculations (following dinnerware generator architecture)
        const footringWidth = foot.footringWidth || 8;
        const innerFootringAngle = foot.innerFootringAngle || -15;
        const baseRecessDepth = foot.baseRecessDepth || -2; // negative = recessed into vessel, 0 = flat
        const sharpFootringCorners = foot.sharpFootringCorners !== false; // default to true for sharp corners
        
        // Footring inner radius at y=0
        const footringInnerRadius = Math.max(3, footBottomRadius - footringWidth);
        
        // Base surface Y position: negative recessDepth = above y=0 (recessed into vessel)
        // baseRecessDepth of -2 means base is at y = 2 (2mm above footring contact surface, inside vessel)
        const baseY = startHeight - baseRecessDepth;
        
        // Calculate where inner wall meets base surface using inner footring angle
        const innerAngleRad = (innerFootringAngle * Math.PI) / 180;
        const innerWallHeight = Math.abs(baseRecessDepth);
        const innerWallHorizontal = innerWallHeight * Math.tan(innerAngleRad);
        
        // Recessed base - inner wall goes up from footring at y=0 to baseY (inside vessel)
        const baseEdgeRadius = Math.max(1, footringInnerRadius - innerWallHorizontal);
        
        // === Generate profile from bottom center outward, then up the wall ===
        // Note: To create sharp corners, we duplicate vertices at corner points.
        // This prevents Three.js from averaging normals across the corner.
        
        // 1. Start at center of base surface
        points.push({ r: 0.1, h: baseY, section: 'foot', isTransition: false });
        
        // 2. Base surface to inner edge (horizontal)
        // First instance of corner point - belongs to horizontal base surface
        points.push({ r: baseEdgeRadius, h: baseY, section: 'foot', isTransition: false });
        
        // 3. Inner footring wall - from base edge up to footring inner at y=0
        if (baseRecessDepth < -0.1) {
            // Duplicate corner point for sharp edge at base-to-wall junction
            if (sharpFootringCorners) {
                points.push({ r: baseEdgeRadius, h: baseY, section: 'foot', isTransition: false, sharpCorner: true });
            }
            
            // Inner wall point
            // Duplicate for sharp edge at wall-to-footring junction
            if (sharpFootringCorners) {
                points.push({ r: footringInnerRadius, h: startHeight, section: 'foot', isTransition: false, sharpCorner: true });
            }
            points.push({ r: footringInnerRadius, h: startHeight, section: 'foot', isTransition: false });
        }
        
        // 4. Footring bottom ring (horizontal contact surface at y=0)
        points.push({ r: footBottomRadius, h: startHeight, section: 'foot', isTransition: false });
        
        // Duplicate for sharp edge at footring-to-outer-wall junction
        if (sharpFootringCorners) {
            points.push({ r: footBottomRadius, h: startHeight, section: 'foot', isTransition: false, sharpCorner: true });
        }
        
        // 5. Outer wall from footring base to foot top
        if (foot.flatWall) {
            const straightCurve = this.generateStraightSection(
                { r: footBottomRadius, h: startHeight },
                { r: footTopRadius, h: endHeight },
                'foot'
            );
            // Skip first point (already have it)
            points.push(...straightCurve.slice(1));
            
            // Exit tangent for straight section
            if (SMOOTHING_MODE === 'tangent') {
                this.lastExitTangent = {
                    x: footTopRadius - footBottomRadius,
                    y: endHeight - startHeight
                };
            }
        } else {
            const footCurve = this.generateCurvedSection(
                { r: footBottomRadius, h: startHeight },
                { r: footTopRadius, h: endHeight },
                foot.bezierHandles,
                foot.curveType,
                foot.curvature,
                'foot'
            );
            
            // Apply midDiameter adjustment
            const adjustedCurve = this.applyMidDiameter(footCurve, footBottomRadius, footTopRadius, midRadius);
            // Skip first point (already have it)
            points.push(...adjustedCurve.slice(1));
            
            // Note: generateCurvedSection already sets lastExitTangent for tangent mode
        }
        
        return { points, endHeight, endRadius: footTopRadius };
    }

    /**
     * Generate waist section (concave indentation)
     */
    generateWaistSection(startHeight, startRadius) {
        const waist = this.state.sections.waist;
        const points = [];
        
        const endHeight = startHeight + waist.height;
        const waistStartRadius = waist.bottomDiameter / 2;
        const waistEndRadius = waist.topDiameter / 2;
        const midRadius = waist.midDiameter / 2;
        
        // If flatWall is enabled, generate a straight line
        if (waist.flatWall) {
            const straightPoints = this.generateStraightSection(
                { r: waistStartRadius, h: startHeight },
                { r: waistEndRadius, h: endHeight },
                'waist'
            );
            points.push(...straightPoints);
            return { points, endHeight, endRadius: waistEndRadius };
        }
        
        // Waist creates an inward curve
        const handles = {
            h1: { x: -waist.curvature / 100 * 0.4, y: 0.3 },
            h2: { x: -waist.curvature / 100 * 0.4, y: 0.7 }
        };
        
        const curvePoints = this.generateCurvedSection(
            { r: waistStartRadius, h: startHeight },
            { r: waistEndRadius, h: endHeight },
            handles,
            'concave',
            waist.curvature,
            'waist'
        );
        
        // Apply midDiameter adjustment at center
        const adjustedPoints = this.applyMidDiameter(curvePoints, waistStartRadius, waistEndRadius, midRadius);
        
        points.push(...adjustedPoints);
        
        return { points, endHeight, endRadius: waistEndRadius };
    }

    /**
     * Generate body section(s) profile
     */
    generateBodySection(startHeight, startRadius) {
        const body = this.state.sections.body;
        const points = [];
        
        const endHeight = startHeight + body.height;
        const bodyStartRadius = body.bottomDiameter / 2;
        const endRadius = body.topDiameter / 2;
        const midRadius = body.midDiameter / 2;
        
        // If flatWall is enabled, generate a straight line
        if (body.flatWall) {
            const straightPoints = this.generateStraightSection(
                { r: bodyStartRadius, h: startHeight },
                { r: endRadius, h: endHeight },
                'body'
            );
            points.push(...straightPoints);
            return { points, endHeight, endRadius };
        }
        
        // Generate curved or flat profile
        const curvePoints = this.generateCurvedSection(
            { r: bodyStartRadius, h: startHeight },
            { r: endRadius, h: endHeight },
            body.bezierHandles,
            body.curveType,
            body.curvature,
            'body'
        );
        
        // Apply midDiameter adjustment
        const adjustedPoints = this.applyMidDiameter(curvePoints, bodyStartRadius, endRadius, midRadius);
        
        points.push(...adjustedPoints);
        
        return { points, endHeight, endRadius };
    }

    /**
     * Generate shoulder section profile
     */
    generateShoulderSection(startHeight, startRadius) {
        const shoulder = this.state.sections.shoulder;
        const points = [];
        
        const endHeight = startHeight + shoulder.height;
        const shoulderStartRadius = shoulder.bottomDiameter / 2;
        const endRadius = shoulder.topDiameter / 2;
        const midRadius = shoulder.midDiameter / 2;
        
        // If flatWall is enabled, generate a straight line
        if (shoulder.flatWall) {
            const straightPoints = this.generateStraightSection(
                { r: shoulderStartRadius, h: startHeight },
                { r: endRadius, h: endHeight },
                'shoulder'
            );
            points.push(...straightPoints);
            return { points, endHeight, endRadius };
        }
        
        // Generate curved profile from bottom to top diameter
        const curvePoints = this.generateCurvedSection(
            { r: shoulderStartRadius, h: startHeight },
            { r: endRadius, h: endHeight },
            shoulder.bezierHandles,
            shoulder.curveType,
            shoulder.curvature,
            'shoulder'
        );
        
        // Apply midDiameter adjustment
        const adjustedPoints = this.applyMidDiameter(curvePoints, shoulderStartRadius, endRadius, midRadius);
        
        points.push(...adjustedPoints);
        
        return { points, endHeight, endRadius };
    }

    /**
     * Generate neck section profile
     */
    generateNeckSection(startHeight, startRadius) {
        const neck = this.state.sections.neck;
        const points = [];
        
        const endHeight = startHeight + neck.height;
        const neckStartRadius = neck.bottomDiameter / 2;
        const endRadius = neck.topDiameter / 2;
        const midRadius = neck.midDiameter / 2;
        
        // If flatWall is enabled, generate a straight line
        if (neck.flatWall) {
            const straightPoints = this.generateStraightSection(
                { r: neckStartRadius, h: startHeight },
                { r: endRadius, h: endHeight },
                'neck'
            );
            points.push(...straightPoints);
            return { points, endHeight, endRadius };
        }
        
        const curvePoints = this.generateCurvedSection(
            { r: neckStartRadius, h: startHeight },
            { r: endRadius, h: endHeight },
            neck.bezierHandles,
            neck.curveType,
            neck.curvature,
            'neck'
        );
        
        // Apply midDiameter adjustment
        const adjustedPoints = this.applyMidDiameter(curvePoints, neckStartRadius, endRadius, midRadius);
        
        points.push(...adjustedPoints);
        
        return { points, endHeight, endRadius };
    }

    /**
     * Generate lip section profile
     */
    generateLipSection(startHeight, startRadius) {
        const lip = this.state.sections.lip;
        const points = [];
        
        const endHeight = startHeight + lip.height;
        const lipStartRadius = lip.bottomDiameter / 2;
        let endRadius = lip.topDiameter / 2;
        
        switch (lip.style) {
            case 'flaredOut':
                endRadius = lipStartRadius + lip.height * Math.tan(lip.flareAngle * Math.PI / 180);
                break;
            case 'flaredIn':
                endRadius = lipStartRadius - lip.height * Math.tan(lip.flareAngle * Math.PI / 180);
                break;
            case 'rolledOut':
                // Add rolled curve outward
                const rollOut = this.generateRolledLip(lipStartRadius, startHeight, lip.height, lip.rollDiameter, 'out');
                points.push(...rollOut);
                return { points, endHeight, endRadius: lipStartRadius + lip.rollDiameter };
            case 'rolledIn':
                // Add rolled curve inward
                const rollIn = this.generateRolledLip(lipStartRadius, startHeight, lip.height, lip.rollDiameter, 'in');
                points.push(...rollIn);
                return { points, endHeight, endRadius: lipStartRadius - lip.rollDiameter };
            case 'beaded':
                const bead = this.generateBeadedLip(lipStartRadius, startHeight, lip.height, lip.beadSize);
                points.push(...bead);
                return { points, endHeight, endRadius: lipStartRadius + lip.beadSize / 2 };
            case 'squared':
                // Sharp 90-degree lip
                points.push({ r: lipStartRadius, h: startHeight, section: 'lip', isTransition: false });
                points.push({ r: lipStartRadius + lip.thickness, h: startHeight, section: 'lip', isTransition: false });
                points.push({ r: lipStartRadius + lip.thickness, h: endHeight, section: 'lip', isTransition: false });
                points.push({ r: endRadius, h: endHeight, section: 'lip', isTransition: false });
                return { points, endHeight, endRadius };
            default: // straight
                // Use the explicit top/bottom diameters
                break;
        }
        
        // Simple straight or angled lip
        points.push({ r: lipStartRadius, h: startHeight, section: 'lip', isTransition: false });
        points.push({ r: endRadius, h: endHeight, section: 'lip', isTransition: false });
        
        return { points, endHeight, endRadius };
    }

    /**
     * Generate rolled lip profile
     */
    generateRolledLip(startRadius, startHeight, height, rollDiameter, direction) {
        const points = [];
        const numPoints = 20;
        const rollRadius = rollDiameter / 2;
        const sign = direction === 'out' ? 1 : -1;
        
        // Center of roll circle
        const cx = startRadius + sign * rollRadius;
        const cy = startHeight + height - rollRadius;
        
        for (let i = 0; i <= numPoints; i++) {
            const angle = (direction === 'out') 
                ? Math.PI - (i / numPoints) * Math.PI
                : (i / numPoints) * Math.PI;
            
            points.push({
                r: cx + rollRadius * Math.cos(angle),
                h: cy + rollRadius * Math.sin(angle),
                section: 'lip',
                isTransition: false
            });
        }
        
        return points;
    }

    /**
     * Generate beaded lip profile
     */
    generateBeadedLip(startRadius, startHeight, height, beadSize) {
        const points = [];
        const numPoints = 24;
        const beadRadius = beadSize / 2;
        
        // Center of bead
        const cx = startRadius + beadRadius;
        const cy = startHeight + height - beadRadius;
        
        // Draw full bead circle
        for (let i = 0; i <= numPoints; i++) {
            const angle = Math.PI + (i / numPoints) * 2 * Math.PI;
            points.push({
                r: cx + beadRadius * Math.cos(angle),
                h: cy + beadRadius * Math.sin(angle),
                section: 'lip',
                isTransition: false
            });
        }
        
        return points;
    }

    /**
     * Generate straight section (flat wall)
     * Simply linearly interpolates between start and end points
     */
    generateStraightSection(start, end, sectionName) {
        const points = [];
        
        for (let i = 0; i <= this.samplesPerSection; i++) {
            const t = i / this.samplesPerSection;
            points.push({
                r: start.r + t * (end.r - start.r),
                h: start.h + t * (end.h - start.h),
                section: sectionName,
                isTransition: false
            });
        }
        
        // Store exit tangent for G1 continuity (straight line tangent)
        if (SMOOTHING_MODE === 'tangent') {
            this.lastExitTangent = {
                x: end.r - start.r,
                y: end.h - start.h
            };
        }
        
        return points;
    }

    /**
     * Generate curved section using bezier
     * Supports G1 continuity when SMOOTHING_MODE is 'tangent'
     */
    generateCurvedSection(start, end, handles, curveType, intensity, sectionName) {
        const points = [];
        
        // Get effective handles
        let effectiveHandles = handles;
        if (!handles || curveType !== 'custom') {
            effectiveHandles = BezierCurve.getPresethHandles(curveType, intensity);
        }
        
        // Create control points
        let { p0, p1, p2, p3 } = BezierCurve.createControlPoints(
            start, end, effectiveHandles, intensity
        );
        
        // SOLUTION 1: G1 Continuity - adjust p1 to match previous exit tangent
        if (SMOOTHING_MODE === 'tangent' && this.lastExitTangent) {
            // Calculate the length to the original p1
            const originalDist = Math.sqrt(
                Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2)
            );
            
            // Normalize the last exit tangent
            const tangLen = Math.sqrt(
                Math.pow(this.lastExitTangent.x, 2) + Math.pow(this.lastExitTangent.y, 2)
            );
            
            if (tangLen > 0 && originalDist > 0) {
                // Place p1 along the continuation of the previous tangent
                // This ensures the curve enters in the same direction it exited
                p1 = {
                    x: p0.x + (this.lastExitTangent.x / tangLen) * originalDist,
                    y: p0.y + (this.lastExitTangent.y / tangLen) * originalDist
                };
            }
        }
        
        // Sample curve
        for (let i = 0; i <= this.samplesPerSection; i++) {
            const t = i / this.samplesPerSection;
            const point = BezierCurve.evaluate(t, p0, p1, p2, p3);
            points.push({
                r: point.x,
                h: point.y,
                section: sectionName,
                isTransition: false
            });
        }
        
        // Store exit tangent for next section (G1 continuity)
        if (SMOOTHING_MODE === 'tangent') {
            this.lastExitTangent = BezierCurve.tangent(1, p0, p1, p2, p3);
        }
        
        return points;
    }

    /**
     * Apply midDiameter adjustment to a set of profile points
     * Creates a bulge (if midDiameter > average) or pinch (if midDiameter < average)
     * @param {ProfilePoint[]} points - Array of profile points
     * @param {number} startRadius - Radius at start of section
     * @param {number} endRadius - Radius at end of section
     * @param {number} midRadius - Desired radius at middle of section
     * @returns {ProfilePoint[]} Adjusted points
     */
    applyMidDiameter(points, startRadius, endRadius, midRadius) {
        if (points.length === 0) return points;
        
        const avgRadius = (startRadius + endRadius) / 2;
        const adjustment = midRadius - avgRadius;
        
        // If no adjustment needed, return original points
        if (Math.abs(adjustment) < 0.01) return points;
        
        return points.map((p, i) => {
            const t = i / (points.length - 1);
            // Bell curve peaks at center (t=0.5), falls off to edges
            const weight = this.bellCurve(t, 0.5);
            return {
                ...p,
                r: p.r + adjustment * weight
            };
        });
    }

    /**
     * Bell curve function for bulge distribution
     * @param {number} t - Position 0-1
     * @param {number} peak - Peak position 0-1
     * @returns {number} Value 0-1
     */
    bellCurve(t, peak = 0.5) {
        const sigma = 0.25;
        const x = (t - peak) / sigma;
        return Math.exp(-0.5 * x * x);
    }

    /**
     * Apply transition blending between sections
     * @param {ProfilePoint[]} profile - Full profile
     * @param {Object} transitions - Transition settings
     * @returns {ProfilePoint[]} Smoothed profile
     */
    applyTransitions(profile, transitions) {
        // Find transition points and apply blending
        const smoothed = [...profile];
        
        for (let i = 1; i < profile.length - 1; i++) {
            if (profile[i].isTransition) {
                const transitionKey = this.getTransitionKey(profile[i].section, profile[i + 1]?.section);
                const sharpness = transitions[transitionKey] ?? 50;
                
                // Apply smoothing based on sharpness (0 = smooth, 100 = sharp)
                if (sharpness < 100) {
                    const smoothRadius = 5 + (100 - sharpness) / 10;
                    this.smoothAroundPoint(smoothed, i, smoothRadius, sharpness / 100);
                }
            }
        }
        
        return smoothed;
    }

    /**
     * Get transition key from section names
     */
    getTransitionKey(fromSection, toSection) {
        const transitionMap = {
            'foot_waist': 'waistToFoot',
            'foot_body': 'bodyToFoot',
            'waist_body': 'bodyToWaist',
            'body_shoulder': 'shoulderToBody',
            'shoulder_neck': 'neckToShoulder',
            'neck_lip': 'lipToNeck'
        };
        return transitionMap[`${fromSection}_${toSection}`] || 'default';
    }

    /**
     * Smooth profile around a point
     */
    smoothAroundPoint(profile, centerIdx, radius, sharpnessFactor) {
        const startIdx = Math.max(0, centerIdx - Math.floor(radius));
        const endIdx = Math.min(profile.length - 1, centerIdx + Math.floor(radius));
        
        for (let i = startIdx; i <= endIdx; i++) {
            if (i === centerIdx) continue;
            
            const distance = Math.abs(i - centerIdx);
            const weight = (1 - distance / radius) * (1 - sharpnessFactor);
            
            // Blend toward center point
            profile[i].r = profile[i].r * (1 - weight) + profile[centerIdx].r * weight;
        }
    }

    /**
     * Get section boundaries for visualization
     * @returns {Object[]} Array of {name, startHeight, endHeight}
     */
    getSectionBoundaries() {
        const boundaries = [];
        const sections = this.state.sections;
        let currentHeight = 0;
        
        if (sections.foot.enabled) {
            boundaries.push({
                name: 'foot',
                startHeight: currentHeight,
                endHeight: currentHeight + sections.foot.height
            });
            currentHeight += sections.foot.height;
        }
        
        if (sections.waist.enabled) {
            boundaries.push({
                name: 'waist',
                startHeight: currentHeight,
                endHeight: currentHeight + sections.waist.height
            });
            currentHeight += sections.waist.height;
        }
        
        // Body section
        boundaries.push({
            name: 'body',
            startHeight: currentHeight,
            endHeight: currentHeight + sections.body.height
        });
        currentHeight += sections.body.height;
        
        if (sections.shoulder.enabled) {
            boundaries.push({
                name: 'shoulder',
                startHeight: currentHeight,
                endHeight: currentHeight + sections.shoulder.height
            });
            currentHeight += sections.shoulder.height;
        }
        
        if (sections.neck.enabled) {
            boundaries.push({
                name: 'neck',
                startHeight: currentHeight,
                endHeight: currentHeight + sections.neck.height
            });
            currentHeight += sections.neck.height;
        }
        
        if (sections.lip.enabled) {
            boundaries.push({
                name: 'lip',
                startHeight: currentHeight,
                endHeight: currentHeight + sections.lip.height
            });
        }
        
        return boundaries;
    }
}

export default ProfileGenerator;

