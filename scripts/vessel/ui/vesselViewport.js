/**
 * Vessel Generator - 3D Viewport
 * Three.js scene setup and rendering
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VesselMeshGenerator } from '../geometry/vesselMeshGenerator.js';
import { getViewerSettings, shadedPalette, FLOOR_GRID_Y } from '../../ui/viewerSettings.js';
import { createViewerStyle } from '../../ui/viewerStyle.js';
import { RenderScheduler } from '../../ui/renderScheduler.js';
import { createWorldAxes } from '../../ui/studio/worldAxes.js';
import { createOrbitPanMode } from '../../ui/orbitPanMode.js';

export class VesselViewport {
    constructor(container, state, options = {}) {
        this.container = container;
        this.state = state;
        this.MeshGenerator = options.MeshGenerator || VesselMeshGenerator;
        this.meshGenerator = new this.MeshGenerator(state);

        // Three.js components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;

        // Scene objects
        this.vesselGroup = null;
        this.gridHelper = null;

        // Named secondary objects (e.g. Vessel V3's independent lid preview)
        // added directly to the scene, outside vesselGroup, so they survive
        // updateVessel()'s full rebuild of the vessel body. Additive-only:
        // does not change any existing method's behavior, so V1/V2 usage of
        // this shared viewport is unaffected when nothing calls these.
        this.secondaryObjects = new Map();

        // Cross-section clipping
        this.clippingPlane = null;
        this.clippingPlaneHelper = null;
        this.vesselMaterial = null;
        this.vesselMaterialClipped = null;

        // Settings
        this.showGrid = true;
        this.showCrossSection = false;
        this.currentView = 'threeQuarter';

        this.renderScheduler = null;
        this.resizeHandler = null;
        this.resizeObserver = null;
        this.panController = null;

        // Theme observer
        this.viewerStyle = null;

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
        this.setupRenderScheduler();
        // Background, axis lines and line art follow the shared view settings
        this.viewerStyle = createViewerStyle({
            scene: this.scene,
            renderer: this.renderer,
            requestRender: () => this.requestRender(),
            applyBackground: (mode, inkPaper) => this.updateSceneColors(mode, inkPaper),
            axesExtent: 300
        });

        // Initial vessel
        this.updateVessel();
    }

    setupScene() {
        this.scene = new THREE.Scene();

        // Initial colors; the viewer style controller keeps them in step
        this.updateSceneColors(getViewerSettings().background, null);
    }

    /**
     * Background, fog and grid for the viewer background mode, or ink on
     * paper while line art is on.
     * @param {'light'|'dark'} mode
     * @param {{ ink: number, paper: number }|null} inkPaper
     */
    updateSceneColors(mode, inkPaper) {
        const shaded = shadedPalette(mode);
        const bgColor = inkPaper ? inkPaper.paper : shaded.background;

        this.scene.background = new THREE.Color(bgColor);
        this.scene.fog = new THREE.Fog(bgColor, 500, 1500);

        // Update grid colors if it exists
        if (this.gridHelper) {
            // Remove old grid and create new one with updated colors
            this.scene.remove(this.gridHelper);
            this.gridHelper.geometry.dispose();
            this.gridHelper.material.dispose();
            this.createGridHelper(mode, inkPaper);
        }

        this.requestRender();
    }

    createGridHelper(mode, inkPaper = null) {
        const shaded = shadedPalette(mode);
        this.gridHelper = inkPaper
            ? new THREE.GridHelper(600, 30, inkPaper.ink, inkPaper.ink)
            : new THREE.GridHelper(600, 30, shaded.grid, shaded.gridCenter);
        this.gridHelper.material.opacity = inkPaper ? 0.14 : 0.5;
        this.gridHelper.material.transparent = true;
        this.gridHelper.position.y = FLOOR_GRID_Y;
        this.gridHelper.visible = this.showGrid;
        this.scene.add(this.gridHelper);
    }

    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 5000);

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
            this.requestRender({ settle: true });
        });

        this.panController = createOrbitPanMode({
            THREE,
            controls: this.controls,
            element: this.renderer.domElement,
            root: this.container,
            requestRender: (options) => this.requestRender(options)
        });
    }

    setPanMode(active) {
        return this.panController?.setPanMode(active) || false;
    }

    togglePanMode() {
        return this.panController?.togglePanMode() || false;
    }

    setTemporaryPan(active) {
        this.panController?.setSpacePanning(active);
    }

    isPanMode() {
        return this.panController?.isPanMode() || false;
    }

    onPanModeChange(listener) {
        return this.panController?.onPanModeChange(listener) || (() => {});
    }

    setupRenderScheduler() {
        this.renderScheduler = new RenderScheduler({
            controls: this.controls,
            render: () => this.renderer.render(this.scene, this.camera)
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
        // Grid helper; recoloured by updateSceneColors
        this.createGridHelper(getViewerSettings().background);

        // Create vessel group
        this.vesselGroup = new THREE.Group();
        this.scene.add(this.vesselGroup);
    }

    setupEventListeners() {
        // Resize handler
        this.resizeHandler = () => this.onResize();
        window.addEventListener('resize', this.resizeHandler);

        // Observe container size changes
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.onResize());
            this.resizeObserver.observe(this.container);
        }
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        if (width === 0 || height === 0) return;

        this.camera.aspect = width / height;
        this.applyViewInset();
        this.renderer.setSize(width, height);
        this.requestRender();
    }

    /**
     * Treat the left `left` px of the canvas as covered (e.g. by a floating
     * editor panel): the projection shifts so the camera target sits in the
     * middle of the uncovered area. The scene still renders under the panel.
     */
    setViewInset(left = 0) {
        this.viewInsetLeft = Math.max(0, left);
        this.applyViewInset();
        this.requestRender();
    }

    applyViewInset() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        const left = this.viewInsetLeft || 0;
        if (left > 0 && left < width && height > 0) {
            this.camera.setViewOffset(width, height, -left / 2, 0, width, height);
        } else {
            this.camera.clearViewOffset();
        }
        this.camera.updateProjectionMatrix();
    }

    /** Move the orbit target (and camera with it) to the vessel's centre. */
    centerOnVessel() {
        const box = this.getBoundingBox();
        if (!box || box.isEmpty() || !this.controls) return;
        const center = box.getCenter(new THREE.Vector3());
        const delta = center.sub(this.controls.target);
        this.controls.target.add(delta);
        this.camera.position.add(delta);
        this.controls.update();
        this.requestRender({ settle: true });
    }

    requestRender(options = {}) {
        this.renderScheduler?.request(options);
    }

    // Camera access for the Studio Shell view cube (additive; no behavior change)
    getCameraRig() {
        if (!this.camera || !this.controls) return null;
        return {
            camera: this.camera,
            controls: this.controls,
            scene: this.scene,
            createWorldAxes: () => createWorldAxes(THREE, this.scene, 600),
            requestRender: (options) => this.requestRender(options)
        };
    }

    /**
     * Update vessel mesh from state
     */
    updateVessel() {
        // Clear existing vessel
        while (this.vesselGroup.children.length > 0) {
            const child = this.vesselGroup.children[0];
            this.disposeObject(child, { disposeMaterial: false });
            this.vesselGroup.remove(child);
        }

        // Generate new vessel
        this.meshGenerator = new this.MeshGenerator(this.state);
        const newVessel = this.meshGenerator.generate();

        // Use appropriate material based on cross-section state
        const material = this.showCrossSection ? this.vesselMaterialClipped : this.vesselMaterial;

        // add() reparents children and removes them from newVessel.children.
        // Iterate a snapshot so the inner surface and other alternate children survive.
        [...newVessel.children].forEach(child => {
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

        this.requestRender();
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
     * Add/replace a named secondary object in the scene (outside the main
     * vessel group), e.g. Vessel V3's independently-generated lid preview.
     * Additive API — does not touch updateVessel()'s single-vessel-mesh path.
     * @param {string} name
     * @param {THREE.Object3D} object3D
     */
    setSecondaryMesh(name, object3D) {
        this.clearSecondaryMesh(name);
        if (!object3D) return;
        this.secondaryObjects.set(name, object3D);
        this.scene.add(object3D);
        this.requestRender();
    }

    /**
     * Remove and dispose a named secondary object added via setSecondaryMesh().
     * @param {string} name
     */
    clearSecondaryMesh(name) {
        const existing = this.secondaryObjects.get(name);
        if (!existing) return;
        this.disposeObject(existing, { disposeMaterial: false });
        this.scene.remove(existing);
        this.secondaryObjects.delete(name);
        this.requestRender();
    }

    /**
     * @param {string} name
     * @returns {THREE.Object3D|null}
     */
    getSecondaryMesh(name) {
        return this.secondaryObjects.get(name) || null;
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

        this.requestRender();
    }

    /**
     * Toggle grid visibility
     * @param {boolean} show
     */
    toggleGrid(show) {
        this.showGrid = show;
        this.gridHelper.visible = show;
        this.requestRender();
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

        this.requestRender({ settle: true });
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
        this.requestRender({ settle: true });
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
        this.requestRender();
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

        this.requestRender();

        return dataUrl;
    }

    /**
     * Dispose of Three.js object
     * @param {THREE.Object3D} obj
     */
    disposeObject(obj, options = {}) {
        const { disposeMaterial = true } = options;

        if (obj.geometry) {
            obj.geometry.dispose();
        }
        if (disposeMaterial && obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach((material) => {
                    if (material !== this.vesselMaterial && material !== this.vesselMaterialClipped) {
                        material.dispose();
                    }
                });
            } else {
                if (obj.material !== this.vesselMaterial && obj.material !== this.vesselMaterialClipped) {
                    obj.material.dispose();
                }
            }
        }
        if (obj.children) {
            obj.children.forEach(child => this.disposeObject(child, options));
        }
    }

    /**
     * Clean up viewport
     */
    dispose() {
        this.renderScheduler?.dispose();
        this.resizeObserver?.disconnect();
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }

        this.viewerStyle?.dispose();

        this.panController?.dispose();
        this.controls.dispose();

        this.scene.traverse(obj => this.disposeObject(obj, { disposeMaterial: false }));
        this.secondaryObjects.clear();

        if (this.vesselMaterial) {
            this.vesselMaterial.dispose();
        }
        if (this.vesselMaterialClipped) {
            this.vesselMaterialClipped.dispose();
        }

        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}

export default VesselViewport;
