# Master Mold Generator - Technical Specification

## 1. Architecture Overview

### 1.1 Platform Integration

The Master Mold Generator integrates into the Playground Ceramics platform following established patterns:

```
playground-ceramics/
├── mold-generator/
│   └── index.html                    # Entry point
├── scripts/
│   └── mold/
│       ├── moldMain.js               # Application entry
│       ├── state/
│       │   ├── moldState.js          # State management
│       │   └── moldDefaults.js       # Default parameters
│       ├── geometry/
│       │   ├── inputProcessor.js     # STL/OBJ import & validation
│       │   ├── scalingEngine.js      # Shrinkage compensation
│       │   ├── booleanPartitioner.js # Mold decomposition (CSG)
│       │   ├── shellGenerator.js     # Shell/offset operations
│       │   ├── natchGenerator.js     # Registration key geometry
│       │   └── moldSTLExporter.js    # Multi-file STL export
│       └── ui/
│           ├── parameterPanel.js     # Parameter controls
│           ├── moldViewport.js       # Three.js scene
│           ├── exportDialog.js       # Export UI
│           └── warningDisplay.js     # Validation feedback
└── styles/
    └── mold-generator.css            # App-specific styles
```

### 1.2 Build Configuration

Add to `vite.config.js`:

```javascript
rollupOptions: {
    input: {
        // ... existing entries
        'mold-generator': resolve(__dirname, 'mold-generator/index.html')
    }
}
```

---

## 2. State Management

### 2.1 State Structure

Following the `VesselStateManager` pattern with reactive subscriptions:

```javascript
// scripts/mold/state/moldDefaults.js

export const DEFAULT_MOLD_PARAMS = {
    // Shrinkage Compensation
    shrinkage: {
        totalPercent: 12,
        anisotropicEnabled: false,
        xyPercent: 12,
        zPercent: 12
    },
    
    // Mold Dimensions
    mold: {
        plasterWallThickness: 30,  // mm
        spareHeight: 45,           // mm
        spareTaper: 3              // degrees
    },
    
    // Foot Configuration
    foot: {
        cutMode: 'auto',           // 'auto' | 'manual'
        manualCutHeight: 0,        // % of total height
        draftAngle: 5,             // degrees
        tenonHeight: 8,            // mm
        tenonWidth: 5              // mm
    },
    
    // Registration Keys (Natches)
    natches: {
        diameter: 10,              // mm
        depth: 5,                  // mm
        toleranceOffset: 0.2,      // mm (per side)
        countPerSeam: 2
    },
    
    // Shell Properties
    shell: {
        wallThickness: 1.5,        // mm (min 1.2)
        flangeWidth: 28,           // mm
        boltHoleSize: 'M6',        // 'M5' | 'M6' | 'M8' | '1/4-20'
        boltHolesPerFlange: 2
    }
};

export const PARAM_CONSTRAINTS = {
    'shrinkage.totalPercent': { min: 5, max: 20, step: 0.5, unit: '%' },
    'shrinkage.xyPercent': { min: 5, max: 20, step: 0.5, unit: '%' },
    'shrinkage.zPercent': { min: 5, max: 20, step: 0.5, unit: '%' },
    'mold.plasterWallThickness': { min: 20, max: 50, step: 1, unit: 'mm' },
    'mold.spareHeight': { min: 30, max: 80, step: 1, unit: 'mm' },
    'mold.spareTaper': { min: 0, max: 10, step: 0.5, unit: '°' },
    'foot.manualCutHeight': { min: 0, max: 30, step: 1, unit: '%' },
    'foot.draftAngle': { min: 0, max: 15, step: 0.5, unit: '°' },
    'foot.tenonHeight': { min: 5, max: 15, step: 1, unit: 'mm' },
    'natches.diameter': { min: 6, max: 15, step: 1, unit: 'mm' },
    'natches.depth': { min: 3, max: 10, step: 0.5, unit: 'mm' },
    'natches.toleranceOffset': { min: 0.1, max: 0.5, step: 0.05, unit: 'mm' },
    'shell.wallThickness': { min: 1.2, max: 3.0, step: 0.1, unit: 'mm' },
    'shell.flangeWidth': { min: 20, max: 40, step: 1, unit: 'mm' }
};
```

### 2.2 State Manager Implementation

```javascript
// scripts/mold/state/moldState.js

import { DEFAULT_MOLD_PARAMS, deepClone } from './moldDefaults.js';

class MoldStateManager {
    constructor() {
        this.state = this.createInitialState();
        this.listeners = new Map();
        this.updateQueue = [];
        this.isProcessing = false;
    }

    createInitialState() {
        return {
            project: {
                id: null,
                name: 'Untitled Mold',
                dateCreated: null,
                lastModified: null,
                isDirty: false
            },
            
            input: {
                source: 'platform',        // 'platform' | 'file'
                geometry: null,            // THREE.BufferGeometry
                fileName: '',
                sourceApp: null,           // 'vessel' | 'dinnerware' | null
                sourceProjectId: null,
                isValid: false,
                validationErrors: []
            },
            
            params: deepClone(DEFAULT_MOLD_PARAMS),
            
            computed: {
                footCutHeight: 0,          // Auto-computed or manual
                scaleFactor: 1.136,        // Computed from shrinkage
                moldBounds: null,          // Bounding box
                estimatedPrintTime: null
            },
            
            output: {
                footShell: null,           // THREE.BufferGeometry
                wallShells: [null, null, null],
                isGenerating: false,
                lastGenerated: null
            },
            
            view: {
                mode: 'exploded',          // 'exploded' | 'assembly' | 'crossSection'
                crossSectionAngle: 0,
                showNatches: true,
                showDimensions: true,
                selectedPart: null         // 'foot' | 'wall1' | 'wall2' | 'wall3'
            },
            
            warnings: [],
            errors: []
        };
    }

    // Subscribe to state changes (path-based)
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);
        return () => this.listeners.get(path)?.delete(callback);
    }

    // Get state value by path
    getState(path) {
        if (!path) return this.state;
        return path.split('.').reduce((obj, key) => obj?.[key], this.state);
    }

    // Set state value by path
    setState(path, value, options = {}) {
        const { silent = false } = options;
        
        // Set nested value
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((obj, key) => {
            if (!(key in obj)) obj[key] = {};
            return obj[key];
        }, this.state);
        
        const oldValue = target[last];
        if (this.isEqual(oldValue, value)) return;
        
        target[last] = value;
        
        // Mark dirty
        if (!path.startsWith('project.') && !path.startsWith('view.')) {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();
        }
        
        if (!silent) {
            this.notifyListeners(path);
        }
    }

    // Batch updates
    batchUpdate(updates) {
        updates.forEach(({ path, value }) => {
            this.setState(path, value, { silent: true });
        });
        this.notifyListeners('*');
    }

    notifyListeners(changedPath) {
        // Notify specific path listeners
        if (this.listeners.has(changedPath)) {
            const value = this.getState(changedPath);
            this.listeners.get(changedPath).forEach(cb => cb(value, changedPath));
        }
        
        // Notify wildcard listeners
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => cb(this.state, [changedPath]));
        }
    }

    isEqual(a, b) {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (typeof a !== 'object' || !a || !b) return false;
        const keysA = Object.keys(a);
        if (keysA.length !== Object.keys(b).length) return false;
        return keysA.every(key => this.isEqual(a[key], b[key]));
    }

    // Reset to new project
    reset() {
        this.state = this.createInitialState();
        this.state.project.dateCreated = new Date().toISOString();
        this.notifyListeners('*');
    }

    // Export for saving
    exportState() {
        return {
            version: '1.0',
            appType: 'mold-generator',
            project: { ...this.state.project },
            params: deepClone(this.state.params),
            input: {
                source: this.state.input.source,
                fileName: this.state.input.fileName,
                sourceApp: this.state.input.sourceApp,
                sourceProjectId: this.state.input.sourceProjectId
            }
        };
    }

    // Load from saved state
    loadState(data) {
        this.state = this.createInitialState();
        if (data.project) Object.assign(this.state.project, data.project);
        if (data.params) this.state.params = deepClone(data.params);
        if (data.input) Object.assign(this.state.input, data.input);
        this.state.project.isDirty = false;
        this.notifyListeners('*');
    }
}

export const moldState = new MoldStateManager();
export default moldState;
```

---

## 3. Geometry Engine

### 3.1 Input Processor

```javascript
// scripts/mold/geometry/inputProcessor.js

import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

export class InputProcessor {
    
    /**
     * Load geometry from file
     * @param {File} file - STL or OBJ file
     * @returns {Promise<{geometry: THREE.BufferGeometry, errors: string[]}>}
     */
    static async loadFromFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();
        const arrayBuffer = await file.arrayBuffer();
        
        let geometry;
        if (extension === 'stl') {
            const loader = new STLLoader();
            geometry = loader.parse(arrayBuffer);
        } else if (extension === 'obj') {
            const loader = new OBJLoader();
            const text = new TextDecoder().decode(arrayBuffer);
            const group = loader.parse(text);
            geometry = this.mergeGroupGeometry(group);
        } else {
            throw new Error(`Unsupported file format: ${extension}`);
        }
        
        return this.processGeometry(geometry);
    }

    /**
     * Import geometry from platform app
     * @param {THREE.Group} meshGroup - Mesh group from vessel/dinnerware
     * @returns {{geometry: THREE.BufferGeometry, errors: string[]}}
     */
    static importFromPlatform(meshGroup) {
        const geometry = this.mergeGroupGeometry(meshGroup);
        return this.processGeometry(geometry);
    }

    /**
     * Process and validate geometry
     */
    static processGeometry(geometry) {
        const errors = [];
        
        // Center geometry
        geometry.computeBoundingBox();
        const center = new THREE.Vector3();
        geometry.boundingBox.getCenter(center);
        geometry.translate(-center.x, -geometry.boundingBox.min.y, -center.z);
        
        // Validate manifold
        const manifoldResult = this.validateManifold(geometry);
        if (!manifoldResult.isManifold) {
            errors.push(...manifoldResult.errors);
        }
        
        // Compute normals if missing
        if (!geometry.getAttribute('normal')) {
            geometry.computeVertexNormals();
        }
        
        return { geometry, errors };
    }

    /**
     * Validate geometry is manifold (watertight)
     * Uses Euler characteristic: V - E + F = 2
     */
    static validateManifold(geometry) {
        const position = geometry.getAttribute('position');
        const index = geometry.getIndex();
        
        const errors = [];
        
        // Build edge map
        const edgeMap = new Map();
        const triangleCount = index 
            ? index.count / 3 
            : position.count / 3;
        
        for (let i = 0; i < triangleCount; i++) {
            const idx = i * 3;
            const indices = index
                ? [index.getX(idx), index.getX(idx + 1), index.getX(idx + 2)]
                : [idx, idx + 1, idx + 2];
            
            // Check each edge
            for (let j = 0; j < 3; j++) {
                const v1 = indices[j];
                const v2 = indices[(j + 1) % 3];
                const edgeKey = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
                
                edgeMap.set(edgeKey, (edgeMap.get(edgeKey) || 0) + 1);
            }
        }
        
        // Non-manifold edges have count != 2
        let nonManifoldEdges = 0;
        edgeMap.forEach((count, edge) => {
            if (count !== 2) nonManifoldEdges++;
        });
        
        if (nonManifoldEdges > 0) {
            errors.push(`Found ${nonManifoldEdges} non-manifold edges`);
        }
        
        return {
            isManifold: errors.length === 0,
            errors
        };
    }

    /**
     * Auto-detect optimal orientation (open end up)
     */
    static detectOrientation(geometry) {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const size = new THREE.Vector3();
        box.getSize(size);
        
        // Assume tallest dimension should be vertical
        const dims = [
            { axis: 'x', size: size.x },
            { axis: 'y', size: size.y },
            { axis: 'z', size: size.z }
        ].sort((a, b) => b.size - a.size);
        
        // Return rotation needed to make tallest axis Y
        if (dims[0].axis === 'y') {
            return new THREE.Euler(0, 0, 0);
        } else if (dims[0].axis === 'x') {
            return new THREE.Euler(0, 0, Math.PI / 2);
        } else {
            return new THREE.Euler(Math.PI / 2, 0, 0);
        }
    }

    /**
     * Merge group into single geometry
     */
    static mergeGroupGeometry(group) {
        const geometries = [];
        
        group.traverse(child => {
            if (child.isMesh && child.geometry) {
                const geo = child.geometry.clone();
                geo.applyMatrix4(child.matrixWorld);
                geometries.push(geo);
            }
        });
        
        if (geometries.length === 0) {
            throw new Error('No geometry found in model');
        }
        
        if (geometries.length === 1) {
            return geometries[0];
        }
        
        // Merge all geometries
        return mergeBufferGeometries(geometries);
    }
}
```

### 3.2 Scaling Engine

```javascript
// scripts/mold/geometry/scalingEngine.js

import * as THREE from 'three';

export class ScalingEngine {
    
    /**
     * Apply shrinkage compensation scaling
     * @param {THREE.BufferGeometry} geometry - Input geometry
     * @param {Object} shrinkageParams - Shrinkage parameters
     * @returns {THREE.BufferGeometry} - Scaled geometry (cloned)
     */
    static applyCompensation(geometry, shrinkageParams) {
        const { totalPercent, anisotropicEnabled, xyPercent, zPercent } = shrinkageParams;
        
        const scaled = geometry.clone();
        
        // Compute center for scaling
        scaled.computeBoundingBox();
        const center = new THREE.Vector3();
        scaled.boundingBox.getCenter(center);
        
        const position = scaled.getAttribute('position');
        const vertex = new THREE.Vector3();
        
        if (anisotropicEnabled) {
            // Anisotropic scaling
            const xyScale = this.computeScaleFactor(xyPercent);
            const zScale = this.computeScaleFactor(zPercent);
            
            for (let i = 0; i < position.count; i++) {
                vertex.fromBufferAttribute(position, i);
                vertex.sub(center);
                vertex.x *= xyScale;
                vertex.z *= xyScale;
                vertex.y *= zScale;  // Y is vertical
                vertex.add(center);
                position.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
        } else {
            // Uniform scaling
            const scale = this.computeScaleFactor(totalPercent);
            
            for (let i = 0; i < position.count; i++) {
                vertex.fromBufferAttribute(position, i);
                vertex.sub(center);
                vertex.multiplyScalar(scale);
                vertex.add(center);
                position.setXYZ(i, vertex.x, vertex.y, vertex.z);
            }
        }
        
        position.needsUpdate = true;
        scaled.computeBoundingBox();
        scaled.computeVertexNormals();
        
        return scaled;
    }

    /**
     * Compute scale factor from shrinkage percentage
     * Formula: ScaleFactor = 1 / (1 - shrinkage/100)
     * 
     * Example: 12% shrinkage → 1/(1-0.12) = 1.136
     * A 100mm vessel becomes 113.6mm in the mold
     */
    static computeScaleFactor(shrinkagePercent) {
        return 1 / (1 - shrinkagePercent / 100);
    }
}
```

### 3.3 Boolean Partitioner (CSG Operations)

```javascript
// scripts/mold/geometry/booleanPartitioner.js

import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

export class BooleanPartitioner {
    constructor() {
        this.evaluator = new Evaluator();
    }

    /**
     * Generate complete 4-part mold from vessel geometry
     * @param {THREE.BufferGeometry} vesselGeometry - Scaled vessel
     * @param {Object} moldParams - Mold parameters
     * @returns {Object} - { foot, walls: [wall1, wall2, wall3] }
     */
    generateMoldParts(vesselGeometry, moldParams) {
        const { plasterWallThickness, spareHeight, spareTaper } = moldParams.mold;
        const { cutMode, manualCutHeight, draftAngle, tenonHeight } = moldParams.foot;
        
        // 1. Compute bounding cylinder
        vesselGeometry.computeBoundingBox();
        const bounds = vesselGeometry.boundingBox;
        const height = bounds.max.y - bounds.min.y;
        const radius = Math.max(
            Math.abs(bounds.max.x), Math.abs(bounds.min.x),
            Math.abs(bounds.max.z), Math.abs(bounds.min.z)
        );
        
        // 2. Create mold volume (bounding cylinder - vessel)
        const moldRadius = radius + plasterWallThickness;
        const moldHeight = height + spareHeight;
        
        const boundingCylinder = this.createCylinder(moldRadius, moldHeight, 64);
        const vesselBrush = new Brush(vesselGeometry);
        const cylinderBrush = new Brush(boundingCylinder);
        
        const moldVolume = this.evaluator.evaluate(
            cylinderBrush, vesselBrush, SUBTRACTION
        );
        
        // 3. Detect or use manual foot cut height
        const footCutHeight = cutMode === 'auto'
            ? this.detectFootRing(vesselGeometry)
            : height * (manualCutHeight / 100);
        
        // 4. Separate foot from walls
        const { footVolume, wallVolume } = this.separateFoot(
            moldVolume.geometry,
            footCutHeight,
            tenonHeight
        );
        
        // 5. Segment walls into 3 parts (120° each)
        const walls = this.segmentWalls(wallVolume, moldParams);
        
        return {
            foot: footVolume,
            walls,
            footCutHeight
        };
    }

    /**
     * Detect foot ring position by analyzing profile
     */
    detectFootRing(geometry) {
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        const height = bounds.max.y - bounds.min.y;
        
        // Sample radii at different heights in bottom 20%
        const samples = 20;
        const position = geometry.getAttribute('position');
        const radii = [];
        
        for (let i = 0; i < samples; i++) {
            const y = bounds.min.y + (height * 0.2 * i / samples);
            let maxRadius = 0;
            
            // Find max radius at this height (within tolerance)
            for (let j = 0; j < position.count; j++) {
                const py = position.getY(j);
                if (Math.abs(py - y) < height * 0.01) {
                    const r = Math.sqrt(
                        position.getX(j) ** 2 + position.getZ(j) ** 2
                    );
                    maxRadius = Math.max(maxRadius, r);
                }
            }
            
            radii.push({ y, radius: maxRadius });
        }
        
        // Find local minimum (foot ring dip)
        let minIdx = 0;
        for (let i = 1; i < radii.length - 1; i++) {
            if (radii[i].radius < radii[minIdx].radius) {
                minIdx = i;
            }
        }
        
        // Cut plane at foot ring top + 2mm clearance
        return radii[minIdx].y + 2;
    }

    /**
     * Separate foot from wall volume at cut plane
     */
    separateFoot(moldGeometry, cutHeight, tenonHeight) {
        // Create cutting plane
        const cuttingPlane = new THREE.Plane(
            new THREE.Vector3(0, 1, 0),
            -cutHeight
        );
        
        // Clip below and above plane
        const footVolume = this.clipGeometry(moldGeometry, cuttingPlane, 'below');
        const wallVolume = this.clipGeometry(moldGeometry, cuttingPlane, 'above');
        
        // Add tenon ring to foot top
        // (Implementation: create ring geometry, boolean union with foot)
        
        return { footVolume, wallVolume };
    }

    /**
     * Segment wall volume into 3 x 120° parts
     */
    segmentWalls(wallGeometry, moldParams) {
        const walls = [];
        const angleStep = (Math.PI * 2) / 3;  // 120°
        
        for (let i = 0; i < 3; i++) {
            const startAngle = i * angleStep;
            const endAngle = (i + 1) * angleStep;
            
            // Create wedge volume
            const wedge = this.createWedge(startAngle, endAngle, 500, 500);
            const wallBrush = new Brush(wallGeometry.clone());
            const wedgeBrush = new Brush(wedge);
            
            // Intersect wall with wedge
            const wallSegment = this.evaluator.evaluate(
                wallBrush, wedgeBrush, INTERSECTION
            );
            
            walls.push(wallSegment.geometry);
        }
        
        return walls;
    }

    /**
     * Create cylinder geometry
     */
    createCylinder(radius, height, segments = 64) {
        const geometry = new THREE.CylinderGeometry(
            radius, radius, height, segments, 1, false
        );
        geometry.translate(0, height / 2, 0);
        return geometry;
    }

    /**
     * Create wedge volume for radial segmentation
     */
    createWedge(startAngle, endAngle, radius, height) {
        const shape = new THREE.Shape();
        
        // Create pie slice shape
        shape.moveTo(0, 0);
        shape.lineTo(Math.cos(startAngle) * radius, Math.sin(startAngle) * radius);
        
        // Arc
        const segments = 32;
        for (let i = 1; i <= segments; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i / segments);
            shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        
        shape.lineTo(0, 0);
        
        // Extrude to height
        const extrudeSettings = { depth: height, bevelEnabled: false };
        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // Rotate to be vertical (Y-up)
        geometry.rotateX(-Math.PI / 2);
        
        return geometry;
    }

    /**
     * Clip geometry by plane
     */
    clipGeometry(geometry, plane, side) {
        // Implementation using three-bvh-csg or custom clipping
        // Returns geometry on specified side of plane
        // ...
        return geometry.clone(); // Placeholder
    }
}
```

### 3.4 Shell Generator

```javascript
// scripts/mold/geometry/shellGenerator.js

import * as THREE from 'three';

export class ShellGenerator {
    
    /**
     * Generate printable shell from mold volume
     * Shell = Offset(MoldVolume, thickness) - MoldVolume
     * 
     * @param {THREE.BufferGeometry} moldVolume - Solid mold part
     * @param {Object} shellParams - Shell parameters
     * @returns {THREE.BufferGeometry} - Shell geometry
     */
    static generateShell(moldVolume, shellParams) {
        const { wallThickness, flangeWidth, boltHoleSize, boltHolesPerFlange } = shellParams;
        
        // 1. Offset geometry outward by shell thickness
        const offsetGeometry = this.offsetGeometry(moldVolume, wallThickness);
        
        // 2. Subtract original to create shell
        // (Using CSG library)
        
        // 3. Add external flanges at seam planes
        const withFlanges = this.addFlanges(offsetGeometry, flangeWidth);
        
        // 4. Add bolt holes
        const withHoles = this.addBoltHoles(withFlanges, boltHoleSize, boltHolesPerFlange);
        
        return withHoles;
    }

    /**
     * Offset geometry along vertex normals
     */
    static offsetGeometry(geometry, distance) {
        const offset = geometry.clone();
        offset.computeVertexNormals();
        
        const position = offset.getAttribute('position');
        const normal = offset.getAttribute('normal');
        const vertex = new THREE.Vector3();
        const norm = new THREE.Vector3();
        
        for (let i = 0; i < position.count; i++) {
            vertex.fromBufferAttribute(position, i);
            norm.fromBufferAttribute(normal, i);
            
            vertex.add(norm.multiplyScalar(distance));
            position.setXYZ(i, vertex.x, vertex.y, vertex.z);
        }
        
        position.needsUpdate = true;
        offset.computeVertexNormals();
        
        return offset;
    }

    /**
     * Add flange geometry at radial cut planes
     */
    static addFlanges(geometry, flangeWidth) {
        // Identify flange positions (at 0°, 120°, 240° planes)
        // Create flange geometry
        // Boolean union with shell
        return geometry; // Placeholder
    }

    /**
     * Add bolt holes to flanges
     */
    static addBoltHoles(geometry, holeSize, holesPerFlange) {
        const holeSizes = {
            'M5': 5.5,
            'M6': 6.5,
            'M8': 8.5,
            '1/4-20': 7.0
        };
        
        const radius = holeSizes[holeSize] / 2;
        
        // Create hole cylinders at flange positions
        // Boolean subtract from shell
        return geometry; // Placeholder
    }
}
```

### 3.5 Natch Generator

```javascript
// scripts/mold/geometry/natchGenerator.js

import * as THREE from 'three';

export class NatchGenerator {
    
    /**
     * Generate registration key (natch) geometry
     * Male: hemisphere protrusion
     * Female: hemisphere recess with tolerance
     */
    static generateNatch(params, isMale = true) {
        const { diameter, depth, toleranceOffset } = params;
        
        const radius = isMale 
            ? diameter / 2 
            : (diameter + 2 * toleranceOffset) / 2;
        
        // Create hemisphere
        const geometry = new THREE.SphereGeometry(
            radius,
            16,  // widthSegments
            8,   // heightSegments
            0,
            Math.PI * 2,
            0,
            Math.PI / 2  // hemisphere
        );
        
        return geometry;
    }

    /**
     * Position natches on wall segment
     * @param {number} wallIndex - 0, 1, or 2
     * @param {number} wallHeight - Height of wall section
     * @param {Object} params - Natch parameters
     */
    static getNatchPositions(wallIndex, wallHeight, footCutHeight, params) {
        const { countPerSeam } = params;
        const positions = [];
        
        // Positions at 25%, 50%, 75% of wall height
        const heightFractions = countPerSeam === 2 
            ? [0.25, 0.75]
            : countPerSeam === 3 
                ? [0.2, 0.5, 0.8]
                : [0.5];
        
        const angleStep = (Math.PI * 2) / 3;
        const leadingAngle = wallIndex * angleStep;
        const trailingAngle = (wallIndex + 1) * angleStep;
        
        heightFractions.forEach(fraction => {
            const y = footCutHeight + wallHeight * fraction;
            
            // Male natch on trailing edge
            positions.push({
                type: 'male',
                angle: trailingAngle,
                height: y
            });
            
            // Female natch on leading edge
            positions.push({
                type: 'female',
                angle: leadingAngle,
                height: y
            });
        });
        
        return positions;
    }
}
```

---

## 4. STL Export System

```javascript
// scripts/mold/geometry/moldSTLExporter.js

import { VesselSTLExporter } from '../../vessel/geometry/vesselSTLExporter.js';

export class MoldSTLExporter extends VesselSTLExporter {
    
    /**
     * Export all 4 mold parts as separate STL files
     * @param {Object} moldParts - { foot, walls: [wall1, wall2, wall3] }
     * @param {string} projectName - Base name for files
     */
    static exportAll(moldParts, projectName) {
        const sanitizedName = projectName.replace(/[^a-zA-Z0-9]/g, '_');
        
        // Export foot
        this.exportBinary(
            this.geometryToGroup(moldParts.foot),
            `${sanitizedName}_Shell_Foot.stl`
        );
        
        // Export walls
        moldParts.walls.forEach((wall, index) => {
            this.exportBinary(
                this.geometryToGroup(wall),
                `${sanitizedName}_Shell_Wall_${index + 1}.stl`
            );
        });
    }

    /**
     * Export as ZIP archive containing all STL files
     */
    static async exportAsZip(moldParts, projectName) {
        // Uses JSZip library
        const JSZip = await import('jszip');
        const zip = new JSZip.default();
        
        const sanitizedName = projectName.replace(/[^a-zA-Z0-9]/g, '_');
        
        // Add foot STL
        const footBlob = this.geometryToSTLBinary(moldParts.foot);
        zip.file(`${sanitizedName}_Shell_Foot.stl`, footBlob);
        
        // Add wall STLs
        moldParts.walls.forEach((wall, index) => {
            const wallBlob = this.geometryToSTLBinary(wall);
            zip.file(`${sanitizedName}_Shell_Wall_${index + 1}.stl`, wallBlob);
        });
        
        // Generate and download ZIP
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        this.downloadBlob(zipBlob, `${sanitizedName}_MoldShells.zip`, 'application/zip');
    }

    /**
     * Wrap geometry in a Group for export
     */
    static geometryToGroup(geometry) {
        const group = new THREE.Group();
        const mesh = new THREE.Mesh(geometry);
        group.add(mesh);
        return group;
    }
}
```

---

## 5. Project Storage Integration

```javascript
// Add to scripts/dashboard/projectStorage.js

const MOLD_PROJECTS_STORAGE_KEY = 'playground_ceramics_mold_projects';

/**
 * Get mold projects
 */
export function getMoldProjects() {
    try {
        const data = localStorage.getItem(MOLD_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            return projects.map(p => ({
                id: p.id || p.project?.id,
                projectName: p.project?.name || 'Untitled Mold',
                dateCreated: p.project?.dateCreated || p.dateCreated,
                lastModified: p.project?.lastModified || p.lastModified,
                thumbnail: p.thumbnail || null,
                appType: 'mold',
                moldData: p
            })).sort((a, b) => 
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load mold projects:', e);
    }
    return [];
}

/**
 * Save mold project
 */
export function saveMoldProject(projectData) {
    let projects = [];
    try {
        const data = localStorage.getItem(MOLD_PROJECTS_STORAGE_KEY);
        if (data) projects = JSON.parse(data);
    } catch (e) {}
    
    const projectId = projectData.id || projectData.project?.id || generateId();
    const now = new Date().toISOString();
    
    const normalized = {
        ...projectData,
        id: projectId,
        project: {
            ...projectData.project,
            id: projectId,
            lastModified: now,
            dateCreated: projectData.project?.dateCreated || now
        }
    };
    
    const existingIdx = projects.findIndex(p => 
        (p.id || p.project?.id) === projectId
    );
    
    if (existingIdx >= 0) {
        projects[existingIdx] = normalized;
    } else {
        projects.push(normalized);
    }
    
    localStorage.setItem(MOLD_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    return normalized;
}

// Update getAllProjects() to include mold projects
export function getAllProjects() {
    const dinnerwareProjects = getDinnerwareProjects();
    const handleProjects = getHandleProjects();
    const vesselProjects = getVesselProjects();
    const moldProjects = getMoldProjects();  // Add this
    
    const allProjects = [
        ...dinnerwareProjects, 
        ...handleProjects, 
        ...vesselProjects,
        ...moldProjects  // Add this
    ];
    
    return allProjects.sort((a, b) => 
        new Date(b.lastModified) - new Date(a.lastModified)
    );
}
```

---

## 6. Three.js Viewport

```javascript
// scripts/mold/ui/moldViewport.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import moldState from '../state/moldState.js';

export class MoldViewport {
    constructor(container) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.moldGroup = null;
        
        this.partColors = {
            foot: 0xC45C26,    // Terracotta
            wall1: 0x7D9B76,  // Sage Green
            wall2: 0x6B8BA4,  // Dusty Blue
            wall3: 0x9C9588,  // Warm Gray
            natch: 0xD4A84B   // Gold
        };
        
        this.init();
        this.setupSubscriptions();
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
            preserveDrawingBuffer: true  // For screenshots
        });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);
        
        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 2000;
        
        // Lighting
        this.setupLighting();
        
        // Grid
        this.setupGrid();
        
        // Mold group
        this.moldGroup = new THREE.Group();
        this.scene.add(this.moldGroup);
        
        // Start render loop
        this.animate();
        
        // Handle resize
        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(100, 200, 100);
        keyLight.castShadow = true;
        this.scene.add(keyLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-100, 100, -100);
        this.scene.add(fillLight);
    }

    setupGrid() {
        const gridHelper = new THREE.GridHelper(400, 40, 0x444444, 0x333333);
        gridHelper.position.y = 0;
        this.scene.add(gridHelper);
    }

    setupSubscriptions() {
        // Subscribe to output changes
        moldState.subscribe('output', () => this.updateMeshes());
        
        // Subscribe to view mode changes
        moldState.subscribe('view.mode', () => this.updateViewMode());
    }

    updateMeshes() {
        // Clear existing
        while (this.moldGroup.children.length > 0) {
            const child = this.moldGroup.children[0];
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
            this.moldGroup.remove(child);
        }
        
        const output = moldState.getState('output');
        if (!output.footShell) return;
        
        // Add foot mesh
        const footMesh = this.createMesh(output.footShell, this.partColors.foot);
        footMesh.name = 'foot';
        this.moldGroup.add(footMesh);
        
        // Add wall meshes
        output.wallShells.forEach((wallGeo, index) => {
            if (wallGeo) {
                const wallMesh = this.createMesh(wallGeo, this.partColors[`wall${index + 1}`]);
                wallMesh.name = `wall${index + 1}`;
                this.moldGroup.add(wallMesh);
            }
        });
        
        this.updateViewMode();
    }

    createMesh(geometry, color) {
        const material = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.7,
            metalness: 0.0,
            side: THREE.DoubleSide
        });
        
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        return mesh;
    }

    updateViewMode() {
        const viewMode = moldState.getState('view.mode');
        const footCutHeight = moldState.getState('computed.footCutHeight') || 20;
        
        // Position parts based on view mode
        this.moldGroup.children.forEach(mesh => {
            if (viewMode === 'exploded') {
                // Exploded view positioning
                if (mesh.name === 'foot') {
                    mesh.position.set(0, -30, 0);
                } else if (mesh.name === 'wall1') {
                    mesh.position.set(50, footCutHeight, 0);
                } else if (mesh.name === 'wall2') {
                    mesh.position.set(-25, footCutHeight, 43);
                } else if (mesh.name === 'wall3') {
                    mesh.position.set(-25, footCutHeight, -43);
                }
            } else {
                // Assembly view - all parts at origin
                mesh.position.set(0, 0, 0);
            }
        });
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Capture viewport as thumbnail
     */
    captureThumbnail(width = 256, height = 256) {
        const canvas = this.renderer.domElement;
        
        // Create temporary canvas for resizing
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const ctx = tempCanvas.getContext('2d');
        
        ctx.drawImage(canvas, 0, 0, width, height);
        return tempCanvas.toDataURL('image/png');
    }
}
```

---

## 7. Performance Considerations

### 7.1 Geometry Optimization

```javascript
// Use BufferGeometry throughout
// Merge geometries where possible
// Dispose unused geometries immediately

function disposeGeometry(geometry) {
    if (geometry.dispose) {
        geometry.dispose();
    }
    // Clear references
    geometry = null;
}

function disposeMesh(mesh) {
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
        } else {
            mesh.material.dispose();
        }
    }
}
```

### 7.2 Debounced Updates

```javascript
// Debounce parameter changes to prevent excessive recalculation
const debouncedRegenerate = debounce(() => {
    regenerateMold();
}, 150);

function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}
```

### 7.3 Web Worker for CSG

```javascript
// Heavy CSG operations can be offloaded to Web Worker
// scripts/mold/workers/csgWorker.js

self.onmessage = async (event) => {
    const { operation, geometryData, params } = event.data;
    
    // Import CSG library
    const { Evaluator, Brush, SUBTRACTION } = await import('three-bvh-csg');
    
    // Perform CSG operation
    // ...
    
    // Return result
    self.postMessage({ result: resultData });
};
```

---

## 8. Testing Strategy

### 8.1 Unit Tests

```javascript
// tests/mold/scalingEngine.test.js

import { ScalingEngine } from '../scripts/mold/geometry/scalingEngine.js';

describe('ScalingEngine', () => {
    test('computes correct scale factor for 12% shrinkage', () => {
        const factor = ScalingEngine.computeScaleFactor(12);
        expect(factor).toBeCloseTo(1.136, 3);
    });
    
    test('computes correct scale factor for 0% shrinkage', () => {
        const factor = ScalingEngine.computeScaleFactor(0);
        expect(factor).toBe(1);
    });
    
    test('applies uniform scaling correctly', () => {
        // Create test geometry
        // Apply scaling
        // Verify dimensions
    });
});
```

### 8.2 Integration Tests

```javascript
// tests/mold/integration.test.js

describe('Mold Generation Pipeline', () => {
    test('generates 4 valid parts from cylinder input', async () => {
        // Create cylinder geometry
        // Run through full pipeline
        // Verify 4 output geometries exist
        // Verify each is manifold
    });
});
```

---

## 9. Dependencies

### 9.1 Package Requirements

```json
// Add to package.json dependencies
{
    "three": "^0.160.0",
    "three-bvh-csg": "^0.0.16"
}
```

### 9.2 CDN Alternatives

```html
<!-- If not using npm -->
<script type="importmap">
{
    "imports": {
        "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
        "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/"
    }
}
</script>
```

---

*Document Version: 1.0.0*  
*Last Updated: December 2024*  
*Author: Playground Ceramics Team*

