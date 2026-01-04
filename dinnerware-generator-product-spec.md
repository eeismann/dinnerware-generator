# Dinnerware Designer - Product Specification

> **Part of Playground Ceramics Platform**
> This application is one of the specialized design tools within the [Playground Ceramics](./playground-ceramics-spec.md) platform.

## 1. Executive Summary

A web-based application that allows users to design complete dinnerware sets by adjusting parametric controls that apply consistently across all pieces. The app generates high-quality 3D models suitable for FDM 3D printing and exports them as STL files.

### 1.1 Target Users
- Product designers creating custom dinnerware lines
- 3D printing enthusiasts
- Ceramic artists exploring digital prototyping
- Small manufacturers testing designs before production

### 1.2 Core Value Proposition
- Parametric design system ensures visual consistency across entire dinnerware set
- Real-time 3D preview with interactive controls
- Export-ready STL files for FDM 3D printing
- Local-only web app (no server required, complete privacy)

---

## 2. Dinnerware Set Components

The application generates seven dinnerware items:

1. **Plate** (Dinner Plate)
2. **Soup Bowl**
3. **Pasta Bowl**
4. **Mug** (without handle)
5. **Tumbler** (tall drinking vessel)
6. **Saucer** (designed to match mug)
7. **Serving Bowl** (Large)

---

## 3. Parameter System

### 3.1 Global Style Parameters

These parameters apply consistently across all items in the set, creating a unified design language.

#### 3.1.1 Wall Angle
- **Description**: Angle of the wall measured from vertical
- **Units**: Degrees (°)
- **Range**: -30° to +45°
- **Behavior**:
  - 0° = straight vertical walls
  - Positive values = walls flare outward
  - Negative values = walls angle inward
- **Application**: Applies to entire wall from base to rim
- **Default**: 15°

#### 3.1.2 Footring Origin Point Height
- **Description**: Height from the base of the form to where the footring begins
- **Units**: Millimeters (mm)
- **Range**: 0mm to 50mm
- **Behavior**: Consistent absolute measurement across all items (does not scale)
- **Special**: When set to 0mm, creates flat-base design (no footring)
- **Default**: 8mm

#### 3.1.3 Outer Footring Angle
- **Description**: Angle of the outer footring wall from vertical
- **Units**: Degrees (°)
- **Range**: -45° to +45°
- **Behavior**: Independent from inner footring angle
- **Default**: 15°

#### 3.1.4 Footring Base Width
- **Description**: Width of the horizontal surface between inner and outer footring walls
- **Units**: Millimeters (mm)
- **Range**: 2mm to 30mm
- **Behavior**: Consistent absolute measurement across all items (does not scale)
- **Default**: 8mm

#### 3.1.5 Inner Footring Angle
- **Description**: Angle of the inner footring wall from vertical
- **Units**: Degrees (°)
- **Range**: -45° to +45°
- **Behavior**: Independent from outer footring angle
- **Validation**: Displays warning if combination with outer angle creates impossible geometry
- **Default**: -15°

#### 3.1.6 Wall Thickness
- **Description**: Thickness of walls throughout the item
- **Units**: Millimeters (mm)
- **Range**: 0.8mm to 10mm
- **Behavior**: Applied to inside of form (profile defines outer surface, thickness goes inward)
- **Validation**: Warning displayed if < 1.2mm (too thin for FDM printing)
- **Default**: 2.5mm

#### 3.1.7 Base Recess Depth
- **Description**: Depth of recess in the base outside the footring
- **Units**: Millimeters (mm)
- **Range**: 0mm to 10mm
- **Behavior**:
  - 0mm = flush base
  - Positive values = recessed base outside footring
- **Default**: 1mm

### 3.2 Global Proportional Parameters

These parameters scale all items proportionally while maintaining traditional aspect ratios.

#### 3.2.1 Global Height Scale
- **Description**: Uniform scaling factor for height across all items
- **Units**: Percentage (%)
- **Range**: 50% to 200%
- **Behavior**: Applies 1:1 scaling to all items (20% increase = 20% taller items)
- **Maintains**: Each item's traditional depth-to-width aspect ratio
- **Default**: 100%

#### 3.2.2 Global Width Scale
- **Description**: Uniform scaling factor for width/diameter across all items
- **Units**: Percentage (%)
- **Range**: 50% to 200%
- **Behavior**: Applies 1:1 scaling to all items (20% increase = 20% wider items)
- **Maintains**: Proportional relationships between items
- **Default**: 100%

### 3.3 Per-Item Scaling Multipliers

Each item has individual scale multipliers that work in combination with global scales.

**Formula**: `Final Dimension = Base Dimension × Global Scale × Item Multiplier`

#### 3.3.1 Item Height Multiplier
- **Range**: 50% to 200%
- **Default**: 100%
- **Per-Item Control**: Independent for each of 7 items

#### 3.3.2 Item Width Multiplier
- **Range**: 50% to 200%
- **Default**: 100%
- **Per-Item Control**: Independent for each of 7 items

### 3.4 Saucer-Specific Parameters

#### 3.4.1 Cup Ring Depth
- **Description**: Depth of recessed ring where mug sits
- **Units**: Millimeters (mm)
- **Range**: 0mm to 10mm
- **Behavior**:
  - Cup ring diameter automatically matches mug base diameter
  - Per-project parameter (not global across all projects)
- **Default**: 2mm

### 3.5 Per-Item Parameter Overrides

Users can override any global parameter for individual items.

**Override Behavior**:
- **Type**: Absolute override (persists independently of global changes)
- **Example**: If soup bowl wall angle is overridden to 10°, it remains 10° even if global wall angle changes from 15° to 25°
- **Visual Indicator**: Parameters with active overrides display distinct visual indicator
- **Reset Option**: "Reset to Global" button available for each overridden parameter

**Overridable Parameters**:
- Wall Angle
- Footring Origin Point Height
- Outer Footring Angle
- Footring Base Width
- Inner Footring Angle
- Wall Thickness
- Base Recess Depth

---

## 4. Default Dimensions & Ratios

### 4.1 Base Dimensions (at 100% global scale, 100% item multipliers)

Based on industry-standard dinnerware dimensions:

| Item | Diameter (mm) | Height (mm) | Notes |
|------|--------------|-------------|-------|
| Plate | 280 | 25 | Standard dinner plate |
| Soup Bowl | 180 | 60 | Medium depth bowl |
| Pasta Bowl | 240 | 50 | Wide, shallow bowl |
| Mug | 90 | 100 | Cylindrical form |
| Tumbler | 75 | 140 | Tall drinking vessel |
| Saucer | 150 | 20 | Matches mug diameter + clearance |
| Serving Bowl | 280 | 100 | Large capacity bowl |

### 4.2 Fixed Proportional Relationships

**User-Editable Ratios**: These default ratios are editable per-project to allow custom proportions.

| Item | Width Ratio (vs Plate) | Height Ratio (vs Plate) |
|------|------------------------|-------------------------|
| Plate | 100% (base) | 100% (base) |
| Soup Bowl | 64% | 240% |
| Pasta Bowl | 86% | 200% |
| Mug | 32% | 400% |
| Tumbler | 27% | 560% |
| Saucer | 54% | 80% |
| Serving Bowl | 100% | 400% |

### 4.3 Default Global Parameter Values

| Parameter | Default Value | Rationale |
|-----------|--------------|-----------|
| Wall Angle | 15° | Gentle outward flare, traditional style |
| Footring Origin Height | 8mm | Adequate clearance for stability |
| Outer Footring Angle | 15° | Matches wall angle for consistency |
| Footring Base Width | 8mm | Sufficient contact surface |
| Inner Footring Angle | -15° | Creates stable ring geometry |
| Wall Thickness | 2.5mm | Optimal for FDM printing strength |
| Base Recess Depth | 1mm | Subtle recess, prevents rocking |
| Global Height Scale | 100% | Standard size |
| Global Width Scale | 100% | Standard size |
| Cup Ring Depth (Saucer) | 2mm | Shallow recess for stability |

---

## 5. 3D Geometry Specifications

### 5.1 Geometry Rules

#### 5.1.1 Profile Construction
- **Wall Profile**: Straight lines only (conical sections)
- **No Wells**: Items have no flat well or rim; continuous profile from center to rim edge
- **No Curves**: All transitions are angular (no bezier or spline curves)
- **Base**: Always flat bottom surface

#### 5.1.2 Cross-Section Profile

All items follow this general profile structure:

```
[RIM EDGE]
    |
    | (wall angle from vertical)
    |
[WALL]
    |
    | (transition to footring)
    |
[FOOTRING - Outer Wall] (outer footring angle)
    |____[FOOTRING BASE]____ (footring base width)
         |
         [FOOTRING - Inner Wall] (inner footring angle)
              |
              [BASE SURFACE] (with optional recess outside footring)
```

#### 5.1.3 Footring Geometry

- **Outer Wall**: Angled surface from footring origin point to footring base
- **Base**: Horizontal ring surface (contact point with table)
- **Inner Wall**: Angled surface from footring base to item interior
- **Width**: Measured as horizontal distance between inner and outer walls at base
- **Disable**: When footring origin height = 0mm, footring is eliminated (flat base)

#### 5.1.4 Base Construction

- **Inside Footring**: Solid flat surface
- **Outside Footring**:
  - Recess depth = 0mm: Flush with footring base
  - Recess depth > 0mm: Recessed below footring base by specified amount

#### 5.1.5 Wall Thickness Application

- **Method**: Shell construction
- **Direction**: Inward from defined outer profile
- **Result**: Outer surface follows designed profile, inner surface offset inward by wall thickness

### 5.2 Item-Specific Geometry Notes

#### 5.2.1 Plate
- Shallow height relative to diameter
- Continuous conical form from center to rim
- Same footring construction as all items

#### 5.2.2 Soup Bowl
- Higher walls than plate
- Steeper wall angle typical
- Deeper overall form

#### 5.2.3 Pasta Bowl
- Wide diameter, moderate depth
- Shallower than soup bowl
- Balance between plate and bowl proportions

#### 5.2.4 Mug
- Tall cylindrical form
- No handle (smooth cylinder)
- Same footring system as other items
- Solid flat base standard

#### 5.2.5 Tumbler
- Taller, narrower cylindrical form than mug
- Designed for water, juice, or beverages without handles
- Same footring system as other items
- Proportionally taller than mug with smaller diameter

#### 5.2.7 Saucer
- Shallow plate-like form
- **Cup Ring**:
  - Circular recessed area for mug
  - Diameter automatically calculated to match mug base diameter
  - Depth controlled by Cup Ring Depth parameter
  - Located at center of saucer
  - Transitions with angular profile (no curves)

#### 5.2.8 Serving Bowl
- Largest capacity
- Tallest depth
- Similar proportions to soup bowl but scaled up

---

## 6. User Interface Specification

### 6.1 UI Design Style

**Reference**: UI.png (attached reference image)

**Visual Characteristics**:
- Dark theme background
- High contrast elements
- Clean, minimal aesthetic
- Colorful accents for data visualization
- Monospace fonts for numeric values
- Smooth, modern UI components

### 6.2 Layout Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Header: App Title, Project Name, Save/Load/Export          │
├─────────────────┬───────────────────────────────────────────┤
│                 │                                           │
│   Parameter     │          3D Viewport                      │
│   Panel         │                                           │
│   (Left Side)   │     [Interactive 3D View]                 │
│                 │                                           │
│   - Collapsible │                                           │
│     Sections    │                                           │
│   - Sliders     │                                           │
│   - Numeric     │                                           │
│     Inputs      │                                           │
│   - Warnings    │                                           │
│                 │                                           │
├─────────────────┴───────────────────────────────────────────┤
│  Footer: View Controls, Item Selection, Layout Toggle       │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Parameter Panel (Left Side)

#### 6.3.1 Panel Organization

Single scrollable panel with collapsible sections:

1. **Global Style Parameters** (collapsed by default after first use)
   - Wall Angle
   - Footring Origin Point Height
   - Outer Footring Angle
   - Footring Base Width
   - Inner Footring Angle
   - Wall Thickness
   - Base Recess Depth

2. **Global Scaling** (expanded by default)
   - Global Height Scale
   - Global Width Scale

3. **Item Proportions** (collapsed by default)
   - Per-item width ratios (editable)
   - Per-item height ratios (editable)

4. **Per-Item Overrides** (collapsed by default)
   - Dropdown to select item
   - Override controls for all global style parameters
   - Visual indicators for active overrides
   - "Reset to Global" buttons

5. **Saucer Settings** (collapsed by default)
   - Cup Ring Depth

6. **Warnings & Validation** (always visible when warnings exist)
   - List of current warnings
   - Click warning to highlight affected parameter/item

#### 6.3.2 Parameter Controls

Each parameter includes:
- **Label**: Clear parameter name
- **Slider**: Visual adjustment control
- **Numeric Input**: Precise value entry
- **Units**: Displayed next to value (°, mm, %)
- **Reset Button**: Return to default value (icon-based)

**Control Synchronization**:
- Slider and numeric input always synchronized
- Real-time updates to 3D viewport
- Smooth animations when adjusting parameters

#### 6.3.3 Override Indicators

When parameter is overridden for specific item:
- **Color Change**: Parameter row highlighted in accent color
- **Icon**: Override indicator icon displayed
- **Reset Button**: "Reset to Global" option appears
- **Tooltip**: Shows global value vs. override value on hover

#### 6.3.4 Warning Display

**Location**: Persistent section in parameter panel

**Warning Types**:
1. **Thin Wall Warning**: Wall thickness < 1.2mm
2. **Overhang Warning**: Angles create overhangs > 45° from vertical
3. **Impossible Geometry**: Footring angles create impossible geometry

**Warning Format**:
```
⚠ [Warning Icon] [Item Name]: [Issue Description]
```

**Example**:
```
⚠ Soup Bowl: Wall thickness (1.0mm) below recommended minimum (1.2mm)
⚠ Plate: Footring geometry creates impossible intersection
⚠ Mug: Wall angle (55°) creates overhang exceeding 45°
```

**Interaction**:
- Click warning to highlight affected item in viewport
- Warning icon appears on affected item in 3D view
- Parameter causing warning highlighted in panel

### 6.4 3D Viewport (Center/Right)

#### 6.4.1 Display Modes

**Single Row Mode**:
- Items displayed horizontally in single line
- Sorted largest to smallest (left to right)
- Consistent spacing between items

**Grid Mode (3x2)**:
- 3 columns, 2 rows
- Sorted largest to smallest (left-to-right, top-to-bottom)
- Consistent spacing between items

**Spacing Rules**:
- Minimum gap: 20% of largest item diameter
- Items never overlap
- Auto-spacing adjusts based on item sizes

#### 6.4.2 Camera Controls

**Orbit Controls**:
- Left mouse drag: Rotate around items
- Right mouse drag: Pan view
- Mouse wheel: Zoom in/out
- No zoom limits (unlimited zoom range)

**Camera Presets** (buttons in footer):
- Top View
- Side View
- 3/4 View (default)
- Bottom View

**Auto-Framing**:
- Disabled (camera does not auto-adjust when items added/removed)
- Users manually frame view as needed

#### 6.4.3 Cross-Section View

**Activation**: Toggle button in footer ("Cross-Section" button)

**Behavior**:
- Overlay on 3D view (semi-transparent cutting plane)
- Vertical cut plane only
- Always passes through center of items
- Shows interior geometry, wall thickness, footring detail

**Visual Style**:
- Cutting plane: Translucent grid surface
- Cut edges: Highlighted in accent color
- Interior surfaces: Visible with material shading

#### 6.4.4 Item Selection for Viewing

**Control**: Checkbox list in footer or separate panel

**Items**:
- [ ] Plate
- [ ] Soup Bowl
- [ ] Pasta Bowl
- [ ] Mug
- [ ] Tumbler
- [ ] Saucer
- [ ] Serving Bowl

**Interaction**:
- Check/uncheck to show/hide items
- "Show All" / "Hide All" quick buttons
- Selected items appear in viewport according to display mode

#### 6.4.5 Warning Indicators in Viewport

**Visual Markers**:
- Warning icon floats above affected item
- Icon color-coded by severity (yellow for warnings)
- Pulsing animation to draw attention
- Click icon to view warning details in parameter panel

### 6.5 Header Bar

**Contents**:
- **Back to Dashboard**: Button to return to Playground Ceramics dashboard
- **App Title**: "Dinnerware Designer" (left)
- **Project Name**: Displays current project name (center)
- **Action Buttons** (right):
  - New Project
  - Save Project
  - Load Project
  - Export STL Files
  - Import Project File (for sharing)

### 6.6 Footer Bar

**Contents**:
- **View Controls** (left):
  - Camera preset buttons (Top, Side, 3/4, Bottom)
  - Cross-section toggle
  - Layout toggle (Row / Grid)

- **Item Selection** (center):
  - Checkboxes for each item
  - Show All / Hide All buttons

- **Status Info** (right):
  - Current item count displayed
  - Warning count (if any)

---

## 7. Interaction & Behavior

### 7.1 Real-Time Updates

**Parameter Changes**:
- All parameter adjustments update 3D models in real-time
- No "Generate" or "Apply" button required
- Smooth visual updates (no flickering)

**Performance Target**:
- 60 FPS interaction during parameter adjustment
- All 7 items viewable simultaneously without lag

### 7.2 Display Quality

**Rendering**:
- High-quality mesh display at all times
- No separate preview/export quality modes
- Single fixed high-quality setting optimized for both viewing and export

**Mesh Resolution**:
- Fixed high-resolution mesh generation
- Sufficient polygon count for smooth FDM printing
- Smooth cylindrical/conical surfaces without visible faceting

### 7.3 Item Visibility Management

**Adding/Removing Items**:
- Check/uncheck items in footer
- Items fade in/out smoothly
- Camera maintains current position (no auto-framing)

**Arrangement**:
- Items auto-arrange in current layout mode (row/grid)
- Spacing adjusts automatically to prevent overlap
- Largest to smallest ordering maintained

### 7.4 Project Workflow

#### 7.4.1 New Project
1. User clicks "New Project"
2. Confirmation dialog if unsaved changes exist
3. All parameters reset to defaults
4. Viewport clears
5. Project name set to "Untitled"

#### 7.4.2 Save Project
1. User clicks "Save Project"
2. If first save: Prompt for project name
3. Project data serialized to JSON
4. File saved locally: `[ProjectName].json`
5. File format: Compressed JSON

**Saved Data**:
- All global parameters
- All per-item overrides
- All per-item multipliers
- Item ratio relationships
- Saucer-specific settings
- Project metadata (name, date created, last modified)

#### 7.4.3 Load Project
1. User clicks "Load Project"
2. File browser opens (filter: .json files)
3. User selects project file
4. App loads all parameters and settings
5. Viewport updates with loaded design
6. Project name updates in header

#### 7.4.4 Export STL Files
1. User clicks "Export STL Files"
2. Modal dialog appears with export options:
   - **Item Selection**: Checkboxes for each item
   - **Select All / Deselect All** buttons
   - **Export Location**: File browser to choose save directory
   - **Confirm Export** button

3. Export process:
   - High-quality mesh generation for selected items
   - Individual STL file per item
   - File naming: `[ProjectName]_[item_name].stl`
   - Progress indicator during export

4. Completion notification with file count and location

**Standard Item Names**:
- `plate`
- `soup_bowl`
- `pasta_bowl`
- `mug`
- `tumbler`
- `saucer`
- `serving_bowl`

**Example Export Filenames**:
```
MyDinnerware_plate.stl
MyDinnerware_soup_bowl.stl
MyDinnerware_pasta_bowl.stl
MyDinnerware_mug.stl
MyDinnerware_tumbler.stl
MyDinnerware_saucer.stl
MyDinnerware_serving_bowl.stl
```

#### 7.4.5 Import Project File
1. User clicks "Import Project File"
2. File browser opens
3. User selects .json project file
4. Project loads with all settings
5. Enables sharing designs between users

---

## 8. Technical Specifications

### 8.1 Platform & Technology

**Platform**: Web application (runs locally in browser)

**3D Library**: Three.js (recommended for web-based 3D rendering)

**Deployment**:
- Static web application
- No server required
- Runs entirely in browser
- All processing client-side

**Browser Compatibility**:
- Modern browsers with WebGL support
- Chrome, Firefox, Safari, Edge (latest versions)
- No mobile/tablet support required

### 8.2 3D Mesh Generation

#### 8.2.1 Geometry Construction

**Method**: Procedural mesh generation using parametric equations

**Primitive**: Revolved profiles (rotational symmetry around vertical axis)

**Steps**:
1. Generate 2D profile based on parameters (cross-section)
2. Revolve profile 360° around center axis
3. Apply wall thickness (shell operation)
4. Generate footring geometry if height > 0
5. Cap bottom with base geometry
6. Generate STL-compatible mesh

#### 8.2.2 Mesh Quality

**Resolution Settings**:
- **Radial Segments**: 120 (smoothness around circumference)
- **Height Segments**: Adaptive based on item height (minimum 40)
- **Footring Segments**: 20 (sufficient detail for small features)

**Quality Targets**:
- Smooth curves without visible faceting
- Suitable for FDM printing (no excessive detail)
- File size manageable (< 10MB per item typically)

**Polygon Count** (approximate):
- Plate: ~15,000 polygons
- Bowls: ~20,000 polygons
- Mug: ~18,000 polygons
- Saucer: ~15,000 polygons

#### 8.2.3 FDM Printing Optimization

**Overhang Support**:
- Automatic validation of angles
- Warning if overhangs exceed 45° from vertical
- No automatic support generation (user responsible for slicing software)

**Wall Thickness**:
- Validation warning if < 1.2mm
- No upper limit warnings

**Mesh Integrity**:
- Manifold geometry (watertight, no holes)
- Correct normals (outward-facing)
- No overlapping vertices
- Valid for STL export and slicing software

### 8.3 File Formats

#### 8.3.1 Project Files

**Format**: JSON (compressed)

**Extension**: `.json`

**Compression**: gzip compression for reduced file size

**Structure**:
```json
{
  "projectName": "MyDinnerware",
  "version": "1.0",
  "dateCreated": "2025-12-20T10:30:00Z",
  "lastModified": "2025-12-20T15:45:00Z",
  "globalParameters": {
    "wallAngle": 15,
    "footringOriginHeight": 8,
    "outerFootringAngle": 15,
    "footringBaseWidth": 8,
    "innerFootringAngle": -15,
    "wallThickness": 2.5,
    "baseRecessDepth": 1,
    "globalHeightScale": 100,
    "globalWidthScale": 100
  },
  "itemRatios": {
    "plate": {"widthRatio": 100, "heightRatio": 100},
    "soup_bowl": {"widthRatio": 64, "heightRatio": 240},
    "pasta_bowl": {"widthRatio": 86, "heightRatio": 200},
    "mug": {"widthRatio": 32, "heightRatio": 400},
    "tumbler": {"widthRatio": 27, "heightRatio": 560},
    "saucer": {"widthRatio": 54, "heightRatio": 80},
    "serving_bowl": {"widthRatio": 100, "heightRatio": 400}
  },
  "itemMultipliers": {
    "plate": {"height": 100, "width": 100},
    "soup_bowl": {"height": 100, "width": 100},
    "pasta_bowl": {"height": 100, "width": 100},
    "mug": {"height": 100, "width": 100},
    "tumbler": {"height": 100, "width": 100},
    "saucer": {"height": 100, "width": 100},
    "serving_bowl": {"height": 100, "width": 100}
  },
  "itemOverrides": {
    "soup_bowl": {
      "wallAngle": 20,
      "wallThickness": 3.0
    }
  },
  "saucerSettings": {
    "cupRingDepth": 2
  }
}
```

#### 8.3.2 STL Export

**Format**: Binary STL (more compact than ASCII)

**Units**: Millimeters

**Orientation**: Items exported in printable orientation (base on Z=0 plane)

**Validation**:
- Manifold mesh (watertight)
- Positive volume
- Correct normal orientation
- No degenerate triangles

### 8.4 Data Persistence

**Storage Method**: Browser LocalStorage

**Saved Data**:
- Current project state (auto-save every 30 seconds)
- Recent projects list (last 10 projects)
- User preferences (UI state, default view settings)

**Storage Limits**:
- LocalStorage typically 5-10MB limit
- Project files small (< 50KB each typically)
- Adequate for multiple saved projects

### 8.5 Performance Requirements

**Real-Time Interaction**:
- 60 FPS during camera manipulation
- < 100ms parameter update latency
- Smooth slider interactions

**Mesh Generation**:
- < 500ms to generate all 7 items from scratch
- Incremental updates for parameter changes (faster)

**File Export**:
- < 2 seconds to export all 7 items as STL
- Progress indicator for user feedback

**Memory**:
- < 500MB RAM usage for full application
- Efficient mesh management (release unused geometry)

---

## 9. Validation & Warnings

### 9.1 Warning System

**Purpose**: Alert users to potential issues without blocking functionality

**Display**: Persistent warnings panel in parameter sidebar

**Warning Types**:

#### 9.1.1 Wall Thickness Warning
- **Trigger**: Wall thickness < 1.2mm
- **Message**: `[Item]: Wall thickness ([value]mm) below recommended minimum (1.2mm) for FDM printing`
- **Severity**: Warning (yellow)
- **Impact**: Item may be fragile or fail during printing

#### 9.1.2 Overhang Warning
- **Trigger**: Wall angle or footring angle creates overhang > 45° from vertical
- **Message**: `[Item]: [Parameter] ([value]°) creates overhang exceeding 45° - may require supports`
- **Severity**: Warning (yellow)
- **Impact**: Item may require support structures during printing

#### 9.1.3 Impossible Footring Geometry
- **Trigger**: Combination of inner/outer footring angles creates intersecting or invalid geometry
- **Message**: `[Item]: Footring angles create impossible geometry - adjust inner or outer angle`
- **Severity**: Warning (yellow)
- **Impact**: Mesh generation may fail or create artifacts

### 9.2 Warning Interactions

**In Parameter Panel**:
- Warning appears in dedicated warnings section
- Parameter causing warning highlighted
- Click warning to jump to parameter

**In Viewport**:
- Warning icon floats above affected item
- Yellow color coding
- Pulsing animation
- Click icon to view details in parameter panel

**Warning Persistence**:
- Warnings appear immediately when condition triggered
- Warnings disappear immediately when condition resolved
- Real-time validation (no manual refresh needed)

---

## 10. UI Component Specifications

### 10.1 Color Palette

Based on UI.png reference image:

**Background Colors**:
- Primary Background: `#1a1a1a` (dark gray)
- Panel Background: `#242424` (slightly lighter gray)
- Section Background: `#2a2a2a` (hover/active states)

**Accent Colors**:
- Primary Accent (Blue): `#4a90e2`
- Success (Green): `#50e3c2`
- Warning (Yellow): `#f5a623`
- Danger (Red): `#e94b3c`
- Neutral (White): `#ffffff`
- Muted (Gray): `#9b9b9b`

**Data Visualization** (for multi-color elements):
- Blue: `#4a90e2`
- Cyan: `#50e3c2`
- Green: `#7ed321`
- Yellow: `#f5a623`
- Red: `#e94b3c`
- Purple: `#bd10e0`

### 10.2 Typography

**Font Family**:
- Primary: Sans-serif system font stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial`)
- Numeric: Monospace for precise values (`"SF Mono", Monaco, "Courier New", monospace`)

**Font Sizes**:
- Header (App Title): 24px, Bold
- Section Headers: 16px, Semi-bold
- Parameter Labels: 14px, Regular
- Numeric Values: 16px, Monospace, Regular
- Body Text: 14px, Regular
- Small Text (units, hints): 12px, Regular

**Text Colors**:
- Primary Text: `#ffffff`
- Secondary Text: `#9b9b9b`
- Muted Text: `#6b6b6b`

### 10.3 Control Specifications

#### 10.3.1 Slider Control

**Appearance**:
- Track: 4px height, dark gray background
- Fill: Gradient from accent color to lighter shade
- Thumb: 16px circle, white with shadow
- Active State: Thumb scales to 18px, glow effect

**Behavior**:
- Smooth dragging
- Click track to jump to value
- Keyboard support (arrow keys for fine adjustment)

#### 10.3.2 Numeric Input

**Appearance**:
- Background: `#2a2a2a`
- Border: 1px solid `#3a3a3a`
- Text: Monospace font, white
- Units: Displayed in muted gray to the right
- Focus State: Border color changes to accent blue

**Behavior**:
- Direct text entry
- Up/down arrow keys increment/decrement
- Validates range on blur
- Reverts to last valid value if out of range

#### 10.3.3 Button Styles

**Primary Button**:
- Background: Accent blue gradient
- Text: White
- Padding: 10px 20px
- Border Radius: 4px
- Hover: Lighter gradient, slight scale
- Active: Darker gradient, pressed effect

**Secondary Button**:
- Background: Transparent
- Border: 1px solid accent color
- Text: Accent color
- Hover: Semi-transparent accent background

**Icon Button**:
- Square aspect ratio
- Transparent background
- Icon: 20px, white/gray
- Hover: Background `#2a2a2a`

#### 10.3.4 Checkbox

**Appearance**:
- Size: 18px square
- Unchecked: Border `#3a3a3a`, transparent background
- Checked: Accent blue background, white checkmark
- Label: 14px, regular, to the right

**Behavior**:
- Toggle on click (entire row clickable)
- Keyboard support (space to toggle)
- Smooth check animation

#### 10.3.5 Collapsible Section

**Appearance**:
- Header: 16px semi-bold text, expand/collapse icon
- Background: `#242424`
- Border: 1px solid `#3a3a3a` between sections
- Expand Icon: Chevron (rotates 90° when expanded)

**Behavior**:
- Click header to expand/collapse
- Smooth height animation
- Remembers state during session

### 10.4 Modal Dialogs

**Export Dialog**:
- Centered overlay
- Semi-transparent backdrop (`rgba(0,0,0,0.7)`)
- Panel: `#242424` background, 8px border radius
- Title: 20px semi-bold
- Item checkboxes: List format with "Select All" button
- Action buttons: Primary (Export) and Secondary (Cancel)

**Save Project Dialog** (on first save):
- Similar style to export dialog
- Text input for project name
- Default value: "Untitled"
- Validation: No special characters except hyphen/underscore

**Confirmation Dialogs**:
- Smaller centered panel
- Warning icon (if applicable)
- Message text
- Two buttons: Confirm (primary) and Cancel (secondary)

### 10.5 Loading & Progress Indicators

**Parameter Update**:
- No loading indicator (real-time, no noticeable delay)

**File Export Progress**:
- Progress bar in export modal
- Percentage text
- Current item being exported
- Cancel button (optional)

**Project Load**:
- Brief loading spinner overlay
- Fades out when complete

---

## 11. User Stories & Use Cases

### 11.1 Primary User Stories

#### Story 1: Design Consistent Dinnerware Set
**As a** product designer
**I want to** adjust global parameters that apply to all dinnerware pieces
**So that** I can create a visually cohesive set with minimal effort

**Acceptance Criteria**:
- Single wall angle parameter affects all 7 items
- Footring parameters create consistent base across set
- Real-time preview shows changes across entire set

#### Story 2: Customize Individual Pieces
**As a** designer with specific requirements
**I want to** override global parameters for individual items
**So that** I can fine-tune specific pieces while maintaining overall consistency

**Acceptance Criteria**:
- Can override any global parameter for any item
- Visual indicator shows which items have overrides
- Can reset override to return to global value

#### Story 3: Export for 3D Printing
**As a** maker
**I want to** export STL files ready for FDM printing
**So that** I can physically produce my custom dinnerware designs

**Acceptance Criteria**:
- High-quality STL export
- Proper file naming convention
- Manifold, printable geometry
- Warnings for potential printing issues

#### Story 4: Iterate on Designs
**As a** designer exploring options
**I want to** save multiple project versions
**So that** I can compare different design approaches

**Acceptance Criteria**:
- Save projects with descriptive names
- Load previously saved projects
- All parameters preserved in save file

#### Story 5: Share Designs
**As a** designer collaborating with others
**I want to** export and import project files
**So that** I can share designs with colleagues or clients

**Acceptance Criteria**:
- Project files portable (JSON format)
- Import restores exact design state
- File size manageable for email/sharing

### 11.2 Use Case Scenarios

#### Scenario A: First-Time User Creates Basic Set

1. User opens app, sees default dinnerware set in viewport
2. User experiments with wall angle slider
3. User sees all 7 items update in real-time with consistent flare
4. User adjusts footring height to create pedestal effect
5. User satisfied with design, clicks "Save Project"
6. User names project "Modern Flared Set"
7. User exports all 6 items as STL files
8. User opens STL files in slicing software for printing

#### Scenario B: Experienced Designer Fine-Tunes Design

1. User loads existing project "Prototype_v2"
2. User notices soup bowl looks too shallow
3. User expands "Per-Item Overrides" section
4. User selects "Soup Bowl" from dropdown
5. User overrides height multiplier to 120%
6. User sees soup bowl update while other items unchanged
7. User enables cross-section view to inspect wall thickness
8. User adjusts wall thickness to 3mm for soup bowl only
9. User sees warning: "Pasta bowl: Wall angle creates overhang"
10. User adjusts pasta bowl wall angle override to fix warning
11. User saves project as "Prototype_v3"
12. User exports only plate, soup bowl, and pasta bowl for test printing

#### Scenario C: Designer Explores Proportional Variations

1. User starts new project
2. User wants oversized serving pieces
3. User adjusts "Global Width Scale" to 120%
4. All items scale proportionally wider
5. User wants shorter plates but taller bowls
6. User expands "Item Proportions" section
7. User edits plate height ratio from 100% to 80%
8. User edits soup bowl height ratio from 240% to 280%
9. User views items in grid mode to compare
10. User switches to cross-section view to verify wall thickness maintained
11. User satisfied, exports complete set

---

## 12. Future Enhancements (Out of Scope for V1)

The following features are not included in the initial version but may be considered for future releases:

### 12.1 Advanced Geometry
- Curved wall profiles (bezier/spline)
- Rim/lip treatments (rolled edges, decorative patterns)
- Well/cavity parameters for plates
- Handle generation for mugs
- Fluted or faceted exteriors

### 12.2 Material & Texture
- Surface texture simulation (glazed, matte, textured)
- Color/material preview
- Multi-material export support

### 12.3 Additional Items
- Teacup with handle
- Gravy boat
- Sugar bowl and creamer
- Salt and pepper shakers
- Additional plate sizes (salad, bread & butter)
- Ramekins

### 12.4 Design Presets
- Template library (Modern, Traditional, Minimalist, etc.)
- Community-shared designs
- Save favorite parameter combinations as presets

### 12.5 Advanced Export
- Export all items in single STL (arranged for printing)
- Export rendering images (PNG/JPG)
- Export technical drawings (PDF)
- Support structure generation
- Print bed layout optimization

### 12.6 Collaboration
- Cloud save/sync
- User accounts
- Share projects via link
- Version history with branching

### 12.7 Advanced Validation
- Print bed size validation (select printer model)
- Material usage estimation
- Print time estimation
- Automatic support detection and suggestion

### 12.8 UI Enhancements
- Undo/redo functionality
- Parameter animation (morph between saved states)
- Side-by-side project comparison
- Measurement tools in viewport
- AR preview (view designs in real-world context via phone)

---

## 13. Success Metrics

### 13.1 Performance Metrics
- Real-time parameter updates < 100ms latency
- 60 FPS viewport interaction with all 6 items visible
- STL export of complete set < 2 seconds
- Application load time < 3 seconds

### 13.2 Quality Metrics
- 100% of exported STL files pass manifold validation
- Zero mesh errors in slicing software
- Successful FDM prints from exported STL files

### 13.3 Usability Metrics
- First-time users can create and export basic set within 10 minutes
- Users can understand parameter relationships without external documentation
- Warning system catches 100% of common printing issues (thin walls, overhangs)

---

## 14. Development Phases

### Phase 1: Core Geometry Engine (Weeks 1-3)
- Parametric mesh generation system
- Basic geometry for all 6 item types
- Footring construction
- Wall thickness application
- STL export functionality

### Phase 2: Parameter System (Weeks 4-5)
- Global parameter implementation
- Per-item scaling multipliers
- Per-item override system
- Real-time updates
- Default values and ratios

### Phase 3: 3D Viewport (Weeks 6-7)
- Three.js integration
- Camera controls (orbit, zoom, pan)
- Camera presets
- Item visibility management
- Row/grid layout modes
- Cross-section view

### Phase 4: UI Implementation (Weeks 8-10)
- Parameter panel with collapsible sections
- Slider and numeric input controls
- Dark theme styling
- Warning display system
- Override indicators
- Responsive layout

### Phase 5: Project Management (Week 11)
- Save/load functionality
- LocalStorage integration
- Project file import/export
- File naming and organization

### Phase 6: Validation & Polish (Weeks 12-13)
- Warning system implementation
- Geometry validation
- Overhang detection
- Wall thickness warnings
- UI refinements
- Performance optimization

### Phase 7: Testing & Documentation (Week 14)
- User testing
- Bug fixes
- Performance tuning
- User documentation
- Code documentation

---

## 15. Technical Architecture

### 15.1 Application Structure

```
dinnerware-generator/
├── index.html
├── styles/
│   ├── main.css
│   ├── components.css
│   └── theme.css
├── scripts/
│   ├── main.js
│   ├── geometry/
│   │   ├── meshGenerator.js
│   │   ├── profileBuilder.js
│   │   ├── footringBuilder.js
│   │   └── stlExporter.js
│   ├── ui/
│   │   ├── parameterPanel.js
│   │   ├── viewport.js
│   │   ├── controls.js
│   │   └── warnings.js
│   ├── state/
│   │   ├── projectState.js
│   │   ├── parameterManager.js
│   │   └── storageManager.js
│   └── utils/
│       ├── validation.js
│       ├── geometry.js
│       └── fileHandling.js
├── assets/
│   ├── icons/
│   └── fonts/
└── lib/
    └── three.js (and dependencies)
```

### 15.2 Core Modules

#### 15.2.1 Geometry Engine
**Responsibility**: Generate 3D meshes from parameters

**Key Functions**:
- `generateItemMesh(itemType, parameters)`: Creates complete mesh for item
- `buildProfile(parameters)`: Generates 2D profile from parameters
- `revolveProfile(profile, segments)`: Creates 3D geometry from revolution
- `applyWallThickness(mesh, thickness)`: Shell operation
- `buildFootring(parameters)`: Generates footring geometry
- `validateGeometry(mesh)`: Checks for manifold, valid geometry

#### 15.2.2 Parameter Manager
**Responsibility**: Handle parameter state and updates

**Key Functions**:
- `setGlobalParameter(name, value)`: Update global parameter
- `setItemOverride(item, parameter, value)`: Set per-item override
- `resetOverride(item, parameter)`: Remove override, revert to global
- `getEffectiveParameter(item, parameter)`: Resolve final value (global or override)
- `validateParameter(name, value)`: Range checking

#### 15.2.3 Viewport Manager
**Responsibility**: 3D rendering and camera control

**Key Functions**:
- `initialize(container)`: Setup Three.js scene
- `updateItemMesh(itemType, mesh)`: Replace mesh in scene
- `setItemVisibility(itemType, visible)`: Show/hide items
- `arrangeItems(mode)`: Position items in row or grid
- `setCameraPreset(preset)`: Apply camera preset view
- `toggleCrossSection(enabled)`: Enable/disable cross-section view

#### 15.2.4 STL Exporter
**Responsibility**: Convert meshes to STL files

**Key Functions**:
- `exportSTL(mesh, filename)`: Generate binary STL file
- `exportMultiple(items, projectName)`: Batch export selected items
- `validateMesh(mesh)`: Pre-export validation

#### 15.2.5 Storage Manager
**Responsibility**: Project persistence

**Key Functions**:
- `saveProject(projectData, filename)`: Save to LocalStorage and download file
- `loadProject(filename)`: Load from file
- `autoSave()`: Periodic auto-save to LocalStorage
- `getRecentProjects()`: Retrieve recent project list

#### 15.2.6 Warning System
**Responsibility**: Validate parameters and display warnings

**Key Functions**:
- `checkWallThickness(item, thickness)`: Validate minimum thickness
- `checkOverhangs(item, parameters)`: Detect overhang issues
- `checkFootringGeometry(parameters)`: Validate footring angles
- `getWarnings()`: Return current warning list
- `clearWarnings()`: Remove all warnings

---

## 16. Glossary

**Base**: Bottom surface of dinnerware item that contacts the table

**Coupe**: Plate style with minimal or no rim

**Cross-Section**: Cut-away view showing interior geometry

**FDM (Fused Deposition Modeling)**: 3D printing technique using melted plastic filament

**Footring**: Raised circular ridge on the base of dinnerware providing stability

**Manifold**: 3D geometry that is watertight with no holes or gaps (required for 3D printing)

**Override**: Per-item parameter value that supersedes global parameter

**Overhang**: Geometry that extends outward beyond support, potentially requiring print supports

**Profile**: 2D cross-sectional outline of an item

**Recess**: Indented or lowered area in the base

**Revolution**: 3D modeling technique rotating 2D profile around axis to create circular form

**Shell**: Hollow 3D form with defined wall thickness

**STL (STereoLithography)**: Standard file format for 3D printing

**Wall Angle**: Angle of sidewalls measured from vertical axis

**Well**: Central depression in plate or shallow bowl (not used in this app)

---

## 17. Appendix

### Appendix A: Reference Images

1. **Group 1.png**: Footring parameter diagram
   - Shows wall angle
   - Footring origin point height
   - Outer and inner footring angles
   - Footring base width

2. **footring_base.png**: Detailed footring base diagram
   - Illustrates footring base width measurement
   - Shows horizontal surface between walls

3. **UI.png**: UI style reference
   - Dark theme color palette
   - Control styling examples
   - Data visualization aesthetics
   - Modern, minimal design approach

### Appendix B: Default Dimension Tables

#### Base Item Dimensions (mm)

| Item | Outer Diameter | Inner Diameter (with wall thickness) | Height | Base Diameter |
|------|----------------|-------------------------------------|--------|---------------|
| Plate | 280 | 275 | 25 | 168 |
| Soup Bowl | 180 | 175 | 60 | 108 |
| Pasta Bowl | 240 | 235 | 50 | 144 |
| Mug | 90 | 85 | 100 | 54 |
| Tumbler | 75 | 70 | 140 | 45 |
| Saucer | 150 | 145 | 20 | 90 |
| Serving Bowl | 280 | 275 | 100 | 168 |

*Based on 2.5mm wall thickness and 60% base diameter ratio*

#### Item Proportional Relationships

| Item | Width (vs Plate) | Height (vs Plate) | Aspect Ratio (H/W) |
|------|------------------|-------------------|-------------------|
| Plate | 100% (280mm) | 100% (25mm) | 0.09 |
| Soup Bowl | 64% (180mm) | 240% (60mm) | 0.33 |
| Pasta Bowl | 86% (240mm) | 200% (50mm) | 0.21 |
| Mug | 32% (90mm) | 400% (100mm) | 1.11 |
| Tumbler | 27% (75mm) | 560% (140mm) | 1.87 |
| Saucer | 54% (150mm) | 80% (20mm) | 0.13 |
| Serving Bowl | 100% (280mm) | 400% (100mm) | 0.36 |

### Appendix C: Parameter Ranges Summary

| Parameter | Unit | Min | Max | Default | Increment |
|-----------|------|-----|-----|---------|-----------|
| Wall Angle | ° | -30 | 45 | 15 | 1 |
| Footring Origin Height | mm | 0 | 50 | 8 | 0.5 |
| Outer Footring Angle | ° | -45 | 45 | 15 | 1 |
| Footring Base Width | mm | 2 | 30 | 8 | 0.5 |
| Inner Footring Angle | ° | -45 | 45 | -15 | 1 |
| Wall Thickness | mm | 0.8 | 10 | 2.5 | 0.1 |
| Base Recess Depth | mm | 0 | 10 | 1 | 0.5 |
| Global Height Scale | % | 50 | 200 | 100 | 5 |
| Global Width Scale | % | 50 | 200 | 100 | 5 |
| Item Height Multiplier | % | 50 | 200 | 100 | 5 |
| Item Width Multiplier | % | 50 | 200 | 100 | 5 |
| Cup Ring Depth | mm | 0 | 10 | 2 | 0.5 |

### Appendix D: Browser Storage Schema

**LocalStorage Keys**:
- `dinnerware_current_project`: Auto-saved current project state
- `dinnerware_recent_projects`: JSON array of recent project metadata
- `dinnerware_user_prefs`: User preferences (UI state, etc.)

**Recent Projects Metadata**:
```json
[
  {
    "name": "ModernSet",
    "lastModified": "2025-12-20T15:30:00Z",
    "thumbnail": "[base64_encoded_preview_image]"
  }
]
```

### Appendix E: STL Export Technical Details

**Binary STL Structure**:
```
UINT8[80]    – Header (unused)
UINT32       – Number of triangles
foreach triangle
    REAL32[3] – Normal vector
    REAL32[3] – Vertex 1
    REAL32[3] – Vertex 2
    REAL32[3] – Vertex 3
    UINT16    – Attribute byte count (unused)
end
```

**Coordinate System**:
- Origin: Item center at base
- X/Y: Horizontal plane
- Z: Vertical axis (up)
- Units: Millimeters

**Export Orientation**:
- Base on Z=0 plane
- Item extends in +Z direction
- Centered on X=0, Y=0

---

## Document Version

**Version**: 1.1
**Date**: 2025-12-30
**Author**: Product Specification for Dinnerware Designer
**Status**: Updated - Added Tumbler item, Platform integration notes

### Changelog

- **v1.1 (2025-12-30)**: Added Tumbler as 7th dinnerware item; Updated all item counts from 6 to 7; Added platform context note referencing Playground Ceramics; Updated app title from "Dinnerware Generator" to "Dinnerware Designer"
- **v1.0 (2025-12-20)**: Initial specification

---

## 18. Detailed Technical Specification

### 18.1 Technology Stack

#### 18.1.1 Core Technologies
- **Frontend Framework**: Vanilla JavaScript (ES6+)
- **3D Rendering**: Three.js (r160+)
- **Build Tool**: Vite (for development and production builds)
- **CSS Framework**: Custom CSS with CSS Grid and Flexbox
- **State Management**: Custom reactive state management system

#### 18.1.2 Three.js Dependencies
- **Core**: `three` (main library)
- **Controls**: `OrbitControls` for camera manipulation
- **Exporters**: `STLExporter` for file export
- **Loaders**: Not required (all geometry is procedurally generated)

#### 18.1.3 Development Dependencies
- **Type Checking**: JSDoc with TypeScript type checking (optional)
- **Linting**: ESLint with recommended rules
- **Formatting**: Prettier
- **Testing**: Vitest for unit tests (geometry calculations)

### 18.2 Geometry Mathematics

#### 18.2.1 Profile Generation Algorithm

**2D Profile Point Calculation**:

For a given item with parameters:
- `R_outer` = outer radius at rim
- `H_total` = total height
- `θ_wall` = wall angle from vertical
- `H_footring` = footring origin height
- `θ_outer` = outer footring angle
- `W_footring` = footring base width
- `θ_inner` = inner footring angle
- `D_recess` = base recess depth

**Profile Points (from top to bottom)**:

1. **Rim Point** (outer edge):
   ```
   P_rim = (R_outer, H_total)
   ```

2. **Wall Transition to Footring**:
   ```
   R_transition = R_outer - (H_total - H_footring) × tan(θ_wall)
   P_transition = (R_transition, H_footring)
   ```

3. **Outer Footring Base**:
   ```
   R_outer_base = R_transition - H_footring × tan(θ_outer)
   P_outer_base = (R_outer_base, 0)
   ```

4. **Inner Footring Base**:
   ```
   R_inner_base = R_outer_base - W_footring
   P_inner_base = (R_inner_base, 0)
   ```

5. **Inner Footring Top**:
   ```
   R_inner_top = R_inner_base + H_footring × tan(θ_inner)
   P_inner_top = (R_inner_top, H_footring)
   ```

6. **Base Surface**:
   - If `D_recess > 0`:
     ```
     P_base_edge = (R_inner_base, -D_recess)
     P_base_center = (0, -D_recess)
     ```
   - If `D_recess = 0`:
     ```
     P_base_edge = P_inner_base
     P_base_center = (0, 0)
     ```

#### 18.2.2 Revolution Algorithm

**Creating 3D Mesh from 2D Profile**:

```javascript
function revolveProfile(profilePoints, radialSegments = 120) {
    const vertices = [];
    const faces = [];

    // Generate vertices by rotating profile around Y-axis
    for (let i = 0; i <= radialSegments; i++) {
        const angle = (i / radialSegments) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        for (let j = 0; j < profilePoints.length; j++) {
            const point = profilePoints[j];
            const x = point.x * cos;
            const z = point.x * sin;
            const y = point.y;

            vertices.push(new Vector3(x, y, z));
        }
    }

    // Generate faces (triangles)
    for (let i = 0; i < radialSegments; i++) {
        for (let j = 0; j < profilePoints.length - 1; j++) {
            const a = i * profilePoints.length + j;
            const b = a + profilePoints.length;
            const c = a + profilePoints.length + 1;
            const d = a + 1;

            // Two triangles per quad
            faces.push(a, b, d);
            faces.push(b, c, d);
        }
    }

    return { vertices, faces };
}
```

#### 18.2.3 Wall Thickness Implementation

**Shell Creation Algorithm**:

1. Generate outer surface mesh using profile revolution
2. Create inner profile by offsetting each point inward by wall thickness
3. For vertical segments: offset horizontally
4. For angled segments: offset perpendicular to surface normal
5. Revolve inner profile to create inner surface
6. Connect top rim edges (create rim surface)
7. Merge outer and inner meshes

**Offset Calculation**:
```javascript
function offsetPoint(point, nextPoint, thickness) {
    // Calculate normal perpendicular to line segment
    const dx = nextPoint.x - point.x;
    const dy = nextPoint.y - point.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    // Normal vector pointing inward
    const nx = -dy / length;
    const ny = dx / length;

    // Offset point
    return {
        x: point.x + nx * thickness,
        y: point.y + ny * thickness
    };
}
```

#### 18.2.4 Saucer Cup Ring Generation

**Cup Ring Algorithm**:

1. Calculate mug base diameter: `D_mug_base`
2. Calculate cup ring radius: `R_cup = D_mug_base / 2 + clearance` (clearance = 2mm)
3. Create ring recess profile:
   ```
   P_outer_top = (R_cup + ring_width, H_surface)
   P_ring_top = (R_cup, H_surface)
   P_ring_bottom = (R_cup, H_surface - cup_ring_depth)
   P_center_bottom = (0, H_surface - cup_ring_depth)
   ```
4. Integrate into saucer profile at center

#### 18.2.5 Geometry Validation

**Manifold Checking**:
```javascript
function isManifold(mesh) {
    const edges = new Map();

    // Each edge should be shared by exactly 2 faces
    for (let face of mesh.faces) {
        for (let i = 0; i < 3; i++) {
            const v1 = face.vertices[i];
            const v2 = face.vertices[(i + 1) % 3];
            const edgeKey = [Math.min(v1, v2), Math.max(v1, v2)].join(',');

            if (!edges.has(edgeKey)) {
                edges.set(edgeKey, 0);
            }
            edges.set(edgeKey, edges.get(edgeKey) + 1);
        }
    }

    // Check all edges are shared by exactly 2 faces
    for (let [edge, count] of edges) {
        if (count !== 2) return false;
    }

    return true;
}
```

**Normal Validation**:
```javascript
function validateNormals(mesh) {
    // All normals should point outward
    const center = mesh.boundingSphere.center;

    for (let i = 0; i < mesh.faces.length; i++) {
        const face = mesh.faces[i];
        const faceCenter = getFaceCenter(face);
        const outwardDir = faceCenter.clone().sub(center).normalize();

        // Normal should point same direction as outward vector
        if (face.normal.dot(outwardDir) < 0) {
            face.normal.negate();
            // Reverse vertex order
            [face.a, face.b, face.c] = [face.c, face.b, face.a];
        }
    }
}
```

### 18.3 State Management Architecture

#### 18.3.1 State Structure

```javascript
const appState = {
    // Global parameters
    globalParameters: {
        wallAngle: 15,
        footringOriginHeight: 8,
        outerFootringAngle: 15,
        footringBaseWidth: 8,
        innerFootringAngle: -15,
        wallThickness: 2.5,
        baseRecessDepth: 1,
        globalHeightScale: 100,
        globalWidthScale: 100
    },

    // Base dimensions (at 100% scale)
    baseDimensions: {
        plate: { diameter: 280, height: 25 },
        soup_bowl: { diameter: 180, height: 60 },
        pasta_bowl: { diameter: 240, height: 50 },
        mug: { diameter: 90, height: 100 },
        tumbler: { diameter: 75, height: 140 },
        saucer: { diameter: 150, height: 20 },
        serving_bowl: { diameter: 280, height: 100 }
    },

    // Item ratios (editable)
    itemRatios: {
        plate: { widthRatio: 100, heightRatio: 100 },
        soup_bowl: { widthRatio: 64, heightRatio: 240 },
        pasta_bowl: { widthRatio: 86, heightRatio: 200 },
        mug: { widthRatio: 32, heightRatio: 400 },
        tumbler: { widthRatio: 27, heightRatio: 560 },
        saucer: { widthRatio: 54, heightRatio: 80 },
        serving_bowl: { widthRatio: 100, heightRatio: 400 }
    },

    // Per-item multipliers
    itemMultipliers: {
        plate: { height: 100, width: 100 },
        soup_bowl: { height: 100, width: 100 },
        pasta_bowl: { height: 100, width: 100 },
        mug: { height: 100, width: 100 },
        tumbler: { height: 100, width: 100 },
        saucer: { height: 100, width: 100 },
        serving_bowl: { height: 100, width: 100 }
    },

    // Per-item parameter overrides
    itemOverrides: {
        // Example: soup_bowl: { wallAngle: 20 }
    },

    // Saucer-specific settings
    saucerSettings: {
        cupRingDepth: 2
    },

    // UI state
    ui: {
        visibleItems: ['plate', 'soup_bowl', 'pasta_bowl', 'mug', 'tumbler', 'saucer', 'serving_bowl'],
        layoutMode: 'row', // 'row' or 'grid'
        crossSectionEnabled: false,
        expandedPanels: ['global-scaling'],
        cameraPreset: 'three-quarter'
    },

    // Project metadata
    project: {
        name: 'Untitled',
        dateCreated: null,
        lastModified: null,
        isDirty: false // Has unsaved changes
    },

    // Active warnings
    warnings: []
};
```

#### 18.3.2 Reactive State Management

```javascript
class StateManager {
    constructor() {
        this.state = this.getInitialState();
        this.listeners = new Map();
        this.history = [];
        this.historyIndex = -1;
    }

    // Subscribe to state changes
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);

        return () => this.listeners.get(path).delete(callback);
    }

    // Update state and notify listeners
    setState(path, value) {
        const oldValue = this.getState(path);
        if (oldValue === value) return;

        // Save to history for undo/redo
        this.saveHistory();

        // Update state
        this.setNestedValue(this.state, path, value);

        // Mark as dirty
        this.state.project.isDirty = true;

        // Notify listeners
        this.notifyListeners(path, value, oldValue);

        // Auto-save to localStorage
        this.autoSave();
    }

    // Get state value by path
    getState(path) {
        return this.getNestedValue(this.state, path);
    }

    // Notify all relevant listeners
    notifyListeners(path, newValue, oldValue) {
        // Exact path match
        if (this.listeners.has(path)) {
            for (let callback of this.listeners.get(path)) {
                callback(newValue, oldValue);
            }
        }

        // Wildcard listeners (e.g., 'globalParameters.*')
        for (let [listenerPath, callbacks] of this.listeners) {
            if (this.pathMatches(path, listenerPath)) {
                for (let callback of callbacks) {
                    callback(newValue, oldValue);
                }
            }
        }
    }

    // Helper functions
    getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => acc[part], obj);
        target[last] = value;
    }
}
```

#### 18.3.3 Parameter Resolution

```javascript
class ParameterResolver {
    constructor(stateManager) {
        this.state = stateManager;
    }

    // Get effective parameter value for an item
    getEffectiveParameter(itemType, parameterName) {
        // Check for override first
        const override = this.state.getState(
            `itemOverrides.${itemType}.${parameterName}`
        );

        if (override !== undefined) {
            return override;
        }

        // Fall back to global parameter
        return this.state.getState(`globalParameters.${parameterName}`);
    }

    // Calculate final dimensions for an item
    getFinalDimensions(itemType) {
        const base = this.state.getState(`baseDimensions.${itemType}`);
        const ratios = this.state.getState(`itemRatios.${itemType}`);
        const multipliers = this.state.getState(`itemMultipliers.${itemType}`);
        const globalScales = {
            width: this.state.getState('globalParameters.globalWidthScale'),
            height: this.state.getState('globalParameters.globalHeightScale')
        };

        // Formula: Final = Base × Ratio × GlobalScale × ItemMultiplier
        return {
            diameter: base.diameter * (ratios.widthRatio / 100) *
                      (globalScales.width / 100) * (multipliers.width / 100),
            height: base.height * (ratios.heightRatio / 100) *
                    (globalScales.height / 100) * (multipliers.height / 100)
        };
    }

    // Get all effective parameters for an item
    getAllParameters(itemType) {
        const parameterNames = [
            'wallAngle', 'footringOriginHeight', 'outerFootringAngle',
            'footringBaseWidth', 'innerFootringAngle', 'wallThickness',
            'baseRecessDepth'
        ];

        const parameters = {};
        for (let name of parameterNames) {
            parameters[name] = this.getEffectiveParameter(itemType, name);
        }

        // Add dimensions
        parameters.dimensions = this.getFinalDimensions(itemType);

        return parameters;
    }
}
```

### 18.4 Mesh Generation Pipeline

#### 18.4.1 Generation Flow

```javascript
class MeshGenerator {
    constructor(parameterResolver) {
        this.resolver = parameterResolver;
    }

    // Main generation function
    generateItemMesh(itemType) {
        // 1. Get effective parameters
        const params = this.resolver.getAllParameters(itemType);

        // 2. Generate outer profile
        const outerProfile = this.generateOuterProfile(params);

        // 3. Generate inner profile (with wall thickness)
        const innerProfile = this.generateInnerProfile(outerProfile, params);

        // 4. Revolve profiles to create 3D geometry
        const outerMesh = this.revolveProfile(outerProfile);
        const innerMesh = this.revolveProfile(innerProfile);

        // 5. Create bottom cap
        const bottomCap = this.generateBottomCap(params);

        // 6. Create top rim
        const topRim = this.generateTopRim(outerProfile, innerProfile);

        // 7. Merge all geometry
        const finalMesh = this.mergeGeometry([
            outerMesh, innerMesh, bottomCap, topRim
        ]);

        // 8. Validate geometry
        this.validateMesh(finalMesh);

        // 9. Compute normals
        finalMesh.computeVertexNormals();

        return finalMesh;
    }

    // Generate outer profile based on parameters
    generateOuterProfile(params) {
        const { diameter, height } = params.dimensions;
        const radius = diameter / 2;

        const profile = [];

        // Rim point
        profile.push({ x: radius, y: height });

        // Wall (may need intermediate points for smooth curves)
        const wallSegments = Math.ceil(height / 2); // 2mm per segment
        for (let i = 1; i <= wallSegments; i++) {
            const h = height - (i / wallSegments) *
                      (height - params.footringOriginHeight);
            const r = radius - (height - h) *
                      Math.tan(params.wallAngle * Math.PI / 180);
            profile.push({ x: r, y: h });
        }

        // Footring
        const footringProfile = this.generateFootringProfile(
            profile[profile.length - 1], params
        );
        profile.push(...footringProfile);

        return profile;
    }

    generateFootringProfile(transitionPoint, params) {
        if (params.footringOriginHeight === 0) {
            // No footring - flat base
            return [
                { x: transitionPoint.x, y: 0 },
                { x: 0, y: 0 }
            ];
        }

        const profile = [];
        const h = params.footringOriginHeight;

        // Outer footring wall
        const outerAngleRad = params.outerFootringAngle * Math.PI / 180;
        const rOuterBase = transitionPoint.x - h * Math.tan(outerAngleRad);
        profile.push({ x: rOuterBase, y: 0 });

        // Footring base
        const rInnerBase = rOuterBase - params.footringBaseWidth;
        profile.push({ x: rInnerBase, y: 0 });

        // Inner footring wall
        const innerAngleRad = params.innerFootringAngle * Math.PI / 180;
        const rInnerTop = rInnerBase + h * Math.tan(innerAngleRad);
        profile.push({ x: rInnerTop, y: h });

        // Base surface (with optional recess)
        if (params.baseRecessDepth > 0) {
            profile.push({ x: rInnerBase, y: -params.baseRecessDepth });
            profile.push({ x: 0, y: -params.baseRecessDepth });
        } else {
            profile.push({ x: 0, y: 0 });
        }

        return profile;
    }
}
```

#### 18.4.2 Performance Optimization

**Geometry Caching**:
```javascript
class GeometryCache {
    constructor() {
        this.cache = new Map();
    }

    // Generate cache key from parameters
    getCacheKey(itemType, parameters) {
        const paramStr = JSON.stringify(parameters);
        return `${itemType}_${paramStr}`;
    }

    // Get cached geometry or generate new
    getGeometry(itemType, parameters, generator) {
        const key = this.getCacheKey(itemType, parameters);

        if (this.cache.has(key)) {
            return this.cache.get(key).clone();
        }

        const geometry = generator();
        this.cache.set(key, geometry);

        // Limit cache size
        if (this.cache.size > 50) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }

        return geometry.clone();
    }
}
```

**Incremental Updates**:
```javascript
class IncrementalMeshUpdater {
    // Update only affected items when parameter changes
    updateAffectedItems(changedParameter, newValue) {
        const affectedItems = this.getAffectedItems(changedParameter);

        for (let itemType of affectedItems) {
            this.updateItemMesh(itemType);
        }
    }

    getAffectedItems(parameter) {
        // If global parameter, affect all items without overrides
        if (this.isGlobalParameter(parameter)) {
            return this.getItemsWithoutOverride(parameter);
        }

        // If item-specific, only affect that item
        return [this.parseItemFromParameter(parameter)];
    }
}
```

### 18.5 Viewport Implementation

#### 18.5.1 Three.js Scene Setup

```javascript
class ViewportManager {
    constructor(container) {
        this.container = container;
        this.setupScene();
        this.setupCamera();
        this.setupRenderer();
        this.setupLights();
        this.setupControls();
        this.setupCrossSectionPlane();

        this.items = new Map();
        this.animate();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
    }

    setupCamera() {
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
        this.camera.position.set(400, 300, 400);
        this.camera.lookAt(0, 0, 0);
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(
            this.container.clientWidth,
            this.container.clientHeight
        );
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.container.appendChild(this.renderer.domElement);
    }

    setupLights() {
        // Ambient light for base illumination
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Key light (main directional light)
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(200, 300, 200);
        keyLight.castShadow = true;
        keyLight.shadow.camera.near = 1;
        keyLight.shadow.camera.far = 1000;
        keyLight.shadow.camera.left = -500;
        keyLight.shadow.camera.right = 500;
        keyLight.shadow.camera.top = 500;
        keyLight.shadow.camera.bottom = -500;
        this.scene.add(keyLight);

        // Fill light (softer, from opposite side)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-200, 200, -200);
        this.scene.add(fillLight);

        // Rim light (from behind for edge definition)
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
        rimLight.position.set(0, 200, -300);
        this.scene.add(rimLight);
    }

    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.minDistance = 50;
        this.controls.maxDistance = 2000;
        this.controls.maxPolarAngle = Math.PI / 2 + 0.1; // Slightly below horizon
    }

    setupCrossSectionPlane() {
        // Create clipping plane for cross-section view
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        this.renderer.clippingPlanes = [];

        // Visual representation of clipping plane
        const planeGeometry = new THREE.PlaneGeometry(500, 500);
        const planeMaterial = new THREE.MeshBasicMaterial({
            color: 0x4a90e2,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        this.clippingPlaneHelper = new THREE.Mesh(planeGeometry, planeMaterial);
        this.clippingPlaneHelper.rotation.y = Math.PI / 2;
        this.clippingPlaneHelper.visible = false;
        this.scene.add(this.clippingPlaneHelper);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
```

#### 18.5.2 Item Arrangement Algorithm

```javascript
class ItemArranger {
    arrangeItems(items, mode, viewportWidth) {
        if (mode === 'row') {
            return this.arrangeRow(items, viewportWidth);
        } else {
            return this.arrangeGrid(items, viewportWidth);
        }
    }

    arrangeRow(items, viewportWidth) {
        // Sort by size (largest to smallest)
        const sorted = this.sortBySize(items);

        // Calculate spacing
        const totalWidth = sorted.reduce((sum, item) =>
            sum + item.dimensions.diameter, 0
        );
        const gap = Math.max(
            sorted[0].dimensions.diameter * 0.2,
            20
        );
        const totalGaps = (sorted.length - 1) * gap;
        const totalSpace = totalWidth + totalGaps;

        // Position items
        let currentX = -totalSpace / 2;
        const positions = [];

        for (let item of sorted) {
            positions.push({
                itemType: item.type,
                position: new THREE.Vector3(
                    currentX + item.dimensions.diameter / 2,
                    0,
                    0
                )
            });
            currentX += item.dimensions.diameter + gap;
        }

        return positions;
    }

    arrangeGrid(items, viewportWidth) {
        const sorted = this.sortBySize(items);
        const cols = 3;
        const rows = 2;

        // Calculate cell size based on largest item
        const maxDiameter = Math.max(...sorted.map(i => i.dimensions.diameter));
        const gap = maxDiameter * 0.2;
        const cellSize = maxDiameter + gap;

        const positions = [];

        for (let i = 0; i < sorted.length; i++) {
            const row = Math.floor(i / cols);
            const col = i % cols;

            const x = (col - (cols - 1) / 2) * cellSize;
            const z = (row - (rows - 1) / 2) * cellSize;

            positions.push({
                itemType: sorted[i].type,
                position: new THREE.Vector3(x, 0, z)
            });
        }

        return positions;
    }

    sortBySize(items) {
        return items.sort((a, b) => {
            const volumeA = a.dimensions.diameter * a.dimensions.height;
            const volumeB = b.dimensions.diameter * b.dimensions.height;
            return volumeB - volumeA;
        });
    }
}
```

### 18.6 STL Export Implementation

```javascript
class STLExporter {
    exportBinary(geometry, filename) {
        // Calculate triangle count
        const triangles = geometry.index ?
            geometry.index.count / 3 :
            geometry.attributes.position.count / 3;

        // Create binary buffer
        const bufferLength = 80 + 4 + (50 * triangles);
        const buffer = new ArrayBuffer(bufferLength);
        const view = new DataView(buffer);

        // Write header (80 bytes)
        const header = `Binary STL - ${filename}`;
        for (let i = 0; i < 80; i++) {
            view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
        }

        // Write triangle count
        view.setUint32(80, triangles, true);

        // Write triangles
        let offset = 84;
        const vertices = geometry.attributes.position.array;
        const normals = geometry.attributes.normal.array;
        const indices = geometry.index ? geometry.index.array : null;

        for (let i = 0; i < triangles; i++) {
            const i3 = i * 3;

            // Get vertex indices
            const a = indices ? indices[i3] * 3 : i3 * 3;
            const b = indices ? indices[i3 + 1] * 3 : (i3 + 1) * 3;
            const c = indices ? indices[i3 + 2] * 3 : (i3 + 2) * 3;

            // Write normal
            view.setFloat32(offset, normals[a], true);
            view.setFloat32(offset + 4, normals[a + 1], true);
            view.setFloat32(offset + 8, normals[a + 2], true);
            offset += 12;

            // Write vertices
            for (let vertex of [a, b, c]) {
                view.setFloat32(offset, vertices[vertex], true);
                view.setFloat32(offset + 4, vertices[vertex + 1], true);
                view.setFloat32(offset + 8, vertices[vertex + 2], true);
                offset += 12;
            }

            // Write attribute byte count (unused)
            view.setUint16(offset, 0, true);
            offset += 2;
        }

        return buffer;
    }

    downloadSTL(buffer, filename) {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();

        URL.revokeObjectURL(url);
    }

    async exportMultiple(items, projectName, progressCallback) {
        const total = items.length;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const filename = `${projectName}_${item.type}.stl`;

            const buffer = this.exportBinary(item.geometry, filename);
            this.downloadSTL(buffer, filename);

            if (progressCallback) {
                progressCallback((i + 1) / total);
            }

            // Small delay to prevent browser blocking multiple downloads
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
}
```

### 18.7 Warning System Implementation

```javascript
class WarningSystem {
    constructor(stateManager, parameterResolver) {
        this.state = stateManager;
        this.resolver = parameterResolver;
        this.warnings = [];

        // Subscribe to parameter changes
        this.state.subscribe('globalParameters.*', () => this.validate());
        this.state.subscribe('itemOverrides.*', () => this.validate());
    }

    validate() {
        this.warnings = [];

        const itemTypes = ['plate', 'soup_bowl', 'pasta_bowl', 'mug', 'tumbler', 'saucer', 'serving_bowl'];

        for (let itemType of itemTypes) {
            const params = this.resolver.getAllParameters(itemType);

            this.checkWallThickness(itemType, params);
            this.checkOverhangs(itemType, params);
            this.checkFootringGeometry(itemType, params);
        }

        this.state.setState('warnings', this.warnings);
    }

    checkWallThickness(itemType, params) {
        const MIN_THICKNESS = 1.2;

        if (params.wallThickness < MIN_THICKNESS) {
            this.warnings.push({
                type: 'wall_thickness',
                severity: 'warning',
                itemType: itemType,
                message: `${this.formatItemName(itemType)}: Wall thickness ` +
                         `(${params.wallThickness}mm) below recommended minimum ` +
                         `(${MIN_THICKNESS}mm) for FDM printing`,
                parameter: 'wallThickness'
            });
        }
    }

    checkOverhangs(itemType, params) {
        const MAX_OVERHANG = 45;

        // Check wall angle
        if (Math.abs(params.wallAngle) > MAX_OVERHANG) {
            this.warnings.push({
                type: 'overhang',
                severity: 'warning',
                itemType: itemType,
                message: `${this.formatItemName(itemType)}: Wall angle ` +
                         `(${params.wallAngle}°) creates overhang exceeding 45° - ` +
                         `may require supports`,
                parameter: 'wallAngle'
            });
        }

        // Check footring angles
        if (Math.abs(params.outerFootringAngle) > MAX_OVERHANG) {
            this.warnings.push({
                type: 'overhang',
                severity: 'warning',
                itemType: itemType,
                message: `${this.formatItemName(itemType)}: Outer footring angle ` +
                         `(${params.outerFootringAngle}°) creates overhang ` +
                         `exceeding 45° - may require supports`,
                parameter: 'outerFootringAngle'
            });
        }
    }

    checkFootringGeometry(itemType, params) {
        // Check if footring angles create impossible geometry
        const h = params.footringOriginHeight;
        if (h === 0) return;

        const outerOffset = h * Math.tan(params.outerFootringAngle * Math.PI / 180);
        const innerOffset = h * Math.tan(params.innerFootringAngle * Math.PI / 180);

        // If offsets point in wrong directions and exceed base width
        if (outerOffset < 0 && Math.abs(outerOffset) + Math.abs(innerOffset) > params.footringBaseWidth) {
            this.warnings.push({
                type: 'impossible_geometry',
                severity: 'warning',
                itemType: itemType,
                message: `${this.formatItemName(itemType)}: Footring angles ` +
                         `create impossible geometry - adjust inner or outer angle`,
                parameters: ['outerFootringAngle', 'innerFootringAngle']
            });
        }
    }

    formatItemName(itemType) {
        return itemType.split('_').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
}
```

### 18.8 File Format Specifications

#### 18.8.1 Project JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "projectName", "globalParameters"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+$",
      "description": "File format version"
    },
    "projectName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 255
    },
    "dateCreated": {
      "type": "string",
      "format": "date-time"
    },
    "lastModified": {
      "type": "string",
      "format": "date-time"
    },
    "globalParameters": {
      "type": "object",
      "properties": {
        "wallAngle": {"type": "number", "minimum": -30, "maximum": 45},
        "footringOriginHeight": {"type": "number", "minimum": 0, "maximum": 50},
        "outerFootringAngle": {"type": "number", "minimum": -45, "maximum": 45},
        "footringBaseWidth": {"type": "number", "minimum": 2, "maximum": 30},
        "innerFootringAngle": {"type": "number", "minimum": -45, "maximum": 45},
        "wallThickness": {"type": "number", "minimum": 0.8, "maximum": 10},
        "baseRecessDepth": {"type": "number", "minimum": 0, "maximum": 10},
        "globalHeightScale": {"type": "number", "minimum": 50, "maximum": 200},
        "globalWidthScale": {"type": "number", "minimum": 50, "maximum": 200}
      }
    },
    "itemRatios": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "widthRatio": {"type": "number"},
          "heightRatio": {"type": "number"}
        }
      }
    },
    "itemMultipliers": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "height": {"type": "number", "minimum": 50, "maximum": 200},
          "width": {"type": "number", "minimum": 50, "maximum": 200}
        }
      }
    },
    "itemOverrides": {
      "type": "object",
      "additionalProperties": {
        "type": "object"
      }
    },
    "saucerSettings": {
      "type": "object",
      "properties": {
        "cupRingDepth": {"type": "number", "minimum": 0, "maximum": 10}
      }
    }
  }
}
```

#### 18.8.2 LocalStorage Structure

```javascript
// Key: dinnerware_current_project
{
    "state": { /* full app state */ },
    "timestamp": "2025-12-20T15:30:00Z"
}

// Key: dinnerware_recent_projects
[
    {
        "name": "ModernSet",
        "path": "~/Documents/ModernSet.json",
        "lastModified": "2025-12-20T15:30:00Z",
        "thumbnail": "data:image/png;base64,..."
    }
]

// Key: dinnerware_user_prefs
{
    "ui": {
        "defaultLayoutMode": "row",
        "defaultCameraPreset": "three-quarter",
        "autoSaveInterval": 30000
    },
    "export": {
        "defaultPath": "~/Downloads",
        "includeDateInFilename": false
    }
}
```

### 18.9 Testing Strategy

#### 18.9.1 Unit Tests

```javascript
// tests/geometry.test.js
describe('Profile Generation', () => {
    test('generates correct rim point', () => {
        const params = {
            dimensions: { diameter: 280, height: 25 },
            wallAngle: 15,
            // ... other params
        };

        const profile = generateOuterProfile(params);
        expect(profile[0]).toEqual({ x: 140, y: 25 });
    });

    test('handles zero footring height', () => {
        const params = {
            dimensions: { diameter: 280, height: 25 },
            footringOriginHeight: 0,
            // ... other params
        };

        const profile = generateOuterProfile(params);
        const lastPoint = profile[profile.length - 1];
        expect(lastPoint.y).toBe(0);
    });
});

describe('Parameter Resolution', () => {
    test('returns override when present', () => {
        const state = createTestState({
            globalParameters: { wallAngle: 15 },
            itemOverrides: { soup_bowl: { wallAngle: 20 } }
        });

        const resolver = new ParameterResolver(state);
        expect(resolver.getEffectiveParameter('soup_bowl', 'wallAngle')).toBe(20);
    });

    test('returns global when no override', () => {
        const state = createTestState({
            globalParameters: { wallAngle: 15 }
        });

        const resolver = new ParameterResolver(state);
        expect(resolver.getEffectiveParameter('plate', 'wallAngle')).toBe(15);
    });
});

describe('STL Export', () => {
    test('generates valid binary STL', () => {
        const geometry = createTestGeometry();
        const exporter = new STLExporter();

        const buffer = exporter.exportBinary(geometry, 'test.stl');

        // Check header
        expect(buffer.byteLength).toBeGreaterThan(84);

        // Check triangle count
        const view = new DataView(buffer);
        const triangleCount = view.getUint32(80, true);
        expect(triangleCount).toBeGreaterThan(0);
    });
});
```

#### 18.9.2 Integration Tests

```javascript
describe('Full Workflow', () => {
    test('parameter change updates mesh', async () => {
        const app = createTestApp();

        // Change parameter
        app.setState('globalParameters.wallAngle', 20);

        // Wait for mesh update
        await waitFor(() => app.getMesh('plate'));

        // Verify mesh was regenerated
        const mesh = app.getMesh('plate');
        expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
    });

    test('save and load project preserves state', () => {
        const app = createTestApp();

        // Modify state
        app.setState('globalParameters.wallAngle', 25);
        app.setState('itemOverrides.soup_bowl.wallThickness', 3.0);

        // Save project
        const projectData = app.saveProject();

        // Create new app and load
        const newApp = createTestApp();
        newApp.loadProject(projectData);

        // Verify state preserved
        expect(newApp.getState('globalParameters.wallAngle')).toBe(25);
        expect(newApp.getState('itemOverrides.soup_bowl.wallThickness')).toBe(3.0);
    });
});
```

### 18.10 Performance Benchmarks

```javascript
// Performance targets and monitoring

const PERFORMANCE_TARGETS = {
    // Mesh generation
    singleItemGeneration: 50,        // ms
    allItemsGeneration: 300,          // ms

    // Parameter updates
    parameterChangeLatency: 100,      // ms

    // Rendering
    frameRate: 60,                    // fps
    frameTime: 16.67,                 // ms

    // File operations
    projectSave: 500,                 // ms
    projectLoad: 1000,                // ms
    stlExport: 2000,                  // ms per item

    // Memory
    maxMemoryUsage: 500,              // MB

    // UI responsiveness
    controlUpdateLatency: 50          // ms
};

class PerformanceMonitor {
    constructor() {
        this.metrics = new Map();
    }

    measure(name, fn) {
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;

        this.recordMetric(name, duration);

        if (duration > PERFORMANCE_TARGETS[name]) {
            console.warn(
                `Performance warning: ${name} took ${duration}ms ` +
                `(target: ${PERFORMANCE_TARGETS[name]}ms)`
            );
        }

        return result;
    }

    async measureAsync(name, fn) {
        const start = performance.now();
        const result = await fn();
        const duration = performance.now() - start;

        this.recordMetric(name, duration);
        return result;
    }

    recordMetric(name, value) {
        if (!this.metrics.has(name)) {
            this.metrics.set(name, []);
        }

        this.metrics.get(name).push({
            value,
            timestamp: Date.now()
        });

        // Keep only last 100 measurements
        const measurements = this.metrics.get(name);
        if (measurements.length > 100) {
            measurements.shift();
        }
    }

    getStats(name) {
        const measurements = this.metrics.get(name) || [];
        if (measurements.length === 0) return null;

        const values = measurements.map(m => m.value);
        const avg = values.reduce((a, b) => a + b) / values.length;
        const max = Math.max(...values);
        const min = Math.min(...values);

        return { avg, max, min, count: values.length };
    }
}
```

---

**End of Product Specification**
