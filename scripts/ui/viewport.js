/**
 * Viewport Manager
 * Handles 3D rendering with Three.js
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { stateManager, parameterResolver, ITEM_TYPES, ITEM_NAMES } from '../state/projectState.js';
import { generateItemMesh, buildItemCrossSection, calculateGeometryValues } from '../geometry/meshGenerator.js';
import { planSetLayout } from '../geometry/setLayout.js';
import { RenderScheduler } from './renderScheduler.js';
import { createWorldAxes } from './studio/worldAxes.js';
import { createOrbitPanMode } from './orbitPanMode.js';
import { createOutlineMaterial, createViewerStyle } from './viewerStyle.js';
import { shadedPalette } from './viewerSettings.js';

// Material for dinnerware items - smooth shading for circumference, geometry controls sharp profile edges
const ITEM_MATERIAL = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    roughness: 0.35,
    metalness: 0.05,
    side: THREE.DoubleSide,
    flatShading: false
});

// Material for cross-section view
const CROSS_SECTION_MATERIAL = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    roughness: 0.35,
    metalness: 0.05,
    side: THREE.DoubleSide,
    clippingPlanes: [],
    clipShadows: true,
    flatShading: false
});

// Cross-section plane material
// Recent geometries kept per item (see getItemGeometry)
const GEOMETRY_CACHE_SIZE = 3;

// Per-item highlight variants. Cross-section variants share its clipping
// plane array, so they clip with it.
const HIGHLIGHTS = {
    selected: (material) => { material.emissive = new THREE.Color(0x1abcfe); material.emissiveIntensity = 0.18; },
    warning: (material) => { material.color = new THREE.Color(0xfff2dc); }
};
const MATERIAL_VARIANTS = new Map();
function materialVariant(base, highlight) {
    if (!highlight) return base;
    const key = `${base.uuid}:${highlight}`;
    if (!MATERIAL_VARIANTS.has(key)) {
        const material = base.clone();
        material.clippingPlanes = base.clippingPlanes;
        HIGHLIGHTS[highlight](material);
        MATERIAL_VARIANTS.set(key, material);
    }
    return MATERIAL_VARIANTS.get(key);
}

// Compare (A/B) ghosts of a saved design
const GHOST_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0x1abcfe,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide
});
const GHOST_EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: 0x1abcfe, transparent: true, opacity: 0.55 });

const CLIPPING_PLANE_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0x00b4d8,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide
});

/**
 * Viewport Manager Class
 */
export class ViewportManager {
    constructor(container) {
        this.container = container;
        this.items = new Map();
        this.meshes = new Map();
        this.crossSectionEnabled = false;
        this.layoutMode = 'row';

        this.renderScheduler = null;
        this.resizeObserver = null;
        this.panController = null;
        // Items whose parameters changed while hidden; rebuilt when shown
        this.staleItems = new Set();
        // Recent geometries per item keyed by resolved parameters, so undo,
        // reset and toggling a setting back reuse meshes instead of rebuilding
        this.geometryCache = new Map();
        this.selectedItem = null;
        this.warnedItems = new Set();
        this.ghosts = new Map();
        this.selectListeners = new Set();
        this.outlineMaterial = null;
        this.lineStyle = null;
        this.flatMaterials = null;

        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();
        this.setupClippingPlane();
        this.setupResizeHandler();
        this.setupRenderScheduler();
        this.setupSelection();
        // Background, axis lines and line art follow the shared view settings;
        // line art uses this viewport's own ink treatment (setAppearance)
        this.viewerStyle = createViewerStyle({
            scene: this.scene,
            requestRender: () => this.requestRender(),
            axesExtent: 300,
            applyBackground: (mode, inkPaper) => {
                if (inkPaper) return; // setAppearance owns paper and grid
                this.setBackgroundColor(shadedPalette(mode).background);
                this.setGridColors(mode === 'light');
            },
            lineArt: {
                enable: ({ ink, paper }) => this.setAppearance({
                    ink, paper, outlinePixels: 1.4 * Math.min(window.devicePixelRatio || 1, 2)
                }),
                disable: () => {
                    if (this.lineStyle) this.clearAppearance({});
                }
            }
        });
        this.requestRender();
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf0f0f0); // Light gray background
        
        // Add subtle grid for reference
        const gridHelper = new THREE.GridHelper(600, 30, 0xcccccc, 0xe0e0e0);
        gridHelper.position.y = -1;
        this.scene.add(gridHelper);
        this.gridHelper = gridHelper;
        this.gridVisible = true;
    }
    
    // Set background color
    setBackgroundColor(color) {
        this.scene.background = new THREE.Color(color);
        this.requestRender();
    }
    
    // Set grid colors based on light/dark mode
    setGridColors(isLight) {
        this.scene.remove(this.gridHelper);
        this.gridHelper.geometry.dispose();
        this.gridHelper.material.dispose();
        if (isLight) {
            this.gridHelper = new THREE.GridHelper(600, 30, 0xcccccc, 0xe0e0e0);
        } else {
            this.gridHelper = new THREE.GridHelper(600, 30, 0x333333, 0x262626);
        }
        this.gridHelper.position.y = -1;
        this.gridHelper.visible = this.gridVisible;
        this.scene.add(this.gridHelper);
        this.requestRender();
    }
    
    // Toggle grid visibility
    toggleGrid(visible) {
        this.gridVisible = visible;
        this.gridHelper.visible = visible;
        this.requestRender();
        stateManager.setState('ui.gridVisible', visible);
    }
    
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 1, 10000);
        // Set initial position - setCameraPreset will be called after controls are ready
        this.camera.position.set(400, 300, 400);
        this.camera.lookAt(0, 30, 0);
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
        // The key light never moves, so shadows only change with geometry,
        // visibility or layout (see invalidateShadows); orbiting reuses them.
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
        this.renderer.localClippingEnabled = true;
        
        this.container.appendChild(this.renderer.domElement);
    }
    
    setupLights() {
        // Ambient light for base illumination
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);
        
        // Key light (main directional light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(300, 400, 300);
        keyLight.castShadow = true;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 2000;
        keyLight.shadow.camera.left = -500;
        keyLight.shadow.camera.right = 500;
        keyLight.shadow.camera.top = 500;
        keyLight.shadow.camera.bottom = -500;
        keyLight.shadow.mapSize.width = 2048;
        keyLight.shadow.mapSize.height = 2048;
        this.scene.add(keyLight);
        
        // Fill light (softer, from opposite side)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.4);
        fillLight.position.set(-200, 200, -200);
        this.scene.add(fillLight);
        
        // Rim light (from behind for edge definition)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
        rimLight.position.set(0, 200, -400);
        this.scene.add(rimLight);
        
        // Bottom fill light
        const bottomLight = new THREE.DirectionalLight(0xffffff, 0.2);
        bottomLight.position.set(0, -200, 0);
        this.scene.add(bottomLight);
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 3000;
        this.controls.maxPolarAngle = Math.PI;
        
        // Enable panning
        this.controls.enablePan = true;
        this.controls.panSpeed = 1.0;
        this.controls.screenSpacePanning = true; // Pan parallel to screen, not ground plane
        
        // Mouse buttons: LEFT=rotate, MIDDLE=dolly, RIGHT=pan
        this.controls.mouseButtons = {
            LEFT: THREE.MOUSE.ROTATE,
            MIDDLE: THREE.MOUSE.DOLLY,
            RIGHT: THREE.MOUSE.PAN
        };
        
        // Touch controls: one finger=rotate, two fingers=dolly+pan
        this.controls.touches = {
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_PAN
        };
        
        this.controls.target.set(0, 30, 0);
        this.controls.update();

        // Re-render whenever the camera changes (drag, zoom, damping, presets)
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

    invalidateShadows() {
        if (this.renderer) this.renderer.shadowMap.needsUpdate = true;
    }

    // Request a single render on the next animation frame
    requestRender(options = {}) {
        this.renderScheduler?.request(options);
    }

    setupRenderScheduler() {
        this.renderScheduler = new RenderScheduler({
            controls: this.controls,
            render: () => this.renderer.render(this.scene, this.camera)
        });
    }

    setupClippingPlane() {
        // Create clipping plane for cross-section view
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        
        // Visual representation of clipping plane
        const planeGeometry = new THREE.PlaneGeometry(600, 400);
        this.clippingPlaneHelper = new THREE.Mesh(planeGeometry, CLIPPING_PLANE_MATERIAL);
        this.clippingPlaneHelper.rotation.y = Math.PI / 2;
        this.clippingPlaneHelper.visible = false;
        this.scene.add(this.clippingPlaneHelper);
        
        // Update cross-section material with clipping plane
        CROSS_SECTION_MATERIAL.clippingPlanes = [this.clippingPlane];
    }
    
    setupResizeHandler() {
        this.resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
        this.resizeObserver.observe(this.container);
    }
    
    handleResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
        this.updateOutlineResolution();
        this.requestRender();
    }
    
    // Camera presets
    setCameraPreset(preset) {
        const distance = 500;
        
        switch (preset) {
            case 'top':
                this.camera.position.set(0, distance * 1.5, 0.1);
                break;
            case 'side':
                this.camera.position.set(distance, 50, 0);
                break;
            case 'three-quarter':
                this.camera.position.set(distance * 0.8, distance * 0.6, distance * 0.8);
                break;
            case 'bottom':
                this.camera.position.set(0, -distance, 0.1);
                break;
        }
        
        if (this.controls) {
            this.controls.target.set(0, 30, 0);
            this.controls.update();
        }
        this.requestRender({ settle: true });
        stateManager.setState('ui.cameraPreset', preset);
    }
    
    // Reset view to default position and target
    resetView() {
        this.camera.position.set(400, 300, 400);
        if (this.controls) {
            this.controls.target.set(0, 30, 0);
            this.controls.update();
        }
        this.requestRender({ settle: true });
    }

    // Camera access for the Studio Shell view cube (additive; no behavior change)
    getCameraRig() {
        if (!this.camera || !this.controls) return null;
        return {
            camera: this.camera,
            controls: this.controls,
            createWorldAxes: () => createWorldAxes(THREE, this.scene, 600),
            requestRender: (options) => this.requestRender(options)
        };
    }

    // Toggle cross-section view
    toggleCrossSection(enabled) {
        this.crossSectionEnabled = enabled;
        this.clippingPlaneHelper.visible = enabled;
        
        // Update all meshes with appropriate material
        this.refreshMaterials();
        this.meshes.forEach(mesh => this.syncOutline(mesh));
        
        this.invalidateShadows();
        this.requestRender();
        stateManager.setState('ui.crossSectionEnabled', enabled);
    }
    
    // Set layout mode
    setLayoutMode(mode) {
        this.layoutMode = mode;
        this.arrangeItems();
        this.invalidateShadows();
        this.requestRender();
        stateManager.setState('ui.layoutMode', mode);
    }
    
    isItemVisible(itemType) {
        return stateManager.getState('ui.visibleItems').includes(itemType);
    }

    /**
     * Geometry for an item's current parameters, from the cache when the
     * same parameters were built recently.
     */
    getItemGeometry(itemType, interactive) {
        const key = `${interactive ? 'i' : 'f'}:${JSON.stringify(parameterResolver.getAllParameters(itemType))}`;
        const entries = this.geometryCache.get(itemType) || [];
        const hit = entries.findIndex(entry => entry.key === key);
        if (hit >= 0) {
            const [entry] = entries.splice(hit, 1);
            entries.unshift(entry);
            return entry.geometry;
        }
        const geometry = generateItemMesh(itemType, { interactive });
        if (!geometry || !geometry.getAttribute('position')) return null;
        entries.unshift({ key, geometry });
        // Interactive drag meshes are throwaway: keep at most one of them
        const kept = [];
        let interactiveKept = 0;
        for (const entry of entries) {
            const isInteractive = entry.key.startsWith('i:');
            const keep = kept.length < GEOMETRY_CACHE_SIZE
                && (!isInteractive || interactiveKept++ < 1 || entry === entries[0]);
            if (keep) kept.push(entry);
            else entry.geometry.dispose();
        }
        this.geometryCache.set(itemType, kept);
        return geometry;
    }

    /**
     * Update a single item mesh.
     * @param {string} itemType
     * @param {Object} [options]
     * @param {boolean} [options.preserveLayout] - Keep the item where it is
     * @param {boolean} [options.deferLayout] - Caller arranges once afterwards
     * @param {boolean} [options.interactive] - Lighter mesh during slider drags
     * @param {boolean} [options.force] - Build even while hidden
     */
    updateItem(itemType, { preserveLayout = false, deferLayout = false, interactive = false, force = false } = {}) {
        // Hidden items rebuild when they are shown again
        if (!force && this.meshes.has(itemType) && !this.isItemVisible(itemType)) {
            this.staleItems.add(itemType);
            return this.meshes.get(itemType);
        }

        try {
            const geometry = this.getItemGeometry(itemType, interactive);
            if (!geometry) {
                console.error(`Failed to generate geometry for ${itemType}`);
                return null;
            }
            this.staleItems.delete(itemType);

            let mesh = this.meshes.get(itemType);
            if (mesh) {
                // Geometry stays owned by the cache; it is disposed on eviction
                mesh.geometry = geometry;
            } else {
                mesh = new THREE.Mesh(geometry, this.materialFor(itemType));
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                mesh.userData.itemType = itemType;
                this.meshes.set(itemType, mesh);
                this.scene.add(mesh);
                preserveLayout = false;
            }
            mesh.visible = this.isItemVisible(itemType);
            this.syncOutline(mesh, { interactive });

            // Per-item proportion edits preserve the existing layout so other
            // objects do not shift in perspective and appear to resize.
            if (!preserveLayout && !deferLayout) {
                this.arrangeItems();
            }
            this.invalidateShadows();
            this.requestRender();

            return mesh;
        } catch (error) {
            console.error(`Error generating mesh for ${itemType}:`, error);
            return null;
        }
    }

    // Update all items. Hidden items are built once so they can be shown
    // instantly, then only refreshed when shown after a change.
    updateAllItems() {
        ITEM_TYPES.forEach(itemType => {
            this.updateItem(itemType, { deferLayout: true, force: !this.meshes.has(itemType) });
        });
        this.updateVisibility();
    }

    // Update item visibility
    updateVisibility() {
        const visibleItems = stateManager.getState('ui.visibleItems');

        this.meshes.forEach((mesh, itemType) => {
            mesh.visible = visibleItems.includes(itemType);
            if (mesh.visible && this.staleItems.has(itemType)) {
                this.updateItem(itemType, { deferLayout: true });
            }
        });

        this.arrangeItems();
        this.invalidateShadows();
        this.requestRender();
    }
    
    /**
     * Alternate "one ink on paper" treatment (the Line interface): flat
     * paper-filled pieces, constant-width ink silhouettes and crease lines,
     * hairline grid, no shading. Call again to switch ink/paper colours.
     * @param {Object} appearance
     * @param {number} appearance.ink
     * @param {number} appearance.paper
     * @param {number} [appearance.outlinePixels] - Silhouette width, device px
     * @param {number} [appearance.creaseAngle] - Degrees; profile corners drawn as lines
     */
    setAppearance({ ink, paper, outlinePixels = 1.5, creaseAngle = 32 } = {}) {
        const inkColor = new THREE.Color(ink);
        const paperColor = new THREE.Color(paper);
        this.lineStyle = { ink: inkColor, paper: paperColor, outlinePixels, creaseAngle };

        this.scene.background = paperColor.clone();
        if (!this.flatMaterials) {
            this.flatMaterials = {
                item: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
                section: new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, clippingPlanes: [this.clippingPlane] }),
                crease: new THREE.LineBasicMaterial(),
                ghost: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
                ghostEdge: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.45 })
            };
            this.outlineMaterial = createOutlineMaterial(ink, outlinePixels);
            this.selectedOutlineMaterial = createOutlineMaterial(ink, outlinePixels * 2.4);
        }
        // Polygon offset lets crease lines sit on the surface without z-fighting
        this.flatMaterials.item.polygonOffset = true;
        this.flatMaterials.item.polygonOffsetFactor = 1;
        this.flatMaterials.item.polygonOffsetUnits = 1;
        this.flatMaterials.item.color.copy(paperColor);
        this.flatMaterials.section.color.copy(paperColor);
        this.flatMaterials.crease.color.copy(inkColor);
        this.flatMaterials.ghost.color.copy(inkColor);
        this.flatMaterials.ghostEdge.color.copy(inkColor);
        this.outlineMaterial.uniforms.uColor.value.copy(inkColor);
        this.selectedOutlineMaterial.uniforms.uColor.value.copy(inkColor);
        GHOST_MATERIAL.color.copy(inkColor);
        GHOST_MATERIAL.opacity = 0.06;
        GHOST_EDGE_MATERIAL.color.copy(inkColor);
        GHOST_EDGE_MATERIAL.opacity = 0.45;

        // Hairline grid in the ink colour
        this.scene.remove(this.gridHelper);
        this.gridHelper.geometry.dispose();
        this.gridHelper.material.dispose();
        this.gridHelper = new THREE.GridHelper(600, 30, inkColor, inkColor);
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.opacity = 0.14;
        this.gridHelper.position.y = -0.5;
        this.gridHelper.visible = this.gridVisible;
        this.scene.add(this.gridHelper);

        this.refreshMaterials();
        this.meshes.forEach(mesh => this.syncOutline(mesh));
        this.updateOutlineResolution();
        this.invalidateShadows();
        this.requestRender();
    }

    /**
     * Return to the standard shaded viewer (lit glaze, shadows), keeping a
     * page-matched background. Undoes setAppearance.
     * @param {Object} options
     * @param {number} options.background - Canvas colour
     * @param {boolean} options.light - Light or dark grid
     */
    clearAppearance({ background, light = true } = {}) {
        this.lineStyle = null;
        this.meshes.forEach(mesh => {
            if (mesh.userData.outline) mesh.userData.outline.visible = false;
            if (mesh.userData.creases) mesh.userData.creases.visible = false;
        });
        GHOST_MATERIAL.color.set(0x1abcfe);
        GHOST_MATERIAL.opacity = 0.18;
        GHOST_EDGE_MATERIAL.color.set(0x1abcfe);
        GHOST_EDGE_MATERIAL.opacity = 0.55;
        this.setGridColors(light);
        if (background !== undefined) this.scene.background = new THREE.Color(background);
        this.refreshMaterials();
        this.invalidateShadows();
        this.requestRender();
    }

    syncOutline(mesh, { interactive = false } = {}) {
        if (!this.lineStyle) return;
        const hidden = this.crossSectionEnabled;
        let hull = mesh.userData.outline;
        if (!hull) {
            hull = new THREE.Mesh(mesh.geometry, this.outlineMaterial);
            hull.renderOrder = -1;
            hull.castShadow = false;
            mesh.add(hull);
            mesh.userData.outline = hull;
        }
        // Shares the item's geometry: no extra memory, always in step
        hull.geometry = mesh.geometry;
        hull.material = mesh.userData.itemType === this.selectedItem
            ? this.selectedOutlineMaterial
            : this.outlineMaterial;
        hull.visible = !hidden;

        // Crease lines: profile corners (rim, foot, chamfer). Skipped while
        // dragging; cached per geometry so cache hits are free.
        let creases = mesh.userData.creases;
        if (!creases) {
            creases = new THREE.LineSegments(new THREE.BufferGeometry(), this.flatMaterials.crease);
            mesh.add(creases);
            mesh.userData.creases = creases;
        }
        if (interactive) {
            creases.visible = false;
            return;
        }
        if (!mesh.geometry.userData.creaseGeometry) {
            mesh.geometry.userData.creaseGeometry = new THREE.EdgesGeometry(mesh.geometry, this.lineStyle.creaseAngle);
            mesh.geometry.addEventListener('dispose', () => mesh.geometry.userData.creaseGeometry?.dispose());
        }
        creases.geometry = mesh.geometry.userData.creaseGeometry;
        creases.material = this.flatMaterials.crease;
        creases.visible = true;
    }

    updateOutlineResolution() {
        if (!this.outlineMaterial) return;
        const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        this.outlineMaterial.uniforms.uResolution.value.copy(size);
        this.selectedOutlineMaterial?.uniforms.uResolution.value.copy(size);
    }

    materialFor(itemType) {
        if (this.flatMaterials && this.lineStyle) {
            return this.crossSectionEnabled ? this.flatMaterials.section : this.flatMaterials.item;
        }
        const base = this.crossSectionEnabled ? CROSS_SECTION_MATERIAL : ITEM_MATERIAL;
        const highlight = itemType === this.selectedItem ? 'selected'
            : this.warnedItems.has(itemType) ? 'warning' : null;
        return materialVariant(base, highlight);
    }

    refreshMaterials() {
        this.meshes.forEach((mesh, itemType) => {
            mesh.material = this.materialFor(itemType);
        });
        this.requestRender();
    }

    /**
     * Tint items that have print warnings.
     * @param {Iterable<string>} itemTypes
     */
    setWarnedItems(itemTypes) {
        this.warnedItems = new Set(itemTypes);
        this.refreshMaterials();
    }

    // === Selection: click an item to select it ===

    setupSelection() {
        const element = this.renderer.domElement;
        const raycaster = new THREE.Raycaster();
        let down = null;
        element.addEventListener('pointerdown', (event) => {
            down = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
        });
        element.addEventListener('pointerup', (event) => {
            if (!down || this.isPanMode()) return;
            const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
            down = null;
            if (moved > 4) return; // an orbit drag, not a click
            const rect = element.getBoundingClientRect();
            const pointer = new THREE.Vector2(
                ((event.clientX - rect.left) / rect.width) * 2 - 1,
                -((event.clientY - rect.top) / rect.height) * 2 + 1
            );
            raycaster.setFromCamera(pointer, this.camera);
            const visible = [...this.meshes.values()].filter(mesh => mesh.visible);
            const hit = raycaster.intersectObjects(visible, false)[0];
            this.setSelectedItem(hit?.object.userData.itemType ?? null, { notify: true });
        });
    }

    setSelectedItem(itemType, { notify = false } = {}) {
        if (this.selectedItem === itemType) return;
        this.selectedItem = itemType;
        this.refreshMaterials();
        this.meshes.forEach(mesh => this.syncOutline(mesh));
        if (notify) this.selectListeners.forEach(listener => listener(itemType));
    }

    onSelect(listener) {
        this.selectListeners.add(listener);
        return () => this.selectListeners.delete(listener);
    }

    // === Compare (A/B): ghosts of a snapshot design ===

    /**
     * Show translucent ghosts of `snapshotState` over the current items, or
     * clear them when null. The ghosts follow the items' layout positions.
     */
    setCompareSnapshot(snapshotState) {
        this.ghosts.forEach(ghost => {
            this.scene.remove(ghost);
            ghost.children.forEach(child => child.geometry.dispose());
        });
        this.ghosts.clear();
        if (snapshotState) {
            const current = stateManager.state;
            try {
                // Generation reads the shared resolver: build from the snapshot
                stateManager.state = { ...current, ...snapshotState };
                ITEM_TYPES.forEach(itemType => {
                    const geometry = generateItemMesh(itemType);
                    const ghost = new THREE.Group();
                    ghost.add(new THREE.Mesh(geometry, GHOST_MATERIAL));
                    const edges = new THREE.EdgesGeometry(geometry, 30);
                    ghost.add(new THREE.LineSegments(edges, GHOST_EDGE_MATERIAL));
                    ghost.renderOrder = 2;
                    ghost.userData.itemType = itemType;
                    this.ghosts.set(itemType, ghost);
                    this.scene.add(ghost);
                });
            } finally {
                stateManager.state = current;
            }
        }
        this.syncGhosts();
        this.requestRender();
    }

    syncGhosts() {
        this.ghosts.forEach((ghost, itemType) => {
            const mesh = this.meshes.get(itemType);
            ghost.visible = Boolean(mesh?.visible);
            if (mesh) ghost.position.copy(mesh.position);
        });
    }

    // Arrange items based on layout mode
    arrangeItems() {
        const visibleItems = stateManager.getState('ui.visibleItems');

        if (this.layoutMode === 'stack' || this.layoutMode === 'table') {
            const sections = {};
            visibleItems.forEach(itemType => {
                if (!this.meshes.has(itemType)) return;
                const params = parameterResolver.getAllParameters(itemType);
                sections[itemType] = buildItemCrossSection(params, calculateGeometryValues(params));
            });
            const layout = planSetLayout(this.layoutMode, sections, visibleItems);
            Object.entries(layout).forEach(([itemType, position]) => {
                this.meshes.get(itemType).position.set(position.x, position.y, position.z);
            });
            this.syncGhosts();
            return;
        }

        const visibleMeshes = [];
        
        // Collect visible meshes with their info
        ITEM_TYPES.forEach(itemType => {
            if (visibleItems.includes(itemType) && this.meshes.has(itemType)) {
                const mesh = this.meshes.get(itemType);
                mesh.position.y = 0;
                const box = new THREE.Box3().setFromObject(mesh);
                const size = new THREE.Vector3();
                box.getSize(size);
                
                // Get base dimensions (rim diameter) for stable sorting
                const params = stateManager.getState(`itemRatios.${itemType}`);
                const baseDiameter = params?.diameter || 100;
                
                visibleMeshes.push({
                    type: itemType,
                    mesh,
                    width: size.x,
                    height: size.y,
                    depth: size.z,
                    baseDiameter: baseDiameter // Use this for stable sorting
                });
            }
        });
        
        if (visibleMeshes.length === 0) return;
        
        // Sort by BASE diameter (largest first) - this is stable regardless of wall angle
        visibleMeshes.sort((a, b) => b.baseDiameter - a.baseDiameter);
        
        if (this.layoutMode === 'row') {
            this.arrangeRow(visibleMeshes);
        } else {
            this.arrangeGrid(visibleMeshes);
        }
        this.syncGhosts();
    }
    
    arrangeRow(items) {
        // Calculate total width and maximum gap
        const maxWidth = Math.max(...items.map(i => i.width));
        const gap = maxWidth * 0.15;
        
        let totalWidth = 0;
        items.forEach(item => {
            totalWidth += item.width;
        });
        totalWidth += gap * (items.length - 1);
        
        // Position items in a row
        let currentX = -totalWidth / 2;
        
        items.forEach(item => {
            item.mesh.position.x = currentX + item.width / 2;
            item.mesh.position.z = 0;
            currentX += item.width + gap;
        });
    }
    
    arrangeGrid(items) {
        const cols = 3;
        const rows = 2;
        
        // Calculate cell size based on largest item
        const maxWidth = Math.max(...items.map(i => Math.max(i.width, i.depth)));
        const gap = maxWidth * 0.15;
        const cellSize = maxWidth + gap;
        
        items.forEach((item, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            
            const x = (col - (cols - 1) / 2) * cellSize;
            const z = (row - (rows - 1) / 2) * cellSize;
            
            item.mesh.position.x = x;
            item.mesh.position.z = z;
        });
    }
    
    // Get mesh for an item type
    getMesh(itemType) {
        return this.meshes.get(itemType);
    }
    
    // Get all meshes
    getAllMeshes() {
        return this.meshes;
    }
    
    // Get geometry for an item
    getGeometry(itemType) {
        const mesh = this.meshes.get(itemType);
        return mesh ? mesh.geometry : null;
    }
    
    // Dispose of all resources
    dispose() {
        this.renderScheduler?.dispose();
        this.resizeObserver?.disconnect();
        this.panController?.dispose();
        this.setCompareSnapshot(null);
        this.geometryCache.forEach(entries => entries.forEach(entry => entry.geometry.dispose()));
        this.geometryCache.clear();
        this.meshes.clear();
        
        this.renderer.dispose();
        this.controls.dispose();
    }
    
    /**
     * Capture a thumbnail of the current viewport
     * @param {number} width - Thumbnail width
     * @param {number} height - Thumbnail height
     * @returns {string} Base64 data URL of the thumbnail
     */
    captureThumbnail(width = 400, height = 300) {
        // Store current size
        const size = this.renderer.getSize(new THREE.Vector2());
        const currentWidth = size.x;
        const currentHeight = size.y;
        
        // Temporarily resize renderer for thumbnail
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // Set to nice viewing angle for thumbnail
        const savedPosition = this.camera.position.clone();
        const savedTarget = this.controls.target.clone();
        
        this.camera.position.set(400, 300, 400);
        this.controls.target.set(0, 30, 0);
        this.controls.update();
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
        
        // Capture the image
        const dataURL = this.renderer.domElement.toDataURL('image/jpeg', 0.7);
        
        // Restore camera position
        this.camera.position.copy(savedPosition);
        this.controls.target.copy(savedTarget);
        this.controls.update();
        
        // Restore original size
        this.renderer.setSize(currentWidth, currentHeight, false);
        this.camera.aspect = currentWidth / currentHeight;
        this.camera.updateProjectionMatrix();
        
        // Re-render at original size
        this.renderer.render(this.scene, this.camera);
        this.requestRender();
        
        return dataURL;
    }
}

// Singleton instance
let viewportInstance = null;

export function initViewport(container) {
    if (!viewportInstance) {
        viewportInstance = new ViewportManager(container);
    }
    return viewportInstance;
}

export function getViewport() {
    return viewportInstance;
}
