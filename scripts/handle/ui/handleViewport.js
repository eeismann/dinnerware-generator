/**
 * Handle Viewport
 * Three.js viewport for the handle generator
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
    generateHandleMesh,
    generateHandlePreviewMesh,
    generateMugPreviewMesh,
    generateAttachmentZoneGeometry
} from '../geometry/handleMeshGenerator.js';
import { generateHandleMoldPackage } from '../mold/handleMoldGenerator.js';
import {
    DEFAULT_MOLD_CONSTRUCTION_VIEW,
    calculateMoldFitDiagnostics,
    getMoldConstructionPartPosition,
    isMoldConstructionPartVisible,
    mergeMoldConstructionViewSettings,
    transformProductProofGeometryToMoldSpace
} from '../mold/handleMoldConstructionView.js';
import { RenderScheduler } from '../../ui/renderScheduler.js';
import { createWorldAxes } from '../../ui/studio/worldAxes.js';
import { createOrbitPanMode } from '../../ui/orbitPanMode.js';

function canCreateWebGLContext() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2')
            || canvas.getContext('webgl')
            || canvas.getContext('experimental-webgl');
        gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
        return !!gl;
    } catch (error) {
        return false;
    }
}

export class HandleViewport {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.webglAvailable = true;
        this.fallbackEl = null;

        // Meshes
        this.handleMesh = null;
        this.mugMesh = null;
        this.attachmentZones = null;
        this.moldGroup = null;
        this.moldSummary = null;
        this.grid = null;

        // Settings
        this.showGrid = true;
        this.showDimensions = true;
        this.showAttachmentOutlines = true;
        this.mugDisplayMode = 'transparent';
        this.showCrossSection = false;
        this.showMoldPreview = false;
        this.moldConstructionView = { ...DEFAULT_MOLD_CONSTRUCTION_VIEW };

        // Materials
        this.handleMaterial = null;
        this.mugMaterials = {};
        this.moldMaterials = {};
        this.moldLineMaterials = {};

        // Clipping for cross-section
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

        this.renderScheduler = null;
        this.resizeHandler = null;
        this.overlayUpdater = null;
        this.lastMugKey = null;
        this.panController = null;

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

        if (!canCreateWebGLContext()) {
            this.activateWebGLFallback();
            return;
        }

        // Renderer
        try {
            this.renderer = new THREE.WebGLRenderer({
                antialias: true,
                alpha: true,
            });
            this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.localClippingEnabled = true;
            this.container.appendChild(this.renderer.domElement);
        } catch (error) {
            console.warn('Handle viewport WebGL unavailable:', error);
            this.activateWebGLFallback();
            return;
        }

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

        // Lighting
        this.setupLighting();

        // Materials
        this.setupMaterials();

        // Grid
        this.createGrid();

        // Handle resize
        this.resizeHandler = () => this.onResize();
        window.addEventListener('resize', this.resizeHandler);

        this.setupRenderScheduler();
        this.requestRender();
    }

    activateWebGLFallback() {
        this.webglAvailable = false;
        this.fallbackEl = document.createElement('div');
        this.fallbackEl.className = 'viewport-webgl-fallback';
        this.fallbackEl.textContent = '3D preview unavailable in this browser.';
        this.container.appendChild(this.fallbackEl);
        this.controls = {
            target: new THREE.Vector3(50, 50, 0),
            update() {},
            addEventListener() {},
            dispose() {}
        };
        this.setupMaterials();
        this.resizeHandler = () => this.onResize();
        window.addEventListener('resize', this.resizeHandler);
        this.setupRenderScheduler();
        this.requestRender();
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

        this.moldMaterials = {
            proof: new THREE.MeshStandardMaterial({
                color: 0x2f9d72,
                roughness: 0.45,
                metalness: 0,
                transparent: true,
                opacity: 0.7,
                depthWrite: false
            }),
            handleMold: new THREE.MeshStandardMaterial({
                color: 0xd66a5f,
                roughness: 0.5,
                metalness: 0,
                transparent: true,
                opacity: 0.68,
                depthWrite: false
            }),
            wallA: new THREE.MeshStandardMaterial({
                color: 0x8a62b8,
                roughness: 0.55,
                metalness: 0,
                transparent: true,
                opacity: 0.68,
                depthWrite: false
            }),
            wallB: new THREE.MeshStandardMaterial({
                color: 0xd59a34,
                roughness: 0.55,
                metalness: 0,
                transparent: true,
                opacity: 0.68,
                depthWrite: false
            }),
            bottom: new THREE.MeshStandardMaterial({
                color: 0x5377ad,
                roughness: 0.55,
                metalness: 0,
                transparent: true,
                opacity: 0.68,
                depthWrite: false
            })
        };

        this.moldLineMaterials = {
            proof: new THREE.LineBasicMaterial({ color: 0x103f2d, transparent: true, opacity: 0.95 }),
            handleMold: new THREE.LineBasicMaterial({ color: 0x7f1f18, transparent: true, opacity: 0.95 }),
            wallA: new THREE.LineBasicMaterial({ color: 0x3e245c, transparent: true, opacity: 0.95 }),
            wallB: new THREE.LineBasicMaterial({ color: 0x6b4312, transparent: true, opacity: 0.95 }),
            bottom: new THREE.LineBasicMaterial({ color: 0x1f3b66, transparent: true, opacity: 0.95 })
        };

        this.moldContactMaterial = new THREE.MeshBasicMaterial({
            color: 0x101820,
            transparent: true,
            opacity: 0.16,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        this.moldContactLineMaterial = new THREE.LineBasicMaterial({
            color: 0x101820,
            transparent: true,
            opacity: 0.72
        });
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

    setupRenderScheduler() {
        this.renderScheduler = new RenderScheduler({
            controls: this.controls,
            updateOverlay: () => this.overlayUpdater?.(),
            render: () => this.renderer?.render(this.scene, this.camera)
        });
    }

    setOverlayUpdater(updater) {
        this.overlayUpdater = updater;
        this.requestRender();
    }

    updateHandle(handleParams, mugData, options = {}) {
        const moldKey = this.showMoldPreview ? JSON.stringify({ handleParams, mugData }) : null;
        if (moldKey && this.moldGroup && this.lastMoldKey === moldKey) {
            this.requestRender();
            return;
        }
        this.moldSummary = null;
        this.lastMoldKey = null;
        if (!this.webglAvailable) {
            this.requestRender();
            return;
        }

        // Remove existing handle mesh
        if (this.handleMesh) {
            this.scene.remove(this.handleMesh);
            this.handleMesh.geometry.dispose();
            this.handleMesh = null;
        }

        if (this.moldGroup) {
            this.scene.remove(this.moldGroup);
            this.disposeObject(this.moldGroup, { disposeMaterial: false });
            this.moldGroup = null;
        }

        if (this.showMoldPreview) {
            this.updateMoldPreview(handleParams, mugData);
            this.lastMoldKey = moldKey;
            return;
        }

        // Generate new handle mesh
        const geometry = options.preview
            ? generateHandlePreviewMesh(handleParams, mugData)
            : generateHandleMesh(handleParams, mugData);
        this.handleMesh = new THREE.Mesh(geometry, this.handleMaterial);

        // Apply clipping if cross-section is enabled
        if (this.showCrossSection) {
            this.handleMaterial.clippingPlanes = [this.clippingPlane];
        } else {
            this.handleMaterial.clippingPlanes = [];
        }
        this.handleMaterial.needsUpdate = true;

        this.scene.add(this.handleMesh);

        // Update attachment zones
        this.updateAttachmentZones(handleParams, mugData);
        this.requestRender();
    }

    /** Remove the handle, mug, mold and attachment outlines (empty start state). */
    clearModels() {
        ['handleMesh', 'mugMesh'].forEach(key => {
            if (!this[key]) return;
            this.scene.remove(this[key]);
            this[key].geometry.dispose();
            this[key] = null;
        });
        ['moldGroup', 'attachmentZones'].forEach(key => {
            if (!this[key]) return;
            this.scene.remove(this[key]);
            this.disposeObject(this[key], { disposeMaterial: key === 'attachmentZones' });
            this[key] = null;
        });
        this.lastMugKey = null;
        this.lastMoldKey = null;
        this.moldSummary = null;
        this.requestRender();
    }

    updateMoldPreview(handleParams, mugData) {
        if (!this.webglAvailable) {
            this.requestRender();
            return;
        }

        const pkg = this.generateMoldPackage(handleParams, mugData);
        const summary = this.createMoldSummary(pkg);
        const group = new THREE.Group();
        group.userData.layout = pkg.layout;
        group.userData.partMeshes = {};

        Object.entries(pkg.parts).forEach(([key, geometry]) => {
            const displayGeometry = key === 'proof'
                ? transformProductProofGeometryToMoldSpace(geometry, pkg.layout)
                : geometry;
            const material = this.moldMaterials[key] || this.handleMaterial;
            const mesh = new THREE.Mesh(displayGeometry, material);
            mesh.name = `mold-${key}`;

            const edges = new THREE.LineSegments(
                new THREE.EdgesGeometry(displayGeometry, 20),
                this.moldLineMaterials[key] || this.moldLineMaterials.handleMold
            );
            edges.name = `mold-${key}-edges`;
            mesh.add(edges);

            group.userData.partMeshes[key] = mesh;
            group.add(mesh);

            if (key === 'proof') {
                geometry.dispose();
            }
        });

        const contactPlane = this.createMoldContactPlane(pkg.layout);
        if (contactPlane) {
            group.userData.contactPlane = contactPlane;
            group.add(contactPlane);
        }

        this.moldGroup = group;
        this.applyMoldConstructionSettings();
        this.scene.add(this.moldGroup);
        this.moldSummary = summary;
        this.frameMoldPreview();

        if (this.attachmentZones) {
            this.scene.remove(this.attachmentZones);
            this.disposeObject(this.attachmentZones, { disposeMaterial: true });
            this.attachmentZones = null;
        }

        this.requestRender();
    }

    generateMoldPackage(handleParams, mugData) {
        return generateHandleMoldPackage(handleParams, mugData);
    }

    createMoldSummary(pkg) {
        const sizes = {};
        for (const [key, geometry] of Object.entries(pkg.parts)) {
            geometry.computeBoundingBox();
            const size = geometry.boundingBox.getSize(new THREE.Vector3());
            sizes[key] = { x: size.x, y: size.y, z: size.z };
        }
        // Keep scalar data only. The scene owns/disposes all displayed geometry.
        return {
            sizes,
            plasterVolumeL: pkg.plaster.plasterVolumeL,
            diagnostics: calculateMoldFitDiagnostics(pkg)
        };
    }

    getMoldSummary() {
        return this.moldSummary;
    }

    applyMoldConstructionSettings() {
        if (!this.moldGroup?.userData?.layout) return;

        const settings = mergeMoldConstructionViewSettings(this.moldConstructionView);
        const { layout, partMeshes } = this.moldGroup.userData;

        Object.entries(partMeshes || {}).forEach(([key, mesh]) => {
            mesh.visible = isMoldConstructionPartVisible(key, settings);
            mesh.position.copy(getMoldConstructionPartPosition(key, layout, settings));

            if (mesh.material) {
                mesh.material.opacity = key === 'proof'
                    ? Math.min(0.85, settings.opacity + 0.12)
                    : settings.opacity;
                mesh.material.transparent = true;
                mesh.material.depthWrite = false;
                mesh.material.needsUpdate = true;
            }
        });

        if (this.moldGroup.userData.contactPlane) {
            this.moldGroup.userData.contactPlane.visible = settings.showHandleMold && settings.showWalls;
        }
    }

    createMoldContactPlane(layout) {
        const contact = layout.wallContact;
        if (!contact || !Number.isFinite(contact.wallInnerFaceX)) {
            return null;
        }

        const bottomBox = layout.boxes.bottom;
        const zMin = layout.bisection?.planeZ ?? 0;
        const zMax = layout.wallHeight;
        const ySize = Math.max(1, bottomBox.max.y - bottomBox.min.y);
        const zSize = Math.max(1, zMax - zMin);
        const planeGeometry = new THREE.PlaneGeometry(zSize, ySize);
        planeGeometry.rotateY(Math.PI / 2);
        planeGeometry.translate(
            contact.wallInnerFaceX,
            (bottomBox.min.y + bottomBox.max.y) / 2,
            (zMin + zMax) / 2
        );

        const plane = new THREE.Mesh(planeGeometry, this.moldContactMaterial);
        plane.name = 'mold-well-wall-contact-plane';

        const edges = new THREE.LineSegments(
            new THREE.EdgesGeometry(planeGeometry, 1),
            this.moldContactLineMaterial
        );
        edges.name = 'mold-well-wall-contact-plane-edges';
        plane.add(edges);
        return plane;
    }

    frameMoldPreview() {
        if (!this.moldGroup || !this.camera || !this.controls) return;

        const box = new THREE.Box3().setFromObject(this.moldGroup);
        if (box.isEmpty()) return;

        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z, 1);
        this.controls.target.copy(center);
        this.camera.position.set(
            center.x + maxDim * 0.55,
            center.y - maxDim * 0.8,
            center.z + maxDim * 1.05
        );
        this.camera.near = Math.max(0.1, maxDim / 200);
        this.camera.far = Math.max(1000, maxDim * 8);
        this.camera.updateProjectionMatrix();
        this.controls.update();
    }

    updateMug(mugData, options = {}) {
        if (!this.webglAvailable) {
            this.requestRender();
            return;
        }

        if (this.showMoldPreview) {
            if (this.mugMesh) {
                this.scene.remove(this.mugMesh);
                this.mugMesh.geometry.dispose();
                this.mugMesh = null;
            }
            this.lastMugKey = null;
            this.requestRender();
            return;
        }

        const nextKey = JSON.stringify({
            loaded: mugData.loaded,
            height: mugData.height,
            topDiameter: mugData.topDiameter,
            bottomDiameter: mugData.bottomDiameter,
            wallThickness: mugData.wallThickness,
            radiusProfile: mugData.radiusProfile,
            mode: this.mugDisplayMode
        });

        if (!options.force && this.lastMugKey === nextKey) {
            this.requestRender();
            return;
        }
        this.lastMugKey = nextKey;

        // Remove existing mug mesh
        if (this.mugMesh) {
            this.scene.remove(this.mugMesh);
            this.mugMesh.geometry.dispose();
            this.mugMesh = null;
        }

        this.requestRender();

        if (this.mugDisplayMode === 'hidden') {
            return;
        }

        // Generate mug preview mesh
        const geometry = Array.isArray(mugData.radiusProfile) && mugData.radiusProfile.length > 1
            ? new THREE.LatheGeometry(mugData.radiusProfile.map((point) => new THREE.Vector2(point.radius, point.y ?? point.height)), 64)
            : generateMugPreviewMesh(mugData);
        const material = this.mugMaterials[this.mugDisplayMode] || this.mugMaterials.transparent;

        this.mugMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mugMesh);

        const sourceKey = JSON.stringify({
            projectId: mugData.projectId,
            height: mugData.height,
            topDiameter: mugData.topDiameter,
            bottomDiameter: mugData.bottomDiameter,
            radiusProfile: mugData.radiusProfile
        });
        if (Array.isArray(mugData.radiusProfile) && this.lastMugSourceKey !== sourceKey) {
            this.frameHandlePreview();
        }
        this.lastMugSourceKey = sourceKey;
    }

    frameHandlePreview() {
        if (!this.camera || !this.controls || !this.mugMesh) return;
        const bounds = new THREE.Box3().setFromObject(this.mugMesh);
        if (this.handleMesh) bounds.union(new THREE.Box3().setFromObject(this.handleMesh));
        if (bounds.isEmpty()) return;
        const sphere = bounds.getBoundingSphere(new THREE.Sphere());
        const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);
        const distance = sphere.radius * 1.1 / Math.sin(Math.min(verticalFov, horizontalFov) / 2);
        const direction = this.camera.position.clone().sub(this.controls.target).normalize();
        this.controls.target.copy(sphere.center);
        this.camera.position.copy(sphere.center).addScaledVector(direction, distance);
        this.controls.maxDistance = Math.max(500, distance * 2);
        this.camera.far = Math.max(1000, distance * 4);
        this.camera.updateProjectionMatrix();
        this.controls.update();
        this.requestRender({ settle: true });
    }

    updateAttachmentZones(handleParams, mugData) {
        // Remove existing attachment zones
        if (this.attachmentZones) {
            this.scene.remove(this.attachmentZones);
            this.disposeObject(this.attachmentZones, { disposeMaterial: true });
            this.attachmentZones = null;
        }

        this.requestRender();

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
        this.lastMugKey = null;
        this.requestRender();
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
        this.requestRender({ settle: true });
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
        this.requestRender();
    }

    setShowCrossSection(show) {
        this.showCrossSection = show;

        if (this.handleMesh) {
            if (show) {
                this.handleMaterial.clippingPlanes = [this.clippingPlane];
            } else {
                this.handleMaterial.clippingPlanes = [];
            }
            this.handleMaterial.needsUpdate = true;
        }
        this.requestRender();
    }

    setShowAttachmentOutlines(show) {
        this.showAttachmentOutlines = show;

        if (this.attachmentZones) {
            this.attachmentZones.visible = show;
        }
        this.requestRender();
    }

    setShowMoldPreview(show, handleParams, mugData, constructionSettings = {}) {
        this.showMoldPreview = show;
        this.moldConstructionView = mergeMoldConstructionViewSettings({
            ...this.moldConstructionView,
            ...constructionSettings
        });
        this.updateHandle(handleParams, mugData);
        this.updateMug(mugData, { force: true });
        this.requestRender({ settle: true });
    }

    setMoldConstructionSettings(settings = {}) {
        this.moldConstructionView = mergeMoldConstructionViewSettings({
            ...this.moldConstructionView,
            ...settings
        });
        this.applyMoldConstructionSettings();
        this.frameMoldPreview();
        this.requestRender({ settle: true });
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
        this.requestRender();
    }

    onResize() {
        if (!this.renderer) return;

        const width = this.container.clientWidth;
        const height = this.container.clientHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);
        this.requestRender();
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
        if (!this.renderer) {
            return null;
        }

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
        this.requestRender();

        return dataURL;
    }

    // Request a single render on the next animation frame
    requestRender(options = {}) {
        this.renderScheduler?.request(options);
    }

    // Camera access for the Studio Shell view cube; null in the WebGL fallback
    getCameraRig() {
        if (!this.webglAvailable || !this.camera || !this.controls ||
            typeof this.controls.addEventListener !== 'function') return null;
        return {
            camera: this.camera,
            controls: this.controls,
            scene: this.scene,
            createWorldAxes: () => createWorldAxes(THREE, this.scene, 220),
            requestRender: (options) => this.requestRender(options)
        };
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

    disposeObject(obj, options = {}) {
        const { disposeMaterial = true } = options;
        obj.traverse?.((child) => {
            child.geometry?.dispose?.();
            if (disposeMaterial && child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach((material) => material.dispose());
                } else {
                    child.material.dispose();
                }
            }
        });
    }

    dispose() {
        // Clean up resources
        this.renderScheduler?.dispose();
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.handleMesh) {
            this.handleMesh.geometry.dispose();
        }

        if (this.mugMesh) {
            this.mugMesh.geometry.dispose();
        }

        if (this.attachmentZones) {
            this.disposeObject(this.attachmentZones, { disposeMaterial: true });
        }

        if (this.moldGroup) {
            this.disposeObject(this.moldGroup, { disposeMaterial: false });
        }

        this.handleMaterial?.dispose();

        Object.values(this.mugMaterials).forEach(mat => mat.dispose());
        Object.values(this.moldMaterials).forEach(mat => mat.dispose());
        Object.values(this.moldLineMaterials).forEach(mat => mat.dispose());

        this.renderer?.dispose();
        this.panController?.dispose();
        this.controls?.dispose();

        if (this.renderer?.domElement?.parentNode === this.container) {
            this.container.removeChild(this.renderer.domElement);
        }
        if (this.fallbackEl?.parentNode === this.container) {
            this.container.removeChild(this.fallbackEl);
        }
    }
}

// Export as singleton factory
let viewportInstance = null;

export function initHandleViewport(containerId) {
    if (viewportInstance) {
        viewportInstance.dispose();
    }
    viewportInstance = new HandleViewport(containerId);
    if (typeof window !== 'undefined' && import.meta.env?.DEV) {
        window.__handleViewport = viewportInstance;
    }
    return viewportInstance;
}

export function getHandleViewport() {
    return viewportInstance;
}
