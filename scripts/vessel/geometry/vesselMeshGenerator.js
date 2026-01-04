/**
 * Vessel Generator - Mesh Generator
 * Creates Three.js 3D mesh from vessel profile
 */

import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { ProfileGenerator } from './profileGenerator.js';

export class VesselMeshGenerator {
    constructor(state) {
        this.state = state;
        this.radialSegments = 64;
        this.profileGenerator = new ProfileGenerator(state);
    }

    /**
     * Generate complete vessel mesh
     * @returns {THREE.Group} Group containing vessel geometry
     */
    generate() {
        const group = new THREE.Group();
        
        // Generate outer and inner profiles
        const outerProfile = this.profileGenerator.generate();
        const innerProfile = this.profileGenerator.generateInnerProfile();
        
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

        // Create base
        const baseMesh = this.createBaseMesh(outerProfile, innerProfile);
        if (baseMesh) {
            group.add(baseMesh);
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

            const color = sectionColors[sectionName] || 0x808080;
            const mesh = this.createLatheMesh(profilePoints, sectionName, false, color);
            
            if (mesh) {
                group.add(mesh);
            }

            previousEndPoint = points[points.length - 1];
        });

        return group;
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

        // Create material
        const material = new THREE.MeshStandardMaterial({
            color: color || 0xE8E0D5,
            roughness: 0.7,
            metalness: 0.0,
            side: isInnerSurface ? THREE.BackSide : THREE.FrontSide,
            flatShading: false
        });

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

        const material = new THREE.MeshStandardMaterial({
            color: 0xE8E0D5,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'rim';
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
        
        const material = new THREE.MeshStandardMaterial({
            color: 0xE8E0D5,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });

        if (!foot.enabled) {
            // No foot - simple base disc at first profile point
            const basePoint = outerProfile[0];
            const geometry = new THREE.CircleGeometry(basePoint.r, this.radialSegments);
            geometry.rotateX(-Math.PI / 2);
            geometry.translate(0, basePoint.h, 0);
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = 'base';
            return mesh;
        }

        // Calculate footring geometry (same as profileGenerator)
        const footBottomRadius = foot.bottomDiameter / 2;
        const footringWidth = foot.footringWidth || 8;
        const innerFootringAngle = foot.innerFootringAngle || -15;
        const baseRecessDepth = foot.baseRecessDepth || -2; // negative = recessed into vessel, 0 = flat
        
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
        
        const ring = new THREE.Mesh(ringGeometry, material.clone());
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
            
            const wall = new THREE.Mesh(wallGeometry, material.clone());
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
        
        const baseSurface = new THREE.Mesh(baseSurfaceGeometry, material.clone());
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

