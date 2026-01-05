/**
 * Vessel Generator - 3D Viewport
 * Three.js scene setup and rendering
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VesselMeshGenerator } from '../geometry/vesselMeshGenerator.js';
import { getMode } from '../../ui/themeManager.js';

export class VesselViewport {
    constructor(container, state) {
        this.container = container;
        this.state = state;
        this.meshGenerator = new VesselMeshGenerator(state);
        
        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Scene objects
        this.vesselGroup = null;
        this.gridHelper = null;
        
        // Cross-section clipping
        this.clippingPlane = null;
        this.clippingPlaneHelper = null;
        this.vesselMaterial = null;
        this.vesselMaterialClipped = null;
        
        // Settings
        this.showGrid = true;
        this.showCrossSection = false;
        this.currentView = 'threeQuarter';
        
        // Animation
        this.animationFrame = null;
        this.needsRender = true;
        
        // Theme observer
        this.themeObserver = null;
        
        this.init();
    }

    init() {
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupControls();
        this.setupLighting();
        this.setupMaterials();
        this.setupClippingPlane();
        this.setupHelpers();
        this.setupEventListeners();
        
        // Initial vessel
        this.updateVessel();
        
        // Start render loop
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        
        // Set initial colors based on theme
        this.updateSceneColors();
    }
    
    /**
     * Update scene colors based on current theme mode
     */
    updateSceneColors() {
        const mode = getMode();
        const isDark = mode === 'dark';
        
        // Background and fog colors
        const bgColor = isDark ? 0x1E1E1E : 0xF5F5F5;
        
        this.scene.background = new THREE.Color(bgColor);
        this.scene.fog = new THREE.Fog(bgColor, 500, 1500);
        
        // Update grid colors if it exists
        if (this.gridHelper) {
            const gridColor = isDark ? 0x444444 : 0xCCCCCC;
            const gridCenterColor = isDark ? 0x333333 : 0xDDDDDD;
            
            // Remove old grid and create new one with updated colors
            this.scene.remove(this.gridHelper);
            this.gridHelper.geometry.dispose();
            this.gridHelper.material.dispose();
            
            this.gridHelper = new THREE.GridHelper(600, 30, gridColor, gridCenterColor);
            this.gridHelper.material.opacity = 0.5;
            this.gridHelper.material.transparent = true;
            this.gridHelper.visible = this.showGrid;
            this.scene.add(this.gridHelper);
        }
        
        this.needsRender = true;
    }

    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
        
        // Default 3/4 view position
        this.setCameraPreset('threeQuarter');
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance'
        });
        
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.localClippingEnabled = true;
        
        this.container.appendChild(this.renderer.domElement);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = true;
        this.controls.panSpeed = 0.5;
        this.controls.rotateSpeed = 0.5;
        this.controls.zoomSpeed = 1.0;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 2000;
        
        // Set target to center of typical vessel
        this.controls.target.set(0, 125, 0);
        
        this.controls.addEventListener('change', () => {
            this.needsRender = true;
        });
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Key light (main light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
        keyLight.position.set(200, 400, 300);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        keyLight.shadow.camera.near = 100;
        keyLight.shadow.camera.far = 1000;
        keyLight.shadow.camera.left = -300;
        keyLight.shadow.camera.right = 300;
        keyLight.shadow.camera.top = 300;
        keyLight.shadow.camera.bottom = -100;
        keyLight.shadow.bias = -0.0005;
        this.scene.add(keyLight);

        // Fill light (softer, from opposite side)
        const fillLight = new THREE.DirectionalLight(0xE8F0FF, 0.4);
        fillLight.position.set(-200, 200, -100);
        this.scene.add(fillLight);

        // Rim light (behind, for edge highlighting)
        const rimLight = new THREE.DirectionalLight(0xFFE8D8, 0.3);
        rimLight.position.set(0, 100, -300);
        this.scene.add(rimLight);

        // Ground bounce light
        const bounceLight = new THREE.DirectionalLight(0xD8E8FF, 0.2);
        bounceLight.position.set(0, -100, 0);
        this.scene.add(bounceLight);
    }

    setupMaterials() {
        // Standard vessel material (no clipping)
        this.vesselMaterial = new THREE.MeshStandardMaterial({
            color: 0xfafafa,
            roughness: 0.35,
            metalness: 0.05,
            side: THREE.DoubleSide,
            flatShading: false
        });
        
        // Vessel material with clipping for cross-section view
        this.vesselMaterialClipped = new THREE.MeshStandardMaterial({
            color: 0xfafafa,
            roughness: 0.35,
            metalness: 0.05,
            side: THREE.DoubleSide,
            flatShading: false,
            clippingPlanes: [],
            clipShadows: true
        });
    }

    setupClippingPlane() {
        // Create clipping plane for cross-section view (cuts along X axis)
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        
        // Update the clipped material with the clipping plane
        this.vesselMaterialClipped.clippingPlanes = [this.clippingPlane];
        
        // Visual representation of the clipping plane (semi-transparent)
        const planeGeometry = new THREE.PlaneGeometry(400, 500);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00b4d8,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        
        this.clippingPlaneHelper = new THREE.Mesh(planeGeometry, planeMaterial);
        this.clippingPlaneHelper.rotation.y = Math.PI / 2; // Rotate to be perpendicular to X axis
        this.clippingPlaneHelper.position.set(0, 125, 0); // Center on vessel
        this.clippingPlaneHelper.visible = false;
        this.scene.add(this.clippingPlaneHelper);
    }

    setupHelpers() {
        // Grid helper - use theme-aware colors
        const mode = getMode();
        const isDark = mode === 'dark';
        const gridColor = isDark ? 0x444444 : 0xCCCCCC;
        const gridCenterColor = isDark ? 0x333333 : 0xDDDDDD;
        
        this.gridHelper = new THREE.GridHelper(600, 30, gridColor, gridCenterColor);
        this.gridHelper.material.opacity = 0.5;
        this.gridHelper.material.transparent = true;
        this.scene.add(this.gridHelper);

        // Create vessel group
        this.vesselGroup = new THREE.Group();
        this.scene.add(this.vesselGroup);
    }

    setupEventListeners() {
        // Resize handler
        window.addEventListener('resize', () => this.onResize());

        // Observe container size changes
        if (typeof ResizeObserver !== 'undefined') {
            const resizeObserver = new ResizeObserver(() => this.onResize());
            resizeObserver.observe(this.container);
        }
        
        // Observe theme changes
        this.themeObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.attributeName === 'data-mode') {
                    this.updateSceneColors();
                }
            }
        });
        
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-mode']
        });
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.needsRender = true;
    }

    animate() {
        this.animationFrame = requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        
        if (this.needsRender) {
            this.renderer.render(this.scene, this.camera);
            this.needsRender = false;
        }
    }

    /**
     * Update vessel mesh from state
     */
    updateVessel() {
        // Clear existing vessel
        while (this.vesselGroup.children.length > 0) {
            const child = this.vesselGroup.children[0];
            this.disposeObject(child);
            this.vesselGroup.remove(child);
        }

        // Generate new vessel
        this.meshGenerator = new VesselMeshGenerator(this.state);
        const newVessel = this.meshGenerator.generate();
        
        // Use appropriate material based on cross-section state
        const material = this.showCrossSection ? this.vesselMaterialClipped : this.vesselMaterial;
        
        newVessel.children.forEach(child => {
            // Replace material with our controlled material
            if (child.isMesh) {
                child.material = material;
            }
            this.vesselGroup.add(child);
        });

        // Update clipping plane helper position based on vessel bounds
        this.updateClippingPlanePosition();

        // Update camera target to center of vessel
        const bounds = this.getBoundingBox();
        if (bounds) {
            const center = new THREE.Vector3();
            bounds.getCenter(center);
            this.controls.target.copy(center);
        }

        this.needsRender = true;
    }

    /**
     * Update the clipping plane helper position to match vessel center
     */
    updateClippingPlanePosition() {
        const bounds = this.getBoundingBox();
        if (bounds && this.clippingPlaneHelper) {
            const center = new THREE.Vector3();
            const size = new THREE.Vector3();
            bounds.getCenter(center);
            bounds.getSize(size);
            
            // Position the helper plane at the center of the vessel
            this.clippingPlaneHelper.position.set(0, center.y, 0);
            
            // Scale the plane to cover the vessel
            const maxDim = Math.max(size.x, size.y, size.z) * 1.2;
            this.clippingPlaneHelper.scale.set(maxDim / 400, maxDim / 500, 1);
        }
    }

    /**
     * Toggle cross-section view
     * @param {boolean} show 
     */
    toggleCrossSection(show) {
        this.showCrossSection = show;
        
        // Show/hide the clipping plane helper
        if (this.clippingPlaneHelper) {
            this.clippingPlaneHelper.visible = show;
        }
        
        // Update all vessel meshes with appropriate material
        const material = show ? this.vesselMaterialClipped : this.vesselMaterial;
        this.vesselGroup.traverse(child => {
            if (child.isMesh) {
                child.material = material;
            }
        });
        
        this.needsRender = true;
    }

    /**
     * Toggle grid visibility
     * @param {boolean} show 
     */
    toggleGrid(show) {
        this.showGrid = show;
        this.gridHelper.visible = show;
        this.needsRender = true;
    }

    /**
     * Set camera to preset position
     * @param {string} preset - 'top'|'side'|'threeQuarter'|'bottom'
     */
    setCameraPreset(preset) {
        this.currentView = preset;
        
        const distance = 500;
        const target = new THREE.Vector3(0, 125, 0); // Center of typical vessel
        
        switch (preset) {
            case 'top':
                this.camera.position.set(0, distance, 0.01);
                break;
            case 'side':
                this.camera.position.set(distance, 125, 0);
                break;
            case 'bottom':
                this.camera.position.set(0, -distance, 0.01);
                break;
            case 'threeQuarter':
            default:
                this.camera.position.set(distance * 0.6, 200, distance * 0.6);
                break;
        }
        
        this.camera.lookAt(target);
        if (this.controls) {
            this.controls.target.copy(target);
            this.controls.update();
        }
        
        this.needsRender = true;
    }

    /**
     * Reset camera to default view
     */
    resetCamera() {
        this.setCameraPreset('threeQuarter');
    }

    /**
     * Get bounding box of vessel
     * @returns {THREE.Box3|null}
     */
    getBoundingBox() {
        if (this.vesselGroup.children.length === 0) return null;
        
        const box = new THREE.Box3();
        this.vesselGroup.traverse(child => {
            if (child.geometry) {
                child.geometry.computeBoundingBox();
                const childBox = child.geometry.boundingBox.clone();
                childBox.applyMatrix4(child.matrixWorld);
                box.union(childBox);
            }
        });
        
        return box;
    }

    /**
     * Fit camera to vessel
     */
    fitToVessel() {
        const box = this.getBoundingBox();
        if (!box) return;

        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        box.getCenter(center);
        box.getSize(size);

        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const distance = maxDim / (2 * Math.tan(fov / 2));

        // Position camera at 3/4 view
        const angle = Math.PI / 4;
        this.camera.position.set(
            center.x + distance * 0.8 * Math.sin(angle),
            center.y + distance * 0.4,
            center.z + distance * 0.8 * Math.cos(angle)
        );
        
        this.controls.target.copy(center);
        this.controls.update();
        this.needsRender = true;
    }

    /**
     * Set vessel material color
     * @param {number} color - Hex color
     */
    setVesselColor(color) {
        this.vesselGroup.traverse(child => {
            if (child.material) {
                child.material.color.setHex(color);
            }
        });
        this.needsRender = true;
    }

    /**
     * Capture viewport as image
     * @returns {string} Data URL
     */
    captureImage() {
        this.renderer.render(this.scene, this.camera);
        return this.renderer.domElement.toDataURL('image/png');
    }

    /**
     * Capture viewport as thumbnail image
     * @param {number} width - Thumbnail width (default 400)
     * @param {number} height - Thumbnail height (default 300)
     * @returns {string} Data URL
     */
    captureThumbnail(width = 400, height = 300) {
        // Store original size (use container dimensions, not canvas pixel dimensions)
        const originalWidth = this.container.clientWidth;
        const originalHeight = this.container.clientHeight;
        const originalAspect = this.camera.aspect;

        // Set to thumbnail size (don't update CSS style)
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // Render
        this.renderer.render(this.scene, this.camera);

        // Capture
        const dataUrl = this.renderer.domElement.toDataURL('image/jpeg', 0.85);

        // Restore original size
        this.renderer.setSize(originalWidth, originalHeight);
        this.camera.aspect = originalAspect;
        this.camera.updateProjectionMatrix();

        // Restore pixel ratio
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.needsRender = true;

        return dataUrl;
    }

    /**
     * Dispose of Three.js object
     * @param {THREE.Object3D} obj 
     */
    disposeObject(obj) {
        if (obj.geometry) {
            obj.geometry.dispose();
        }
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
        if (obj.children) {
            obj.children.forEach(child => this.disposeObject(child));
        }
    }

    /**
     * Clean up viewport
     */
    dispose() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        
        if (this.themeObserver) {
            this.themeObserver.disconnect();
        }
        
        // Dispose materials
        if (this.vesselMaterial) {
            this.vesselMaterial.dispose();
        }
        if (this.vesselMaterialClipped) {
            this.vesselMaterialClipped.dispose();
        }
        
        // Dispose clipping plane helper
        if (this.clippingPlaneHelper) {
            this.clippingPlaneHelper.geometry.dispose();
            this.clippingPlaneHelper.material.dispose();
        }
        
        this.controls.dispose();
        
        this.scene.traverse(obj => this.disposeObject(obj));
        
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

export default VesselViewport;


