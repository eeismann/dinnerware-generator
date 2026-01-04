/**
 * Cast Form Generator - Viewport
 * Three.js 3D rendering for mold visualization
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import castFormState from '../state/castFormState.js';
import { PART_COLORS } from '../state/castFormDefaults.js';

export class CastFormViewport {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Scene groups
        this.inputGroup = null;
        this.moldGroup = null;
        this.debugGroup = null;  // Debug visualization group
        this.gridHelper = null;
        
        // Debug mode for shell visualization
        this.debugMode = false;
        this.debugColors = {
            spareCap: 0x00ff88,    // Green-cyan - spare (pour) region top cap
            topCap: 0x00ffff,      // Cyan - top hollow caps
            bottomCap: 0xff00ff,   // Magenta - bottom hollow caps  
            innerShell: 0xffff00,  // Yellow - inner shell surfaces
            outerShell: 0x00ff00,  // Green - outer shell surfaces
            sideCap: 0xff8800,     // Orange - side caps
            edges: 0xffffff,       // White - edge wireframes
            points: 0x00ffff       // Cyan - vertex points
        };
        
        // Individual debug element visibility
        this.debugVisibility = {
            inputGeometry: true, // Imported vessel geometry
            spareCap: true,      // Top ring closing the spare (pour) region
            topCap: true,        // Top caps on the main mold body
            bottomCap: true,     // Bottom caps closing the shell
            edges: true,         // Wireframe edges
            points: true         // Vertex points
        };
        
        // Cross-section clipping
        this.clippingPlane = null;
        this.clippingPlaneHelper = null;
        
        // Camera presets
        this.cameraPresets = {
            front: { position: [0, 100, 300], target: [0, 50, 0] },
            side: { position: [300, 100, 0], target: [0, 50, 0] },
            threeQuarter: { position: [200, 150, 200], target: [0, 50, 0] },
            top: { position: [0, 400, 0], target: [0, 0, 0] }
        };
        
        this.init();
        this.setupSubscriptions();
        this.setupDebugKeyboardShortcut();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        
        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
        this.camera.position.set(200, 150, 200);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true  // For screenshots/thumbnails
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.localClippingEnabled = true;  // Enable local clipping for cross-section
        this.container.appendChild(this.renderer.domElement);
        
        // Initialize clipping plane for cross-section view
        // Plane normal points in +X direction, will be rotated by crossSectionAngle
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 2000;
        this.controls.target.set(0, 50, 0);
        
        // Lighting
        this.setupLighting();
        
        // Grid
        this.setupGrid();
        
        // Groups for organizing objects
        this.inputGroup = new THREE.Group();
        this.inputGroup.name = 'input';
        this.scene.add(this.inputGroup);
        
        this.moldGroup = new THREE.Group();
        this.moldGroup.name = 'mold';
        this.scene.add(this.moldGroup);
        
        // Debug visualization group (for shell cap highlighting)
        this.debugGroup = new THREE.Group();
        this.debugGroup.name = 'debug';
        this.debugGroup.visible = false;
        this.scene.add(this.debugGroup);
        
        // Start render loop
        this.animate();
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        // Key light (main light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(100, 200, 100);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 10;
        keyLight.shadow.camera.far = 500;
        keyLight.shadow.camera.left = -200;
        keyLight.shadow.camera.right = 200;
        keyLight.shadow.camera.top = 200;
        keyLight.shadow.camera.bottom = -200;
        this.scene.add(keyLight);
        
        // Fill light (softer, from opposite side)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-100, 100, -100);
        this.scene.add(fillLight);
        
        // Rim light (behind, for separation)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
        rimLight.position.set(0, 50, -150);
        this.scene.add(rimLight);
    }

    setupGrid() {
        this.gridHelper = new THREE.GridHelper(400, 40, 0x444444, 0x333333);
        this.gridHelper.position.y = 0;
        this.scene.add(this.gridHelper);
    }

    setupSubscriptions() {
        // Subscribe to input geometry changes
        castFormState.subscribe('input', () => this.updateInputPreview());
        
        // Subscribe to output changes
        castFormState.subscribe('output', () => this.updateMoldMeshes());
        
        // Subscribe to view mode changes
        castFormState.subscribe('view.mode', () => this.updateViewMode());
        
        // Subscribe to explosion distance changes
        castFormState.subscribe('view.explosionDistance', () => this.updateViewMode());
        
        // Subscribe to cross-section angle changes
        castFormState.subscribe('view.crossSectionAngle', () => this.updateCrossSectionAngle());
        
        // Subscribe to grid visibility
        castFormState.subscribe('view.showGrid', (show) => {
            if (this.gridHelper) {
                this.gridHelper.visible = show;
            }
        });
    }

    /**
     * Update input geometry preview
     */
    updateInputPreview() {
        // Clear existing input preview
        this.clearGroup(this.inputGroup);
        
        const inputState = castFormState.getState('input');
        if (!inputState.geometry || !inputState.isValid) {
            return;
        }
        
        // Create preview mesh with transparent material
        const material = new THREE.MeshStandardMaterial({
            color: PART_COLORS.input,
            roughness: 0.7,
            metalness: 0.0,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(inputState.geometry, material);
        mesh.name = 'inputPreview';
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        this.inputGroup.add(mesh);
        
        // Fit camera to input
        this.fitCameraToObject(inputState.geometry);
    }

    /**
     * Update mold shell meshes
     */
    updateMoldMeshes() {
        // Clear existing mold meshes
        this.clearGroup(this.moldGroup);
        
        const output = castFormState.getState('output');
        if (!output.footShell && !output.wallShells.some(w => w)) {
            return;
        }
        
        // Foot mesh
        if (output.footShell) {
            const footMaterial = new THREE.MeshStandardMaterial({
                color: PART_COLORS.foot,
                roughness: 0.7,
                metalness: 0.0,
                side: THREE.DoubleSide
            });
            
            const footMesh = new THREE.Mesh(output.footShell, footMaterial);
            footMesh.name = 'foot';
            footMesh.castShadow = true;
            footMesh.receiveShadow = true;
            this.moldGroup.add(footMesh);
        }
        
        // Wall meshes
        const wallColors = [PART_COLORS.wall1, PART_COLORS.wall2, PART_COLORS.wall3];
        output.wallShells.forEach((wallGeo, index) => {
            if (wallGeo) {
                const wallMaterial = new THREE.MeshStandardMaterial({
                    color: wallColors[index],
                    roughness: 0.7,
                    metalness: 0.0,
                    side: THREE.DoubleSide
                });
                
                const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
                wallMesh.name = `wall${index + 1}`;
                wallMesh.castShadow = true;
                wallMesh.receiveShadow = true;
                this.moldGroup.add(wallMesh);
            }
        });
        
        // Apply current view mode
        this.updateViewMode();
    }

    /**
     * Update positions based on view mode
     */
    updateViewMode() {
        const viewMode = castFormState.getState('view.mode');
        const explosionDistance = castFormState.getState('view.explosionDistance') || 40;
        
        // Always keep input visible - user should see the imported STL alongside the mold
        this.inputGroup.visible = true;
        
        // Wall segment midpoint angles (each wall covers 120°, so midpoints are at 60°, 180°, 300°)
        // Wall 1: 0° to 120° → midpoint at 60° (π/3)
        // Wall 2: 120° to 240° → midpoint at 180° (π)
        // Wall 3: 240° to 360° → midpoint at 300° (5π/3)
        const wallMidAngles = [
            Math.PI / 3,      // 60° for wall1
            Math.PI,          // 180° for wall2
            5 * Math.PI / 3   // 300° for wall3
        ];
        
        // Handle cross-section clipping
        const isCrossSection = viewMode === 'crossSection';
        this.updateClippingPlanes(isCrossSection);
        
        // Position parts based on view mode
        this.moldGroup.children.forEach(mesh => {
            if (viewMode === 'exploded') {
                // Exploded view - separate parts by pulling radially outward from center
                switch (mesh.name) {
                    case 'foot':
                        // Foot pulls straight down
                        mesh.position.set(0, -explosionDistance, 0);
                        break;
                    case 'wall1':
                        // Pull in direction of segment midpoint (60°)
                        mesh.position.set(
                            explosionDistance * Math.cos(wallMidAngles[0]),
                            0,
                            explosionDistance * Math.sin(wallMidAngles[0])
                        );
                        break;
                    case 'wall2':
                        // Pull in direction of segment midpoint (180°)
                        mesh.position.set(
                            explosionDistance * Math.cos(wallMidAngles[1]),
                            0,
                            explosionDistance * Math.sin(wallMidAngles[1])
                        );
                        break;
                    case 'wall3':
                        // Pull in direction of segment midpoint (300°)
                        mesh.position.set(
                            explosionDistance * Math.cos(wallMidAngles[2]),
                            0,
                            explosionDistance * Math.sin(wallMidAngles[2])
                        );
                        break;
                }
            } else {
                // Assembly and cross-section views - all at origin
                mesh.position.set(0, 0, 0);
            }
        });
    }
    
    /**
     * Update clipping plane angle for cross-section view
     */
    updateCrossSectionAngle() {
        const angleInDegrees = castFormState.getState('view.crossSectionAngle') || 0;
        const angleInRadians = (angleInDegrees * Math.PI) / 180;
        
        // Update the clipping plane normal based on the rotation angle
        // Rotate around Y axis - plane cuts through the center
        this.clippingPlane.normal.set(
            Math.cos(angleInRadians),
            0,
            Math.sin(angleInRadians)
        );
        this.clippingPlane.constant = 0;
        
        // Update the helper visualization if it exists
        if (this.clippingPlaneHelper) {
            this.clippingPlaneHelper.rotation.y = -angleInRadians;
        }
    }
    
    /**
     * Update clipping planes on all meshes
     * @param {boolean} enabled - Whether to enable clipping
     */
    updateClippingPlanes(enabled) {
        // Update mold meshes
        this.moldGroup.children.forEach(mesh => {
            if (mesh.material) {
                mesh.material.clippingPlanes = enabled ? [this.clippingPlane] : [];
                mesh.material.clipShadows = enabled;
                mesh.material.needsUpdate = true;
            }
        });
        
        // Update input preview mesh
        this.inputGroup.children.forEach(mesh => {
            if (mesh.material) {
                mesh.material.clippingPlanes = enabled ? [this.clippingPlane] : [];
                mesh.material.clipShadows = enabled;
                mesh.material.needsUpdate = true;
            }
        });
        
        // Update the clipping plane angle
        if (enabled) {
            this.updateCrossSectionAngle();
        }
    }

    /**
     * Set camera to preset position
     * @param {string} presetName - 'front', 'side', 'threeQuarter', 'top'
     */
    setCameraPreset(presetName) {
        const preset = this.cameraPresets[presetName];
        if (!preset) return;
        
        // Animate camera to new position
        const duration = 500;
        const startPosition = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const endPosition = new THREE.Vector3(...preset.position);
        const endTarget = new THREE.Vector3(...preset.target);
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const eased = this.easeOutCubic(t);
            
            this.camera.position.lerpVectors(startPosition, endPosition, eased);
            this.controls.target.lerpVectors(startTarget, endTarget, eased);
            this.controls.update();
            
            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        animate();
        
        // Update state
        castFormState.setState('view.cameraPreset', presetName);
    }

    /**
     * Fit camera to show object
     * @param {THREE.BufferGeometry} geometry 
     */
    fitCameraToObject(geometry) {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = maxDim / (2 * Math.tan(fov / 2)) * 1.5;
        
        const center = new THREE.Vector3();
        box.getCenter(center);
        
        this.controls.target.copy(center);
        this.camera.position.set(
            center.x + distance * 0.7,
            center.y + distance * 0.5,
            center.z + distance * 0.7
        );
        
        this.controls.update();
    }

    /**
     * Clear all children from a group
     * @param {THREE.Group} group 
     */
    clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
            group.remove(child);
        }
    }

    /**
     * Capture viewport as thumbnail image
     * @param {number} width 
     * @param {number} height 
     * @returns {string} Data URL
     */
    captureThumbnail(width = 256, height = 256) {
        // Render current frame
        this.renderer.render(this.scene, this.camera);
        
        // Get canvas
        const canvas = this.renderer.domElement;
        
        // Create temporary canvas for resizing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        
        // Draw scaled
        ctx.drawImage(canvas, 0, 0, width, height);
        
        return tempCanvas.toDataURL('image/png');
    }

    /**
     * Highlight specific part
     * @param {string} partName - 'foot', 'wall1', 'wall2', 'wall3', or null
     */
    highlightPart(partName) {
        this.moldGroup.children.forEach(mesh => {
            if (mesh.material) {
                if (partName === null || mesh.name === partName) {
                    mesh.material.emissive = new THREE.Color(0x000000);
                    mesh.material.opacity = 1;
                } else {
                    mesh.material.emissive = new THREE.Color(0x000000);
                    mesh.material.opacity = 0.4;
                }
                mesh.material.transparent = mesh.material.opacity < 1;
                mesh.material.needsUpdate = true;
            }
        });
    }

    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Handle window resize
     */
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Easing function
     */
    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    /**
     * Setup keyboard shortcut for debug mode toggle
     * Press 'D' to toggle debug visualization of hollow shell caps
     */
    setupDebugKeyboardShortcut() {
        window.addEventListener('keydown', (e) => {
            // Only trigger if not typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            if (e.key === 'd' || e.key === 'D') {
                this.toggleDebugMode();
            }
        });
    }

    /**
     * Toggle debug visualization mode
     * Shows hollow shell caps highlighted in different colors
     */
    toggleDebugMode() {
        this.debugMode = !this.debugMode;
        
        if (this.debugMode) {
            this.showDebugVisualization();
            console.log('%c🔧 Debug Mode: ON', 'color: #00ff00; font-weight: bold;');
            console.log('  Cyan: Top caps');
            console.log('  Magenta: Bottom caps');
            console.log('  Yellow: Inner shell surfaces');
            console.log('  Orange: Side caps');
            this.showDebugLegend();
        } else {
            this.hideDebugVisualization();
            console.log('%c🔧 Debug Mode: OFF', 'color: #ff0000; font-weight: bold;');
            this.hideDebugLegend();
        }
        
        // Sync UI elements
        this.syncDebugUIState();
    }

    /**
     * Sync debug mode state with UI elements
     */
    syncDebugUIState() {
        // Sync checkbox in View menu
        const checkbox = document.getElementById('debugShellCaps');
        if (checkbox) {
            checkbox.checked = this.debugMode;
        }
        
        // Sync button state
        const btn = document.getElementById('debugModeBtn');
        if (btn) {
            if (this.debugMode) {
                btn.classList.add('active');
                btn.title = 'Debug Mode ON (D)';
            } else {
                btn.classList.remove('active');
                btn.title = 'Toggle Debug Mode (D)';
            }
        }
    }

    /**
     * Show debug visualization - extract and highlight cap faces
     */
    showDebugVisualization() {
        // Clear any existing debug geometry
        this.clearGroup(this.debugGroup);
        
        const output = castFormState.getState('output');
        if (!output.footShell && !output.wallShells.some(w => w)) {
            return;
        }
        
        // Create debug visualizations for each mold part
        if (output.footShell) {
            this.createDebugVisualizationForBase(output.footShell);
        }
        
        output.wallShells.forEach((wallGeo, index) => {
            if (wallGeo) {
                this.createDebugVisualizationForWall(wallGeo, index);
            }
        });
        
        // Make mold meshes semi-transparent so debug can be seen
        this.moldGroup.children.forEach(mesh => {
            if (mesh.material) {
                mesh.material.transparent = true;
                mesh.material.opacity = 0.3;
                mesh.material.needsUpdate = true;
            }
        });
        
        this.debugGroup.visible = true;
    }

    /**
     * Create debug visualization for base mold (foot)
     * Highlights the hollow cap regions
     */
    createDebugVisualizationForBase(geometry) {
        // The base mold has specific vertex regions for caps
        // Based on the generateBaseMold structure:
        // - Bottom cap: hollow ring connecting outer to inner at bottomY
        // - Top edge ring: connects outer top to inner top
        // - Inner shell floor: flat surface at innerBottomY
        
        // Create edge highlighting using EdgesGeometry for the whole part
        if (this.debugVisibility.edges) {
            const edges = new THREE.EdgesGeometry(geometry, 15);
            const edgeMaterial = new THREE.LineBasicMaterial({ 
                color: this.debugColors.edges,
                linewidth: 2
            });
            const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
            edgeLines.name = 'debug_foot_edges';  // Contains 'edges' for visibility toggle
            edgeLines.visible = this.debugVisibility.edges;
            this.debugGroup.add(edgeLines);
        }
        
        // Create a point cloud to show vertices
        if (this.debugVisibility.points) {
            const pointsMaterial = new THREE.PointsMaterial({
                color: this.debugColors.points,
                size: 2,
                sizeAttenuation: true
            });
            const points = new THREE.Points(geometry, pointsMaterial);
            points.name = 'debug_foot_points';  // Contains 'points' for visibility toggle
            points.visible = this.debugVisibility.points;
            this.debugGroup.add(points);
        }
    }

    /**
     * Create debug visualization for wall segment
     * Highlights the different shell surfaces and caps
     */
    createDebugVisualizationForWall(geometry, wallIndex) {
        const position = geometry.getAttribute('position');
        if (!position) return;
        
        // Wall segments have 4 vertices per angle step per height:
        // [0] A = innerOuter (cavity-facing)
        // [1] A' = innerInner (shell interior cavity side)
        // [2] B' = outerInner (shell interior exterior side)
        // [3] B = outerOuter (exterior flat wall)
        
        // Create colored wireframe to show the shell structure
        if (this.debugVisibility.edges) {
            const edges = new THREE.EdgesGeometry(geometry, 20);
            const edgeColors = [
                this.debugColors.innerShell,
                this.debugColors.outerShell,
                this.debugColors.sideCap
            ];
            const edgeMaterial = new THREE.LineBasicMaterial({ 
                color: edgeColors[wallIndex % 3],
                linewidth: 2
            });
            const edgeLines = new THREE.LineSegments(edges, edgeMaterial);
            edgeLines.name = `debug_wall${wallIndex + 1}_edges`;  // Contains 'edges' for visibility toggle
            edgeLines.visible = this.debugVisibility.edges;
            this.debugGroup.add(edgeLines);
        }
        
        // Extract and highlight the cap faces specifically
        this.highlightWallCaps(geometry, wallIndex);
    }

    /**
     * Highlight the spare caps, top caps, and bottom caps of a wall segment
     * Creates separate meshes for visualization
     */
    highlightWallCaps(geometry, wallIndex) {
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        
        if (!position || !index) return;
        
        // Find the Y bounds to identify cap faces
        let minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < position.count; i++) {
            const y = position.getY(i);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        
        // The "spare" region is typically the top ~20-30mm of the mold (above vessel rim)
        // We identify faces at the absolute top as "spare caps"
        const spareCapTolerance = 2.0;  // Very tight tolerance for the top ring
        const topCapTolerance = 15.0;   // Wider tolerance for other top-ish faces
        const bottomCapTolerance = 2.0;
        
        const spareCapVertices = [];
        const topCapVertices = [];
        const bottomCapVertices = [];
        
        // Extract triangles that form the caps
        const indexArray = index.array;
        for (let i = 0; i < indexArray.length; i += 3) {
            const i0 = indexArray[i];
            const i1 = indexArray[i + 1];
            const i2 = indexArray[i + 2];
            
            const y0 = position.getY(i0);
            const y1 = position.getY(i1);
            const y2 = position.getY(i2);
            const avgY = (y0 + y1 + y2) / 3;
            
            // Spare cap: faces at the absolute maximum Y (top ring of spare/pour region)
            const isSpareCap = y0 > maxY - spareCapTolerance && 
                               y1 > maxY - spareCapTolerance && 
                               y2 > maxY - spareCapTolerance;
            
            // Top cap: faces near the top but NOT at the absolute top (if any exist)
            const isTopCap = !isSpareCap && 
                             avgY > maxY - topCapTolerance &&
                             y0 > maxY - topCapTolerance * 2 && 
                             y1 > maxY - topCapTolerance * 2 && 
                             y2 > maxY - topCapTolerance * 2;
            
            // Bottom cap: faces at the absolute minimum Y
            const isBottomCap = y0 < minY + bottomCapTolerance && 
                                y1 < minY + bottomCapTolerance && 
                                y2 < minY + bottomCapTolerance;
            
            const v0 = [position.getX(i0), position.getY(i0), position.getZ(i0)];
            const v1 = [position.getX(i1), position.getY(i1), position.getZ(i1)];
            const v2 = [position.getX(i2), position.getY(i2), position.getZ(i2)];
            
            if (isSpareCap) {
                spareCapVertices.push(...v0, ...v1, ...v2);
            }
            
            if (isTopCap) {
                topCapVertices.push(...v0, ...v1, ...v2);
            }
            
            if (isBottomCap) {
                bottomCapVertices.push(...v0, ...v1, ...v2);
            }
        }
        
        // Create spare cap highlight mesh (top ring of spare/pour region)
        if (spareCapVertices.length > 0 && this.debugVisibility.spareCap) {
            const spareCapGeometry = new THREE.BufferGeometry();
            spareCapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spareCapVertices, 3));
            spareCapGeometry.computeVertexNormals();
            
            const spareCapMaterial = new THREE.MeshBasicMaterial({
                color: this.debugColors.spareCap,
                transparent: true,
                opacity: 0.8,
                side: THREE.DoubleSide,
                wireframe: false
            });
            
            const spareCapMesh = new THREE.Mesh(spareCapGeometry, spareCapMaterial);
            spareCapMesh.name = `debug_wall${wallIndex + 1}_spareCap`;
            spareCapMesh.position.y += 0.2;
            spareCapMesh.visible = this.debugVisibility.spareCap;
            this.debugGroup.add(spareCapMesh);
            
            // Add wireframe overlay
            const spareCapWireframe = new THREE.Mesh(spareCapGeometry.clone(), new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true
            }));
            spareCapWireframe.name = `debug_wall${wallIndex + 1}_spareCap_wireframe`;
            spareCapWireframe.position.y += 0.25;
            spareCapWireframe.visible = this.debugVisibility.spareCap;
            this.debugGroup.add(spareCapWireframe);
        }
        
        // Create top cap highlight mesh (vessel region top, if any faces exist)
        if (topCapVertices.length > 0 && this.debugVisibility.topCap) {
            const topCapGeometry = new THREE.BufferGeometry();
            topCapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(topCapVertices, 3));
            topCapGeometry.computeVertexNormals();
            
            const topCapMaterial = new THREE.MeshBasicMaterial({
                color: this.debugColors.topCap,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                wireframe: false
            });
            
            const topCapMesh = new THREE.Mesh(topCapGeometry, topCapMaterial);
            topCapMesh.name = `debug_wall${wallIndex + 1}_topCap`;
            topCapMesh.position.y += 0.1;
            topCapMesh.visible = this.debugVisibility.topCap;
            this.debugGroup.add(topCapMesh);
            
            // Add wireframe overlay
            const topCapWireframe = new THREE.Mesh(topCapGeometry.clone(), new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true
            }));
            topCapWireframe.name = `debug_wall${wallIndex + 1}_topCap_wireframe`;
            topCapWireframe.position.y += 0.15;
            topCapWireframe.visible = this.debugVisibility.topCap;
            this.debugGroup.add(topCapWireframe);
        }
        
        // Create bottom cap highlight mesh
        if (bottomCapVertices.length > 0 && this.debugVisibility.bottomCap) {
            const bottomCapGeometry = new THREE.BufferGeometry();
            bottomCapGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bottomCapVertices, 3));
            bottomCapGeometry.computeVertexNormals();
            
            const bottomCapMaterial = new THREE.MeshBasicMaterial({
                color: this.debugColors.bottomCap,
                transparent: true,
                opacity: 0.7,
                side: THREE.DoubleSide,
                wireframe: false
            });
            
            const bottomCapMesh = new THREE.Mesh(bottomCapGeometry, bottomCapMaterial);
            bottomCapMesh.name = `debug_wall${wallIndex + 1}_bottomCap`;
            bottomCapMesh.position.y -= 0.1;
            bottomCapMesh.visible = this.debugVisibility.bottomCap;
            this.debugGroup.add(bottomCapMesh);
            
            // Add wireframe overlay
            const bottomCapWireframe = new THREE.Mesh(bottomCapGeometry.clone(), new THREE.MeshBasicMaterial({
                color: 0xffffff,
                wireframe: true
            }));
            bottomCapWireframe.name = `debug_wall${wallIndex + 1}_bottomCap_wireframe`;
            bottomCapWireframe.position.y -= 0.15;
            bottomCapWireframe.visible = this.debugVisibility.bottomCap;
            this.debugGroup.add(bottomCapWireframe);
        }
    }

    /**
     * Hide debug visualization and restore normal view
     */
    hideDebugVisualization() {
        this.clearGroup(this.debugGroup);
        this.debugGroup.visible = false;
        
        // Restore mold mesh opacity
        this.moldGroup.children.forEach(mesh => {
            if (mesh.material) {
                mesh.material.transparent = false;
                mesh.material.opacity = 1.0;
                mesh.material.needsUpdate = true;
            }
        });
        
        // Restore input geometry visibility and reset debug visibility state
        if (this.inputGroup) {
            this.inputGroup.visible = true;
        }
        this.debugVisibility.inputGeometry = true;
    }

    /**
     * Show debug legend overlay on the viewport with toggleable items
     */
    showDebugLegend() {
        // Remove existing legend if any
        this.hideDebugLegend();
        
        const legend = document.createElement('div');
        legend.id = 'debug-legend';
        legend.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 12px 16px;
            border-radius: 8px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            z-index: 1000;
            border: 1px solid rgba(255, 255, 255, 0.2);
            min-width: 200px;
        `;
        
        // Create toggleable legend items
        const items = [
            { key: 'inputGeometry', color: '#4488ff', label: 'Imported Geometry' },
            { key: 'spareCap', color: '#00ff88', label: 'Spare Caps (top ring)' },
            { key: 'topCap', color: '#00ffff', label: 'Top Caps (vessel)' },
            { key: 'bottomCap', color: '#ff00ff', label: 'Bottom Caps' },
            { key: 'edges', color: '#ffffff', label: 'Shell Edges' },
            { key: 'points', color: '#00ffff', label: 'Vertex Points' }
        ];
        
        let html = `
            <div style="font-weight: bold; margin-bottom: 10px; color: #00ff00; display: flex; justify-content: space-between; align-items: center;">
                <span>🔧 Debug Mode</span>
                <span style="font-size: 10px; color: #888; font-weight: normal;">Click to toggle</span>
            </div>
        `;
        
        items.forEach(item => {
            const isVisible = this.debugVisibility[item.key];
            const opacity = isVisible ? '1' : '0.3';
            const checkmark = isVisible ? '✓' : '○';
            const textDecoration = isVisible ? 'none' : 'line-through';
            
            html += `
                <div class="debug-legend-item" data-key="${item.key}" 
                     style="display: flex; align-items: center; margin: 6px 0; padding: 4px 6px; 
                            border-radius: 4px; cursor: pointer; transition: all 0.15s;
                            opacity: ${opacity}; background: rgba(255,255,255,0.05);"
                     onmouseover="this.style.background='rgba(255,255,255,0.15)'"
                     onmouseout="this.style.background='rgba(255,255,255,0.05)'">
                    <span style="display: inline-block; width: 16px; height: 16px; background: ${item.color}; 
                                 margin-right: 10px; border-radius: 3px; flex-shrink: 0;"></span>
                    <span style="flex: 1; text-decoration: ${textDecoration};">${item.label}</span>
                    <span style="font-size: 14px; margin-left: 8px;">${checkmark}</span>
                </div>
            `;
        });
        
        html += `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">
                <div style="display: flex; gap: 8px;">
                    <button id="debug-show-all" style="flex: 1; padding: 4px 8px; background: rgba(0,255,0,0.2); 
                            border: 1px solid rgba(0,255,0,0.4); border-radius: 4px; color: #00ff00; 
                            cursor: pointer; font-size: 10px; font-family: inherit;">Show All</button>
                    <button id="debug-hide-all" style="flex: 1; padding: 4px 8px; background: rgba(255,0,0,0.2); 
                            border: 1px solid rgba(255,0,0,0.4); border-radius: 4px; color: #ff6666; 
                            cursor: pointer; font-size: 10px; font-family: inherit;">Hide All</button>
                </div>
            </div>
            <div style="margin-top: 8px; font-size: 10px; color: #666; text-align: center;">Press 'D' to close</div>
        `;
        
        legend.innerHTML = html;
        
        this.container.style.position = 'relative';
        this.container.appendChild(legend);
        
        // Add click handlers for toggle items
        legend.querySelectorAll('.debug-legend-item').forEach(item => {
            item.addEventListener('click', () => {
                const key = item.dataset.key;
                this.toggleDebugElement(key);
            });
        });
        
        // Show all / Hide all buttons
        legend.querySelector('#debug-show-all')?.addEventListener('click', () => {
            Object.keys(this.debugVisibility).forEach(key => {
                this.debugVisibility[key] = true;
            });
            this.refreshDebugVisualization();
            this.showDebugLegend(); // Refresh legend
        });
        
        legend.querySelector('#debug-hide-all')?.addEventListener('click', () => {
            Object.keys(this.debugVisibility).forEach(key => {
                this.debugVisibility[key] = false;
            });
            this.refreshDebugVisualization();
            this.showDebugLegend(); // Refresh legend
        });
    }

    /**
     * Toggle visibility of a specific debug element
     */
    toggleDebugElement(key) {
        if (key in this.debugVisibility) {
            this.debugVisibility[key] = !this.debugVisibility[key];
            this.refreshDebugVisualization();
            this.showDebugLegend(); // Refresh legend to show new state
        }
    }

    /**
     * Refresh debug visualization based on current visibility settings
     */
    refreshDebugVisualization() {
        // Update input geometry visibility
        if (this.inputGroup) {
            this.inputGroup.visible = this.debugVisibility.inputGeometry;
        }
        
        // Update visibility of debug meshes based on their type
        // Order matters: check more specific names first (spareCap before topCap)
        this.debugGroup.children.forEach(child => {
            const name = child.name || '';
            
            if (name.includes('spareCap')) {
                child.visible = this.debugVisibility.spareCap;
            } else if (name.includes('topCap')) {
                child.visible = this.debugVisibility.topCap;
            } else if (name.includes('bottomCap')) {
                child.visible = this.debugVisibility.bottomCap;
            } else if (name.includes('edges')) {
                child.visible = this.debugVisibility.edges;
            } else if (name.includes('points')) {
                child.visible = this.debugVisibility.points;
            }
        });
    }

    /**
     * Hide debug legend overlay
     */
    hideDebugLegend() {
        const legend = document.getElementById('debug-legend');
        if (legend) {
            legend.remove();
        }
    }

    /**
     * Dispose of viewport resources
     */
    dispose() {
        this.controls.dispose();
        this.renderer.dispose();
        this.clearGroup(this.inputGroup);
        this.clearGroup(this.moldGroup);
        this.clearGroup(this.debugGroup);
        this.hideDebugLegend();
    }
}

export default CastFormViewport;

