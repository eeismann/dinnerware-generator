/**
 * Handle Viewport
 * Three.js viewport for the handle generator
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
    generateHandleMesh, 
    generateMugPreviewMesh,
    generateAttachmentZoneGeometry 
} from '../geometry/handleMeshGenerator.js';

class HandleViewport {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        
        // Meshes
        this.handleMesh = null;
        this.mugMesh = null;
        this.attachmentZones = null;
        this.grid = null;
        
        // Settings
        this.showGrid = true;
        this.showDimensions = true;
        this.showAttachmentOutlines = true;
        this.mugDisplayMode = 'transparent';
        this.showCrossSection = false;
        
        // Materials
        this.handleMaterial = null;
        this.mugMaterials = {};
        
        // Clipping for cross-section
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
        
        this.init();
    }
    
    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1e1e1e);
        
        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
        this.camera.position.set(150, 80, 0); // Side view default
        this.camera.lookAt(50, 50, 0);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            alpha: true,
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.localClippingEnabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.target.set(50, 50, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 500;
        
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
        
        this.controls.update();
        
        // Lighting
        this.setupLighting();
        
        // Materials
        this.setupMaterials();
        
        // Grid
        this.createGrid();
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
        
        // Start animation loop
        this.animate();
    }
    
    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        // Main directional light
        const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
        mainLight.position.set(100, 150, 100);
        mainLight.castShadow = false;
        this.scene.add(mainLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-50, 50, -50);
        this.scene.add(fillLight);
        
        // Rim light
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
        rimLight.position.set(0, -50, 100);
        this.scene.add(rimLight);
    }
    
    setupMaterials() {
        // Handle material - ceramic-like appearance
        this.handleMaterial = new THREE.MeshStandardMaterial({
            color: 0xfaf3e8,
            roughness: 0.4,
            metalness: 0.0,
            side: THREE.DoubleSide,
        });
        
        // Mug materials for different display modes
        this.mugMaterials = {
            transparent: new THREE.MeshStandardMaterial({
                color: 0xfaf3e8,
                roughness: 0.4,
                metalness: 0.0,
                transparent: true,
                opacity: 0.35,
                side: THREE.DoubleSide,
            }),
            wireframe: new THREE.MeshBasicMaterial({
                color: 0x888888,
                wireframe: true,
            }),
            solid: new THREE.MeshStandardMaterial({
                color: 0x8a8a8a,
                roughness: 0.5,
                metalness: 0.0,
                side: THREE.DoubleSide,
            }),
        };
    }
    
    createGrid() {
        // Create a custom grid aligned to the XY plane (vertical)
        const gridSize = 200;
        const gridDivisions = 20;
        
        this.grid = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x333333);
        this.grid.rotation.x = Math.PI / 2; // Rotate to XY plane
        this.grid.position.z = -1; // Slightly behind the model
        
        if (this.showGrid) {
            this.scene.add(this.grid);
        }
    }
    
    updateHandle(handleParams, mugData) {
        // Remove existing handle mesh
        if (this.handleMesh) {
            this.scene.remove(this.handleMesh);
            this.handleMesh.geometry.dispose();
        }
        
        // Generate new handle mesh
        const geometry = generateHandleMesh(handleParams, mugData);
        this.handleMesh = new THREE.Mesh(geometry, this.handleMaterial);
        
        // Apply clipping if cross-section is enabled
        if (this.showCrossSection) {
            this.handleMaterial.clippingPlanes = [this.clippingPlane];
        } else {
            this.handleMaterial.clippingPlanes = [];
        }
        
        this.scene.add(this.handleMesh);
        
        // Update attachment zones
        this.updateAttachmentZones(handleParams, mugData);
    }
    
    updateMug(mugData) {
        // Remove existing mug mesh
        if (this.mugMesh) {
            this.scene.remove(this.mugMesh);
            this.mugMesh.geometry.dispose();
        }
        
        if (this.mugDisplayMode === 'hidden') {
            return;
        }
        
        // Generate mug preview mesh
        const geometry = generateMugPreviewMesh(mugData);
        const material = this.mugMaterials[this.mugDisplayMode] || this.mugMaterials.transparent;
        
        this.mugMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mugMesh);
    }
    
    updateAttachmentZones(handleParams, mugData) {
        // Remove existing attachment zones
        if (this.attachmentZones) {
            this.scene.remove(this.attachmentZones);
        }
        
        if (!this.showAttachmentOutlines) {
            return;
        }
        
        // Generate attachment zone visualization
        this.attachmentZones = generateAttachmentZoneGeometry(handleParams, mugData);
        this.scene.add(this.attachmentZones);
    }
    
    setMugDisplayMode(mode) {
        this.mugDisplayMode = mode;
        
        if (this.mugMesh) {
            if (mode === 'hidden') {
                this.mugMesh.visible = false;
            } else {
                this.mugMesh.visible = true;
                this.mugMesh.material = this.mugMaterials[mode] || this.mugMaterials.transparent;
            }
        }
    }
    
    setCameraView(view) {
        const targetPos = new THREE.Vector3(50, 50, 0);
        
        switch (view) {
            case 'side':
                this.camera.position.set(150, 50, 0);
                break;
            case 'threeQuarter':
                this.camera.position.set(120, 80, 80);
                break;
            case 'top':
                this.camera.position.set(50, 200, 0);
                break;
            case 'bottom':
                this.camera.position.set(50, -150, 0);
                break;
            default:
                this.camera.position.set(150, 80, 0);
        }
        
        this.controls.target.copy(targetPos);
        this.controls.update();
    }
    
    resetView() {
        this.setCameraView('side');
    }
    
    setShowGrid(show) {
        this.showGrid = show;
        if (show && !this.grid.parent) {
            this.scene.add(this.grid);
        } else if (!show && this.grid.parent) {
            this.scene.remove(this.grid);
        }
    }
    
    setShowCrossSection(show) {
        this.showCrossSection = show;
        
        if (this.handleMesh) {
            if (show) {
                this.handleMaterial.clippingPlanes = [this.clippingPlane];
            } else {
                this.handleMaterial.clippingPlanes = [];
            }
        }
    }
    
    setShowAttachmentOutlines(show) {
        this.showAttachmentOutlines = show;
        
        if (this.attachmentZones) {
            this.attachmentZones.visible = show;
        }
    }
    
    setTheme(isDark) {
        if (isDark) {
            this.scene.background = new THREE.Color(0x1e1e1e);
            if (this.grid) {
                this.grid.material.color.set(0x444444);
            }
        } else {
            this.scene.background = new THREE.Color(0xf5f5f5);
            if (this.grid) {
                this.grid.material.color.set(0xcccccc);
            }
        }
    }
    
    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    // Alias for external calls
    handleResize() {
        this.onResize();
    }
    
    /**
     * Capture a thumbnail of the current viewport
     * @param {number} width - Thumbnail width
     * @param {number} height - Thumbnail height
     * @returns {string} Base64 data URL of the thumbnail
     */
    captureThumbnail(width = 400, height = 300) {
        // Store current size (use container dimensions, not canvas pixel dimensions)
        const currentWidth = this.container.clientWidth;
        const currentHeight = this.container.clientHeight;

        // Temporarily resize renderer for thumbnail
        this.renderer.setSize(width, height, false); // false = don't update CSS style
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        // Set to nice three-quarter viewing angle for thumbnail
        const savedPosition = this.camera.position.clone();
        const savedTarget = this.controls.target.clone();
        
        // Position camera to show handle nicely (three-quarter view)
        this.camera.position.set(120, 80, 80);
        this.controls.target.set(50, 50, 0);
        this.controls.update();
        
        // Temporarily hide grid for cleaner thumbnail
        const gridWasVisible = this.grid && this.grid.parent;
        if (gridWasVisible) {
            this.scene.remove(this.grid);
        }
        
        // Temporarily hide attachment zones for cleaner thumbnail
        const zonesWereVisible = this.attachmentZones && this.attachmentZones.visible;
        if (this.attachmentZones) {
            this.attachmentZones.visible = false;
        }
        
        // Render the scene
        this.renderer.render(this.scene, this.camera);
        
        // Capture the image
        const dataURL = this.renderer.domElement.toDataURL('image/jpeg', 0.7);
        
        // Restore grid visibility
        if (gridWasVisible) {
            this.scene.add(this.grid);
        }
        
        // Restore attachment zones visibility
        if (this.attachmentZones && zonesWereVisible) {
            this.attachmentZones.visible = true;
        }
        
        // Restore camera position
        this.camera.position.copy(savedPosition);
        this.controls.target.copy(savedTarget);
        this.controls.update();
        
        // Restore original size (and update CSS to match container)
        this.renderer.setSize(currentWidth, currentHeight);
        this.camera.aspect = currentWidth / currentHeight;
        this.camera.updateProjectionMatrix();

        // Restore pixel ratio
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        
        // Re-render at original size
        this.renderer.render(this.scene, this.camera);
        
        return dataURL;
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    dispose() {
        // Clean up resources
        if (this.handleMesh) {
            this.handleMesh.geometry.dispose();
            this.handleMesh.material.dispose();
        }
        
        if (this.mugMesh) {
            this.mugMesh.geometry.dispose();
        }
        
        Object.values(this.mugMaterials).forEach(mat => mat.dispose());
        
        this.renderer.dispose();
        this.controls.dispose();
        
        this.container.removeChild(this.renderer.domElement);
    }
}

// Export as singleton factory
let viewportInstance = null;

export function initHandleViewport(containerId) {
    if (viewportInstance) {
        viewportInstance.dispose();
    }
    viewportInstance = new HandleViewport(containerId);
    return viewportInstance;
}

export function getHandleViewport() {
    return viewportInstance;
}

