/**
 * Viewport Manager
 * Handles 3D rendering with Three.js
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { stateManager, ITEM_TYPES, ITEM_NAMES } from '../state/projectState.js';
import { generateItemMesh } from '../geometry/meshGenerator.js';

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
        
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();
        this.setupClippingPlane();
        this.setupResizeHandler();
        
        this.animate();
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
    }
    
    // Set grid colors based on light/dark mode
    setGridColors(isLight) {
        this.scene.remove(this.gridHelper);
        if (isLight) {
            this.gridHelper = new THREE.GridHelper(600, 30, 0xcccccc, 0xe0e0e0);
        } else {
            this.gridHelper = new THREE.GridHelper(600, 30, 0x333333, 0x262626);
        }
        this.gridHelper.position.y = -1;
        this.gridHelper.visible = this.gridVisible;
        this.scene.add(this.gridHelper);
    }
    
    // Toggle grid visibility
    toggleGrid(visible) {
        this.gridVisible = visible;
        this.gridHelper.visible = visible;
        stateManager.setState('ui.gridVisible', visible);
    }
    
    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
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
        const resizeObserver = new ResizeObserver(() => {
            this.handleResize();
        });
        resizeObserver.observe(this.container);
    }
    
    handleResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
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
        stateManager.setState('ui.cameraPreset', preset);
    }
    
    // Reset view to default position and target
    resetView() {
        this.camera.position.set(400, 300, 400);
        if (this.controls) {
            this.controls.target.set(0, 30, 0);
            this.controls.update();
        }
    }
    
    // Toggle cross-section view
    toggleCrossSection(enabled) {
        this.crossSectionEnabled = enabled;
        this.clippingPlaneHelper.visible = enabled;
        
        // Update all meshes with appropriate material
        this.meshes.forEach((mesh) => {
            mesh.material = enabled ? CROSS_SECTION_MATERIAL : ITEM_MATERIAL;
        });
        
        stateManager.setState('ui.crossSectionEnabled', enabled);
    }
    
    // Set layout mode
    setLayoutMode(mode) {
        this.layoutMode = mode;
        this.arrangeItems();
        stateManager.setState('ui.layoutMode', mode);
    }
    
    // Update a single item mesh
    updateItem(itemType) {
        // Remove old mesh if exists
        if (this.meshes.has(itemType)) {
            const oldMesh = this.meshes.get(itemType);
            this.scene.remove(oldMesh);
            oldMesh.geometry.dispose();
        }
        
        try {
            // Generate new mesh
            const geometry = generateItemMesh(itemType);
            
            if (!geometry || !geometry.getAttribute('position')) {
                console.error(`Failed to generate geometry for ${itemType}`);
                return null;
            }
            
            console.log(`Generated ${itemType}: ${geometry.getAttribute('position').count} vertices`);
            
            const material = this.crossSectionEnabled ? CROSS_SECTION_MATERIAL : ITEM_MATERIAL;
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            mesh.userData.itemType = itemType;
            
            this.meshes.set(itemType, mesh);
            this.scene.add(mesh);
            
            // Arrange items
            this.arrangeItems();
            
            return mesh;
        } catch (error) {
            console.error(`Error generating mesh for ${itemType}:`, error);
            return null;
        }
    }
    
    // Update all items
    updateAllItems() {
        ITEM_TYPES.forEach(itemType => {
            this.updateItem(itemType);
        });
        this.updateVisibility();
    }
    
    // Update item visibility
    updateVisibility() {
        const visibleItems = stateManager.getState('ui.visibleItems');
        
        this.meshes.forEach((mesh, itemType) => {
            mesh.visible = visibleItems.includes(itemType);
        });
        
        this.arrangeItems();
    }
    
    // Arrange items based on layout mode
    arrangeItems() {
        const visibleItems = stateManager.getState('ui.visibleItems');
        const visibleMeshes = [];
        
        // Collect visible meshes with their info
        ITEM_TYPES.forEach(itemType => {
            if (visibleItems.includes(itemType) && this.meshes.has(itemType)) {
                const mesh = this.meshes.get(itemType);
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
        this.meshes.forEach((mesh) => {
            mesh.geometry.dispose();
        });
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
        const currentWidth = this.renderer.domElement.width;
        const currentHeight = this.renderer.domElement.height;
        
        // Temporarily resize renderer for thumbnail
        this.renderer.setSize(width, height);
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
        this.renderer.setSize(currentWidth, currentHeight);
        this.camera.aspect = currentWidth / currentHeight;
        this.camera.updateProjectionMatrix();
        
        // Re-render at original size
        this.renderer.render(this.scene, this.camera);
        
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

