# Master Mold Generator - Product Specification

## 1. Executive Summary

### 1.1 Purpose
The Master Mold Generator is a specialized application within the Playground Ceramics platform that transforms vessel geometry into 3D-printable mold shells for slip casting. It automates the complex task of decomposing a rotationally symmetric vessel into a four-part mold system optimized for plaster casting.

### 1.2 Target Users
- **Primary**: Professional ceramicists with slip casting experience
- **Secondary**: Production potters transitioning to mold-making
- **Tertiary**: Ceramic educators and students in production ceramics programs

### 1.3 Core Value Proposition
- Automated 4-part mold decomposition from any compatible vessel geometry
- 3D-printable shells eliminating traditional model-making skills requirement
- Integrated spare (slip well) generation for proper casting workflow
- Shrinkage compensation built into the workflow
- Registration key system ensuring precise mold alignment

### 1.4 Platform Integration
The Master Mold Generator integrates with the Playground Ceramics ecosystem:
- Direct import from Vessel Generator and Dinnerware Designer
- External STL/OBJ file support for third-party models
- Shared project storage and naming conventions
- Consistent UI/UX patterns across applications

---

## 2. Mold Architecture Specification

### 2.1 Four-Part Mold System Overview

The mold decomposes into four distinct manufacturing volumes:

```
        [Spare/Slip Well - integrated into walls]
                    ↑
    ┌───────────────────────────────┐
    │                               │
    │   Wall 1 (0°-120°)            │
    │   Wall 2 (120°-240°)          │  ← Parts B, C, D
    │   Wall 3 (240°-360°)          │
    │                               │
    ├───────────────────────────────┤  ← Foot/Wall separation plane
    │         Foot                  │  ← Part A
    └───────────────────────────────┘
```

### 2.2 Part A: Foot Component

The foot component forms the base of the mold and establishes the datum plane for the entire assembly.

#### 2.2.1 Cut Plane Logic
- **Auto-detection**: Algorithm identifies the foot ring transition point by analyzing:
  - Rate of change in radius along Z-axis
  - Inflection points in the profile curve
  - Minimum local diameter within bottom 20% of vessel height
- **Manual override**: User-adjustable cut height slider (0-30% of total height)
- **Default behavior**: Cut plane at detected foot ring top + 2mm clearance

#### 2.2.2 Geometric Features
| Feature | Specification |
|---------|---------------|
| Draft angle | 5° outward from vertical (facilitates mold release) |
| Top flange | 25mm wide horizontal surface for wall seating |
| Registration keys | Female (recessed) at 0°, 120°, 240° positions |
| Key geometry | Hemispherical, 10mm diameter, 5mm depth |
| Flange thickness | Matches plaster wall thickness parameter |

#### 2.2.3 Tenon Geometry
The foot includes a raised tenon ring that locks into a corresponding groove in the wall sections:
- **Tenon height**: 8mm
- **Tenon width**: 5mm
- **Position**: Inner edge of flange
- **Purpose**: Prevents lateral movement during casting

### 2.3 Parts B, C, D: Radial Wall Components

Three identical-arc wall sections, each spanning 120° of the vessel circumference.

#### 2.3.1 Radial Segmentation
- **Cutting planes**: Vertical planes through vessel centerline at 0°, 120°, 240°
- **Plane orientation**: Each plane extends from center axis to beyond mold exterior
- **Segment assignment**:
  - Wall 1: 0° to 120°
  - Wall 2: 120° to 240°
  - Wall 3: 240° to 360° (0°)

#### 2.3.2 Seam Flanges
| Feature | Specification |
|---------|---------------|
| Flange width | 25-30mm (user configurable) |
| Flange type | Planar extension from cut plane |
| Bolt holes | 2 per flange, M6 or 1/4"-20 clearance |
| Hole spacing | 15mm from flange edges |
| Hole pattern | Centered on flange width |

#### 2.3.3 Inter-Wall Registration (Natches)
Adjacent wall sections interlock via male/female natch pairs:

```
Wall 1 (trailing edge)    Wall 2 (leading edge)
        │                        │
        │  ╭──╮                  │
        │  │  │ ←── Male key     │
        ├──┴──┤                  │
        │                  ╭─────┤
        │     Female key ──→     │
        │                  ╰─────┤
        │                        │
```

- **Male natch**: Hemispherical protrusion, 10mm diameter, 5mm height
- **Female natch**: Hemispherical recess, 10.4mm diameter (0.2mm tolerance per side)
- **Natch positions**: 2 per seam, at 25% and 75% of wall height
- **Assignment pattern**:
  - Wall 1: Male on 120° edge, Female on 0° edge
  - Wall 2: Male on 240° edge, Female on 120° edge
  - Wall 3: Male on 0° edge, Female on 240° edge

### 2.4 Integrated Spare (Slip Well)

The spare provides the reservoir for slip during casting and compensates for clay shrinkage.

#### 2.4.1 Geometry Generation
1. **Rim detection**: Identify top naked edge of vessel geometry
2. **Profile extraction**: Sample rim edge at regular angular intervals
3. **Loft extension**: Extrude rim profile vertically upward
4. **Height**: User-configurable, default 40-50mm
5. **Taper**: Optional 2-5° outward draft for easier unmolding

#### 2.4.2 Integration with Walls
- Spare geometry is generated as a continuous extension of wall geometry
- Split by the same radial planes (0°, 120°, 240°) as walls
- Each wall section includes its corresponding 120° spare segment
- Seam flanges extend through spare region

---

## 3. Input Processing Module

### 3.1 Input Sources

#### 3.1.1 Platform Imports
- **Vessel Generator**: Direct geometry transfer via shared state
- **Dinnerware Designer**: Direct geometry transfer via shared state
- **Project files**: Load from `.pgc` project format

#### 3.1.2 External Files
| Format | Extension | Support Level |
|--------|-----------|---------------|
| STL (Binary) | .stl | Full |
| STL (ASCII) | .stl | Full |
| OBJ | .obj | Geometry only (no materials) |

### 3.2 Geometry Validation

#### 3.2.1 Manifold Analysis
Watertight mesh verification using Euler characteristic:

```
χ = V - E + F = 2 (for closed manifold)

Where:
  V = vertex count
  E = edge count  
  F = face count
```

**Validation checks**:
- Euler characteristic equals 2
- No non-manifold edges (edges with ≠ 2 adjacent faces)
- No non-manifold vertices (vertices with discontinuous face fans)
- Consistent face winding (all normals point outward)

#### 3.2.2 Repair Operations
If validation fails, offer automatic repair:

1. **Hole filling**: Voxel-based remeshing at detected boundary edges
2. **Normal correction**: Flip faces with inward-pointing normals
3. **Degenerate removal**: Delete zero-area triangles
4. **Duplicate cleanup**: Merge coincident vertices within tolerance (0.001mm)

### 3.3 Auto-Orientation

#### 3.3.1 Orientation Detection
Algorithm to determine vessel up-axis:

1. Compute oriented bounding box (OBB)
2. Identify principal axes by length
3. Assume longest axis perpendicular to base
4. Detect open end by comparing face density at axis extremes
5. Orient open end upward (+Z)

#### 3.3.2 User Confirmation
- Display detected orientation in preview
- Provide rotation controls (90° increments around X, Y, Z)
- "Confirm Orientation" button before proceeding

---

## 4. Parameter System

### 4.1 Shrinkage Compensation

| Parameter | Type | Default | Range | Unit |
|-----------|------|---------|-------|------|
| Total Shrinkage | Slider | 12 | 5-20 | % |
| Anisotropic Mode | Toggle | Off | - | - |
| X/Y Shrinkage | Slider | 12 | 5-20 | % |
| Z Shrinkage | Slider | 12 | 5-20 | % |

**Scaling Formula**:
```
ScaleFactor = 1 / (1 - Shrinkage% / 100)

Example: 12% shrinkage
ScaleFactor = 1 / (1 - 0.12) = 1 / 0.88 = 1.136

A 100mm vessel becomes 113.6mm in the mold
```

**Anisotropic Mode**: When enabled, allows separate X/Y (radial) and Z (vertical) shrinkage values to account for directional shrinkage differences in specific clay bodies.

### 4.2 Mold Dimensions

| Parameter | Type | Default | Range | Unit |
|-----------|------|---------|-------|------|
| Plaster Wall Thickness | Slider | 30 | 20-50 | mm |
| Spare Height | Slider | 45 | 30-80 | mm |
| Spare Taper | Slider | 3 | 0-10 | ° |

### 4.3 Foot Configuration

| Parameter | Type | Default | Range | Unit |
|-----------|------|---------|-------|------|
| Cut Height Mode | Dropdown | Auto | Auto/Manual | - |
| Manual Cut Height | Slider | - | 0-30 | % of height |
| Foot Draft Angle | Slider | 5 | 0-15 | ° |
| Tenon Height | Slider | 8 | 5-15 | mm |

### 4.4 Registration Keys

| Parameter | Type | Default | Range | Unit |
|-----------|------|---------|-------|------|
| Natch Diameter | Slider | 10 | 6-15 | mm |
| Natch Depth | Slider | 5 | 3-10 | mm |
| Tolerance Offset | Slider | 0.2 | 0.1-0.5 | mm |
| Natches Per Seam | Dropdown | 2 | 1-4 | - |

### 4.5 Shell Properties

| Parameter | Type | Default | Range | Unit |
|-----------|------|---------|-------|------|
| Shell Wall Thickness | Slider | 1.5 | 1.2-3.0 | mm |
| Flange Width | Slider | 28 | 20-40 | mm |
| Bolt Hole Size | Dropdown | M6 | M5/M6/M8/1/4"-20 | - |
| Bolt Holes Per Flange | Dropdown | 2 | 1-3 | - |

---

## 5. Geometry Engine

### 5.1 Processing Pipeline

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Input     │ → │   Scale     │ → │  Boolean    │ → │   Shell     │
│  Geometry   │    │   Engine    │    │ Partition   │    │ Generation  │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
                          │                  │                  │
                          ↓                  ↓                  ↓
                   Shrinkage         4 Mold Volumes      4 Printable
                   Compensated                              Shells
```

### 5.2 Scaling Engine

#### 5.2.1 Uniform Scaling
```javascript
function applyUniformShrinkageCompensation(geometry, shrinkagePercent) {
  const scaleFactor = 1 / (1 - shrinkagePercent / 100);
  
  // Scale from centroid
  const centroid = computeCentroid(geometry);
  
  geometry.vertices.forEach(vertex => {
    vertex.sub(centroid);
    vertex.multiplyScalar(scaleFactor);
    vertex.add(centroid);
  });
  
  return geometry;
}
```

#### 5.2.2 Anisotropic Scaling
```javascript
function applyAnisotropicShrinkage(geometry, xyPercent, zPercent) {
  const xyScale = 1 / (1 - xyPercent / 100);
  const zScale = 1 / (1 - zPercent / 100);
  
  const centroid = computeCentroid(geometry);
  
  geometry.vertices.forEach(vertex => {
    vertex.sub(centroid);
    vertex.x *= xyScale;
    vertex.y *= xyScale;
    vertex.z *= zScale;
    vertex.add(centroid);
  });
  
  return geometry;
}
```

### 5.3 Boolean Partitioning Engine

#### 5.3.1 Mold Volume Generation

1. **Compute bounding cylinder**:
   ```javascript
   const boundingRadius = maxRadialExtent + plasterWallThickness;
   const boundingHeight = vesselHeight + spareHeight + footClearance;
   ```

2. **Create mold solid**:
   ```
   MoldVolume = BoundingCylinder - ScaledVessel
   ```

3. **Result**: Solid representing plaster that would fill the space around the vessel

#### 5.3.2 Foot Separation

```javascript
function separateFoot(moldVolume, cutHeight) {
  // Create cutting plane at Z = cutHeight
  const cuttingPlane = new THREE.Plane(
    new THREE.Vector3(0, 0, 1),  // Normal pointing up
    -cutHeight                    // Distance from origin
  );
  
  // Split mold volume
  const footVolume = clipGeometryBelow(moldVolume, cuttingPlane);
  const wallVolume = clipGeometryAbove(moldVolume, cuttingPlane);
  
  // Add tenon to foot top surface
  const tenonRing = generateTenonRing(cutHeight, tenonParams);
  footVolume = booleanUnion(footVolume, tenonRing);
  
  // Add tenon groove to wall bottom surface  
  const tenonGroove = generateTenonGroove(cutHeight, tenonParams);
  wallVolume = booleanSubtract(wallVolume, tenonGroove);
  
  return { footVolume, wallVolume };
}
```

#### 5.3.3 Radial Wall Segmentation

```javascript
function segmentWalls(wallVolume, segments = 3) {
  const angleStep = (2 * Math.PI) / segments;  // 120° for 3 segments
  const walls = [];
  
  for (let i = 0; i < segments; i++) {
    const startAngle = i * angleStep;
    const endAngle = (i + 1) * angleStep;
    
    // Create wedge volume
    const wedge = createWedgeVolume(startAngle, endAngle, boundingRadius, boundingHeight);
    
    // Intersect with wall volume
    const wallSegment = booleanIntersect(wallVolume, wedge);
    
    // Add flanges at cut planes
    const flange1 = createFlange(startAngle, flangeWidth, wallHeight);
    const flange2 = createFlange(endAngle, flangeWidth, wallHeight);
    wallSegment = booleanUnion(wallSegment, flange1, flange2);
    
    // Add registration keys
    wallSegment = addNatches(wallSegment, i, segments);
    
    walls.push(wallSegment);
  }
  
  return walls;
}
```

#### 5.3.4 Registration Key Generation

```javascript
function addNatches(wallSegment, wallIndex, totalSegments) {
  const leadingEdgeAngle = wallIndex * (2 * Math.PI / totalSegments);
  const trailingEdgeAngle = (wallIndex + 1) * (2 * Math.PI / totalSegments);
  
  // Natch positions along wall height
  const natchHeights = [0.25, 0.75].map(t => footCutHeight + t * wallHeight);
  
  natchHeights.forEach(height => {
    // Male natch on trailing edge
    const maleNatch = createHemisphere(
      natchDiameter / 2,
      trailingEdgeAngle,
      height,
      flangeWidth / 2
    );
    wallSegment = booleanUnion(wallSegment, maleNatch);
    
    // Female natch on leading edge (with tolerance)
    const femaleNatch = createHemisphere(
      (natchDiameter + 2 * toleranceOffset) / 2,
      leadingEdgeAngle,
      height,
      flangeWidth / 2
    );
    wallSegment = booleanSubtract(wallSegment, femaleNatch);
  });
  
  return wallSegment;
}
```

### 5.4 Shell Generation Module

#### 5.4.1 Inversion Process
Transform solid mold volumes into printable shells:

```javascript
function generateShell(moldVolume, shellThickness) {
  // 1. Compute outer boundary
  const outerBoundary = computeBoundingBox(moldVolume).expand(shellThickness);
  
  // 2. Create shell volume
  // Shell = OuterBoundary - MoldVolume (this creates the "negative" space)
  // But we want the shell itself, so:
  // Shell = Offset(MoldVolume, shellThickness) - MoldVolume
  
  const expandedVolume = offsetGeometry(moldVolume, shellThickness);
  const shellVolume = booleanSubtract(expandedVolume, moldVolume);
  
  // 3. Add external features
  shellVolume = addBoltHoles(shellVolume, boltHoleParams);
  shellVolume = addExternalFlanges(shellVolume, flangeParams);
  
  return shellVolume;
}
```

#### 5.4.2 Offset Algorithm
Using vertex normal-based offsetting:

```javascript
function offsetGeometry(geometry, distance) {
  // Compute vertex normals (average of adjacent face normals)
  geometry.computeVertexNormals();
  
  // Offset each vertex along its normal
  const offsetGeometry = geometry.clone();
  
  for (let i = 0; i < offsetGeometry.vertices.length; i++) {
    const vertex = offsetGeometry.vertices[i];
    const normal = offsetGeometry.vertexNormals[i];
    
    vertex.add(normal.multiplyScalar(distance));
  }
  
  // Rebuild faces and fix any self-intersections
  return cleanGeometry(offsetGeometry);
}
```

#### 5.4.3 Bolt Hole Generation

```javascript
function addBoltHoles(shellVolume, params) {
  const { holeSize, holesPerFlange, flangeWidth, edgeOffset } = params;
  
  // Identify flange surfaces (vertical planar faces at radial cut planes)
  const flangeFaces = identifyFlangeFaces(shellVolume);
  
  flangeFaces.forEach(flange => {
    const holePositions = calculateBoltHolePositions(
      flange,
      holesPerFlange,
      edgeOffset
    );
    
    holePositions.forEach(position => {
      // Create through-hole cylinder
      const hole = createCylinder(
        holeSize / 2,  // radius
        flangeWidth * 2,  // height (ensure full penetration)
        position,
        flange.normal
      );
      
      shellVolume = booleanSubtract(shellVolume, hole);
    });
  });
  
  return shellVolume;
}
```

---

## 6. User Interface Specification

### 6.1 Layout Structure

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ┌─ Header ─────────────────────────────────────────────────────────┐   │
│  │  [Logo] Master Mold Generator    Project: [Untitled]    [≡ Menu] │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ Parameter Panel ──────┐  ┌─ Viewport ─────────────────────────────┐ │
│  │                        │  │                                         │ │
│  │  ▼ Input Source        │  │                                         │ │
│  │    ○ From Platform     │  │        ┌─────┐                          │ │
│  │    ○ Import File       │  │        │Foot │                          │ │
│  │    [Import STL/OBJ]    │  │        └─────┘                          │ │
│  │                        │  │    ┌─────┐ ┌─────┐ ┌─────┐              │ │
│  │  ▼ Shrinkage           │  │    │Wall │ │Wall │ │Wall │              │ │
│  │    Total: [===12%===]  │  │    │  1  │ │  2  │ │  3  │              │ │
│  │    □ Anisotropic       │  │    └─────┘ └─────┘ └─────┘              │ │
│  │                        │  │                                         │ │
│  │  ▼ Mold Configuration  │  │    [Exploded View - Color Coded]        │ │
│  │    Wall Thickness:     │  │                                         │ │
│  │    [====30mm====]      │  │                                         │ │
│  │    Spare Height:       │  │                                         │ │
│  │    [====45mm====]      │  │                                         │ │
│  │                        │  │                                         │ │
│  │  ▼ Foot Settings       │  │                                         │ │
│  │    Cut Mode: [Auto ▾]  │  │                                         │ │
│  │    Draft: [===5°===]   │  │                                         │ │
│  │                        │  │                                         │ │
│  │  ▼ Registration Keys   │  │                                         │ │
│  │    Diameter: [==10mm=] │  │                                         │ │
│  │    Tolerance: [=0.2mm] │  │                                         │ │
│  │                        │  │                                         │ │
│  │  ▼ Shell Properties    │  │                                         │ │
│  │    Thickness: [=1.5mm] │  │                                         │ │
│  │    Bolt Size: [M6 ▾]   │  │                                         │ │
│  │                        │  │                                         │ │
│  │  ▼ Warnings            │  │                                         │ │
│  │    ⚠ Large mold size   │  │                                         │ │
│  │                        │  │                                         │ │
│  └────────────────────────┘  └─────────────────────────────────────────┘ │
│                                                                          │
│  ┌─ Footer ─────────────────────────────────────────────────────────┐   │
│  │  [Orbit] [Pan] [Zoom] │ View: [Exploded ▾] │ [Cross-Section]     │   │
│  │  │ [Export All STLs]                                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Header Component

| Element | Behavior |
|---------|----------|
| Logo | Links to Playground Ceramics dashboard |
| App Title | "Master Mold Generator" |
| Project Name | Editable text field, auto-saves |
| Menu Button | Opens dropdown: New, Open, Save, Export, Settings |

### 6.3 Parameter Panel

#### 6.3.1 Collapsible Sections
Each parameter group uses an accordion pattern:
- Click header to expand/collapse
- Chevron icon indicates state (▼ expanded, ▶ collapsed)
- Last state persisted in localStorage

#### 6.3.2 Input Controls

| Control Type | Usage | Interaction |
|--------------|-------|-------------|
| Slider | Continuous values (shrinkage, thickness) | Drag handle, click track, keyboard arrows |
| Dropdown | Discrete options (cut mode, bolt size) | Click to open, select option |
| Toggle | Boolean settings (anisotropic mode) | Click to toggle |
| Button | Actions (Import, Export) | Click to trigger |
| Radio Group | Exclusive selection (input source) | Click to select |

#### 6.3.3 Real-Time Updates
- All parameter changes immediately update the 3D preview
- Debounce slider inputs (150ms) to prevent excessive recalculation
- Show loading indicator during geometry regeneration

### 6.4 Viewport

#### 6.4.1 Rendering Configuration
```javascript
const viewportConfig = {
  renderer: {
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true  // For screenshots
  },
  camera: {
    type: 'perspective',
    fov: 45,
    near: 0.1,
    far: 10000
  },
  controls: {
    type: 'OrbitControls',
    enableDamping: true,
    dampingFactor: 0.05,
    minDistance: 50,
    maxDistance: 2000
  }
};
```

#### 6.4.2 Part Colors
| Part | Color | Hex |
|------|-------|-----|
| Foot | Terracotta | #C45C26 |
| Wall 1 | Sage Green | #7D9B76 |
| Wall 2 | Dusty Blue | #6B8BA4 |
| Wall 3 | Warm Gray | #9C9588 |
| Registration Keys | Gold Highlight | #D4A84B |

#### 6.4.3 View Modes

**Exploded View** (Default):
- Parts separated along their natural pull directions
- Foot positioned below, walls arranged radially
- Separation distance: 30% of mold height

**Assembly View**:
- All parts in final mold configuration
- Registration keys highlighted on hover
- Cross-section plane available

**Cross-Section Mode**:
- Vertical cutting plane through center
- Adjustable rotation (0-180°)
- Interior wall thickness visible

### 6.5 Footer

| Element | Function |
|---------|----------|
| Orbit/Pan/Zoom | Navigation mode buttons (radio group) |
| View Dropdown | Switch between Exploded/Assembly/Cross-Section |
| Export Button | Opens export dialog with all 4 STL files |

---

## 7. Export System

### 7.1 File Naming Convention

```
[ProjectName]_Shell_[PartName].stl

Examples:
  CoffeeMug_Shell_Foot.stl
  CoffeeMug_Shell_Wall_1.stl
  CoffeeMug_Shell_Wall_2.stl
  CoffeeMug_Shell_Wall_3.stl
```

### 7.2 STL Format Specification

| Property | Value |
|----------|-------|
| Format | Binary STL |
| Units | Millimeters |
| Coordinate System | Right-handed, Z-up |
| Origin | Part centroid at XY origin, bottom face at Z=0 |

### 7.3 Print Orientation

Each part is oriented for optimal FDM printing:

| Part | Orientation | Rationale |
|------|-------------|-----------|
| Foot | Flange face down | Maximum flange surface contact with bed |
| Walls | Interior face up | Best surface finish on mold interior |

### 7.4 Export Dialog

```
┌─ Export Mold Shells ──────────────────────────────────────────┐
│                                                               │
│  Project: CoffeeMug                                           │
│                                                               │
│  ☑ CoffeeMug_Shell_Foot.stl         [Preview]                 │
│  ☑ CoffeeMug_Shell_Wall_1.stl       [Preview]                 │
│  ☑ CoffeeMug_Shell_Wall_2.stl       [Preview]                 │
│  ☑ CoffeeMug_Shell_Wall_3.stl       [Preview]                 │
│                                                               │
│  □ Include build instructions (PDF)                           │
│                                                               │
│  [Select All] [Select None]                                   │
│                                                               │
│              [Cancel]  [Download Selected]  [Download ZIP]    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## 8. Technical Specification

### 8.1 Technology Stack

| Component | Technology |
|-----------|------------|
| 3D Rendering | Three.js r152+ |
| CSG Operations | three-bvh-csg |
| UI Framework | Vanilla JS + Custom Components |
| Build Tool | Vite |
| State Management | Custom Observable Pattern |
| File I/O | Native File System API (with fallback) |
| Storage | LocalStorage + IndexedDB |

### 8.2 State Management

Following the established pattern from other Playground Ceramics apps:

```javascript
// scripts/mold/state/moldState.js

const MoldState = {
  // Input
  inputSource: 'platform',  // 'platform' | 'file'
  inputGeometry: null,
  inputFileName: '',
  
  // Shrinkage
  shrinkageTotal: 12,
  shrinkageAnisotropic: false,
  shrinkageXY: 12,
  shrinkageZ: 12,
  
  // Mold dimensions
  plasterWallThickness: 30,
  spareHeight: 45,
  spareTaper: 3,
  
  // Foot configuration
  footCutMode: 'auto',  // 'auto' | 'manual'
  footCutHeight: 0,     // Computed or manual value
  footDraftAngle: 5,
  tenonHeight: 8,
  
  // Registration keys
  natchDiameter: 10,
  natchDepth: 5,
  natchTolerance: 0.2,
  natchesPerSeam: 2,
  
  // Shell properties
  shellThickness: 1.5,
  flangeWidth: 28,
  boltHoleSize: 'M6',
  boltHolesPerFlange: 2,
  
  // View state
  viewMode: 'exploded',  // 'exploded' | 'assembly' | 'crossSection'
  crossSectionAngle: 0,
  
  // Generated geometry
  footShell: null,
  wallShells: [null, null, null],
  
  // Validation
  warnings: [],
  errors: []
};

// Observable implementation
const observers = new Set();

export function getState() {
  return { ...MoldState };
}

export function setState(updates) {
  Object.assign(MoldState, updates);
  notifyObservers();
}

export function subscribe(callback) {
  observers.add(callback);
  return () => observers.delete(callback);
}

function notifyObservers() {
  observers.forEach(cb => cb(getState()));
}
```

### 8.3 Module Structure

```
scripts/
├── mold/
│   ├── state/
│   │   └── moldState.js           # State management
│   ├── geometry/
│   │   ├── inputProcessor.js      # STL/OBJ parsing, validation
│   │   ├── scalingEngine.js       # Shrinkage compensation
│   │   ├── booleanPartitioner.js  # Mold decomposition
│   │   ├── shellGenerator.js      # Shell/offset operations
│   │   └── natchGenerator.js      # Registration key geometry
│   ├── ui/
│   │   ├── parameterPanel.js      # Parameter controls
│   │   ├── viewport.js            # Three.js scene management
│   │   ├── exportDialog.js        # Export UI
│   │   └── warningDisplay.js      # Validation feedback
│   └── main.js                    # App initialization
```

### 8.4 Integration Points

#### 8.4.1 Platform Import
```javascript
// Receiving geometry from other apps
window.addEventListener('message', (event) => {
  if (event.data.type === 'IMPORT_GEOMETRY') {
    const { geometry, projectName, sourceApp } = event.data;
    loadGeometryFromPlatform(geometry, projectName, sourceApp);
  }
});
```

#### 8.4.2 Project Storage
```javascript
// Integration with shared project storage
import { saveProject, loadProject, listProjects } from '../../scripts/dashboard/projectStorage.js';

const projectData = {
  type: 'mold-generator',
  version: '1.0.0',
  state: getState(),
  inputGeometry: serializeGeometry(inputGeometry),
  created: Date.now(),
  modified: Date.now()
};

await saveProject(projectName, projectData);
```

---

## 9. Validation and Warnings

### 9.1 Warning System

| Warning Type | Trigger Condition | Severity | Message |
|--------------|-------------------|----------|---------|
| Undercut Detected | Surface normal > 90° from pull direction | Warning | "Undercut detected on wall surface. May cause plaster lock." |
| Thin Shell | Shell thickness < 1.2mm | Error | "Shell thickness below minimum. Increase to at least 1.2mm." |
| Missing Footring | No foot geometry detected by algorithm | Warning | "No foot ring detected. Using full bottom as foot." |
| Large Mold | Any dimension > 200mm | Info | "Large mold size may require extended print time." |
| Non-Manifold | Euler characteristic ≠ 2 | Error | "Input geometry is not watertight. Repair required." |
| Extreme Shrinkage | Shrinkage > 18% or < 6% | Warning | "Unusual shrinkage value. Verify clay body data." |

### 9.2 Warning Display

```html
<div class="warning-panel">
  <div class="warning-item warning-level-error">
    <span class="warning-icon">⛔</span>
    <span class="warning-message">Shell thickness below minimum.</span>
    <button class="warning-action">Fix</button>
  </div>
  <div class="warning-item warning-level-warning">
    <span class="warning-icon">⚠️</span>
    <span class="warning-message">Undercut detected on wall surface.</span>
    <button class="warning-action">Show</button>
  </div>
  <div class="warning-item warning-level-info">
    <span class="warning-icon">ℹ️</span>
    <span class="warning-message">Large mold size detected.</span>
  </div>
</div>
```

### 9.3 Validation Pipeline

```javascript
function validateMoldConfiguration(state) {
  const warnings = [];
  const errors = [];
  
  // Shell thickness check
  if (state.shellThickness < 1.2) {
    errors.push({
      type: 'THIN_SHELL',
      message: 'Shell thickness below minimum. Increase to at least 1.2mm.',
      action: () => setState({ shellThickness: 1.2 })
    });
  }
  
  // Shrinkage range check
  if (state.shrinkageTotal > 18 || state.shrinkageTotal < 6) {
    warnings.push({
      type: 'EXTREME_SHRINKAGE',
      message: `Unusual shrinkage value (${state.shrinkageTotal}%). Verify clay body data.`
    });
  }
  
  // Undercut analysis
  const undercuts = analyzeUndercuts(state.inputGeometry);
  if (undercuts.length > 0) {
    warnings.push({
      type: 'UNDERCUT_DETECTED',
      message: 'Undercut detected on wall surface. May cause plaster lock.',
      locations: undercuts,
      action: () => highlightUndercuts(undercuts)
    });
  }
  
  // Size check
  const bounds = computeBounds(state.inputGeometry);
  if (Math.max(bounds.x, bounds.y, bounds.z) > 200) {
    warnings.push({
      type: 'LARGE_MOLD',
      message: 'Large mold size may require extended print time.',
      dimensions: bounds
    });
  }
  
  setState({ warnings, errors });
  return errors.length === 0;
}
```

---

## 10. Material Science Recommendations

### 10.1 Recommended 3D Print Materials

| Material | Advantages | Disadvantages | Recommendation |
|----------|------------|---------------|----------------|
| **PLA** | Dimensional stability, low warp, easy to print | Brittle, low heat resistance | **Primary choice** |
| PETG | More durable, chemical resistant | Slightly more warp, stringing | Alternative |
| ABS | Heat resistant, strong | High warp, requires enclosure | Not recommended |

### 10.2 Print Settings

| Parameter | Recommended Value | Rationale |
|-----------|-------------------|-----------|
| Layer Height | 0.12-0.16mm | Fine layers prevent plaster mechanical lock |
| Wall Thickness | 1.2mm minimum (3 perimeters @ 0.4mm) | Structural integrity, water resistance |
| Infill | 0% (shells are already solid walls) | N/A for shell geometry |
| Top/Bottom Layers | 4 minimum | Water sealing on flange surfaces |
| Print Speed | 40-50mm/s | Quality over speed for mold masters |
| Bed Adhesion | Brim (5mm) | Prevent warp on large flat flanges |

### 10.3 Surface Sealing Protocol

Before use, 3D printed shells should be sealed to:
1. Prevent plaster absorption into layer lines
2. Improve surface finish on cast plaster
3. Enable release agent effectiveness

**Recommended Sealants**:
| Product | Application | Dry Time |
|---------|-------------|----------|
| XTC-3D Epoxy | Brush coat, 2 layers | 4 hours |
| Spray Primer (Filler) | 2-3 light coats | 30 min between coats |
| Clear Acrylic | 3 coats, light sand between | 1 hour |

### 10.4 Release Agent Compatibility

| Release Agent | Effectiveness | Notes |
|---------------|---------------|-------|
| Murphy's Oil Soap | Excellent | Traditional, food-safe |
| Ease Release 200 | Excellent | Industrial standard |
| Vaseline (thin coat) | Good | Budget option, harder to clean |
| Cooking Spray | Fair | Can leave residue |

---

## 11. Operational Workflow

### 11.1 Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        MASTER MOLD GENERATOR WORKFLOW                    │
└─────────────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  START       │
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────┐     ┌──────────────────────┐
    │ Import from Platform │ OR  │ Import External STL  │
    └──────────┬───────────┘     └──────────┬───────────┘
               │                            │
               └────────────┬───────────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │  Validate Geometry   │
                 │  (Manifold Check)    │
                 └──────────┬───────────┘
                            │
              ┌─────────────┴─────────────┐
              │ Non-manifold?             │
              │                           │
         Yes  ▼                      No   ▼
    ┌──────────────────┐      ┌──────────────────┐
    │  Repair Dialog   │      │  Auto-Orient     │
    │  (Voxel Remesh)  │      │  + User Confirm  │
    └────────┬─────────┘      └────────┬─────────┘
             │                         │
             └───────────┬─────────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Configure Parameters │
              │  - Shrinkage          │
              │  - Mold thickness     │
              │  - Spare height       │
              │  - Shell options      │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Generate Preview    │
              │  (Real-time update)  │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Review Warnings     │
              │  - Undercuts         │
              │  - Thin walls        │
              │  - Size alerts       │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  Export 4 STL Files  │
              │  - Foot              │
              │  - Wall 1, 2, 3      │
              └──────────┬───────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │     END      │
                  └──────────────┘
```

### 11.2 Time Estimates

| Task | Estimated Time |
|------|----------------|
| Import & validate geometry | 5-30 seconds |
| Parameter configuration | 2-5 minutes |
| Geometry generation | 10-60 seconds |
| Export | 5-15 seconds |
| **Total workflow** | **3-8 minutes** |

---

## 12. Testing Strategy

### 12.1 Unit Tests

| Module | Test Coverage |
|--------|---------------|
| Scaling Engine | Uniform scaling, anisotropic scaling, edge cases (0%, 100%) |
| Boolean Partitioner | Foot separation, radial segmentation, natch placement |
| Shell Generator | Offset operations, flange generation, bolt holes |
| Input Processor | STL parsing, OBJ parsing, manifold validation |

### 12.2 Integration Tests

| Scenario | Validation |
|----------|------------|
| Simple cylinder | All 4 parts generate without errors |
| Complex vessel (from Vessel Generator) | Proper shrinkage compensation, valid shells |
| Non-manifold input | Repair dialog appears, repaired geometry valid |
| Extreme parameters | Warnings display appropriately |

### 12.3 Visual Regression Tests

| Test | Criteria |
|------|----------|
| Exploded view | Parts positioned correctly, colors accurate |
| Assembly view | Parts interlock properly, no gaps |
| Cross-section | Interior surfaces visible, wall thickness accurate |
| Export preview | All files listed, thumbnails render |

### 12.4 Performance Benchmarks

| Operation | Target | Maximum |
|-----------|--------|---------|
| Initial geometry load | < 2s | 5s |
| Parameter change update | < 500ms | 1s |
| Full mold regeneration | < 5s | 15s |
| STL export (all 4 files) | < 3s | 10s |

---

## 13. Accessibility

### 13.1 Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Move between controls |
| Enter/Space | Activate buttons, toggles |
| Arrow keys | Adjust slider values (1% increments) |
| Shift + Arrow | Adjust slider values (10% increments) |
| Escape | Close dialogs, cancel operations |

### 13.2 Screen Reader Support

- All controls have appropriate ARIA labels
- Live regions announce parameter changes
- Warning messages announced immediately
- Export progress communicated via ARIA live regions

### 13.3 Color Considerations

- Part colors chosen for deuteranopia/protanopia distinguishability
- Warning severity indicated by icon shape, not just color
- High contrast mode available in settings

---

## 14. Future Enhancements

### 14.1 Planned Features (v1.1)

- [ ] Two-part mold option (simple geometries)
- [ ] Custom cut plane orientation
- [ ] Multiple spare configurations (top, side)
- [ ] Batch export with print job estimation

### 14.2 Potential Features (v2.0)

- [ ] Undercut resolution suggestions
- [ ] Multi-piece mold for complex geometry (5+ parts)
- [ ] Direct slicer integration (PrusaSlicer, Cura)
- [ ] Mold assembly instructions generator (PDF)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Master Mold** | The original mold from which working molds are cast; also called "mother mold" |
| **Spare** | The reservoir/funnel at the top of a mold that holds excess slip during casting |
| **Slip** | Liquid clay used in slip casting |
| **Natch** | Registration key/notch that ensures mold parts align correctly |
| **Draft Angle** | Taper added to mold walls to facilitate part removal |
| **Undercut** | A geometry feature that prevents straight-pull mold release |
| **Shrinkage** | The reduction in size of clay as it dries and fires |
| **Shell** | The 3D-printable negative mold volume |
| **Flange** | Flat extension on mold parts for clamping/bolting |

---

## Appendix B: Reference Clay Body Shrinkage Values

| Clay Body Type | Typical Total Shrinkage |
|----------------|-------------------------|
| Porcelain | 12-15% |
| Stoneware | 10-13% |
| Earthenware | 8-12% |
| Bone China | 14-17% |
| Paper Clay | 8-10% |

*Note: Always test with specific clay body, as shrinkage varies by manufacturer and firing schedule.*

---

## Appendix C: Bolt Hole Reference

| Standard | Thread | Clearance Hole |
|----------|--------|----------------|
| M5 | 5mm | 5.5mm |
| M6 | 6mm | 6.5mm |
| M8 | 8mm | 8.5mm |
| 1/4"-20 | 6.35mm | 7mm |

---

*Document Version: 1.0.0*
*Last Updated: December 2024*
*Author: Playground Ceramics Team*

