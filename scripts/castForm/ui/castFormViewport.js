/**
 * Cast Form Generator - Viewport
 * Three.js 3D rendering for mold visualization
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import castFormState from '../state/castFormState.js';
import { PART_COLORS } from '../state/castFormDefaults.js';
import { buildWallCaseBox, buildFootCaseBox, buildContinuousWallCaseBox } from '../geometry/caseBoxGenerator.js';
import { RenderScheduler } from '../../ui/renderScheduler.js';
import { createWorldAxes } from '../../ui/studio/worldAxes.js';
import { createOrbitPanMode } from '../../ui/orbitPanMode.js';

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
        
        // Debug mode for shell visualization; the page listens via onDebugModeChange
        this.debugMode = false;
        this.onDebugModeChange = null;

        // Mesh names the user has hidden (parts and 'inputPreview'); survives regeneration
        this.hiddenParts = new Set();
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

        this.renderScheduler = null;
        this.resizeHandler = null;
        this.keydownHandler = null;
        this.cameraTweenFrame = null;
        this.panController = null;
        this.unsubscribers = [];
        this.validationCaptureRequested = new URLSearchParams(window.location.search).get('validationCapture') === '1';
        this.validationCaptureKey = '';
        
        // Camera presets
        this.cameraPresets = {
            front: { position: [0, 100, 300], target: [0, 50, 0] },
            side: { position: [300, 100, 0], target: [0, 50, 0] },
            threeQuarter: { position: [200, 150, 200], target: [0, 50, 0] },
            top: { position: [0, 520, 0], target: [0, 0, 0] }
        };
        
        this.init();
        this.setupSubscriptions();
        this.setupDebugKeyboardShortcut();
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        // Match the light gray studio canvas used by the other generators.
        this.scene.background = new THREE.Color(0xe9e9e6);
        
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

        // Re-render whenever the camera changes (drag, zoom, damping, presets, tweens)
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

        // Polymer case box preview group (seated form + pour box + polymer)
        this.caseBoxGroup = new THREE.Group();
        this.caseBoxGroup.name = 'caseBox';
        this.caseBoxGroup.visible = false;
        this.scene.add(this.caseBoxGroup);
        
        // Handle resize
        this.resizeHandler = () => this.onResize();
        window.addEventListener('resize', this.resizeHandler);

        this.setupRenderScheduler();
        this.updateValidationState();
        this.requestRender();
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
        this.gridHelper = new THREE.GridHelper(400, 40, 0xbfc0bd, 0xd8d8d4);
        this.gridHelper.position.y = 0;
        this.scene.add(this.gridHelper);
    }

    setupRenderScheduler() {
        this.renderScheduler = new RenderScheduler({
            controls: this.controls,
            render: () => {
                this.renderer.render(this.scene, this.camera);
                this.updateValidationCapture();
            }
        });
    }

    setupSubscriptions() {
        // Subscribe to input geometry changes
        this.unsubscribers.push(castFormState.subscribe('input', () => {
            this.updateInputPreview();
            this.updateValidationState();
            this.requestRender();
        }));
        
        // Subscribe to output changes
        this.unsubscribers.push(castFormState.subscribe('output', () => {
            this.updateMoldMeshes();
            // Reseat the case box preview on the fresh parts if it is active
            if (castFormState.getState('view.caseBoxPreview')?.enabled) {
                this.updateCaseBoxPreview();
            }
            this.updateValidationState();
            this.requestRender();
        }));

        // Case box preview mode: toggling/enabling swaps the viewport scene
        this.unsubscribers.push(castFormState.subscribe('view.caseBoxPreview', () => {
            this.updateCaseBoxPreview({ refit: true });
            this.requestRender();
        }));

        // Case box parameters: rebuild only the box preview (never the mold)
        this.unsubscribers.push(castFormState.subscribe('params.caseBox', () => {
            if (castFormState.getState('view.caseBoxPreview')?.enabled) {
                this.updateCaseBoxPreview();
                this.requestRender();
            }
        }));
        
        // Subscribe to view mode changes
        this.unsubscribers.push(castFormState.subscribe('view.mode', () => {
            this.updateViewMode();
            this.updateValidationState();
            this.requestRender();
        }));
        
        // Subscribe to explosion distance changes
        this.unsubscribers.push(castFormState.subscribe('view.explosionDistance', () => {
            this.updateViewMode();
            this.updateValidationState();
            this.requestRender();
        }));

        // Subscribe to camera preset changes
        this.unsubscribers.push(castFormState.subscribe('view.cameraPreset', () => {
            this.updateValidationState();
        }));

        // Subscribe to wall count changes
        this.unsubscribers.push(castFormState.subscribe('params.mold.wallCount', () => {
            this.updateValidationState();
        }));
        
        // Subscribe to cross-section angle changes
        this.unsubscribers.push(castFormState.subscribe('view.crossSectionAngle', () => { this.updateCrossSectionAngle(); this.requestRender(); }));
        
        // Subscribe to grid visibility
        this.unsubscribers.push(castFormState.subscribe('view.showGrid', (show) => {
            if (this.gridHelper) {
                this.gridHelper.visible = show;
            }
            this.requestRender();
        }));

    }

    /**
     * Update input geometry preview
     */
    updateInputPreview() {
        // Clear existing input preview
        this.clearGroup(this.inputGroup, { disposeGeometry: false, disposeMaterial: true });
        
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
        mesh.visible = !this.hiddenParts.has(mesh.name);
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
        this.clearGroup(this.moldGroup, { disposeGeometry: false, disposeMaterial: true });
        
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
            footMesh.visible = !this.hiddenParts.has(footMesh.name);
            footMesh.castShadow = true;
            footMesh.receiveShadow = true;
            this.moldGroup.add(footMesh);
        }
        
        // Wall meshes
        output.wallShells.forEach((wallGeo, index) => {
            if (wallGeo) {
                const wallMaterial = new THREE.MeshStandardMaterial({
                    color: PART_COLORS[`wall${index + 1}`] || PART_COLORS.wall1,
                    roughness: 0.7,
                    metalness: 0.0,
                    side: THREE.DoubleSide
                });
                
                const wallMesh = new THREE.Mesh(wallGeo, wallMaterial);
                wallMesh.name = `wall${index + 1}`;
                wallMesh.visible = !this.hiddenParts.has(wallMesh.name);
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
        const explosionDistance = castFormState.getState('view.explosionDistance') ?? 40;
        
        // Always keep input visible - user should see the imported STL alongside the mold
        this.inputGroup.visible = true;
        
        const output = castFormState.getState('output');
        const wallCount = Math.max(1, output.wallShells.filter(Boolean).length || castFormState.getState('params.mold.wallCount') || 2);
        const wallSegmentAngle = (Math.PI * 2) / wallCount;
        
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
                    default: {
                        const match = /^wall(\d+)$/.exec(mesh.name);
                        if (!match) break;
                        const wallIndex = parseInt(match[1], 10) - 1;
                        const wallMidAngle = (wallIndex + 0.5) * wallSegmentAngle;
                        mesh.position.set(
                            explosionDistance * Math.cos(wallMidAngle),
                            0,
                            explosionDistance * Math.sin(wallMidAngle)
                        );
                        break;
                    }
                }
            } else {
                // Assembly and cross-section views - all at origin
                mesh.position.set(0, 0, 0);
            }
        });

        this.updateValidationState();
    }

    /**
     * Case box preview mode: shows the selected mold form seated outer-face-down
     * in its polymer pour box (with the amber pour volume), hiding the mold and
     * input previews. Uses the exact box geometry the exporter writes.
     * @param {{refit?: boolean}} options - refit reframes the camera on the box
     */
    updateCaseBoxPreview(options = {}) {
        const preview = castFormState.getState('view.caseBoxPreview') || {};
        const enabled = !!preview.enabled;

        this.clearGroup(this.caseBoxGroup, { disposeGeometry: true, disposeMaterial: true });
        if (!enabled) {
            this.caseBoxGroup.visible = false;
            this.moldGroup.visible = true;
            this.inputGroup.visible = true;
            this.requestRender();
            return;
        }

        const output = castFormState.getState('output');
        const params = castFormState.getState('params');
        const target = preview.target === 'foot' ? 'foot' : 'wall';
        const wallCount = Math.max(1, Math.min(4, Math.round(params?.mold?.wallCount || 2)));

        const readout = document.getElementById('caseBoxReadout');
        const setReadoutMessage = (message) => {
            if (readout) readout.innerHTML = `<table><tr><td>${message}</td><td></td></tr></table>`;
        };

        if (target === 'wall' && !output.wallShells?.[0]) {
            this.caseBoxGroup.visible = false;
            this.moldGroup.visible = true;
            this.inputGroup.visible = true;
            setReadoutMessage('Generate a mold first');
            return;
        }
        if (target === 'foot' && !output.footShell) {
            this.caseBoxGroup.visible = false;
            this.moldGroup.visible = true;
            this.inputGroup.visible = true;
            setReadoutMessage('Generate a mold first');
            return;
        }

        this.caseBoxGroup.visible = true;
        this.moldGroup.visible = false;
        this.inputGroup.visible = false;

        const caseBoxParams = params.caseBox || {};
        const floorThickness = caseBoxParams.floorThickness ?? 3;
        const isContinuousWallBox = target === 'wall' && wallCount === 1;

        // The exact export geometry drives the preview.
        const boxGeometry = target === 'wall'
            ? (isContinuousWallBox
                ? buildContinuousWallCaseBox(output.wallShells[0], caseBoxParams)
                : buildWallCaseBox(output.wallShells[0], wallCount, caseBoxParams))
            : buildFootCaseBox(output.footShell, caseBoxParams);
        const info = boxGeometry.userData.caseBox;

        // Seated form: laid-flat clone (wall) or bottom-on-floor clone (foot).
        let formGeometry;
        if (target === 'wall') {
            formGeometry = isContinuousWallBox
                ? this.seatContinuousWallFootSocketDown(output.wallShells[0])
                : this.layFlatWallClone(output.wallShells[0], wallCount);
        } else {
            formGeometry = output.footShell.clone();
            formGeometry.translate(0, -info.form.yMin, 0);
        }
        formGeometry.translate(0, floorThickness, 0); // onto the pocket floor

        const formMesh = new THREE.Mesh(formGeometry, new THREE.MeshStandardMaterial({
            color: target === 'wall' ? PART_COLORS.wall1 : PART_COLORS.foot,
            roughness: 0.75,
            metalness: 0.0,
            side: THREE.DoubleSide
        }));
        formMesh.name = 'caseBoxForm';
        this.caseBoxGroup.add(formMesh);

        const boxMesh = new THREE.Mesh(boxGeometry, new THREE.MeshStandardMaterial({
            color: 0x6b8ba4,
            roughness: 0.45,
            metalness: 0.05,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false
        }));
        boxMesh.name = 'caseBoxTub';
        this.caseBoxGroup.add(boxMesh);
        this.caseBoxGroup.add(new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeometry, 25),
            new THREE.LineBasicMaterial({ color: 0x9fc3dd, transparent: true, opacity: 0.5 })
        ));

        // Polymer pour to the brim (from the indent ledge up).
        const brim = floorThickness + info.interiorHeight;
        const pourBase = floorThickness + (caseBoxParams.indentDepth ?? 2.5);
        const gap = caseBoxParams.gap ?? 10;
        const pourGeometry = target === 'wall' && !isContinuousWallBox
            ? new THREE.BoxGeometry(
                (info.form.halfWidth + gap) * 2,
                brim - pourBase,
                (info.form.halfLength + gap) * 2
            )
            : new THREE.CylinderGeometry(info.form.radius + gap, info.form.radius + gap, brim - pourBase, 96);
        const pourMesh = new THREE.Mesh(pourGeometry, new THREE.MeshStandardMaterial({
            color: 0xe0a83c,
            roughness: 0.25,
            transparent: true,
            opacity: 0.22,
            depthWrite: false
        }));
        pourMesh.position.y = (pourBase + brim) / 2;
        pourMesh.name = 'caseBoxPour';
        this.caseBoxGroup.add(pourMesh);

        // Readout: the same numbers the export uses.
        if (readout) {
            boxGeometry.computeBoundingBox();
            const bb = boxGeometry.boundingBox;
            const fmt = (v) => `${v.toFixed(1)} mm`;
            const rows = target === 'wall' && !isContinuousWallBox
                ? [
                    ['Form (seated)', `${fmt(info.form.halfWidth * 2)} × ${fmt(info.form.halfLength * 2)} × ${fmt(info.form.height)}`],
                    ['Box outer', `${fmt(bb.max.x - bb.min.x)} × ${fmt(bb.max.z - bb.min.z)} × ${fmt(bb.max.y - bb.min.y)}`],
                    ['Interior above form', fmt(caseBoxParams.headspace ?? 25.4)],
                    ['Serves', `all ${wallCount} walls — print once`]
                ]
                : [
                    ['Form (seated)', `Ø${fmt(info.form.radius * 2)} × ${fmt(info.form.height)}`],
                    ['Box outer', `Ø${fmt(bb.max.x - bb.min.x)} × ${fmt(bb.max.y - bb.min.y)}`],
                    ['Interior above form', fmt(caseBoxParams.headspace ?? 25.4)],
                    ...(isContinuousWallBox ? [
                        ['Orientation', 'Foot socket seated on the case-box floor'],
                        ['Cavity', 'Open upward for polymer capture']
                    ] : [])
                ];
            readout.innerHTML = `<table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`;
        }

        if (options.refit) {
            this.fitCameraToObject(boxGeometry);
        }
    }

    /**
     * Bake wall segment geometry into the laid-flat frame:
     * worldX = tangent, worldY = outerFaceDistance - u (up), worldZ = mold-Y (centered).
     */
    layFlatWallClone(wallGeometry, wallCount) {
        const phi = Math.PI / Math.max(1, wallCount); // wall 0 bisector
        const cos = Math.cos(phi);
        const sin = Math.sin(phi);
        const clone = wallGeometry.clone();
        const position = clone.getAttribute('position');

        let outerFaceDistance = -Infinity;
        let yMin = Infinity;
        let yMax = -Infinity;
        for (let i = 0; i < position.count; i++) {
            const u = position.getX(i) * cos + position.getZ(i) * sin;
            if (u > outerFaceDistance) outerFaceDistance = u;
            const y = position.getY(i);
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
        }

        const zMid = (yMin + yMax) / 2;
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const y = position.getY(i);
            const z = position.getZ(i);
            const u = x * cos + z * sin;
            const v = -x * sin + z * cos;
            position.setXYZ(i, v, outerFaceDistance - u, y - zMid);
        }
        position.needsUpdate = true;
        clone.computeVertexNormals();
        return clone;
    }

    /**
     * Seat the rotational one-wall form with its foot-mold interface against
     * the case-box floor. The vessel cavity stays open at the pour side so the
     * polymer records its full internal shape.
     */
    seatContinuousWallFootSocketDown(wallGeometry) {
        wallGeometry.computeBoundingBox();
        const clone = wallGeometry.clone();
        clone.translate(0, -wallGeometry.boundingBox.min.y, 0);
        clone.computeVertexNormals();
        return clone;
    }

    formatDataNumber(value) {
        const number = Number(value);
        if (!Number.isFinite(number)) return '';
        return Number.isInteger(number) ? String(number) : String(Number(number.toFixed(3)));
    }

    formatVectorData(vector) {
        if (!vector) return '';
        return [
            this.formatDataNumber(vector.x),
            this.formatDataNumber(vector.y),
            this.formatDataNumber(vector.z)
        ].join(',');
    }

    getRenderedWallCount() {
        return this.moldGroup?.children.filter(child => /^wall\d+$/.test(child.name)).length || 0;
    }

    updateValidationState() {
        if (!this.container) return;

        const params = castFormState.getState('params');
        const input = castFormState.getState('input');
        const output = castFormState.getState('output');
        const view = castFormState.getState('view');
        const renderedWallCount = this.getRenderedWallCount();
        const configuredWallCount = Number(params?.mold?.wallCount);
        const wallCount = Number.isFinite(configuredWallCount)
            ? Math.max(1, Math.round(configuredWallCount))
            : renderedWallCount;
        const hasRenderedMold = Boolean(output?.footShell || renderedWallCount > 0);
        const isReady = Boolean(castFormState.getState('input.isValid') && hasRenderedMold && !output?.isGenerating);

        this.container.dataset.validationReady = isReady ? 'true' : 'false';
        this.container.dataset.wallCount = String(wallCount || '');
        this.container.dataset.renderedWallCount = String(renderedWallCount);
        this.container.dataset.cornerCutWidth = this.formatDataNumber(params?.mold?.cornerCutWidth ?? 0);
        this.container.dataset.inputFileName = input?.fileName || '';
        this.container.dataset.inputSourceUrl = input?.validationSourceUrl || '';
        this.container.dataset.explosionDistance = this.formatDataNumber(view?.explosionDistance ?? 40);
        this.container.dataset.viewMode = view?.mode || '';
        this.container.dataset.cameraPreset = view?.cameraPreset || '';
        this.container.dataset.cameraSettled = this.cameraTweenFrame ? 'false' : 'true';
        this.container.dataset.cameraPosition = this.formatVectorData(this.camera?.position);
        this.container.dataset.cameraTarget = this.formatVectorData(this.controls?.target);
    }

    updateValidationCapture() {
        if (!this.validationCaptureRequested || !this.container) return;

        const isReady = this.container.dataset.validationReady === 'true';
        const isCameraSettled = this.container.dataset.cameraSettled === 'true';
        if (!isReady || !isCameraSettled) {
            this.container.dataset.validationCaptureReady = 'false';
            return;
        }

        const captureKey = [
            this.container.dataset.inputSourceUrl,
            this.container.dataset.cornerCutWidth,
            this.container.dataset.wallCount,
            this.container.dataset.renderedWallCount,
            this.container.dataset.explosionDistance,
            this.container.dataset.viewMode,
            this.container.dataset.cameraPreset,
            this.container.dataset.cameraPosition,
            this.container.dataset.cameraTarget
        ].join('|');

        if (captureKey === this.validationCaptureKey) return;

        try {
            const img = this.getValidationCaptureElement();
            img.src = this.captureCurrentFrame(520, 366);
            img.dataset.captureKey = captureKey;
            this.validationCaptureKey = captureKey;
            this.container.dataset.validationCaptureReady = 'true';
            this.container.dataset.validationCaptureError = '';
        } catch (error) {
            this.container.dataset.validationCaptureReady = 'false';
            this.container.dataset.validationCaptureError = error?.message || 'capture failed';
        }
    }

    getValidationCaptureElement() {
        let img = document.getElementById('castFormValidationCapture');
        if (!img) {
            img = document.createElement('img');
            img.id = 'castFormValidationCapture';
            img.alt = 'Cast form validation capture';
            img.hidden = true;
            this.container.appendChild(img);
        }
        return img;
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
    setCameraPreset(presetName, options = {}) {
        const preset = this.cameraPresets[presetName];
        if (!preset) return;
        const { instant = false } = options;

        if (this.cameraTweenFrame) {
            cancelAnimationFrame(this.cameraTweenFrame);
            this.cameraTweenFrame = null;
        }

        const endPosition = new THREE.Vector3(...preset.position);
        const endTarget = new THREE.Vector3(...preset.target);

        if (instant) {
            this.camera.position.copy(endPosition);
            this.controls.target.copy(endTarget);
            this.controls.update();
            castFormState.setState('view.cameraPreset', presetName);
            this.updateValidationState();
            this.renderer.render(this.scene, this.camera);
            this.updateValidationCapture();
            return;
        }

        // Animate camera to new position
        const duration = 500;
        const startPosition = this.camera.position.clone();
        const startTarget = this.controls.target.clone();
        const startTime = Date.now();
        
        const animate = () => {
            const elapsed = Date.now() - startTime;
            const t = Math.min(elapsed / duration, 1);
            const eased = this.easeOutCubic(t);
            
            this.camera.position.lerpVectors(startPosition, endPosition, eased);
            this.controls.target.lerpVectors(startTarget, endTarget, eased);
            this.controls.update();
            this.requestRender({ settle: true });
            
            if (t < 1) {
                this.cameraTweenFrame = requestAnimationFrame(animate);
            } else {
                this.cameraTweenFrame = null;
                this.updateValidationState();
                this.updateValidationCapture();
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
        this.requestRender({ settle: true });
    }

    /**
     * Clear all children from a group
     * @param {THREE.Group} group 
     */
    clearGroup(group, options = {}) {
        const { disposeGeometry = true, disposeMaterial = true } = options;
        while (group.children.length > 0) {
            const child = group.children[0];
            if (disposeGeometry && child.geometry && !child.userData?.externalGeometry) {
                child.geometry.dispose();
            }
            if (disposeMaterial && child.material) {
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
        return this.captureCurrentFrame(width, height);
    }

    captureCurrentFrame(width = 256, height = 256) {
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
     * @param {string} partName - 'foot', 'wall1'...'wall4', or null
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
        this.requestRender();
    }

    /**
     * Request a single render on the next animation frame
     */
    requestRender(options = {}) {
        this.renderScheduler?.request(options);
    }

    /**
     * Camera access for the Studio Shell view cube (additive; no behavior change).
     * cancelTween stops an in-flight preset tween so cube drags take over cleanly.
     */
    getCameraRig() {
        if (!this.camera || !this.controls) return null;
        return {
            camera: this.camera,
            controls: this.controls,
            scene: this.scene,
            createWorldAxes: () => createWorldAxes(THREE, this.scene, 400),
            requestRender: (options) => this.requestRender(options),
            cancelTween: () => {
                if (this.cameraTweenFrame) {
                    cancelAnimationFrame(this.cameraTweenFrame);
                    this.cameraTweenFrame = null;
                }
            }
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

    /**
     * Show/hide a named mold part or the input preview ('inputPreview').
     * Remembered so regenerated meshes keep the choice.
     */
    setPartVisible(name, visible) {
        if (visible) this.hiddenParts.delete(name);
        else this.hiddenParts.add(name);
        [...(this.moldGroup?.children || []), ...(this.inputGroup?.children || [])]
            .filter(child => child.name === name)
            .forEach(mesh => { mesh.visible = visible; });
        this.requestRender();
    }

    isPartVisible(name) {
        return !this.hiddenParts.has(name);
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
        this.requestRender();
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
        this.keydownHandler = (e) => {
            // Only trigger if not typing in an input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
            
            if (e.key === 'd' || e.key === 'D') {
                this.toggleDebugMode();
            }
        };
        window.addEventListener('keydown', this.keydownHandler);
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
     * Tell the page (View dials) that debug mode changed, e.g. via the D key
     */
    syncDebugUIState() {
        this.onDebugModeChange?.(this.debugMode);
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
        this.requestRender();
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
            points.userData.externalGeometry = true;
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
        this.requestRender();
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
        this.requestRender();
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
        this.renderScheduler?.dispose();
        this.panController?.dispose();
        if (this.cameraTweenFrame) {
            cancelAnimationFrame(this.cameraTweenFrame);
            this.cameraTweenFrame = null;
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler);
        }
        this.unsubscribers.forEach((unsubscribe) => unsubscribe?.());
        this.unsubscribers = [];
        this.controls.dispose();
        this.renderer.dispose();
        this.clearGroup(this.inputGroup, { disposeGeometry: false, disposeMaterial: true });
        this.clearGroup(this.moldGroup, { disposeGeometry: false, disposeMaterial: true });
        this.clearGroup(this.debugGroup);
        this.clearGroup(this.caseBoxGroup, { disposeGeometry: true, disposeMaterial: true });
        this.hideDebugLegend();
        this.renderer.domElement.remove();
    }
}

export default CastFormViewport;
