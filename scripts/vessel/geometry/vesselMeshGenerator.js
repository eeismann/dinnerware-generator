/**
 * Vessel Generator - Mesh Generator
 * Creates Three.js 3D mesh from vessel profile
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ProfileGenerator } from './profileGenerator.js';

const PROFILE_EPSILON = 1e-5;
const MIN_PROFILE_RADIUS = 0.1;

export class VesselMeshGenerator {
    static sharedPreviewMaterial = null;

    static getSharedPreviewMaterial() {
        if (!VesselMeshGenerator.sharedPreviewMaterial) {
            VesselMeshGenerator.sharedPreviewMaterial = new THREE.MeshStandardMaterial({
                color: 0xE8E0D5,
                roughness: 0.7,
                metalness: 0.0,
                side: THREE.DoubleSide,
                flatShading: false
            });
        }
        return VesselMeshGenerator.sharedPreviewMaterial;
    }

    constructor(state) {
        this.state = state;
        this.radialSegments = 64;
        this.profileGenerator = new ProfileGenerator(state);
        this.previewMaterial = VesselMeshGenerator.getSharedPreviewMaterial();
    }

    /**
     * Generate complete vessel mesh
     * @returns {THREE.Group} Group containing vessel geometry
     */
    generate() {
        const group = new THREE.Group();
        
        // Generate outer and inner profiles
        const outerProfile = this.sanitizeProfile(this.profileGenerator.generate());
        const innerProfile = this.sanitizeProfile(this.profileGenerator.generateInnerProfile());
        
        if (outerProfile.length < 2) {
            console.warn('Profile has insufficient points');
            return group;
        }

        // Create main vessel body (lathe geometry)
        const outerMesh = this.createLatheMesh(outerProfile, 'outer');
        if (outerMesh) {
            group.add(outerMesh);
        }

        // Create inner surface (hollow interior)
        const innerMesh = this.createLatheMesh(innerProfile, 'inner', true);
        if (innerMesh) {
            group.add(innerMesh);
        }

        // Create top rim (connects outer to inner at mouth)
        const rimMesh = this.createRimMesh(outerProfile, innerProfile);
        if (rimMesh) {
            group.add(rimMesh);
        }

        // The foot profile already encodes bottom geometry when foot is enabled.
        // Generating an additional base in that mode creates overlapping faces.
        const shouldGenerateBase = !this.state.sections?.foot?.enabled;
        if (shouldGenerateBase) {
            const baseMesh = this.createBaseMesh(outerProfile, innerProfile);
            if (baseMesh) {
                group.add(baseMesh);
            }
        }

        return group;
    }

    /**
     * Generate mesh with section color visualization
     * @returns {THREE.Group} Group with colored sections
     */
    generateWithSections() {
        const group = new THREE.Group();
        const outerProfile = this.profileGenerator.generate();
        
        if (outerProfile.length < 2) {
            return group;
        }

        // Section colors
        const sectionColors = {
            lip: 0xFF6B6B,
            neck: 0x4ECDC4,
            shoulder: 0x45B7D1,
            body: 0x96CEB4,
            waist: 0xFFEAA7,
            foot: 0xDDA0DD
        };

        // Group points by section
        const sectionPoints = new Map();
        
        outerProfile.forEach(point => {
            const section = point.section || 'body';
            if (!sectionPoints.has(section)) {
                sectionPoints.set(section, []);
            }
            sectionPoints.get(section).push(point);
        });

        // Create mesh for each section
        let previousEndPoint = null;
        
        sectionPoints.forEach((points, sectionName) => {
            if (points.length < 2) return;

            // Add overlap point from previous section for continuity
            const profilePoints = previousEndPoint 
                ? [previousEndPoint, ...points]
                : points;
            const sanitizedProfile = this.sanitizeProfile(profilePoints);

            const color = sectionColors[sectionName] || 0x808080;
            const mesh = this.createLatheMesh(sanitizedProfile, sectionName, false, color);
            
            if (mesh) {
                group.add(mesh);
            }

            previousEndPoint = points[points.length - 1];
        });

        return group;
    }

    /**
     * Clean profile points to avoid lathe degenerates and non-manifold horizontal spikes.
     * @param {Array<{r:number,h:number}>} profile
     * @returns {Array<{r:number,h:number}>}
     */
    sanitizeProfile(profile) {
        if (!Array.isArray(profile) || profile.length === 0) {
            return [];
        }

        let points = profile
            .filter((point) => Number.isFinite(point?.r) && Number.isFinite(point?.h))
            .map((point) => ({ ...point, r: Math.max(MIN_PROFILE_RADIUS, point.r) }));

        if (points.length < 2) {
            return points;
        }

        // Remove exact/near duplicate consecutive points.
        points = points.filter((point, index) => {
            if (index === 0) return true;
            const prev = points[index - 1];
            return (
                Math.abs(point.r - prev.r) > PROFILE_EPSILON ||
                Math.abs(point.h - prev.h) > PROFILE_EPSILON
            );
        });

        // Iteratively remove collinear and same-height spike points.
        let changed = true;
        while (changed && points.length > 2) {
            changed = false;
            const cleaned = [points[0]];

            for (let i = 1; i < points.length - 1; i++) {
                const a = cleaned[cleaned.length - 1];
                const b = points[i];
                const c = points[i + 1];

                const abx = b.r - a.r;
                const aby = b.h - a.h;
                const bcx = c.r - b.r;
                const bcy = c.h - b.h;
                const area2 = Math.abs(abx * bcy - aby * bcx);

                if (area2 <= PROFILE_EPSILON) {
                    const minR = Math.min(a.r, c.r) - PROFILE_EPSILON;
                    const maxR = Math.max(a.r, c.r) + PROFILE_EPSILON;
                    const minH = Math.min(a.h, c.h) - PROFILE_EPSILON;
                    const maxH = Math.max(a.h, c.h) + PROFILE_EPSILON;

                    if (b.r >= minR && b.r <= maxR && b.h >= minH && b.h <= maxH) {
                        changed = true;
                        continue;
                    }
                }

                // Remove radius spikes on perfectly horizontal runs.
                const sameHeight =
                    Math.abs(a.h - b.h) <= PROFILE_EPSILON &&
                    Math.abs(b.h - c.h) <= PROFILE_EPSILON;
                const localExtremum =
                    (b.r >= a.r && b.r >= c.r) || (b.r <= a.r && b.r <= c.r);

                if (sameHeight && localExtremum) {
                    changed = true;
                    continue;
                }

                cleaned.push(b);
            }

            cleaned.push(points[points.length - 1]);
            points = cleaned;
        }

        return points;
    }

    /**
     * Create lathe mesh from profile points
     * @param {Array} profile - Array of {r, h} points (may include sharpCorner markers)
     * @param {string} name - Mesh name
     * @param {boolean} isInnerSurface - Whether this is an inner surface (renders BackSide)
     * @param {number} color - Optional color override
     * @returns {THREE.Mesh}
     */
    createLatheMesh(profile, name = 'vessel', isInnerSurface = false, color = null) {
        if (profile.length < 2) return null;

        // Create 2D shape points for lathe
        const points = profile.map(p => new THREE.Vector2(p.r, p.h));

        // Create lathe geometry
        let geometry = new THREE.LatheGeometry(
            points,
            this.radialSegments,
            0,
            Math.PI * 2
        );

        // Merge vertices at the seam (where theta=0 meets theta=2π)
        // This eliminates the visible seam by ensuring shared vertices have the same normals
        geometry = mergeVertices(geometry);
        
        // Recompute normals after merging
        geometry.computeVertexNormals();

        // Use lightweight shared material in generator path; viewport assigns render materials.
        const material = color
            ? new THREE.MeshStandardMaterial({
                color,
                roughness: 0.7,
                metalness: 0.0,
                side: isInnerSurface ? THREE.BackSide : THREE.FrontSide,
                flatShading: false
            })
            : this.previewMaterial;

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * Create rim mesh connecting outer and inner surfaces at the top
     * @param {Array} outerProfile - Outer profile points
     * @param {Array} innerProfile - Inner profile points
     * @returns {THREE.Mesh}
     */
    createRimMesh(outerProfile, innerProfile) {
        if (outerProfile.length < 1 || innerProfile.length < 1) return null;

        // Get top points
        const outerTop = outerProfile[outerProfile.length - 1];
        const innerTop = innerProfile[innerProfile.length - 1];

        // Create a ring geometry for the rim
        const outerRadius = outerTop.r;
        const innerRadius = Math.max(0.1, innerTop.r);
        const height = outerTop.h;

        if (outerRadius <= innerRadius) return null;

        const geometry = new THREE.RingGeometry(
            innerRadius,
            outerRadius,
            this.radialSegments,
            1
        );

        // Rotate to be horizontal and position at top
        geometry.rotateX(-Math.PI / 2);
        geometry.translate(0, height, 0);

        const mesh = new THREE.Mesh(geometry, this.previewMaterial);
        mesh.name = 'rim';
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * Create a flat annular cap that closes a hollow vessel ring.
     * @param {number} innerRadius
     * @param {number} outerRadius
     * @param {number} height
     * @param {string} name
     * @param {number} normalY - 1 for upward, -1 for downward
     * @returns {THREE.Mesh|null}
     */
    createAnnularCapMesh(innerRadius, outerRadius, height, name, normalY = -1) {
        const safeOuterRadius = Math.max(MIN_PROFILE_RADIUS, outerRadius);
        const safeInnerRadius = Math.max(0, innerRadius);

        if (safeOuterRadius <= safeInnerRadius + PROFILE_EPSILON) {
            return null;
        }

        const positions = [];
        const indices = [];

        for (let i = 0; i < this.radialSegments; i++) {
            const angle = (i / this.radialSegments) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);

            positions.push(safeOuterRadius * cos, height, safeOuterRadius * sin);
            positions.push(safeInnerRadius * cos, height, safeInnerRadius * sin);
        }

        for (let i = 0; i < this.radialSegments; i++) {
            const next = (i + 1) % this.radialSegments;
            const outerCurrent = i * 2;
            const innerCurrent = outerCurrent + 1;
            const outerNext = next * 2;
            const innerNext = outerNext + 1;

            if (normalY < 0) {
                indices.push(outerCurrent, outerNext, innerCurrent);
                indices.push(outerNext, innerNext, innerCurrent);
            } else {
                indices.push(outerCurrent, innerCurrent, outerNext);
                indices.push(outerNext, innerCurrent, innerNext);
            }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, this.previewMaterial);
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        return mesh;
    }

    /**
     * Create base mesh (bottom of vessel)
     * Uses dinnerware generator architecture for footring:
     * - Footring bottom ring at y=0 (contact surface)
     * - Inner footring wall from inner edge to base surface
     * - Base surface at baseY (recessed or raised)
     * @param {Array} outerProfile - Outer profile points
     * @param {Array} innerProfile - Inner profile points
     * @returns {THREE.Mesh|THREE.Group}
     */
    createBaseMesh(outerProfile, innerProfile) {
        if (outerProfile.length < 1) return null;

        const foot = this.state.sections.foot;
        const group = new THREE.Group();
        
        if (!foot.enabled) {
            const outerBase = outerProfile[0];
            const innerBase = innerProfile[0];
            const innerRadius = Math.max(0, innerBase?.r ?? 0);

            if (innerRadius <= PROFILE_EPSILON) {
                const geometry = new THREE.CircleGeometry(outerBase.r, this.radialSegments);
                geometry.rotateX(-Math.PI / 2);
                geometry.translate(0, outerBase.h, 0);

                const mesh = new THREE.Mesh(geometry, this.previewMaterial);
                mesh.name = 'base';
                return mesh;
            }

            return this.createAnnularCapMesh(
                innerRadius,
                outerBase.r,
                outerBase.h,
                'base',
                -1
            );
        }

        // Calculate footring geometry (same as profileGenerator)
        const footBottomRadius = foot.bottomDiameter / 2;
        const footringWidth = foot.footringWidth ?? 8;
        const innerFootringAngle = foot.innerFootringAngle ?? -15;
        const baseRecessDepth = foot.baseRecessDepth ?? -2; // negative = recessed into vessel, 0 = flat
        
        const footringInnerRadius = Math.max(3, footBottomRadius - footringWidth);
        const baseY = -baseRecessDepth; // Base surface Y position (negative depth = positive Y, inside vessel)
        
        // Calculate where inner wall meets base surface
        const innerAngleRad = (innerFootringAngle * Math.PI) / 180;
        const innerWallHeight = Math.abs(baseRecessDepth);
        const innerWallHorizontal = innerWallHeight * Math.tan(innerAngleRad);
        
        // Recessed base - inner wall goes up from footring at y=0 to baseY (inside vessel)
        const baseEdgeRadius = Math.max(1, footringInnerRadius - innerWallHorizontal);

        // 1. Footring bottom ring (contact surface at y=0)
        const ringGeometry = new THREE.RingGeometry(
            footringInnerRadius,
            footBottomRadius,
            this.radialSegments,
            1
        );
        ringGeometry.rotateX(-Math.PI / 2);
        // Face downward
        const ringNormals = ringGeometry.getAttribute('normal');
        for (let i = 0; i < ringNormals.count; i++) {
            ringNormals.setY(i, -1);
        }
        ringNormals.needsUpdate = true;
        
        const ring = new THREE.Mesh(ringGeometry, this.previewMaterial);
        ring.name = 'footring-bottom';
        group.add(ring);

        // 2. Inner footring wall (angled wall from footring inner up to base edge)
        if (baseRecessDepth < -0.1) {
            // Recessed into vessel: wall goes from y=0 up to baseY
            const wallPoints = [
                new THREE.Vector2(footringInnerRadius, 0),
                new THREE.Vector2(baseEdgeRadius, baseY)
            ];
            
            const wallGeometry = new THREE.LatheGeometry(
                wallPoints,
                this.radialSegments,
                0,
                Math.PI * 2
            );
            
            const wall = new THREE.Mesh(wallGeometry, this.previewMaterial);
            wall.name = 'inner-footring-wall';
            group.add(wall);
        }

        // 3. Base surface (horizontal disc at baseY - inside vessel)
        const baseSurfaceGeometry = new THREE.CircleGeometry(baseEdgeRadius, this.radialSegments);
        baseSurfaceGeometry.rotateX(-Math.PI / 2);
        baseSurfaceGeometry.translate(0, baseY, 0);
        
        // Base surface faces down (into the recess cavity)
        const normals = baseSurfaceGeometry.getAttribute('normal');
        for (let i = 0; i < normals.count; i++) {
            normals.setY(i, -normals.getY(i));
        }
        normals.needsUpdate = true;
        
        const baseSurface = new THREE.Mesh(baseSurfaceGeometry, this.previewMaterial);
        baseSurface.name = 'base-surface';
        group.add(baseSurface);

        group.name = 'base';
        return group;
    }

    /**
     * Flip geometry normals (helper for base mesh)
     */
    flipGeometryNormals(geometry) {
        const normals = geometry.getAttribute('normal');
        if (normals) {
            for (let i = 0; i < normals.count; i++) {
                normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
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

    /**
     * Generate wireframe visualization of profile
     * @returns {THREE.Line}
     */
    generateProfileWireframe() {
        const profile = this.profileGenerator.generate();
        
        const points = profile.map(p => new THREE.Vector3(p.r, p.h, 0));
        
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
            color: 0x4ECDC4,
            linewidth: 2 
        });
        
        return new THREE.Line(geometry, material);
    }

    /**
     * Generate cross-section mesh for visualization
     * @returns {THREE.Group}
     */
    generateCrossSection() {
        const group = new THREE.Group();
        
        const outerProfile = this.profileGenerator.generate();
        const innerProfile = this.profileGenerator.generateInnerProfile();
        
        // Create shape from outer and inner profiles
        const shape = new THREE.Shape();
        
        // Start at first outer point
        if (outerProfile.length > 0) {
            shape.moveTo(outerProfile[0].r, outerProfile[0].h);
            
            // Draw outer profile upward
            for (let i = 1; i < outerProfile.length; i++) {
                shape.lineTo(outerProfile[i].r, outerProfile[i].h);
            }
            
            // Connect to inner profile at top
            if (innerProfile.length > 0) {
                shape.lineTo(innerProfile[innerProfile.length - 1].r, innerProfile[innerProfile.length - 1].h);
                
                // Draw inner profile downward
                for (let i = innerProfile.length - 2; i >= 0; i--) {
                    shape.lineTo(innerProfile[i].r, innerProfile[i].h);
                }
            }
            
            shape.closePath();
        }
        
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xE8E0D5,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.y = Math.PI / 2;
        mesh.position.x = 0;
        
        group.add(mesh);
        
        // Add outline
        const outlinePoints = [];
        outerProfile.forEach(p => outlinePoints.push(new THREE.Vector3(p.r, p.h, 0)));
        innerProfile.reverse().forEach(p => outlinePoints.push(new THREE.Vector3(p.r, p.h, 0)));
        outlinePoints.push(outlinePoints[0].clone());
        
        const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
        const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
        const outline = new THREE.Line(outlineGeometry, outlineMaterial);
        outline.rotation.y = Math.PI / 2;
        
        group.add(outline);
        
        return group;
    }

    /**
     * Calculate vessel statistics
     * @returns {Object} Statistics object
     */
    calculateStatistics() {
        const outerProfile = this.profileGenerator.generate();
        const innerProfile = this.profileGenerator.generateInnerProfile();
        
        if (outerProfile.length < 2) {
            return { volume: 0, surfaceArea: 0, height: 0, maxDiameter: 0 };
        }
        
        let volume = 0;
        let surfaceArea = 0;
        let maxDiameter = 0;
        let height = 0;
        
        // Calculate using disk method (integration)
        for (let i = 1; i < outerProfile.length; i++) {
            const p1 = outerProfile[i - 1];
            const p2 = outerProfile[i];
            const dh = p2.h - p1.h;
            const avgR = (p1.r + p2.r) / 2;
            
            // Outer volume
            volume += Math.PI * avgR * avgR * dh;
            
            // Surface area (lateral)
            const dr = p2.r - p1.r;
            const segmentLength = Math.sqrt(dr * dr + dh * dh);
            surfaceArea += 2 * Math.PI * avgR * segmentLength;
            
            maxDiameter = Math.max(maxDiameter, p1.r * 2, p2.r * 2);
            height = Math.max(height, p2.h);
        }
        
        // Subtract inner volume for hollow vessel
        for (let i = 1; i < innerProfile.length; i++) {
            const p1 = innerProfile[i - 1];
            const p2 = innerProfile[i];
            const dh = p2.h - p1.h;
            const avgR = (p1.r + p2.r) / 2;
            
            volume -= Math.PI * avgR * avgR * dh;
        }
        
        return {
            volume: Math.abs(volume) / 1000, // Convert mm³ to cm³ (ml)
            surfaceArea: surfaceArea / 100,  // Convert mm² to cm²
            height: height,
            maxDiameter: maxDiameter
        };
    }

    /**
     * Update mesh after state change
     * @param {THREE.Group} existingGroup - Existing group to update
     * @returns {THREE.Group} Updated group
     */
    updateMesh(existingGroup) {
        // Clear existing meshes
        while (existingGroup.children.length > 0) {
            const child = existingGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            existingGroup.remove(child);
        }
        
        // Generate new mesh
        const newGroup = this.generate();
        newGroup.children.forEach(child => {
            existingGroup.add(child);
        });
        
        return existingGroup;
    }

    /**
     * Set radial segments for mesh quality
     * @param {number} segments 
     */
    setRadialSegments(segments) {
        this.radialSegments = Math.max(16, Math.min(128, segments));
    }
}

export default VesselMeshGenerator;
