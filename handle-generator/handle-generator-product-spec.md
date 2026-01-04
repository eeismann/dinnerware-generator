# Mug Handle Generator - Product Specification

## 1. Executive Summary

A web-based parametric design tool for creating custom mug handles that integrate with mugs designed in the Playground Ceramics Dinnerware Generator. The app allows users to import mug data from saved projects, design handles with full parametric control, and export handles as STL files for 3D printing.

### 1.1 Target Users
- Ceramic artists designing custom mug collections
- Product designers creating complete drinkware sets
- 3D printing enthusiasts customizing mugs
- Small manufacturers testing handle designs before production

### 1.2 Core Value Proposition
- Seamless integration with Dinnerware Generator mug projects
- Parametric control over all handle dimensions and styling
- Squared handle with rounded corners (Hasami-style) for V1
- Real-time 3D preview with mug body visualization
- Export-ready STL files designed for boolean union with mug
- Local-only web app (no server required, complete privacy)

---

## 2. Handle Types & Styles

### 2.1 Squared Handle with Rounded Corners (Primary - V1)
Reference: Images 1 & 2 (attached reference images)

**Characteristics:**
- Rectangular/angular overall form
- Rounded corners with configurable radius (key differentiator)
- Clean, geometric aesthetic inspired by Hasami Porcelain
- Parallel or tapered sides
- Flat or slightly curved back
- Modern Japanese ceramic design language

This is the primary handle style for V1, reflecting the contemporary aesthetic shown in the reference images.

### 2.2 Future Handle Styles (Post-V1)

The following styles may be added in future versions:

**D-Shaped Handle (Classic)**
Reference: Image 3
- Curved, organic form
- Smooth flowing lines
- Traditional ergonomic shape

**C-Shaped Handle (Loop)**
- Open loop form
- Symmetrical top and bottom attachment
- Classic coffee mug style

**Custom Handle (Advanced)**
- User-defined bezier curve path
- Full control over handle trajectory

---

## 3. Parameter System

### 3.1 Mug Import Parameters (Read-Only)

These parameters are imported from a Dinnerware Generator project and define the mug body that the handle will attach to:

| Parameter | Description | Units |
|-----------|-------------|-------|
| Mug Diameter | Outer diameter of mug body | mm |
| Mug Height | Total height of mug | mm |
| Wall Angle | Angle of mug wall from vertical | ° |
| Wall Thickness | Thickness of mug walls | mm |
| Footring Height | Height of footring origin | mm |

### 3.2 Handle Style Selection

#### 3.2.1 Handle Type (V1)
- **Options**: Squared with Rounded Corners (V1 only)
- **Default**: Squared
- **Future**: D-Shaped, C-Shaped, Custom styles planned for post-V1
- **Behavior**: Style-specific parameters shown based on selection

### 3.2.2 Parameter Behavior

**Independence:**
- All parameters are fully independent (no linked/locked parameters)
- Changing one parameter does not auto-adjust others
- Users have complete manual control over all values

**Smart Defaults:**
- Default values calculated as simple percentages of mug dimensions
- Example: Handle Height defaults to Mug Height × 0.7
- Defaults applied only on initial mug import

**Constraint Handling:**
- Invalid parameter combinations show warnings but are NOT blocked
- User can set any value within the parameter's range
- Warning system alerts user to potential issues (structural, ergonomic, geometric)
- User decides whether to address warnings or proceed

### 3.3 Handle Dimension Parameters

#### 3.3.1 Handle Height
- **Description**: Vertical distance between top and bottom attachment points on the mug
- **Units**: Millimeters (mm)
- **Range**: 30mm to 120mm
- **Default**: Mug Height × 0.7 (simple percentage)
- **Validation**: Warning shown if exceeds mug height minus 20mm (change allowed)

#### 3.3.2 Handle Protrusion
- **Description**: How far the handle extends from the mug body (horizontal depth)
- **Units**: Millimeters (mm)
- **Range**: 20mm to 80mm
- **Default**: 35mm
- **Note**: Measured from mug outer wall to outer edge of handle

#### 3.3.3 Handle Width
- **Description**: Width of the grip opening (finger clearance)
- **Units**: Millimeters (mm)
- **Range**: 20mm to 50mm
- **Default**: 28mm
- **Ergonomic Note**: Minimum 25mm recommended for comfortable 2-3 finger grip

#### 3.3.4 Handle Depth
- **Description**: Vertical dimension of the inner grip opening
- **Units**: Millimeters (mm)
- **Range**: 25mm to 80mm
- **Default**: 45mm (calculated as Handle Height × 0.65)
- **Validation**: Cannot exceed Handle Height minus 20mm

### 3.4 Handle Cross-Section Parameters

#### 3.4.1 Cross-Section Shape
- **Options**: Round, Oval, Squared, D-Profile, Custom
- **Default**: Oval (for Squared/D-Shaped handles), Round (for C-Shaped)
- **Visual**: Real-time 2D profile preview

#### 3.4.2 Cross-Section Width
- **Description**: Horizontal dimension of handle cross-section (thickness of grip)
- **Units**: Millimeters (mm)
- **Range**: 8mm to 25mm
- **Default**: 12mm
- **Ergonomic Note**: 10-15mm provides comfortable grip

#### 3.4.3 Cross-Section Height
- **Description**: Vertical dimension of handle cross-section (depth of grip)
- **Units**: Millimeters (mm)
- **Range**: 8mm to 30mm
- **Default**: 15mm
- **Note**: For round cross-sections, this equals Cross-Section Width

#### 3.4.4 Cross-Section Corner Radius
- **Description**: Radius of corners for squared cross-sections
- **Units**: Millimeters (mm)
- **Range**: 0mm to (Cross-Section Width / 2)
- **Default**: 3mm
- **Applies To**: Squared cross-section only

#### 3.4.5 Cross-Section Taper
- **Description**: Percentage change in cross-section size from top to bottom
- **Units**: Percentage (%)
- **Range**: 50% to 150%
- **Default**: 100% (no taper)
- **Behavior**: 
  - 100% = uniform thickness
  - <100% = thinner at bottom
  - >100% = thicker at bottom

### 3.5 Attachment Point Parameters

#### 3.5.1 Top Attachment Height
- **Description**: Height from mug base to top attachment point
- **Units**: Millimeters (mm)
- **Range**: (Footring Height + 20mm) to (Mug Height - 10mm)
- **Default**: Mug Height - 15mm (near rim)
- **Validation**: Must be greater than Bottom Attachment Height + Handle Depth

#### 3.5.2 Bottom Attachment Height
- **Description**: Height from mug base to bottom attachment point
- **Units**: Millimeters (mm)
- **Range**: (Footring Height + 10mm) to (Top Attachment Height - Handle Depth)
- **Default**: Footring Height + 20mm
- **Validation**: Must be less than Top Attachment Height - Handle Depth

#### 3.5.3 Top Attachment Angle
- **Description**: Angle of handle at top attachment point (relative to horizontal)
- **Units**: Degrees (°)
- **Range**: -45° to 45°
- **Default**: 0° (horizontal)
- **Behavior**: 
  - Negative = angled downward from mug
  - Positive = angled upward from mug

#### 3.5.4 Bottom Attachment Angle
- **Description**: Angle of handle at bottom attachment point (relative to horizontal)
- **Units**: Degrees (°)
- **Range**: -45° to 45°
- **Default**: 0° (horizontal)
- **Behavior**:
  - Negative = angled downward from mug
  - Positive = angled upward from mug

#### 3.5.5 Attachment Blend Radius
- **Description**: Fillet radius where handle meets mug body
- **Units**: Millimeters (mm)
- **Range**: 0mm to 20mm
- **Default**: 8mm
- **Note**: Larger values create smoother transitions; 0mm creates sharp edge

#### 3.5.6 Top Attachment Width
- **Description**: Width of handle at top attachment point
- **Units**: Millimeters (mm)
- **Range**: 10mm to 40mm
- **Default**: Cross-Section Width × 1.2
- **Note**: Often wider than grip for structural strength

#### 3.5.7 Bottom Attachment Width
- **Description**: Width of handle at bottom attachment point
- **Units**: Millimeters (mm)
- **Range**: 10mm to 40mm
- **Default**: Cross-Section Width × 1.2
- **Note**: Often wider than grip for structural strength

### 3.6 Handle Path Parameters

#### 3.6.1 Path Type
- **Options**: Arc, Straight, Compound Curve
- **Default**: Arc (for Squared/D-Shaped), Arc (for C-Shaped)
- **Note**: Squared handles typically use straight segments with rounded corners

#### 3.6.2 Path Curve Amount
- **Description**: How much the handle curves away from the mug (for Arc path)
- **Units**: Percentage (%)
- **Range**: 0% to 100%
- **Default**: 40%
- **Behavior**:
  - 0% = straight line between attachment points
  - 100% = maximum arc bulge

#### 3.6.3 Vertical Offset
- **Description**: How much the handle dips below the straight line between attachments
- **Units**: Millimeters (mm)
- **Range**: -20mm to 30mm
- **Default**: 0mm
- **Behavior**:
  - Negative = handle rises above straight line
  - Positive = handle dips below straight line

### 3.7 Squared Handle Specific Parameters

#### 3.7.1 Handle Corner Radius (Outer)
- **Description**: Radius of outer corners of squared handle
- **Units**: Millimeters (mm)
- **Range**: 5mm to 30mm
- **Default**: 12mm
- **Applies To**: Squared handle type only

#### 3.7.2 Handle Corner Radius (Inner)
- **Description**: Radius of inner corners of squared handle
- **Units**: Millimeters (mm)
- **Range**: 3mm to 25mm
- **Default**: 8mm
- **Applies To**: Squared handle type only

#### 3.7.3 Back Curvature
- **Description**: Amount of curve in the back (outer) edge of handle
- **Units**: Percentage (%)
- **Range**: 0% to 50%
- **Default**: 0% (flat back for squared handles)
- **Applies To**: Squared handle type only
- **Behavior**:
  - 0% = flat/straight back edge
  - 50% = significantly curved back

### 3.8 D-Shaped Handle Specific Parameters (Post-V1)

*The following parameters are planned for the D-Shaped handle style in future versions:*

#### 3.8.1 Upper Curve Tension
- **Description**: Controls the shape of the upper portion of the D-curve
- **Units**: Percentage (%)
- **Range**: 20% to 100%
- **Default**: 60%

#### 3.8.2 Lower Curve Tension
- **Description**: Controls the shape of the lower portion of the D-curve
- **Units**: Percentage (%)
- **Range**: 20% to 100%
- **Default**: 50%

#### 3.8.3 Apex Position
- **Description**: Vertical position of the furthest point of handle protrusion
- **Units**: Percentage (%)
- **Range**: 30% to 70%
- **Default**: 50% (center)

---

## 4. Ergonomic Guidelines & Validation

### 4.1 Finger Clearance Requirements

| Grip Type | Minimum Width | Minimum Depth | Recommended |
|-----------|---------------|---------------|-------------|
| 1 Finger (Espresso) | 18mm | 25mm | 20mm × 30mm |
| 2 Fingers (Standard) | 25mm | 35mm | 28mm × 40mm |
| 3 Fingers (Large) | 30mm | 45mm | 35mm × 50mm |
| 4 Fingers (Stein) | 40mm | 60mm | 45mm × 70mm |

### 4.2 Comfort Recommendations

**Cross-Section:**
- Minimum thickness: 8mm (prevents discomfort during extended use)
- Maximum thickness: 20mm (allows easy grip)
- Oval cross-sections preferred for comfort over squared

**Handle Position:**
- Top attachment near rim preferred for hot beverages (prevents finger burns)
- Balanced center of gravity prevents tipping when held

### 4.3 Structural Requirements

**For 3D Printing (FDM):**
- Minimum cross-section: 10mm (prevents weak points)
- Minimum attachment width: 15mm (structural integrity)
- Minimum blend radius: 3mm (reduces stress concentration)

**Warning Thresholds:**
- Cross-section < 10mm: "Handle may be fragile"
- Attachment width < 12mm: "Attachment may be weak"
- Blend radius < 3mm: "Sharp transitions may cause stress fractures"

---

## 5. User Interface Specification

### 5.1 Layout Structure

The UI mirrors the Dinnerware Generator layout for consistency:

```
┌─────────────────────────────────────────────────────────────┐
│  Header: App Title, Project Name, Save/Load/Export          │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│   Parameter     │          3D Viewport                      │
│   Panel         │                                           │
│   (Left Side)   │     [Handle + Mug Preview]                │
│                 │                                           │
│   - Mug Import  │                                           │
│   - Handle Type │                                           │
│   - Dimensions  │                                           │
│   - Cross-Sec   │                                           │
│   - Attachments │                                           │
│   - Path        │                                           │
│   - Warnings    │                                           │
│                 │                                           │
├─────────────────┴───────────────────────────────────────────┤
│  Footer: View Controls, Cross-Section Toggle, Status        │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Parameter Panel (Left Side)

#### 5.2.1 Panel Sections

1. **Mug Reference** (always visible at top)
   - Currently loaded mug info display (project name, dimensions)
   - Change Mug button (opens import modal)
   - Mug visibility toggle

2. **Handle Style** (expanded by default)
   - Handle type indicator: "Squared with Rounded Corners"
   - (Future: selector for additional styles post-V1)

3. **Handle Dimensions** (expanded by default)
   - Handle Height
   - Handle Protrusion
   - Handle Width (grip opening)
   - Handle Depth

4. **Cross-Section** (collapsed by default)
   - Cross-Section Shape selector
   - Cross-Section Width
   - Cross-Section Height
   - Corner Radius (if applicable)
   - Taper

5. **Attachment Points** (collapsed by default)
   - Top Attachment Height
   - Bottom Attachment Height
   - Top Attachment Angle
   - Bottom Attachment Angle
   - Blend Radius
   - Attachment Widths

6. **Handle Path** (collapsed by default)
   - Path Type
   - Curve Amount
   - Vertical Offset

7. **Style-Specific Parameters** (conditional)
   - Shows parameters specific to selected handle type

8. **Warnings** (always visible when warnings exist)
   - Ergonomic warnings
   - Structural warnings
   - Compatibility warnings

### 5.3 3D Viewport

#### 5.3.1 Default View
- **Default Camera**: Side view to clearly show handle profile
- Camera can be adjusted using standard orbit controls
- Camera presets available: Side (default), 3/4, Top, Bottom

#### 5.3.2 Display Elements
- **Handle Mesh**: Primary focus, full detail, real-time updates
- **Mug Body**: Full quality preview with display mode options (see 5.3.5)
- **Attachment Zone Outlines**: Wireframe showing where handle meets mug (toggleable)
- **Dimension Overlays**: Live metric dimension labels on handle (toggleable)
- **Cross-Section Plane**: Optional slice view

#### 5.3.3 Dimension Overlays
- Display key dimensions directly on handle in viewport:
  - Handle Height (vertical span)
  - Handle Width (grip opening)
  - Handle Protrusion (depth from mug)
- All dimensions shown in millimeters (metric only)
- Toggle visibility via footer control or settings menu
- Non-intrusive positioning to avoid obscuring handle geometry

#### 5.3.4 Attachment Zone Visualization
- Wireframe/outline showing attachment boundaries on mug surface
- Helps users understand where handle will bond to mug body
- Toggle visibility via footer control or settings menu
- Does not affect exported geometry

#### 5.3.5 Mug Display Modes
Accessible via settings menu, user can toggle between:
- **Semi-transparent** (30-50% opacity) - see handle through mug
- **Wireframe/outline only** - minimal visual interference
- **Solid desaturated** - full form, muted color
- **Hidden** - handle only visible

#### 5.3.6 Camera Controls
- Same controls as Dinnerware Generator
- Orbit, Pan, Zoom (unlimited)
- Camera presets: Side (default), 3/4, Top, Bottom

#### 5.3.7 Cross-Section View
- Vertical slice through handle center
- Shows cross-section profile
- Shows attachment blend detail
- Shows wall thickness

#### 5.3.8 Cross-Section Profile Preview (2D Inset)
- Small inset panel in viewport corner
- Shows 2D outline of handle cross-section shape
- Updates in real-time as parameters change
- Always visible (no toggle needed)
- Shows cross-section dimensions

### 5.4 Header Bar

**Contents:**
- **Back to Dashboard**: Returns to Playground Ceramics dashboard
- **App Title**: "Handle Generator"
- **Project Name**: Current project name
- **Unsaved Indicator**: Shows when changes exist
- **Action Buttons**:
  - New Project
  - Save Project
  - Load Project
  - Export STL

### 5.5 Footer Bar

**Contents:**
- **View Controls** (left):
  - Camera preset buttons (Side default, 3/4, Top, Bottom)
  - Cross-section toggle
  - Dimension overlays toggle
  - Attachment outlines toggle
  - Grid toggle
  - Background toggle (light/dark)

- **Settings Menu** (accessible via gear icon):
  - Mug display mode selector (Semi-transparent / Wireframe / Solid / Hidden)

- **Status Info** (right):
  - Handle dimensions summary
  - Warning count (if any)

---

## 6. Mug Import System

### 6.1 Import Sources

Mug data must be imported from an existing Dinnerware Generator project. Manual entry is not supported to ensure handle designs are always properly associated with a source mug project.

#### 6.1.1 From Saved Project (Primary Method)
1. On app launch, import modal appears automatically
2. Modal shows list of saved Dinnerware Generator projects that include a mug
3. Each project card shows:
   - Project name
   - Thumbnail
   - Mug dimensions
   - Last modified date
4. User selects project
5. Mug parameters extracted and loaded
6. Project association stored for reference

#### 6.1.2 From Project File
1. User clicks "Import from File" in import modal
2. File browser opens (.json filter)
3. User selects exported Dinnerware Generator project file
4. Mug parameters extracted from file
5. File must contain valid mug data

**Note**: Manual entry of mug dimensions is not supported. All handles must be associated with a Dinnerware Generator project to maintain design consistency and traceability.

### 6.2 Imported Data Structure

```json
{
  "mugReference": {
    "projectId": "abc123",
    "projectName": "My Dinnerware Set",
    "diameter": 90,
    "height": 100,
    "wallAngle": 15,
    "wallThickness": 2.5,
    "footringHeight": 8,
    "importDate": "2025-12-24T10:30:00Z"
  }
}
```

### 6.3 Mug Preview Generation

When mug data is imported:
1. Generate simplified mug mesh from parameters
2. Display as semi-transparent reference
3. Calculate valid attachment point ranges
4. Update parameter constraints based on mug size

---

## 7. Project Workflow

### 7.1 New Handle Project

1. User opens Handle Generator (via New Project → Handle Generator)
2. **Mug Import Modal appears immediately** (required step)
   - Shows list of Dinnerware Generator projects with mugs
   - User must select a project to continue
   - Cancel returns to dashboard
3. Once mug is imported:
   - Mug parameters loaded and displayed
   - Default squared handle generated based on mug dimensions
   - Handle automatically sized proportionally to mug
4. User adjusts handle parameters
5. Real-time 3D preview updates with mug reference visible

### 7.2 Save Handle Project

**Project File Structure:**
```json
{
  "version": "1.0",
  "appType": "handle-generator",
  "projectName": "Modern Handle",
  "dateCreated": "2025-12-24T10:30:00Z",
  "lastModified": "2025-12-24T15:45:00Z",
  
  "mugReference": {
    "projectId": "abc123",
    "projectName": "My Dinnerware Set",
    "diameter": 90,
    "height": 100,
    "wallAngle": 15,
    "wallThickness": 2.5,
    "footringHeight": 8
  },
  
  "handleStyle": "squared",
  
  "handleDimensions": {
    "height": 70,
    "protrusion": 35,
    "width": 28,
    "depth": 45
  },
  
  "crossSection": {
    "shape": "oval",
    "width": 12,
    "height": 15,
    "cornerRadius": 3,
    "taper": 100
  },
  
  "attachmentPoints": {
    "topHeight": 85,
    "bottomHeight": 15,
    "topAngle": 0,
    "bottomAngle": 0,
    "blendRadius": 8,
    "topWidth": 14,
    "bottomWidth": 14
  },
  
  "handlePath": {
    "type": "arc",
    "curveAmount": 40,
    "verticalOffset": 0
  },
  
  "styleParameters": {
    "outerCornerRadius": 12,
    "innerCornerRadius": 8,
    "backCurvature": 0
  }
}
```

### 7.3 Export STL

**Export Behavior:**
- Handle exports as an independent STL file
- Handle geometry includes attachment surfaces that extend into where the mug body would be
- Designed for boolean union: when combined with mug STL in slicing/modeling software, creates watertight mesh
- Attachment overlap ensures clean boolean operations (no gaps or non-manifold edges)

**Filename Convention:**
- Format: `[HandleProjectName]_handle.stl`
- Example: `ModernSquaredHandle_handle.stl`

**Export Dialog Options:**
- File format: Binary STL (fixed)
- Units: Millimeters (fixed)
- **Orientation** (user choice):
  - **Relative to mug origin**: Y-up, handle extending in +X direction, positioned as if attached to mug
  - **Centered at origin**: Handle centered at 0,0,0 for easier manipulation in CAD software

**Recommended Print Orientation:**
- Handle lying flat on back edge
- OR handle standing with attachment points down

**Boolean Union Note:**
The exported handle mesh includes geometry that overlaps with the mug body at attachment points. Users should perform a boolean union operation in their slicing software or CAD tool to merge the handle with the mug body for a single watertight printable mesh.

---

## 8. Geometry Specifications

### 8.1 Handle Path Generation

#### 8.1.1 Squared Handle Path

**Algorithm:**
1. Calculate attachment points on mug surface
2. Generate corner points based on handle dimensions
3. Create rounded corners using arc segments
4. Subdivide path for smooth mesh

**Path Points:**
```
P1: Top attachment point
P2: Top-outer corner (rounded)
P3: Bottom-outer corner (rounded)
P4: Bottom attachment point
```

#### 8.1.2 D-Shaped Handle Path (Post-V1)

*Planned for future implementation with D-Shaped handle style:*

**Algorithm:**
1. Calculate attachment points
2. Generate bezier curve with control points
3. Control points determined by curve tension and apex position
4. Subdivide for smooth mesh

### 8.2 Cross-Section Sweep

**Method:**
1. Generate 2D cross-section profile
2. Apply taper transformation along path
3. Orient profile perpendicular to path tangent
4. Sweep profile along path to generate mesh
5. Cap ends or blend into attachment zones

### 8.3 Attachment Zone Generation

**Blending Algorithm:**
1. Calculate intersection curve of handle with mug surface
2. Generate fillet geometry using blend radius
3. Ensure manifold connection between handle and mug
4. Smooth normals at junction

### 8.4 Mesh Quality

**Resolution Settings:**
- Path segments: 48 (smooth curves)
- Cross-section segments: 24 (smooth profile)
- Blend segments: 16 (smooth fillets)

**Quality Targets:**
- No visible faceting at standard viewing distance
- Suitable for FDM printing (0.2mm layer height)
- Watertight manifold geometry

---

## 9. Validation & Warnings

### 9.1 Ergonomic Warnings

| Warning | Trigger | Severity |
|---------|---------|----------|
| Grip too narrow | Width < 20mm | Warning |
| Grip too shallow | Depth < 30mm | Warning |
| Handle too thin | Cross-section < 8mm | Warning |
| Handle too thick | Cross-section > 22mm | Info |

### 9.2 Structural Warnings

| Warning | Trigger | Severity |
|---------|---------|----------|
| Weak attachment | Attachment width < 12mm | Warning |
| Sharp transition | Blend radius < 3mm | Warning |
| Fragile handle | Cross-section area < 80mm² | Warning |
| Overhang concern | Angle > 45° from vertical | Info |

### 9.3 Compatibility Warnings

| Warning | Trigger | Severity |
|---------|---------|----------|
| Handle too tall | Height > Mug Height - 15mm | Error |
| Attachment overlap | Top/Bottom too close | Error |
| Invalid position | Attachment below footring | Error |

---

## 10. Dashboard Integration

### 10.1 New Project App Selection

Access to different apps is provided via the **New Project** button on the dashboard:

**New Project Flow:**
1. User clicks "New Project" button (header or empty state)
2. Modal appears with app selection:
   - **Dinnerware Generator** - "Create plates, bowls, mugs, and more"
   - **Handle Generator** - "Design handles for your mugs"
   - (Future apps can be added here)
3. User selects app type
4. Navigates to selected app with new project state

**Modal Design:**
```
┌─────────────────────────────────────────┐
│         Create New Project              │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────┐  ┌─────────────┐       │
│  │   [icon]    │  │   [icon]    │       │
│  │ Dinnerware  │  │   Handle    │       │
│  │  Generator  │  │  Generator  │       │
│  │             │  │             │       │
│  │ Create      │  │ Design      │       │
│  │ plates,     │  │ handles for │       │
│  │ bowls, mugs │  │ your mugs   │       │
│  └─────────────┘  └─────────────┘       │
│                                         │
│                          [Cancel]       │
└─────────────────────────────────────────┘
```

**Button Locations:**
- Header "New Project" button → Opens app selection modal
- Empty state "Create Your First Project" button → Opens app selection modal
- Project grid "New Project" card → Opens app selection modal

### 10.2 Project Storage

**Storage Key Structure:**
- `handle_projects`: Array of handle project metadata
- `handle_current_project`: Auto-saved current state
- `handle_editing_project_id`: Currently editing project ID

**Project Metadata:**
```json
{
  "id": "handle_abc123",
  "projectName": "Modern Handle",
  "appType": "handle-generator",
  "thumbnail": "data:image/png;base64,...",
  "dateCreated": "2025-12-24T10:30:00Z",
  "lastModified": "2025-12-24T15:45:00Z",
  "linkedMugProject": "dinnerware_xyz789"
}
```

---

## 11. Technical Specification

This section provides detailed technical specifications for implementing the Handle Generator application.

### 11.1 Technology Stack

#### 11.1.1 Core Technologies
| Technology | Purpose | Version |
|------------|---------|---------|
| **Vanilla JavaScript** | Application logic | ES6+ |
| **Three.js** | 3D rendering, geometry | r160+ |
| **Vite** | Build tool, dev server | 5.x |
| **CSS3** | Styling, animations | - |

#### 11.1.2 Three.js Dependencies
```javascript
// Required Three.js modules
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
```

#### 11.1.3 Browser Requirements
- WebGL 2.0 support
- ES6+ JavaScript support
- LocalStorage API
- File API (for import/export)
- Modern browsers: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

### 11.2 Application Structure

```
dinnerware-generator/
├── handle-generator/
│   └── index.html                    # Handle Generator entry point
├── scripts/
│   ├── handle/
│   │   ├── handleMain.js             # Application entry, initialization
│   │   ├── geometry/
│   │   │   ├── handleMeshGenerator.js    # Main mesh generation orchestrator
│   │   │   ├── squaredPathGenerator.js   # Squared handle path algorithm
│   │   │   ├── crossSectionBuilder.js    # Cross-section profile generation
│   │   │   ├── profileSweeper.js         # Sweep cross-section along path
│   │   │   └── attachmentBlender.js      # Attachment zone blending
│   │   ├── ui/
│   │   │   ├── handleViewport.js         # 3D viewport management
│   │   │   ├── mugImporter.js            # Mug import modal and logic
│   │   │   ├── crossSectionPreview.js    # 2D inset preview
│   │   │   └── dimensionOverlays.js      # Viewport dimension labels
│   │   ├── state/
│   │   │   └── handleState.js            # State management
│   │   └── utils/
│   │       └── handleValidation.js       # Validation and warnings
│   ├── dashboard/
│   │   └── projectStorage.js         # Extended for handle projects
│   └── ui/
│       └── themeManager.js           # Shared theme management
├── styles/
│   ├── handle-generator.css          # Handle Generator specific styles
│   ├── shared.css                    # Shared UI components
│   └── themes.css                    # Theme definitions
└── vite.config.js                    # Build configuration (updated)
```

### 11.3 Data Structures

#### 11.3.1 Type Definitions

```typescript
// TypeScript-style definitions for documentation (app uses JSDoc)

interface MugReference {
  projectId: string;
  projectName: string;
  diameter: number;      // mm
  height: number;        // mm
  wallAngle: number;     // degrees
  wallThickness: number; // mm
  footringHeight: number; // mm
  importDate: string;    // ISO 8601
}

interface HandleDimensions {
  height: number;      // mm - vertical span between attachments
  protrusion: number;  // mm - depth from mug surface
  width: number;       // mm - grip opening width
  depth: number;       // mm - grip opening depth
}

interface CrossSection {
  shape: 'round' | 'oval' | 'squared' | 'd-profile';
  width: number;        // mm
  height: number;       // mm
  cornerRadius: number; // mm (for squared)
  taper: number;        // percentage (100 = no taper)
}

interface AttachmentPoints {
  topHeight: number;      // mm from mug base
  bottomHeight: number;   // mm from mug base
  topAngle: number;       // degrees from horizontal
  bottomAngle: number;    // degrees from horizontal
  blendRadius: number;    // mm
  topWidth: number;       // mm
  bottomWidth: number;    // mm
}

interface HandlePath {
  type: 'arc' | 'straight' | 'compound';
  curveAmount: number;    // percentage
  verticalOffset: number; // mm
}

interface SquaredStyleParams {
  outerCornerRadius: number; // mm
  innerCornerRadius: number; // mm
  backCurvature: number;     // percentage
}

interface HandleParameters {
  mugReference: MugReference;
  handleStyle: 'squared';  // V1 only
  handleDimensions: HandleDimensions;
  crossSection: CrossSection;
  attachmentPoints: AttachmentPoints;
  handlePath: HandlePath;
  styleParameters: SquaredStyleParams;
}

interface UIState {
  mugDisplayMode: 'transparent' | 'wireframe' | 'solid' | 'hidden';
  showDimensionOverlays: boolean;
  showAttachmentOutlines: boolean;
  crossSectionEnabled: boolean;
  cameraPreset: 'side' | 'three-quarter' | 'top' | 'bottom';
  gridVisible: boolean;
  backgroundLight: boolean;
}

interface ProjectState {
  name: string;
  dateCreated: string;
  lastModified: string;
  isDirty: boolean;
}

interface Warning {
  type: 'ergonomic' | 'structural' | 'compatibility';
  severity: 'info' | 'warning' | 'error';
  message: string;
  parameter?: string;
}

interface AppState {
  parameters: HandleParameters;
  ui: UIState;
  project: ProjectState;
  warnings: Warning[];
}
```

#### 11.3.2 Default Values

```javascript
// scripts/handle/state/handleState.js

export const DEFAULT_HANDLE_PARAMETERS = {
  handleStyle: 'squared',
  
  handleDimensions: {
    height: 70,      // Will be recalculated: mugHeight * 0.7
    protrusion: 35,
    width: 28,
    depth: 45,       // Will be recalculated: height * 0.65
  },
  
  crossSection: {
    shape: 'oval',
    width: 12,
    height: 15,
    cornerRadius: 3,
    taper: 100,
  },
  
  attachmentPoints: {
    topHeight: 85,   // Will be recalculated: mugHeight - 15
    bottomHeight: 15, // Will be recalculated: footringHeight + 7
    topAngle: 0,
    bottomAngle: 0,
    blendRadius: 8,
    topWidth: 14,    // crossSection.width * 1.2
    bottomWidth: 14,
  },
  
  handlePath: {
    type: 'arc',
    curveAmount: 40,
    verticalOffset: 0,
  },
  
  styleParameters: {
    outerCornerRadius: 12,
    innerCornerRadius: 8,
    backCurvature: 0,
  },
};

export const DEFAULT_UI_STATE = {
  mugDisplayMode: 'transparent',
  showDimensionOverlays: true,
  showAttachmentOutlines: true,
  crossSectionEnabled: false,
  cameraPreset: 'side',
  gridVisible: true,
  backgroundLight: false,
};

export const PARAMETER_CONSTRAINTS = {
  handleHeight:      { min: 30, max: 120, step: 1, unit: 'mm' },
  handleProtrusion:  { min: 20, max: 80, step: 1, unit: 'mm' },
  handleWidth:       { min: 20, max: 50, step: 1, unit: 'mm' },
  handleDepth:       { min: 25, max: 80, step: 1, unit: 'mm' },
  crossSectionWidth: { min: 8, max: 25, step: 0.5, unit: 'mm' },
  crossSectionHeight:{ min: 8, max: 30, step: 0.5, unit: 'mm' },
  cornerRadius:      { min: 0, max: 12.5, step: 0.5, unit: 'mm' },
  taper:             { min: 50, max: 150, step: 5, unit: '%' },
  attachmentAngle:   { min: -45, max: 45, step: 1, unit: '°' },
  blendRadius:       { min: 0, max: 20, step: 1, unit: 'mm' },
  attachmentWidth:   { min: 10, max: 40, step: 1, unit: 'mm' },
  outerCornerRadius: { min: 5, max: 30, step: 1, unit: 'mm' },
  innerCornerRadius: { min: 3, max: 25, step: 1, unit: 'mm' },
  backCurvature:     { min: 0, max: 50, step: 5, unit: '%' },
  curveAmount:       { min: 0, max: 100, step: 5, unit: '%' },
  verticalOffset:    { min: -20, max: 30, step: 1, unit: 'mm' },
};
```

### 11.4 Geometry Algorithms

#### 11.4.1 Squared Handle Path Generation

The squared handle consists of four segments with rounded corners:

```
                    ┌─────────────┐
                    │  Top Edge   │
    Top             │             │
    Attachment ─────┼─┐         ┌─┼───── Outer Edge (Back)
    Point           │ │ Corner  │ │
                    │ │ Radius  │ │
                    │ └─────────┘ │
                    │             │
                    │  Inner     │
                    │  Opening   │
                    │             │
                    │ ┌─────────┐ │
    Bottom          │ │ Corner  │ │
    Attachment ─────┼─┘ Radius  └─┼───── 
    Point           │             │
                    │ Bottom Edge │
                    └─────────────┘
```

**Algorithm: `generateSquaredPath(params)`**

```javascript
// scripts/handle/geometry/squaredPathGenerator.js

/**
 * Generates the 3D path for a squared handle with rounded corners
 * @param {HandleParameters} params - Handle parameters
 * @returns {THREE.CurvePath} - Path for cross-section sweep
 */
export function generateSquaredPath(params) {
  const {
    handleDimensions: { height, protrusion, width, depth },
    attachmentPoints: { topHeight, bottomHeight, topAngle, bottomAngle },
    styleParameters: { outerCornerRadius, innerCornerRadius, backCurvature },
    mugReference: { diameter, wallAngle },
  } = params;

  // Calculate mug radius at attachment heights
  const mugRadius = diameter / 2;
  const topMugRadius = calculateMugRadiusAtHeight(mugRadius, wallAngle, topHeight);
  const bottomMugRadius = calculateMugRadiusAtHeight(mugRadius, wallAngle, bottomHeight);

  // Define corner points
  const points = {
    // Top attachment point (on mug surface)
    topAttach: new THREE.Vector3(topMugRadius, topHeight, 0),
    
    // Top outer corner (before rounding)
    topOuter: new THREE.Vector3(topMugRadius + protrusion, topHeight, 0),
    
    // Bottom outer corner (before rounding)
    bottomOuter: new THREE.Vector3(bottomMugRadius + protrusion, bottomHeight, 0),
    
    // Bottom attachment point (on mug surface)
    bottomAttach: new THREE.Vector3(bottomMugRadius, bottomHeight, 0),
  };

  // Apply attachment angles
  points.topAttach = applyAttachmentAngle(points.topAttach, topAngle, 'top');
  points.bottomAttach = applyAttachmentAngle(points.bottomAttach, bottomAngle, 'bottom');

  // Apply back curvature if specified
  if (backCurvature > 0) {
    const curveOffset = (protrusion * backCurvature) / 100;
    const midHeight = (topHeight + bottomHeight) / 2;
    // Outer edge becomes a curve instead of straight line
  }

  // Build path with rounded corners
  const path = new THREE.CurvePath();

  // Segment 1: Top attachment to top-outer corner (with blend at attachment)
  path.add(createLineSegment(points.topAttach, points.topOuter, outerCornerRadius));

  // Segment 2: Top-outer corner arc
  path.add(createCornerArc(points.topOuter, outerCornerRadius, 'top-outer'));

  // Segment 3: Outer edge (back of handle) - straight or curved
  if (backCurvature > 0) {
    path.add(createCurvedSegment(points.topOuter, points.bottomOuter, backCurvature));
  } else {
    path.add(createLineSegment(points.topOuter, points.bottomOuter, outerCornerRadius));
  }

  // Segment 4: Bottom-outer corner arc
  path.add(createCornerArc(points.bottomOuter, outerCornerRadius, 'bottom-outer'));

  // Segment 5: Bottom attachment
  path.add(createLineSegment(points.bottomOuter, points.bottomAttach, outerCornerRadius));

  return path;
}

/**
 * Calculate mug radius at a specific height accounting for wall angle
 */
function calculateMugRadiusAtHeight(baseRadius, wallAngle, height) {
  const angleRad = (wallAngle * Math.PI) / 180;
  return baseRadius + height * Math.tan(angleRad);
}

/**
 * Create a rounded corner arc
 */
function createCornerArc(cornerPoint, radius, position) {
  // Calculate arc center and angles based on corner position
  const arcPoints = calculateArcPoints(cornerPoint, radius, position);
  return new THREE.QuadraticBezierCurve3(
    arcPoints.start,
    arcPoints.control,
    arcPoints.end
  );
}
```

#### 11.4.2 Cross-Section Profile Generation

```javascript
// scripts/handle/geometry/crossSectionBuilder.js

/**
 * Generates a 2D cross-section profile for the handle
 * @param {CrossSection} crossSection - Cross-section parameters
 * @returns {THREE.Shape} - 2D shape for sweeping
 */
export function generateCrossSection(crossSection) {
  const { shape, width, height, cornerRadius } = crossSection;
  
  switch (shape) {
    case 'round':
      return generateRoundProfile(width / 2);
    case 'oval':
      return generateOvalProfile(width / 2, height / 2);
    case 'squared':
      return generateSquaredProfile(width, height, cornerRadius);
    case 'd-profile':
      return generateDProfile(width, height);
    default:
      return generateOvalProfile(width / 2, height / 2);
  }
}

/**
 * Generate oval cross-section (default for squared handles)
 */
function generateOvalProfile(radiusX, radiusY) {
  const shape = new THREE.Shape();
  const segments = 24;
  
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    
    if (i === 0) {
      shape.moveTo(x, y);
    } else {
      shape.lineTo(x, y);
    }
  }
  
  shape.closePath();
  return shape;
}

/**
 * Generate squared cross-section with rounded corners
 */
function generateSquaredProfile(width, height, cornerRadius) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(cornerRadius, hw, hh);
  
  // Start at top-right, go counter-clockwise
  shape.moveTo(hw - r, hh);
  
  // Top edge
  shape.lineTo(-hw + r, hh);
  // Top-left corner
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  
  // Left edge
  shape.lineTo(-hw, -hh + r);
  // Bottom-left corner
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  
  // Bottom edge
  shape.lineTo(hw - r, -hh);
  // Bottom-right corner
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  
  // Right edge
  shape.lineTo(hw, hh - r);
  // Top-right corner
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  
  shape.closePath();
  return shape;
}

/**
 * Generate points for 2D preview inset
 */
export function getCrossSectionPreviewPoints(crossSection) {
  const shape = generateCrossSection(crossSection);
  return shape.getPoints(48);
}
```

#### 11.4.3 Profile Sweep Algorithm

```javascript
// scripts/handle/geometry/profileSweeper.js

/**
 * Sweeps a cross-section profile along a path to create handle geometry
 * @param {THREE.CurvePath} path - Handle path
 * @param {THREE.Shape} profile - Cross-section shape
 * @param {number} taper - Taper percentage (100 = no taper)
 * @param {Object} attachmentWidths - Width at top/bottom attachments
 * @returns {THREE.BufferGeometry} - Handle mesh geometry
 */
export function sweepProfileAlongPath(path, profile, taper, attachmentWidths) {
  const pathSegments = 48;  // Segments along path
  const profileSegments = 24; // Segments around profile
  
  const vertices = [];
  const normals = [];
  const indices = [];
  
  // Get points and tangents along path
  const pathPoints = path.getSpacedPoints(pathSegments);
  const pathLength = path.getLength();
  
  for (let i = 0; i <= pathSegments; i++) {
    const t = i / pathSegments;
    const point = pathPoints[i];
    const tangent = path.getTangentAt(t).normalize();
    
    // Calculate local coordinate frame (Frenet-Serret frame)
    const { normal, binormal } = calculateFrenetFrame(tangent, i, pathPoints);
    
    // Calculate scale at this position (for taper and attachment width)
    const scale = calculateScaleAtT(t, taper, attachmentWidths);
    
    // Generate profile points at this position
    const profilePoints = profile.getPoints(profileSegments);
    
    for (let j = 0; j <= profileSegments; j++) {
      const pp = profilePoints[j % profileSegments];
      
      // Transform profile point to world space
      const worldPoint = new THREE.Vector3()
        .addScaledVector(normal, pp.x * scale.x)
        .addScaledVector(binormal, pp.y * scale.y)
        .add(point);
      
      vertices.push(worldPoint.x, worldPoint.y, worldPoint.z);
      
      // Calculate normal
      const vertexNormal = new THREE.Vector3(pp.x, pp.y, 0)
        .applyMatrix3(new THREE.Matrix3().set(
          normal.x, binormal.x, tangent.x,
          normal.y, binormal.y, tangent.y,
          normal.z, binormal.z, tangent.z
        ))
        .normalize();
      
      normals.push(vertexNormal.x, vertexNormal.y, vertexNormal.z);
    }
  }
  
  // Generate indices for triangles
  for (let i = 0; i < pathSegments; i++) {
    for (let j = 0; j < profileSegments; j++) {
      const a = i * (profileSegments + 1) + j;
      const b = a + profileSegments + 1;
      const c = a + 1;
      const d = b + 1;
      
      // Two triangles per quad
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }
  
  // Create geometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  
  return geometry;
}

/**
 * Calculate scale factor at position t along path
 */
function calculateScaleAtT(t, taper, attachmentWidths) {
  const taperFactor = 1 + (taper - 100) / 100 * (t - 0.5) * 2;
  
  // Interpolate attachment widths
  const widthFactor = THREE.MathUtils.lerp(
    attachmentWidths.top,
    attachmentWidths.bottom,
    t
  );
  
  return {
    x: taperFactor * (widthFactor / attachmentWidths.top),
    y: taperFactor,
  };
}
```

#### 11.4.4 Attachment Blending

```javascript
// scripts/handle/geometry/attachmentBlender.js

/**
 * Creates smooth blend geometry where handle meets mug
 * @param {THREE.BufferGeometry} handleGeometry - Handle mesh
 * @param {MugReference} mugParams - Mug parameters
 * @param {AttachmentPoints} attachmentPoints - Attachment configuration
 * @returns {THREE.BufferGeometry} - Handle with attachment blends
 */
export function createAttachmentBlends(handleGeometry, mugParams, attachmentPoints) {
  const { blendRadius, topHeight, bottomHeight, topWidth, bottomWidth } = attachmentPoints;
  const { diameter, wallAngle, wallThickness } = mugParams;
  
  // Calculate attachment ellipse on mug surface
  const topEllipse = calculateAttachmentEllipse(
    diameter / 2, wallAngle, topHeight, topWidth
  );
  const bottomEllipse = calculateAttachmentEllipse(
    diameter / 2, wallAngle, bottomHeight, bottomWidth
  );
  
  // Generate fillet geometry for top attachment
  const topBlend = generateFilletGeometry(
    handleGeometry,
    topEllipse,
    blendRadius,
    'top'
  );
  
  // Generate fillet geometry for bottom attachment
  const bottomBlend = generateFilletGeometry(
    handleGeometry,
    bottomEllipse,
    blendRadius,
    'bottom'
  );
  
  // Extend handle geometry into mug body for boolean union
  const booleanExtension = createBooleanExtension(
    topEllipse, bottomEllipse, wallThickness
  );
  
  // Merge all geometries
  return mergeGeometries([
    handleGeometry,
    topBlend,
    bottomBlend,
    booleanExtension,
  ]);
}

/**
 * Calculate the ellipse where handle meets curved mug surface
 */
function calculateAttachmentEllipse(baseRadius, wallAngle, height, width) {
  const angleRad = (wallAngle * Math.PI) / 180;
  const radius = baseRadius + height * Math.tan(angleRad);
  
  // Ellipse is stretched vertically due to cylindrical surface
  return {
    center: new THREE.Vector3(radius, height, 0),
    radiusX: width / 2,
    radiusY: width / 2 / Math.cos(angleRad), // Stretched by wall angle
    normal: new THREE.Vector3(Math.cos(angleRad), Math.sin(angleRad), 0),
  };
}

/**
 * Generate fillet (rounded transition) geometry
 */
function generateFilletGeometry(handleGeom, ellipse, radius, position) {
  const segments = 16;
  const vertices = [];
  const indices = [];
  
  // Generate torus-like fillet around attachment ellipse
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const ellipseAngle = u * Math.PI * 2;
    
    // Point on ellipse
    const ex = ellipse.center.x + Math.cos(ellipseAngle) * ellipse.radiusX;
    const ey = ellipse.center.y + Math.sin(ellipseAngle) * ellipse.radiusY;
    
    for (let j = 0; j <= segments / 2; j++) {
      const v = j / (segments / 2);
      const filletAngle = v * Math.PI / 2; // Quarter circle fillet
      
      // Calculate fillet point
      const fx = ex + Math.cos(filletAngle) * radius * Math.cos(ellipseAngle);
      const fy = ey + Math.sin(filletAngle) * radius;
      
      vertices.push(fx, fy, Math.sin(ellipseAngle) * ellipse.radiusX);
    }
  }
  
  // Generate indices...
  // (Similar quad generation as sweep)
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  
  return geometry;
}

/**
 * Create geometry extension that penetrates mug body for boolean union
 */
function createBooleanExtension(topEllipse, bottomEllipse, wallThickness) {
  // Create extruded shapes that extend wallThickness into mug body
  // This ensures clean boolean union in external software
  
  const extensionDepth = wallThickness + 2; // Extra 2mm for clean boolean
  
  // ... extrusion geometry generation
  
  return geometry;
}
```

#### 11.4.5 Complete Handle Mesh Generation

```javascript
// scripts/handle/geometry/handleMeshGenerator.js

import { generateSquaredPath } from './squaredPathGenerator.js';
import { generateCrossSection } from './crossSectionBuilder.js';
import { sweepProfileAlongPath } from './profileSweeper.js';
import { createAttachmentBlends } from './attachmentBlender.js';

/**
 * Main function to generate complete handle mesh
 * @param {HandleParameters} params - All handle parameters
 * @returns {THREE.Mesh} - Complete handle mesh ready for display/export
 */
export function generateHandleMesh(params) {
  // 1. Generate path based on handle style
  const path = generateSquaredPath(params);
  
  // 2. Generate cross-section profile
  const profile = generateCrossSection(params.crossSection);
  
  // 3. Sweep profile along path
  const handleGeometry = sweepProfileAlongPath(
    path,
    profile,
    params.crossSection.taper,
    {
      top: params.attachmentPoints.topWidth,
      bottom: params.attachmentPoints.bottomWidth,
    }
  );
  
  // 4. Add attachment blends and boolean extensions
  const finalGeometry = createAttachmentBlends(
    handleGeometry,
    params.mugReference,
    params.attachmentPoints
  );
  
  // 5. Ensure manifold geometry
  validateAndRepairGeometry(finalGeometry);
  
  // 6. Create mesh with material
  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    roughness: 0.6,
    metalness: 0.1,
  });
  
  return new THREE.Mesh(finalGeometry, material);
}

/**
 * Validate geometry is manifold and repair if needed
 */
function validateAndRepairGeometry(geometry) {
  // Check for:
  // - Non-manifold edges (edges shared by != 2 faces)
  // - Degenerate triangles (zero area)
  // - Flipped normals
  
  geometry.computeBoundingBox();
  geometry.computeVertexNormals();
  
  // Merge close vertices
  // geometry.mergeVertices() - if using indexed geometry
  
  return geometry;
}
```

### 11.5 Mug Preview Generation

```javascript
// scripts/handle/ui/mugImporter.js

/**
 * Generate mug preview mesh from imported parameters
 * Uses same algorithm as Dinnerware Generator for consistency
 */
export function generateMugPreview(mugParams) {
  const { diameter, height, wallAngle, wallThickness, footringHeight } = mugParams;
  
  // Reuse mesh generation from dinnerware generator
  // or simplified version for preview
  
  const mugGeometry = generateMugGeometry(mugParams);
  
  // Create materials for different display modes
  const materials = {
    transparent: new THREE.MeshStandardMaterial({
      color: 0x888888,
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
    }),
    wireframe: new THREE.MeshBasicMaterial({
      color: 0x666666,
      wireframe: true,
    }),
    solid: new THREE.MeshStandardMaterial({
      color: 0x555555,
      roughness: 0.8,
    }),
  };
  
  return {
    geometry: mugGeometry,
    materials,
    setDisplayMode(mode) {
      this.mesh.material = materials[mode];
    },
  };
}
```

### 11.6 State Management

```javascript
// scripts/handle/state/handleState.js

/**
 * Reactive state manager for Handle Generator
 * Triggers mesh regeneration on parameter changes
 */
class HandleStateManager {
  constructor() {
    this.state = this.getInitialState();
    this.listeners = new Map();
    this.meshUpdateCallback = null;
  }

  getInitialState() {
    return {
      parameters: { ...DEFAULT_HANDLE_PARAMETERS },
      ui: { ...DEFAULT_UI_STATE },
      project: {
        name: 'Untitled Handle',
        dateCreated: null,
        lastModified: null,
        isDirty: false,
      },
      warnings: [],
    };
  }

  /**
   * Subscribe to state changes
   * @param {string} path - Dot-notation path (e.g., 'parameters.handleDimensions.height')
   * @param {Function} callback - Called with (newValue, oldValue)
   * @returns {Function} Unsubscribe function
   */
  subscribe(path, callback) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, new Set());
    }
    this.listeners.get(path).add(callback);
    return () => this.listeners.get(path).delete(callback);
  }

  /**
   * Update state and trigger mesh regeneration
   * @param {string} path - State path
   * @param {any} value - New value
   */
  setState(path, value) {
    const oldValue = this.getState(path);
    if (oldValue === value) return;

    this.setNestedValue(this.state, path, value);
    this.state.project.isDirty = true;
    this.state.project.lastModified = new Date().toISOString();

    // Notify listeners
    this.notifyListeners(path, value, oldValue);

    // Trigger mesh update if parameter changed
    if (path.startsWith('parameters.') && this.meshUpdateCallback) {
      this.meshUpdateCallback(this.state.parameters);
    }

    // Run validation
    this.validate();

    // Auto-save to localStorage
    this.autoSave();
  }

  /**
   * Get state value by path
   */
  getState(path) {
    if (!path) return this.state;
    return path.split('.').reduce((obj, key) => obj?.[key], this.state);
  }

  /**
   * Calculate smart defaults based on mug dimensions
   */
  calculateSmartDefaults(mugParams) {
    const { height, footringHeight } = mugParams;
    
    return {
      handleDimensions: {
        height: Math.round(height * 0.7),
        protrusion: 35,
        width: 28,
        depth: Math.round(height * 0.7 * 0.65),
      },
      attachmentPoints: {
        topHeight: height - 15,
        bottomHeight: footringHeight + 7,
        topAngle: 0,
        bottomAngle: 0,
        blendRadius: 8,
        topWidth: 14,
        bottomWidth: 14,
      },
    };
  }

  /**
   * Initialize state with imported mug
   */
  initializeWithMug(mugReference) {
    const defaults = this.calculateSmartDefaults(mugReference);
    
    this.state.parameters.mugReference = mugReference;
    this.state.parameters.handleDimensions = defaults.handleDimensions;
    this.state.parameters.attachmentPoints = defaults.attachmentPoints;
    
    this.state.project.dateCreated = new Date().toISOString();
    
    if (this.meshUpdateCallback) {
      this.meshUpdateCallback(this.state.parameters);
    }
  }

  /**
   * Validate current parameters and update warnings
   */
  validate() {
    const warnings = [];
    const params = this.state.parameters;
    
    // Ergonomic warnings
    if (params.handleDimensions.width < 20) {
      warnings.push({
        type: 'ergonomic',
        severity: 'warning',
        message: 'Grip width is narrow (< 20mm)',
        parameter: 'handleDimensions.width',
      });
    }
    
    if (params.handleDimensions.depth < 30) {
      warnings.push({
        type: 'ergonomic',
        severity: 'warning',
        message: 'Grip depth is shallow (< 30mm)',
        parameter: 'handleDimensions.depth',
      });
    }
    
    // Structural warnings
    if (params.crossSection.width < 10 || params.crossSection.height < 10) {
      warnings.push({
        type: 'structural',
        severity: 'warning',
        message: 'Handle cross-section may be fragile',
        parameter: 'crossSection.width',
      });
    }
    
    if (params.attachmentPoints.blendRadius < 3) {
      warnings.push({
        type: 'structural',
        severity: 'warning',
        message: 'Small blend radius may cause stress concentration',
        parameter: 'attachmentPoints.blendRadius',
      });
    }
    
    // Compatibility warnings
    const mug = params.mugReference;
    if (mug) {
      if (params.handleDimensions.height > mug.height - 15) {
        warnings.push({
          type: 'compatibility',
          severity: 'error',
          message: 'Handle height exceeds mug height',
          parameter: 'handleDimensions.height',
        });
      }
      
      if (params.attachmentPoints.bottomHeight < mug.footringHeight) {
        warnings.push({
          type: 'compatibility',
          severity: 'error',
          message: 'Bottom attachment below footring',
          parameter: 'attachmentPoints.bottomHeight',
        });
      }
    }
    
    this.state.warnings = warnings;
    this.notifyListeners('warnings', warnings, null);
  }

  /**
   * Export state for save
   */
  exportState() {
    return {
      version: '1.0',
      appType: 'handle-generator',
      projectName: this.state.project.name,
      dateCreated: this.state.project.dateCreated,
      lastModified: this.state.project.lastModified,
      ...this.state.parameters,
    };
  }

  /**
   * Import state from saved project
   */
  importState(data) {
    this.state.parameters = {
      mugReference: data.mugReference,
      handleStyle: data.handleStyle,
      handleDimensions: data.handleDimensions,
      crossSection: data.crossSection,
      attachmentPoints: data.attachmentPoints,
      handlePath: data.handlePath,
      styleParameters: data.styleParameters,
    };
    
    this.state.project = {
      name: data.projectName,
      dateCreated: data.dateCreated,
      lastModified: data.lastModified,
      isDirty: false,
    };
    
    this.validate();
    
    if (this.meshUpdateCallback) {
      this.meshUpdateCallback(this.state.parameters);
    }
  }

  /**
   * Auto-save to localStorage
   */
  autoSave() {
    const data = {
      state: this.exportState(),
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('handle_current_project', JSON.stringify(data));
  }

  /**
   * Load auto-saved state
   */
  loadAutoSave() {
    const saved = localStorage.getItem('handle_current_project');
    if (saved) {
      try {
        const { state } = JSON.parse(saved);
        this.importState(state);
        return true;
      } catch (e) {
        console.error('Failed to load auto-save:', e);
      }
    }
    return false;
  }

  // Helper methods
  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k] = o[k] || {}, obj);
    target[last] = value;
  }

  notifyListeners(path, newValue, oldValue) {
    // Exact match
    if (this.listeners.has(path)) {
      this.listeners.get(path).forEach(cb => cb(newValue, oldValue));
    }
    // Wildcard match (e.g., 'parameters.*')
    for (const [listenerPath, callbacks] of this.listeners) {
      if (listenerPath.endsWith('.*') && path.startsWith(listenerPath.slice(0, -2))) {
        callbacks.forEach(cb => cb(newValue, oldValue));
      }
    }
  }
}

export const handleStateManager = new HandleStateManager();
export default handleStateManager;
```

### 11.7 Viewport Implementation

```javascript
// scripts/handle/ui/handleViewport.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { generateHandleMesh } from '../geometry/handleMeshGenerator.js';
import { generateMugPreview } from './mugImporter.js';

class HandleViewport {
  constructor(container) {
    this.container = container;
    this.handleMesh = null;
    this.mugMesh = null;
    this.dimensionLabels = [];
    this.attachmentOutlines = null;
    
    this.init();
  }

  init() {
    // Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a1a);
    
    // Camera - default to side view
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
    this.setCameraPreset('side');
    
    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.container.appendChild(this.renderer.domElement);
    
    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    
    // Lights
    this.setupLights();
    
    // Grid
    this.grid = new THREE.GridHelper(200, 20, 0x444444, 0x333333);
    this.grid.rotation.x = Math.PI / 2;
    this.scene.add(this.grid);
    
    // Start render loop
    this.animate();
    
    // Resize handler
    window.addEventListener('resize', () => this.onResize());
  }

  setupLights() {
    // Ambient
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    
    // Key light
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(100, 150, 100);
    keyLight.castShadow = true;
    this.scene.add(keyLight);
    
    // Fill light
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
    fillLight.position.set(-100, 100, -100);
    this.scene.add(fillLight);
  }

  /**
   * Update handle mesh from parameters
   */
  updateHandle(params) {
    // Remove old handle
    if (this.handleMesh) {
      this.scene.remove(this.handleMesh);
      this.handleMesh.geometry.dispose();
    }
    
    // Generate new handle
    this.handleMesh = generateHandleMesh(params);
    this.scene.add(this.handleMesh);
    
    // Update dimension overlays
    this.updateDimensionOverlays(params);
    
    // Update attachment outlines
    this.updateAttachmentOutlines(params);
  }

  /**
   * Set mug preview from imported data
   */
  setMugPreview(mugParams) {
    if (this.mugMesh) {
      this.scene.remove(this.mugMesh);
      this.mugMesh.geometry.dispose();
    }
    
    this.mugPreview = generateMugPreview(mugParams);
    this.mugMesh = new THREE.Mesh(
      this.mugPreview.geometry,
      this.mugPreview.materials.transparent
    );
    this.scene.add(this.mugMesh);
  }

  /**
   * Set mug display mode
   */
  setMugDisplayMode(mode) {
    if (!this.mugMesh || !this.mugPreview) return;
    
    if (mode === 'hidden') {
      this.mugMesh.visible = false;
    } else {
      this.mugMesh.visible = true;
      this.mugMesh.material = this.mugPreview.materials[mode];
    }
  }

  /**
   * Update dimension overlay labels
   */
  updateDimensionOverlays(params) {
    // Remove old labels
    this.dimensionLabels.forEach(label => this.scene.remove(label));
    this.dimensionLabels = [];
    
    if (!this.showDimensionOverlays) return;
    
    const { handleDimensions } = params;
    
    // Create HTML overlay labels positioned in 3D space
    // Implementation uses CSS2DRenderer or sprite-based labels
    
    const labels = [
      { text: `${handleDimensions.height}mm`, position: 'height' },
      { text: `${handleDimensions.width}mm`, position: 'width' },
      { text: `${handleDimensions.protrusion}mm`, position: 'protrusion' },
    ];
    
    labels.forEach(({ text, position }) => {
      const label = this.createDimensionLabel(text, position, params);
      this.dimensionLabels.push(label);
      this.scene.add(label);
    });
  }

  /**
   * Camera presets
   */
  setCameraPreset(preset) {
    const distance = 200;
    
    switch (preset) {
      case 'side':
        this.camera.position.set(distance, 50, 0);
        break;
      case 'three-quarter':
        this.camera.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
        break;
      case 'top':
        this.camera.position.set(0, distance, 0);
        break;
      case 'bottom':
        this.camera.position.set(0, -distance, 0);
        break;
    }
    
    this.camera.lookAt(0, 50, 0);
    this.controls.target.set(0, 50, 0);
  }

  /**
   * Toggle cross-section view
   */
  toggleCrossSection(enabled) {
    if (enabled) {
      this.renderer.clippingPlanes = [
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
      ];
      this.renderer.localClippingEnabled = true;
    } else {
      this.renderer.clippingPlanes = [];
      this.renderer.localClippingEnabled = false;
    }
  }

  /**
   * Capture thumbnail for project save
   */
  captureThumbnail(width, height) {
    const originalSize = {
      width: this.renderer.domElement.width,
      height: this.renderer.domElement.height,
    };
    
    this.renderer.setSize(width, height);
    this.renderer.render(this.scene, this.camera);
    
    const dataUrl = this.renderer.domElement.toDataURL('image/png');
    
    this.renderer.setSize(originalSize.width, originalSize.height);
    
    return dataUrl;
  }

  /**
   * Get geometry for STL export
   */
  getHandleGeometry() {
    return this.handleMesh?.geometry.clone();
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
}

export function initHandleViewport(container) {
  return new HandleViewport(container);
}
```

### 11.8 STL Export

```javascript
// Extended from scripts/geometry/stlExporter.js

import { STLExporter } from 'three/addons/exporters/STLExporter.js';

/**
 * Export handle as STL file
 * @param {THREE.BufferGeometry} geometry - Handle geometry
 * @param {string} filename - Output filename
 * @param {string} orientation - 'mug-relative' or 'centered'
 */
export function exportHandleSTL(geometry, filename, orientation = 'mug-relative') {
  let exportGeometry = geometry.clone();
  
  // Apply orientation transformation
  if (orientation === 'centered') {
    exportGeometry.computeBoundingBox();
    const center = new THREE.Vector3();
    exportGeometry.boundingBox.getCenter(center);
    exportGeometry.translate(-center.x, -center.y, -center.z);
  }
  
  // Export as binary STL
  const exporter = new STLExporter();
  const buffer = exporter.parse(new THREE.Mesh(exportGeometry), { binary: true });
  
  // Download file
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}
```

### 11.9 Build Configuration

```javascript
// vite.config.js (updated)

import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        handleGenerator: resolve(__dirname, 'handle-generator/index.html'),
      },
      output: {
        manualChunks: {
          three: ['three'],
          'three-addons': [
            'three/addons/controls/OrbitControls.js',
            'three/addons/exporters/STLExporter.js',
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'scripts'),
      '@handle': resolve(__dirname, 'scripts/handle'),
      '@shared': resolve(__dirname, 'scripts'),
    },
  },
});
```

### 11.10 Testing Strategy

#### 11.10.1 Unit Tests

```javascript
// tests/handle/geometry.test.js

import { describe, it, expect } from 'vitest';
import { generateSquaredPath } from '@handle/geometry/squaredPathGenerator.js';
import { generateCrossSection } from '@handle/geometry/crossSectionBuilder.js';

describe('Squared Path Generation', () => {
  const defaultParams = {
    handleDimensions: { height: 70, protrusion: 35, width: 28, depth: 45 },
    attachmentPoints: { topHeight: 85, bottomHeight: 15, topAngle: 0, bottomAngle: 0 },
    styleParameters: { outerCornerRadius: 12, innerCornerRadius: 8, backCurvature: 0 },
    mugReference: { diameter: 90, wallAngle: 15 },
  };

  it('generates valid path with correct number of segments', () => {
    const path = generateSquaredPath(defaultParams);
    expect(path.curves.length).toBeGreaterThan(0);
  });

  it('path starts at top attachment point', () => {
    const path = generateSquaredPath(defaultParams);
    const startPoint = path.getPointAt(0);
    expect(startPoint.y).toBeCloseTo(defaultParams.attachmentPoints.topHeight, 1);
  });

  it('path ends at bottom attachment point', () => {
    const path = generateSquaredPath(defaultParams);
    const endPoint = path.getPointAt(1);
    expect(endPoint.y).toBeCloseTo(defaultParams.attachmentPoints.bottomHeight, 1);
  });
});

describe('Cross Section Generation', () => {
  it('generates oval profile with correct dimensions', () => {
    const profile = generateCrossSection({
      shape: 'oval',
      width: 12,
      height: 15,
      cornerRadius: 0,
    });
    
    const points = profile.getPoints(24);
    expect(points.length).toBeGreaterThan(0);
  });

  it('generates squared profile with rounded corners', () => {
    const profile = generateCrossSection({
      shape: 'squared',
      width: 12,
      height: 15,
      cornerRadius: 3,
    });
    
    const points = profile.getPoints(24);
    expect(points.length).toBeGreaterThan(0);
  });
});
```

#### 11.10.2 Integration Tests

```javascript
// tests/handle/integration.test.js

describe('Handle Generation Pipeline', () => {
  it('generates manifold geometry', () => {
    const params = getDefaultHandleParams();
    const mesh = generateHandleMesh(params);
    
    expect(isManifold(mesh.geometry)).toBe(true);
  });

  it('geometry has positive volume', () => {
    const params = getDefaultHandleParams();
    const mesh = generateHandleMesh(params);
    
    expect(calculateVolume(mesh.geometry)).toBeGreaterThan(0);
  });

  it('attachment extends into mug body', () => {
    const params = getDefaultHandleParams();
    const mesh = generateHandleMesh(params);
    
    // Check that some vertices are inside mug radius
    const mugRadius = params.mugReference.diameter / 2;
    const positions = mesh.geometry.attributes.position.array;
    
    let hasInteriorPoints = false;
    for (let i = 0; i < positions.length; i += 3) {
      const r = Math.sqrt(positions[i] ** 2 + positions[i + 2] ** 2);
      if (r < mugRadius) {
        hasInteriorPoints = true;
        break;
      }
    }
    
    expect(hasInteriorPoints).toBe(true);
  });
});
```

---

## 12. Performance Requirements

### 12.1 Real-Time Interaction
- **60 FPS** during camera manipulation
- **Real-time mesh updates**: Handle geometry regenerates on every slider movement (no debouncing)
- Smooth, immediate visual feedback during parameter adjustment
- No "Generate" or "Apply" button needed

### 12.2 Mesh Quality
- **Handle Mesh**: Full quality at all times (same as export quality)
- **Mug Preview**: Full quality (same resolution as Dinnerware Generator)
- No separate preview/export quality modes

### 12.3 File Operations
- < 500ms project save
- < 1000ms project load with mug import
- < 1000ms STL export

### 12.4 Memory
- < 200MB RAM usage
- Efficient geometry caching for mug preview (doesn't regenerate unless mug changes)

---

## 13. Future Enhancements (Out of Scope for V1)

### 13.1 Additional Handle Styles
- D-Shaped handle (classic curved style)
- C-Shaped handle (loop style)
- Custom bezier path handles

### 13.2 Advanced Handle Features
- Double handles (soup bowl style)
- Thumb rest/support
- Decorative patterns on handle
- Textured grip surfaces

### 13.3 Ergonomic Tools
- Hand size presets (S/M/L/XL)
- Grip simulation visualization
- Heat transfer analysis
- Weight balance indicator

### 13.4 Integration Features
- Direct export back to dinnerware project
- Batch handle generation for sets
- Handle style presets library
- Community-shared handle designs

### 13.5 Advanced Geometry
- Asymmetric handles
- Sculpted/organic forms
- Variable cross-section along path
- Hollow handles (for weight reduction)

### 13.6 Extended Item Support
- Teapot handles
- Pitcher handles
- Sugar bowl handles

---

## 14. Design Decisions (Confirmed)

The following design decisions have been confirmed for V1:

### 14.1 Workflow
- ✅ Users design mug first in Dinnerware Generator, then design handle
- ✅ App prompts for mug import on launch (required step)
- ✅ Mug must be imported from existing project (no manual entry)
- ✅ Unsaved changes show confirmation dialog (same as Dinnerware Generator)

### 14.2 Export
- ✅ Handles export independently as separate STL files
- ✅ Filename format: `[HandleProjectName]_handle.stl`
- ✅ Export orientation: User choice in export dialog
- ✅ Handle geometry designed for boolean union with mug in external software
- ✅ STL is the only export format needed

### 14.3 Features
- ✅ Squared handle with rounded corners is the primary style for V1
- ✅ No ergonomic presets for V1
- ✅ No undo/redo functionality for V1
- ✅ No reset options needed
- ✅ No ceramic production constraints to model

### 14.4 Visual Feedback
- ✅ Default camera view: Side view (shows handle profile clearly)
- ✅ Dimension overlays: Yes, metric, toggleable
- ✅ Attachment zone outlines: Wireframe, toggleable
- ✅ Cross-section preview: 2D inset panel in viewport corner
- ✅ Mug display modes: Toggle between semi-transparent, wireframe, solid, hidden (in settings)

### 14.5 Parameter Behavior
- ✅ All parameters fully independent (no linking)
- ✅ Smart defaults: Simple percentages based on mug size
- ✅ Constraint handling: Allow changes, show warnings (don't block)

### 14.6 Performance
- ✅ Real-time mesh updates on every slider movement
- ✅ Full quality mug preview (same as Dinnerware Generator)
- ✅ No viewport direct manipulation (parameters panel only)

### 14.7 Dashboard Access
- ✅ App selection via New Project button modal
- ✅ Handle Generator listed alongside Dinnerware Generator

### 14.8 Open Questions for Future Consideration
1. Should the handle generator support handles for other items (teapots, pitchers)?
2. Should there be a "fit test" visualization showing hand placement?
3. Should additional handle styles (D-shaped, C-shaped) be added post-V1?

---

## 15. Appendix

### Appendix A: Reference Images

1. **Image 1 (Tall Hasami-style mug)**: Squared handle with rounded corners
   - Handle Height: ~75% of mug height
   - Handle Protrusion: ~40mm
   - Corner Radius: ~12mm
   - Cross-section: Rounded rectangle

2. **Image 2 (Short Hasami-style mug)**: Compact squared handle
   - Handle Height: ~65% of mug height
   - Handle Protrusion: ~35mm
   - More squared proportions

3. **Image 3 (White ceramic mug)**: D-shaped ergonomic handle
   - Smooth flowing curves
   - Variable thickness (thicker at attachments)
   - Traditional comfortable grip

### Appendix B: Parameter Ranges Summary

| Parameter | Min | Max | Default | Unit |
|-----------|-----|-----|---------|------|
| Handle Height | 30 | 120 | 70 | mm |
| Handle Protrusion | 20 | 80 | 35 | mm |
| Handle Width | 20 | 50 | 28 | mm |
| Handle Depth | 25 | 80 | 45 | mm |
| Cross-Section Width | 8 | 25 | 12 | mm |
| Cross-Section Height | 8 | 30 | 15 | mm |
| Cross-Section Corner Radius | 0 | 12.5 | 3 | mm |
| Cross-Section Taper | 50 | 150 | 100 | % |
| Top Attachment Angle | -45 | 45 | 0 | ° |
| Bottom Attachment Angle | -45 | 45 | 0 | ° |
| Attachment Blend Radius | 0 | 20 | 8 | mm |
| Outer Corner Radius (Squared) | 5 | 30 | 12 | mm |
| Inner Corner Radius (Squared) | 3 | 25 | 8 | mm |
| Path Curve Amount | 0 | 100 | 40 | % |

### Appendix C: Ergonomic Reference Data

**Average Adult Hand Dimensions:**

| Measurement | Male (mm) | Female (mm) |
|-------------|-----------|-------------|
| Hand Length | 189 | 172 |
| Hand Breadth | 84 | 74 |
| Finger Breadth (Index) | 20 | 17 |
| Grip Diameter (comfortable) | 35-45 | 30-40 |

**Recommended Handle Dimensions by Mug Size:**

| Mug Size | Handle Width | Handle Depth | Cross-Section |
|----------|--------------|--------------|---------------|
| Espresso (60ml) | 20-24mm | 30-35mm | 8-10mm |
| Standard (250ml) | 26-30mm | 40-50mm | 10-14mm |
| Large (350ml) | 28-35mm | 45-55mm | 12-16mm |
| Oversized (500ml+) | 32-40mm | 50-65mm | 14-18mm |

---

## Document Version

**Version**: 1.2
**Date**: 2025-12-24
**Author**: Product Specification for Mug Handle Generator
**Status**: Final for V1 Development (includes Technical Specification)

### Version History
| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-24 | Initial specification with confirmed design decisions |
| 1.1 | 2025-12-24 | Added UX/performance decisions: viewport settings, parameter behavior, export options |
| 1.2 | 2025-12-24 | Added comprehensive technical specification: algorithms, data structures, code architecture |

---

