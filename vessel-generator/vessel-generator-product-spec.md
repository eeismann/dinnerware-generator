# Vessel Generator - Product Specification

## 1. Executive Summary

A web-based parametric design tool for creating custom vases and vessels with granular control over every anatomical section. Unlike simple parametric generators, this tool provides independent control over each vessel section (mouth, lip, neck, shoulder, body, waist, foot) with the flexibility to create both organic curved forms and geometric flat-walled designs.

### 1.1 Target Users
- Ceramic artists designing custom vase collections
- Product designers creating decorative vessels
- 3D printing enthusiasts crafting unique home décor
- Artists exploring parametric ceramic design
- Small manufacturers prototyping vessel designs
- Florists designing vessels for specific arrangements

### 1.2 Core Value Proposition
- **Section-by-Section Control**: Independent parametric control over all vessel anatomy (Mouth, Lip, Neck, Shoulder, Body, Waist, Foot)
- **Dual Wall Modes**: Switch between organic curved walls and geometric flat-angled walls — independently per section
- **Visual Profile Editor**: Interactive 2D cross-section editor with draggable bezier handles for precise curve control
- **Multi-Body Support**: Create complex forms with 1-7 independent body bulges (gourds, multi-bellied forms)
- **Transition Sharpness Control**: Fine-grained control over blending between sections (smooth to sharp carination)
- **Real-time 3D Preview**: Interactive visualization with section highlighting
- **Export-Ready STL**: High-quality manifold geometry for 3D printing
- **Project Save/Load**: Save and load vessel designs as project files
- **Local-Only Privacy**: Runs entirely in browser, no server required

---

## 2. Vessel Anatomy & Section Definitions

Based on classical ceramic vessel terminology, the vessel is divided into distinct anatomical sections:

```
                    ┌─────────────┐
                    │    MOUTH    │ ← Opening/aperture diameter
                    ├─────────────┤
                    │     LIP     │ ← Rim edge treatment (optional)
                    ├─────────────┤
                    │             │
                    │    NECK     │ ← Narrow section between lip and shoulder
                    │             │
                    ├─────────────┤
                    │             │
                    │  SHOULDER   │ ← Outward curve under neck
                    │             │
                    ├─────────────┤
                    │             │
                    │    BODY     │ ← Main section (can be multi-bulge)
                    │  (1-7 sections)  │
                    │             │
                    ├─────────────┤
                    │   WAIST     │ ← Optional inward curve (decorative)
                    ├─────────────┤
                    │    FOOT     │ ← Base/bottom projection
                    └─────────────┘
```

### 2.1 Section Definitions

| Section | Description | Typical Height Range | Function |
|---------|-------------|---------------------|----------|
| **Mouth** | Top opening of the vessel | Fixed at top | Defines aperture size |
| **Lip** | Rim/edge treatment at top | 2-30mm | Structural/decorative edge |
| **Neck** | Narrow section below lip | 0-250mm | Creates visual proportion, often narrowest |
| **Shoulder** | Outward curve under neck | 0-200mm | Defines vessel character, often widest |
| **Body** | Main vessel volume (1-7 sections) | 20-500mm | Primary volume/capacity |
| **Waist** | Optional inward narrowing | 0-150mm | Decorative hourglass effect |
| **Foot** | Base projection for stability | 0-100mm | Stability and visual grounding |

### 2.2 Section Enablement

Each section can be independently enabled/disabled:
- **Mouth**: Always enabled (required)
- **Lip**: Optional (disable for raw/cut edge)
- **Neck**: Optional (disable for bowl-like forms)
- **Shoulder**: Optional (disable for cylinder/straight forms)
- **Body**: Always enabled (required) — supports 1-7 sections
- **Waist**: Optional (enable for hourglass/gourd effects)
- **Foot**: Optional (disable for flat-bottom vessels)

---

## 3. Wall Mode System

### 3.1 Global Wall Mode

The vessel can operate in two fundamental modes that affect how section profiles are generated:

#### 3.1.1 Curved Mode (Default)
- **Description**: Organic, smooth transitions between diameters
- **Control**: Bezier curve handles for each section
- **Result**: Continuous, flowing profiles reminiscent of wheel-thrown ceramics
- **Best For**: Classical vases, organic forms, traditional aesthetics

#### 3.1.2 Flat Mode (Multi-Angle)
- **Description**: Geometric, angular transitions with precise angle control
- **Control**: Angle in degrees from vertical for each section wall
- **Result**: Faceted, architectural profiles with crisp transitions
- **Best For**: Modern/contemporary designs, geometric forms, architectural vessels

### 3.2 Per-Section Wall Mode Override

Each section can override the global wall mode:
- **Inherit Global**: Uses global wall mode setting
- **Force Curved**: This section uses curved profile regardless of global
- **Force Flat**: This section uses flat/angled profile regardless of global

This enables hybrid designs (e.g., curved body with angular shoulder).

---

## 4. Global Vessel Parameters

### 4.1 Overall Dimensions

#### 4.1.1 Total Height
- **Description**: Overall height from bottom of foot to top of lip
- **Units**: Millimeters (mm)
- **Range**: 50mm to 1000mm
- **Default**: 250mm
- **Behavior**: When changed, proportionally scales all section heights unless sections are locked

#### 4.1.2 Maximum Diameter
- **Description**: Widest diameter anywhere on the vessel
- **Units**: Millimeters (mm)
- **Range**: 30mm to 600mm
- **Default**: 150mm
- **Note**: Read-only display; determined by section parameters

#### 4.1.3 Mouth Diameter
- **Description**: Inner diameter of the top opening
- **Units**: Millimeters (mm)
- **Range**: 10mm to 500mm
- **Default**: 80mm
- **Constraint**: Cannot exceed shoulder/body diameter

#### 4.1.4 Base Diameter
- **Description**: Diameter at the very bottom of the vessel
- **Units**: Millimeters (mm)
- **Range**: 15mm to 400mm
- **Default**: 60mm
- **Note**: Affects foot construction and stability

### 4.2 Wall Properties

#### 4.2.1 Wall Thickness
- **Description**: Default wall thickness throughout vessel
- **Units**: Millimeters (mm)
- **Range**: 1.0mm to 20mm
- **Default**: 3.0mm
- **Validation**: Warning if < 1.5mm (fragile for FDM printing)

#### 4.2.2 Wall Thickness Mode
- **Options**: 
  - **Uniform**: Same thickness throughout
  - **Variable**: Thickness varies from top to bottom
- **Default**: Uniform

#### 4.2.3 Wall Thickness (Top) — Variable Mode
- **Description**: Wall thickness at mouth/lip area
- **Units**: Millimeters (mm)
- **Range**: 1.0mm to 20mm
- **Default**: 2.5mm

#### 4.2.4 Wall Thickness (Bottom) — Variable Mode
- **Description**: Wall thickness at foot/base area
- **Units**: Millimeters (mm)
- **Range**: 1.0mm to 20mm
- **Default**: 4.0mm

### 4.3 Proportion Mode

#### 4.3.1 Section Height Mode
- **Options**:
  - **Absolute**: Each section height in mm
  - **Proportional**: Each section height as % of total
- **Default**: Proportional
- **Note**: Proportional mode maintains ratios when total height changes

#### 4.3.2 Lock Section Heights
- **Description**: When enabled, changing total height doesn't affect section heights
- **Type**: Boolean per section
- **Default**: All unlocked

---

## 5. Section-Specific Parameters

### 5.1 Lip Parameters

The lip defines the rim treatment at the top edge of the vessel.

#### 5.1.1 Lip Enabled
- **Type**: Boolean
- **Default**: true

#### 5.1.2 Lip Style
- **Options**:
  - **Straight**: Vertical continuation (no flare)
  - **Flared Outward**: Opens outward at angle
  - **Flared Inward**: Closes inward at angle
  - **Rolled Outward**: Classic outward curl/bead
  - **Rolled Inward**: Inward curl (good for pouring)
  - **Beaded**: Decorative rounded bead
  - **Collared**: Distinct ring addition
  - **Squared**: Flat horizontal top edge
- **Default**: Straight

#### 5.1.3 Lip Height
- **Units**: Millimeters (mm)
- **Range**: 2mm to 30mm
- **Default**: 8mm

#### 5.1.4 Lip Thickness
- **Description**: Additional thickness beyond base wall
- **Units**: Millimeters (mm)
- **Range**: 0mm to 15mm
- **Default**: 1mm

#### 5.1.5 Lip Flare Angle (Flared styles)
- **Units**: Degrees (°)
- **Range**: -45° to 60°
- **Default**: 15°

#### 5.1.6 Lip Roll Diameter (Rolled styles)
- **Units**: Millimeters (mm)
- **Range**: 3mm to 20mm
- **Default**: 6mm

#### 5.1.7 Lip Bead Size (Beaded style)
- **Units**: Millimeters (mm)
- **Range**: 2mm to 15mm
- **Default**: 5mm

### 5.2 Neck Parameters

The neck is the narrow section between the lip and shoulder.

#### 5.2.1 Neck Enabled
- **Type**: Boolean
- **Default**: true

#### 5.2.2 Neck Height
- **Units**: Millimeters (mm) or Percentage (%)
- **Range**: 10mm to 250mm (or 5% to 50%)
- **Default**: 50mm (20%)

#### 5.2.3 Neck Top Diameter
- **Description**: Diameter at top of neck (below lip)
- **Units**: Millimeters (mm)
- **Range**: 15mm to 400mm
- **Default**: Equals mouth diameter

#### 5.2.4 Neck Bottom Diameter
- **Description**: Diameter at bottom of neck (at shoulder)
- **Units**: Millimeters (mm)
- **Range**: 15mm to 500mm
- **Default**: 100mm

#### 5.2.5 Neck Wall Mode Override
- **Options**: Inherit Global, Force Curved, Force Flat
- **Default**: Inherit Global

#### 5.2.6 Neck Wall Angle (Flat Mode)
- **Description**: Angle from vertical
- **Units**: Degrees (°)
- **Range**: -60° to 60°
- **Default**: Calculated from diameter difference

#### 5.2.7 Neck Profile Curve (Curved Mode)
- **Options**:
  - **Straight**: Linear transition
  - **Concave**: Curves inward (hourglass effect)
  - **Convex**: Curves outward (bulging)
  - **S-Curve**: Serpentine curve
  - **Custom**: User-defined bezier
- **Default**: Concave (slight)

#### 5.2.8 Neck Curve Intensity
- **Description**: How pronounced the curve is
- **Units**: Percentage (%)
- **Range**: 0% to 100%
- **Default**: 30%
- **Note**: 0% = straight line regardless of profile type

#### 5.2.9 Neck Curve Apex Position
- **Description**: Where curve reaches maximum bulge/pinch
- **Units**: Percentage (%) from top
- **Range**: 10% to 90%
- **Default**: 50%

### 5.3 Shoulder Parameters

The shoulder is the outward-curving section under the neck, typically the widest part.

#### 5.3.1 Shoulder Enabled
- **Type**: Boolean
- **Default**: true

#### 5.3.2 Shoulder Height
- **Units**: Millimeters (mm) or Percentage (%)
- **Range**: 10mm to 200mm (or 5% to 40%)
- **Default**: 40mm (16%)

#### 5.3.3 Shoulder Top Diameter
- **Description**: Diameter at top (from neck)
- **Units**: Millimeters (mm)
- **Range**: 30mm to 500mm
- **Default**: Inherited from neck bottom

#### 5.3.4 Shoulder Maximum Diameter
- **Description**: Widest point of shoulder
- **Units**: Millimeters (mm)
- **Range**: 30mm to 600mm
- **Default**: 150mm

#### 5.3.5 Shoulder Bottom Diameter
- **Description**: Diameter at bottom (to body)
- **Units**: Millimeters (mm)
- **Range**: 30mm to 500mm
- **Default**: 140mm

#### 5.3.6 Shoulder Max Diameter Position
- **Description**: Height where maximum diameter occurs
- **Units**: Percentage (%) from top of shoulder
- **Range**: 0% to 100%
- **Default**: 70%
- **Note**: 0% = widest at top, 100% = widest at bottom

#### 5.3.7 Shoulder Wall Mode Override
- **Options**: Inherit Global, Force Curved, Force Flat
- **Default**: Inherit Global

#### 5.3.8 Shoulder Wall Angle (Flat Mode)
- **Units**: Degrees (°)
- **Range**: -75° to 75°
- **Default**: Calculated from diameters

#### 5.3.9 Shoulder Profile Curve (Curved Mode)
- **Options**: Circular Arc, Elliptical, Parabolic, Ogee, S-Curve, Custom
- **Default**: Circular Arc

#### 5.3.10 Shoulder Curve Tension
- **Description**: How "full" vs "flat" the curve is
- **Units**: Percentage (%)
- **Range**: 10% to 100%
- **Default**: 70%

#### 5.3.11 Shoulder-to-Neck Transition
- **Description**: Sharpness of transition from neck to shoulder
- **Units**: Percentage (%)
- **Range**: 0% (smooth blend) to 100% (sharp carination)
- **Default**: 20%

#### 5.3.12 Shoulder-to-Body Transition
- **Description**: Sharpness of transition from shoulder to body
- **Units**: Percentage (%)
- **Range**: 0% to 100%
- **Default**: 10%

### 5.4 Body Parameters

The body is the main volume section, supporting 1-5 independent bulge sections.

#### 5.4.1 Body Section Count
- **Range**: 1 to 7
- **Default**: 1
- **Note**: Multiple sections create gourd-like/multi-bellied forms with automatic waist transitions between each

#### 5.4.2 Per-Section Parameters (for each of 1-5 sections)

Each body section has these independent controls:

##### Height
- **Units**: Millimeters (mm) or Percentage (%)
- **Range**: 20mm to 400mm
- **Default**: 100mm (single section)

##### Top Diameter
- **Units**: Millimeters (mm)
- **Range**: 30mm to 500mm
- **Default**: Inherited from section above

##### Bottom Diameter
- **Units**: Millimeters (mm)
- **Range**: 30mm to 500mm
- **Default**: 100mm

##### Maximum Diameter
- **Units**: Millimeters (mm)
- **Range**: 30mm to 600mm
- **Default**: Larger of top/bottom

##### Max Diameter Position
- **Units**: Percentage (%) from top
- **Range**: 0% to 100%
- **Default**: 40%

##### Wall Mode Override
- **Options**: Inherit Global, Force Curved, Force Flat
- **Default**: Inherit Global

##### Wall Angle (Flat Mode)
- **Units**: Degrees (°)
- **Range**: -75° to 75°

##### Profile Curve (Curved Mode)
- **Options**: Straight, Convex, Concave, S-Curve, Ogee, Custom
- **Default**: Convex (slight)

##### Curve Intensity
- **Units**: Percentage (%)
- **Range**: 0% to 100%
- **Default**: 25%

#### 5.4.3 Inter-Section Transitions
- **Description**: Sharpness of transitions between body sections
- **Units**: Percentage (%)
- **Range**: 0% to 100%
- **Default**: 30%
- **Note**: Higher values create more distinct "waists" between bulges
- **Count**: Up to 6 transition points for a 7-section body

#### 5.4.4 Body Section Bezier Controls
Each body section in Curved Mode has independent bezier handles:
- **Handle 1 X/Y**: Control point for top of section curve
- **Handle 2 X/Y**: Control point for bottom of section curve
- **Visual Editor**: Drag handles directly in Profile Editor
- **Numeric Entry**: Can also set handle positions via parameter panel

### 5.5 Waist Parameters

Optional decorative narrowing, typically between body and foot.

#### 5.5.1 Waist Enabled
- **Type**: Boolean
- **Default**: false

#### 5.5.2 Waist Height
- **Units**: Millimeters (mm) or Percentage (%)
- **Range**: 5mm to 150mm (or 2% to 30%)
- **Default**: 25mm (10%)

#### 5.5.3 Waist Diameter
- **Description**: Minimum diameter at waist
- **Units**: Millimeters (mm)
- **Range**: 20mm to (body bottom diameter - 10mm)
- **Default**: 70% of body bottom diameter

#### 5.5.4 Waist Position
- **Description**: Where waist occurs relative to total waist section
- **Units**: Percentage (%) from top
- **Range**: 20% to 80%
- **Default**: 50%

#### 5.5.5 Waist Wall Mode Override
- **Options**: Inherit Global, Force Curved, Force Flat
- **Default**: Inherit Global

#### 5.5.6 Waist Profile (Curved Mode)
- **Options**: Circular, Elliptical, Sharp V, Soft U, Custom
- **Default**: Circular

#### 5.5.7 Waist Curve Depth
- **Description**: How deep the inward curve goes
- **Units**: Percentage (%)
- **Range**: 10% to 100%
- **Default**: 50%

### 5.6 Foot Parameters

The foot provides stability and visual grounding.

#### 5.6.1 Foot Enabled
- **Type**: Boolean
- **Default**: true
- **Note**: When disabled, vessel has flat bottom

#### 5.6.2 Foot Style
- **Options**:
  - **Footring**: Traditional ceramic ring foot
  - **Pedestal**: Solid cylindrical base
  - **Flared**: Outward-spreading base
  - **Tapered**: Inward-narrowing base
  - **Stepped**: Multiple horizontal rings
- **Default**: Footring

#### 5.6.3 Foot Height
- **Units**: Millimeters (mm)
- **Range**: 5mm to 100mm
- **Default**: 15mm

#### 5.6.4 Foot Top Diameter
- **Description**: Where foot meets body/waist
- **Units**: Millimeters (mm)
- **Range**: 20mm to 400mm
- **Default**: Inherited from waist/body bottom

#### 5.6.5 Foot Bottom Diameter
- **Description**: Diameter at very bottom
- **Units**: Millimeters (mm)
- **Range**: 15mm to 400mm
- **Default**: 60mm

#### 5.6.6 Foot Wall Mode Override
- **Options**: Inherit Global, Force Curved, Force Flat
- **Default**: Inherit Global

#### 5.6.7 Foot Wall Angle (Flat Mode / Footring)
- **Units**: Degrees (°)
- **Range**: -60° to 60°
- **Default**: 15°

#### 5.6.8 Foot Profile (Curved Mode)
- **Options**: Straight, Convex, Concave, Ogee
- **Default**: Straight

### 5.7 Footring-Specific Parameters (when Foot Style = Footring)

#### 5.7.1 Footring Base Width
- **Description**: Width of the contact surface
- **Units**: Millimeters (mm)
- **Range**: 2mm to 40mm
- **Default**: 10mm

#### 5.7.2 Outer Footring Angle
- **Units**: Degrees (°)
- **Range**: -60° to 60°
- **Default**: 15°

#### 5.7.3 Inner Footring Angle
- **Units**: Degrees (°)
- **Range**: -60° to 60°
- **Default**: -15°

#### 5.7.4 Base Recess Depth
- **Description**: Depth of recess inside footring
- **Units**: Millimeters (mm)
- **Range**: 0mm to 15mm
- **Default**: 2mm
- **Note**: 0mm = flush base

---

## 6. Advanced Features

### 6.1 Visual Profile Editor

A critical feature: an interactive 2D cross-section editor that displays alongside the 3D viewport, allowing direct manipulation of the vessel profile.

#### 6.1.1 Editor Layout
- **Display**: 2D side-view cross-section of vessel profile
- **Orientation**: Height on Y-axis, radius on X-axis
- **Scale**: Auto-fit with zoom/pan controls
- **Background**: Grid for measurement reference

#### 6.1.2 Section Visualization
- Each section displayed as a distinct region
- Section boundaries shown as horizontal lines
- Color-coded sections matching parameter panel
- Active section highlighted

#### 6.1.3 Draggable Control Points
For each section in Curved Mode:
- **Endpoint Handles**: Drag to adjust diameter at section boundaries
- **Bezier Handles**: Two control handles per section for curve shape
- **Handle Constraints**: Handles maintain tangent continuity at boundaries (optional)

#### 6.1.4 Bezier Curve Control
- **Start Point**: Fixed at section top diameter (draggable horizontally)
- **End Point**: Fixed at section bottom diameter (draggable horizontally)
- **Handle 1**: Bezier control handle for start point (direction + magnitude)
- **Handle 2**: Bezier control handle for end point (direction + magnitude)
- **Visual Feedback**: Handle lines and control points visible when section selected

#### 6.1.5 Flat Mode Visualization
For sections in Flat Mode:
- Straight line between top and bottom diameters
- Angle displayed numerically
- Drag endpoints to adjust diameters

#### 6.1.6 Real-time Sync
- All changes in profile editor instantly update 3D viewport
- All changes in parameter panel instantly update profile editor
- Bi-directional synchronization

#### 6.1.7 Editor Controls
- **Zoom**: Mouse wheel or pinch
- **Pan**: Middle mouse drag or two-finger drag
- **Reset View**: Button to fit vessel in view
- **Toggle**: Show/hide profile editor panel

### 6.2 Transition Sharpness System

Transition sharpness between sections is a critical design control, determining whether sections flow smoothly into each other or create distinct visual breaks (carinations).

#### 6.2.1 Transition Sharpness Parameter
- **Available At**: Every section boundary (Lip↔Neck, Neck↔Shoulder, Shoulder↔Body, Body sections, Body↔Waist, Waist↔Foot)
- **Range**: 0% to 100%
- **0% (Smooth)**: Continuous tangent across boundary, sections blend seamlessly
- **100% (Sharp)**: Distinct angle/edge at boundary, creates visible carination line
- **50% (Default)**: Balanced blend with subtle definition

#### 6.2.2 Visual Feedback
- Transition sharpness visualized in Profile Editor as curve continuity
- Sharp transitions show as angular corners
- Smooth transitions show as continuous curves
- Highlight transition zones when parameter is being adjusted

#### 6.2.3 Per-Boundary Control
Each transition point has independent sharpness:
- Lip to Neck transition
- Neck to Shoulder transition
- Shoulder to Body transition
- Body Section to Body Section transitions (up to 6 for 7-section bodies)
- Body to Waist transition
- Waist to Foot transition

### 6.3 Section Highlighting

#### 6.3.1 Hover Highlighting
- When hovering over section parameters, corresponding section glows in 3D view
- Different color per section for easy identification

#### 6.3.2 Section Selection
- Click section in 3D view to expand its parameters in panel
- Click section in Profile Editor to select
- Selected section shows boundary lines in viewport

### 6.4 Dimension Overlays

#### 6.4.1 Toggle Dimension Display
- Show/hide dimension annotations in 3D view
- Displays diameters at key points
- Displays section heights

#### 6.4.2 Measurement Tool
- Click two points to measure distance
- Hover to see local diameter/radius

### 6.5 Profile Editor Integration

#### 6.5.1 Dual View Layout
- Profile Editor can be displayed as:
  - Side panel (alongside parameter panel)
  - Overlay on 3D viewport
  - Detached floating window
- User preference saved

#### 6.5.2 Synchronized Editing
- Drag points in Profile Editor → updates parameters and 3D view
- Change parameters in panel → updates Profile Editor and 3D view
- Rotate 3D view → Profile Editor maintains consistent 2D cross-section

#### 6.5.3 Context-Sensitive Controls
- When section selected, Profile Editor zooms to that section
- Bezier handles only shown for active section
- Quick-access buttons for common curve presets (Convex, Concave, S-Curve, Straight)

---

## 7. User Interface Specification

### 7.1 Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Header: App Title, Project Name, New/Save/Load/Export                  │
├───────────────┬─────────────────────────────┬───────────────────────────┤
│               │                             │                           │
│   Parameter   │      3D Viewport            │    Profile Editor         │
│   Panel       │                             │    (2D Cross-Section)     │
│   (Left)      │  [Interactive 3D View]      │                           │
│               │                             │    [Draggable Bezier      │
│   - Sections  │  [Section Highlighting]     │     Control Points]       │
│     Accordion │                             │                           │
│   - Controls  │  [Dimension Overlays]       │    [Section Boundaries]   │
│               │                             │                           │
├───────────────┴─────────────────────────────┴───────────────────────────┤
│  Footer: View Controls, Profile Editor Toggle, Settings                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**Alternative Layout**: Profile Editor can be toggled to overlay the 3D viewport for users who prefer more viewport space.

### 7.2 Parameter Panel Organization

#### 7.2.1 Section Navigation
- Vertical tabs or accordion for each anatomical section
- Visual indicator showing which sections are enabled
- Quick enable/disable toggle per section

#### 7.2.2 Section Groups

**Global Settings** (always at top)
- Total Height
- Wall Mode (Curved/Flat)
- Wall Thickness
- Proportion Mode

**Per Section** (expandable/collapsible)
Each section (Lip, Neck, Shoulder, Body, Waist, Foot) has:
- Enable toggle
- Dimension parameters
- Wall mode override
- Profile/curve controls
- Transition controls

### 7.3 Parameter Controls

#### 7.3.1 Slider + Numeric Input
- All numeric parameters have both slider and text input
- Synchronized in real-time
- Keyboard increment with up/down arrows

#### 7.3.2 Dropdown Selects
- Style options (Lip Style, Wall Mode, etc.)
- Section selection for multi-body editing

#### 7.3.3 Toggle Switches
- Section enable/disable
- Lock toggles
- Boolean options

#### 7.3.4 Transition Sharpness Sliders
- Dedicated slider for each section boundary
- Visual preview of sharpness effect
- 0-100% range with clear labeling

#### 7.3.5 Wall Mode Selector
- Global wall mode toggle (Curved/Flat)
- Per-section override dropdown (Inherit/Force Curved/Force Flat)

### 7.4 3D Viewport Features

#### 7.4.1 Camera Controls
- Orbit (left mouse drag)
- Pan (right mouse drag)
- Zoom (scroll wheel)
- Camera presets: Top, Side, 3/4, Bottom

#### 7.4.2 View Options
- Cross-section toggle (vertical cut to show interior)
- Wireframe toggle
- Show dimensions toggle
- Grid toggle
- Background light/dark

#### 7.4.3 Profile Editor Toggle
- Button to show/hide Profile Editor panel
- Option to dock right or overlay viewport

#### 7.4.4 Section Interaction
- Click section in 3D view to select/expand parameters
- Click section in Profile Editor to select
- Hover for section name tooltip
- Color-coded section highlighting (consistent colors across 3D and Profile Editor)

---

## 8. Technical Specification

### 8.1 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Language | JavaScript | ES6+ | Core application logic |
| 3D Rendering | Three.js | r160+ | WebGL-based 3D viewport |
| Build Tool | Vite | 5.x | Development server, bundling |
| CSS | Custom + CSS Variables | - | Theming, inherits shared styles |
| 2D Canvas | HTML5 Canvas API | - | Profile Editor rendering |

### 8.2 Application Architecture

#### 8.2.1 Directory Structure

```
vessel-generator/
├── index.html                      # Main HTML entry point
├── vessel-generator-product-spec.md
│
├── scripts/
│   ├── vesselMain.js              # Application entry point
│   │
│   ├── state/
│   │   ├── vesselState.js         # Central state management
│   │   └── vesselDefaults.js      # Default parameter values
│   │
│   ├── geometry/
│   │   ├── profileGenerator.js    # 2D profile from parameters
│   │   ├── bezierCurve.js         # Bezier math utilities
│   │   ├── sectionBuilder.js      # Per-section profile construction
│   │   ├── transitionBlender.js   # Section transition handling
│   │   ├── meshGenerator.js       # 3D mesh from profile (revolution)
│   │   ├── wallThickness.js       # Shell/offset operations
│   │   └── stlExporter.js         # Binary STL export
│   │
│   ├── ui/
│   │   ├── parameterPanel.js      # Left panel controls
│   │   ├── sectionAccordion.js    # Collapsible section UI
│   │   ├── sliderControl.js       # Slider + numeric input component
│   │   ├── profileEditor.js       # 2D canvas profile editor
│   │   ├── profileEditorCanvas.js # Canvas rendering for profile
│   │   ├── bezierHandles.js       # Draggable bezier handle logic
│   │   └── viewport.js            # Three.js 3D viewport
│   │
│   └── utils/
│       ├── validation.js          # Parameter validation, warnings
│       ├── math.js                # Math utilities
│       └── storage.js             # LocalStorage operations
│
└── styles/
    └── vessel-generator.css       # Component-specific styles
```

#### 8.2.2 Module Dependency Graph

```
                    ┌──────────────┐
                    │ vesselMain.js│
                    └──────┬───────┘
                           │
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ vesselState │ │  viewport   │ │profileEditor│
    └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
           │               │               │
           │        ┌──────┴──────┐        │
           │        ▼             │        │
           │  ┌───────────┐       │        │
           └─►│meshGenerator│◄─────┘        │
              └─────┬─────┘                │
                    │                      │
              ┌─────┴─────┐                │
              ▼           ▼                │
        ┌──────────┐ ┌──────────┐         │
        │ profile  │ │  wall    │         │
        │Generator │ │Thickness │         │
        └────┬─────┘ └──────────┘         │
             │                             │
             ▼                             │
        ┌──────────┐                       │
        │ bezier   │◄──────────────────────┘
        │ Curve    │
        └──────────┘
```

### 8.3 State Management

#### 8.3.1 State Structure

```javascript
const vesselState = {
    // Project metadata
    project: {
        name: 'Untitled',
        dateCreated: null,
        lastModified: null,
        isDirty: false
    },

    // Global parameters
    global: {
        totalHeight: 250,           // mm
        mouthDiameter: 80,          // mm
        baseDiameter: 60,           // mm
        wallThickness: 3.0,         // mm
        wallThicknessMode: 'uniform', // 'uniform' | 'variable'
        wallThicknessTop: 2.5,      // mm (if variable)
        wallThicknessBottom: 4.0,   // mm (if variable)
        wallMode: 'curved',         // 'curved' | 'flat'
        proportionMode: 'proportional' // 'absolute' | 'proportional'
    },

    // Section definitions
    sections: {
        lip: {
            enabled: true,
            style: 'straight',      // 'straight'|'flaredOut'|'flaredIn'|'rolledOut'|'rolledIn'|'beaded'|'collared'|'squared'
            height: 8,              // mm
            thickness: 1,           // mm additional
            flareAngle: 15,         // degrees
            rollDiameter: 6,        // mm
            beadSize: 5,            // mm
            wallModeOverride: 'inherit' // 'inherit'|'curved'|'flat'
        },

        neck: {
            enabled: true,
            height: 50,             // mm or %
            heightLocked: false,
            topDiameter: 80,        // mm (usually = mouth)
            bottomDiameter: 100,    // mm
            wallModeOverride: 'inherit',
            // Curved mode
            curveType: 'concave',   // 'straight'|'concave'|'convex'|'sCurve'|'custom'
            curveIntensity: 30,     // %
            curveApexPosition: 50,  // %
            bezierHandles: {
                h1: { x: 0.0, y: 0.33 },  // Normalized 0-1
                h2: { x: 0.0, y: 0.67 }
            },
            // Flat mode
            wallAngle: null         // degrees (calculated if null)
        },

        shoulder: {
            enabled: true,
            height: 40,
            heightLocked: false,
            topDiameter: 100,       // from neck bottom
            maxDiameter: 150,
            bottomDiameter: 140,
            maxDiameterPosition: 70, // %
            wallModeOverride: 'inherit',
            curveType: 'circularArc',
            curveTension: 70,
            bezierHandles: { h1: { x: 0.3, y: 0.2 }, h2: { x: 0.3, y: 0.8 } },
            wallAngle: null
        },

        body: {
            sectionCount: 1,        // 1-7
            sections: [
                {
                    height: 100,
                    heightLocked: false,
                    topDiameter: 140,
                    bottomDiameter: 100,
                    maxDiameter: 145,
                    maxDiameterPosition: 40,
                    wallModeOverride: 'inherit',
                    curveType: 'convex',
                    curveIntensity: 25,
                    bezierHandles: { h1: { x: 0.2, y: 0.25 }, h2: { x: 0.2, y: 0.75 } },
                    wallAngle: null
                }
                // ... up to 7 sections
            ]
        },

        waist: {
            enabled: false,
            height: 25,
            heightLocked: false,
            diameter: 70,           // minimum at waist
            position: 50,           // %
            wallModeOverride: 'inherit',
            curveType: 'circular',
            curveDepth: 50,
            bezierHandles: { h1: { x: -0.3, y: 0.3 }, h2: { x: -0.3, y: 0.7 } }
        },

        foot: {
            enabled: true,
            style: 'footring',      // 'footring'|'pedestal'|'flared'|'tapered'|'stepped'
            height: 15,
            heightLocked: false,
            topDiameter: 100,       // from body/waist
            bottomDiameter: 60,
            wallModeOverride: 'inherit',
            curveType: 'straight',
            bezierHandles: { h1: { x: 0, y: 0.33 }, h2: { x: 0, y: 0.67 } },
            wallAngle: 15,
            // Footring specific
            footringBaseWidth: 10,
            outerFootringAngle: 15,
            innerFootringAngle: -15,
            baseRecessDepth: 2
        }
    },

    // Transition sharpness (0-100)
    transitions: {
        lipToNeck: 50,
        neckToShoulder: 20,
        shoulderToBody: 10,
        bodySections: [30, 30, 30, 30, 30, 30], // Between body sections
        bodyToWaist: 30,
        waistToFoot: 20
    },

    // UI state
    ui: {
        selectedSection: 'body',
        expandedSections: ['global', 'body'],
        profileEditorVisible: true,
        profileEditorDocked: 'right',
        viewportCameraPreset: 'threeQuarter',
        crossSectionEnabled: false,
        dimensionsVisible: false,
        gridVisible: true
    },

    // Validation warnings
    warnings: []
};
```

#### 8.3.2 State Manager Class

```javascript
class VesselStateManager {
    constructor() {
        this.state = this.getDefaultState();
        this.listeners = new Map();
        this.updateQueue = [];
        this.isProcessing = false;
    }

    // Subscribe to state changes
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);
        return () => this.listeners.get(path).delete(callback);
    }

    // Update state with batching
    setState(path, value, options = {}) {
        const { silent = false, batch = false } = options;
        
        this.updateQueue.push({ path, value, silent });
        
        if (!batch && !this.isProcessing) {
            this.processUpdates();
        }
    }

    // Batch multiple updates
    batchUpdate(updates) {
        updates.forEach(({ path, value }) => {
            this.setState(path, value, { batch: true });
        });
        this.processUpdates();
    }

    processUpdates() {
        this.isProcessing = true;
        const notifyPaths = new Set();

        while (this.updateQueue.length > 0) {
            const { path, value, silent } = this.updateQueue.shift();
            const oldValue = this.getNestedValue(this.state, path);
            
            if (oldValue !== value) {
                this.setNestedValue(this.state, path, value);
                this.state.project.isDirty = true;
                this.state.project.lastModified = new Date().toISOString();
                
                if (!silent) {
                    notifyPaths.add(path);
                    // Also notify parent paths
                    const parts = path.split('.');
                    while (parts.length > 1) {
                        parts.pop();
                        notifyPaths.add(parts.join('.'));
                    }
                }
            }
        }

        // Notify listeners
        notifyPaths.forEach(path => {
            if (this.listeners.has(path)) {
                const value = this.getNestedValue(this.state, path);
                this.listeners.get(path).forEach(cb => cb(value, path));
            }
        });

        // Notify wildcard listeners
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => cb(this.state, '*'));
        }

        this.isProcessing = false;
    }

    getState(path) {
        return path ? this.getNestedValue(this.state, path) : this.state;
    }

    // Utility methods
    getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    }

    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => {
            if (!(part in acc)) acc[part] = {};
            return acc[part];
        }, obj);
        target[last] = value;
    }
}
```

### 8.4 Geometry Engine

#### 8.4.1 Profile Point Structure

```javascript
// A single point on the 2D profile
class ProfilePoint {
    constructor(radius, height, sectionId = null) {
        this.r = radius;      // Distance from center axis (mm)
        this.h = height;      // Height from base (mm)
        this.section = sectionId;
    }
}

// Complete vessel profile
class VesselProfile {
    constructor() {
        this.outerPoints = [];  // ProfilePoint[]
        this.innerPoints = [];  // ProfilePoint[] (offset by wall thickness)
    }
}
```

#### 8.4.2 Bezier Curve Implementation

```javascript
class BezierCurve {
    /**
     * Evaluate cubic bezier at parameter t
     * @param {number} t - Parameter 0 to 1
     * @param {Object} p0 - Start point {x, y}
     * @param {Object} p1 - Control point 1 {x, y}
     * @param {Object} p2 - Control point 2 {x, y}
     * @param {Object} p3 - End point {x, y}
     * @returns {Object} Point {x, y}
     */
    static evaluate(t, p0, p1, p2, p3) {
        const t2 = t * t;
        const t3 = t2 * t;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;

        return {
            x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
            y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y
        };
    }

    /**
     * Get tangent vector at parameter t
     */
    static tangent(t, p0, p1, p2, p3) {
        const t2 = t * t;
        const mt = 1 - t;
        const mt2 = mt * mt;

        return {
            x: 3 * mt2 * (p1.x - p0.x) + 6 * mt * t * (p2.x - p1.x) + 3 * t2 * (p3.x - p2.x),
            y: 3 * mt2 * (p1.y - p0.y) + 6 * mt * t * (p2.y - p1.y) + 3 * t2 * (p3.y - p2.y)
        };
    }

    /**
     * Sample curve at n points
     */
    static sample(p0, p1, p2, p3, numPoints = 50) {
        const points = [];
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            points.push(this.evaluate(t, p0, p1, p2, p3));
        }
        return points;
    }

    /**
     * Adaptive sampling based on curvature
     * More points where curve bends more
     */
    static adaptiveSample(p0, p1, p2, p3, tolerance = 0.5) {
        const points = [p0];
        this._subdivide(p0, p1, p2, p3, 0, 1, points, tolerance);
        points.push(p3);
        return points;
    }

    static _subdivide(p0, p1, p2, p3, t0, t1, points, tolerance) {
        const tMid = (t0 + t1) / 2;
        const pMid = this.evaluate(tMid, p0, p1, p2, p3);
        const pStart = this.evaluate(t0, p0, p1, p2, p3);
        const pEnd = this.evaluate(t1, p0, p1, p2, p3);

        // Check if midpoint is close enough to linear interpolation
        const linearMid = {
            x: (pStart.x + pEnd.x) / 2,
            y: (pStart.y + pEnd.y) / 2
        };
        const dist = Math.sqrt(
            Math.pow(pMid.x - linearMid.x, 2) + 
            Math.pow(pMid.y - linearMid.y, 2)
        );

        if (dist > tolerance && t1 - t0 > 0.01) {
            this._subdivide(p0, p1, p2, p3, t0, tMid, points, tolerance);
            points.push(pMid);
            this._subdivide(p0, p1, p2, p3, tMid, t1, points, tolerance);
        }
    }

    /**
     * Convert normalized handle coordinates to absolute
     * @param {Object} handle - Normalized {x: 0-1, y: 0-1}
     * @param {Object} start - Start point {r, h}
     * @param {Object} end - End point {r, h}
     */
    static handleToAbsolute(handle, start, end) {
        const dr = end.r - start.r;
        const dh = end.h - start.h;
        return {
            x: start.r + handle.x * Math.abs(dr) * Math.sign(dr === 0 ? 1 : dr) + handle.x * 50,
            y: start.h + handle.y * dh
        };
    }
}
```

#### 8.4.3 Section Profile Builder

```javascript
class SectionBuilder {
    /**
     * Build profile points for a single section
     */
    static buildSection(sectionParams, startPoint, endPoint, wallMode, bezierHandles) {
        const points = [];

        if (wallMode === 'flat') {
            // Flat mode: straight line
            points.push(new ProfilePoint(startPoint.r, startPoint.h, sectionParams.id));
            points.push(new ProfilePoint(endPoint.r, endPoint.h, sectionParams.id));
        } else {
            // Curved mode: bezier curve
            const p0 = { x: startPoint.r, y: startPoint.h };
            const p3 = { x: endPoint.r, y: endPoint.h };
            
            // Convert normalized handles to absolute coordinates
            const p1 = BezierCurve.handleToAbsolute(bezierHandles.h1, startPoint, endPoint);
            const p2 = BezierCurve.handleToAbsolute(bezierHandles.h2, startPoint, endPoint);

            // Sample the curve
            const curvePoints = BezierCurve.adaptiveSample(p0, p1, p2, p3, 0.3);
            
            curvePoints.forEach(cp => {
                points.push(new ProfilePoint(cp.x, cp.y, sectionParams.id));
            });
        }

        return points;
    }

    /**
     * Build section with max diameter (shoulder/body bulges)
     */
    static buildBulgeSection(params, startPoint, endPoint, wallMode, bezierHandles) {
        if (params.maxDiameter <= Math.max(startPoint.r, endPoint.r)) {
            // No bulge, use standard section builder
            return this.buildSection(params, startPoint, endPoint, wallMode, bezierHandles);
        }

        // Calculate apex point
        const apexHeight = startPoint.h - (startPoint.h - endPoint.h) * (params.maxDiameterPosition / 100);
        const apexPoint = { r: params.maxDiameter / 2, h: apexHeight };

        // Build two sub-sections: start-to-apex and apex-to-end
        const topSection = this.buildSection(
            { ...params, id: params.id + '_top' },
            startPoint,
            apexPoint,
            wallMode,
            { h1: bezierHandles.h1, h2: { x: bezierHandles.h1.x, y: 1 } }
        );

        const bottomSection = this.buildSection(
            { ...params, id: params.id + '_bottom' },
            apexPoint,
            endPoint,
            wallMode,
            { h1: { x: bezierHandles.h2.x, y: 0 }, h2: bezierHandles.h2 }
        );

        // Combine, removing duplicate apex point
        return [...topSection, ...bottomSection.slice(1)];
    }
}
```

#### 8.4.4 Transition Blending

```javascript
class TransitionBlender {
    /**
     * Blend tangents at section boundary based on sharpness
     * @param {number} sharpness - 0 (smooth) to 100 (sharp)
     * @param {Object} tangentIn - Incoming tangent vector
     * @param {Object} tangentOut - Outgoing tangent vector
     * @returns {Object} Blended tangent for smooth transition
     */
    static blendTangents(sharpness, tangentIn, tangentOut) {
        const t = sharpness / 100; // 0 = full blend, 1 = no blend
        
        if (t >= 1) {
            // Sharp: no blending, use original tangents
            return { in: tangentIn, out: tangentOut };
        }

        // Normalize tangents
        const normIn = this.normalize(tangentIn);
        const normOut = this.normalize(tangentOut);

        // Blend direction
        const blended = {
            x: normIn.x * (1 - t) + normOut.x * t,
            y: normIn.y * (1 - t) + normOut.y * t
        };

        // Apply blended direction to original magnitudes
        const magIn = this.magnitude(tangentIn);
        const magOut = this.magnitude(tangentOut);

        return {
            in: { x: blended.x * magIn, y: blended.y * magIn },
            out: { x: blended.x * magOut, y: blended.y * magOut }
        };
    }

    /**
     * Adjust bezier handles at boundary for transition sharpness
     */
    static adjustHandlesForTransition(
        section1Handles, section2Handles,
        boundaryPoint, sharpness
    ) {
        if (sharpness >= 100) {
            return { section1: section1Handles, section2: section2Handles };
        }

        const blend = 1 - (sharpness / 100);

        // Get tangent directions from handles
        const tang1 = { x: section1Handles.h2.x, y: 1 - section1Handles.h2.y };
        const tang2 = { x: section2Handles.h1.x, y: section2Handles.h1.y };

        // Blend tangent directions
        const avgTang = {
            x: (tang1.x + tang2.x) / 2,
            y: (tang1.y + tang2.y) / 2
        };

        // Lerp toward average based on blend factor
        const adjusted1H2 = {
            x: section1Handles.h2.x + (avgTang.x - tang1.x) * blend,
            y: section1Handles.h2.y
        };
        const adjusted2H1 = {
            x: section2Handles.h1.x + (avgTang.x - tang2.x) * blend,
            y: section2Handles.h1.y
        };

        return {
            section1: { ...section1Handles, h2: adjusted1H2 },
            section2: { ...section2Handles, h1: adjusted2H1 }
        };
    }

    static normalize(v) {
        const mag = Math.sqrt(v.x * v.x + v.y * v.y);
        return mag > 0 ? { x: v.x / mag, y: v.y / mag } : { x: 0, y: 1 };
    }

    static magnitude(v) {
        return Math.sqrt(v.x * v.x + v.y * v.y);
    }
}
```

#### 8.4.5 Complete Profile Generator

```javascript
class ProfileGenerator {
    constructor(stateManager) {
        this.state = stateManager;
    }

    /**
     * Generate complete vessel profile from state
     * @returns {VesselProfile}
     */
    generate() {
        const state = this.state.getState();
        const profile = new VesselProfile();
        
        let currentHeight = 0;
        let currentRadius = state.global.baseDiameter / 2;
        const sections = [];

        // Build sections bottom-to-top
        // 1. Foot
        if (state.sections.foot.enabled) {
            sections.push(this.buildFootSection(state, currentHeight));
            currentHeight += state.sections.foot.height;
            currentRadius = state.sections.foot.topDiameter / 2;
        }

        // 2. Waist
        if (state.sections.waist.enabled) {
            sections.push(this.buildWaistSection(state, currentHeight, currentRadius));
            currentHeight += state.sections.waist.height;
        }

        // 3. Body (1-7 sections)
        const bodySections = this.buildBodySections(state, currentHeight, currentRadius);
        sections.push(...bodySections.sections);
        currentHeight = bodySections.endHeight;
        currentRadius = bodySections.endRadius;

        // 4. Shoulder
        if (state.sections.shoulder.enabled) {
            sections.push(this.buildShoulderSection(state, currentHeight, currentRadius));
            currentHeight += state.sections.shoulder.height;
            currentRadius = state.sections.shoulder.topDiameter / 2;
        }

        // 5. Neck
        if (state.sections.neck.enabled) {
            sections.push(this.buildNeckSection(state, currentHeight, currentRadius));
            currentHeight += state.sections.neck.height;
            currentRadius = state.sections.neck.topDiameter / 2;
        }

        // 6. Lip
        if (state.sections.lip.enabled) {
            sections.push(this.buildLipSection(state, currentHeight, currentRadius));
        }

        // Apply transition blending between sections
        const blendedSections = this.applyTransitions(sections, state.transitions);

        // Combine all section points into profile
        blendedSections.forEach(section => {
            profile.outerPoints.push(...section.points);
        });

        // Remove duplicate points at boundaries
        profile.outerPoints = this.removeDuplicatePoints(profile.outerPoints);

        // Generate inner profile with wall thickness
        profile.innerPoints = this.generateInnerProfile(
            profile.outerPoints,
            state.global.wallThickness,
            state.global.wallThicknessMode,
            state.global.wallThicknessTop,
            state.global.wallThicknessBottom
        );

        return profile;
    }

    /**
     * Generate inner profile by offsetting outer profile
     */
    generateInnerProfile(outerPoints, thickness, mode, thicknessTop, thicknessBottom) {
        const innerPoints = [];
        const totalHeight = outerPoints[outerPoints.length - 1].h - outerPoints[0].h;

        for (let i = 0; i < outerPoints.length; i++) {
            const point = outerPoints[i];
            
            // Calculate local thickness
            let localThickness = thickness;
            if (mode === 'variable') {
                const heightRatio = (point.h - outerPoints[0].h) / totalHeight;
                localThickness = thicknessBottom + (thicknessTop - thicknessBottom) * heightRatio;
            }

            // Calculate normal direction for offset
            const normal = this.calculateNormal(outerPoints, i);
            
            // Offset inward (toward center axis)
            const innerR = Math.max(0, point.r - localThickness * Math.abs(normal.x));
            
            innerPoints.push(new ProfilePoint(innerR, point.h, point.section));
        }

        return innerPoints;
    }

    /**
     * Calculate outward normal at point index
     */
    calculateNormal(points, index) {
        let tangent;
        
        if (index === 0) {
            tangent = {
                x: points[1].r - points[0].r,
                y: points[1].h - points[0].h
            };
        } else if (index === points.length - 1) {
            tangent = {
                x: points[index].r - points[index - 1].r,
                y: points[index].h - points[index - 1].h
            };
        } else {
            tangent = {
                x: points[index + 1].r - points[index - 1].r,
                y: points[index + 1].h - points[index - 1].h
            };
        }

        // Rotate 90 degrees for normal (pointing outward)
        const mag = Math.sqrt(tangent.x * tangent.x + tangent.y * tangent.y);
        return {
            x: tangent.y / mag,
            y: -tangent.x / mag
        };
    }

    removeDuplicatePoints(points, tolerance = 0.01) {
        return points.filter((point, index) => {
            if (index === 0) return true;
            const prev = points[index - 1];
            const dist = Math.sqrt(
                Math.pow(point.r - prev.r, 2) + 
                Math.pow(point.h - prev.h, 2)
            );
            return dist > tolerance;
        });
    }

    // ... Additional section builder methods
}
```

#### 8.4.6 Mesh Generator (Revolution)

```javascript
class MeshGenerator {
    static RADIAL_SEGMENTS = 120;

    /**
     * Generate 3D mesh by revolving profile around Y axis
     * @param {VesselProfile} profile
     * @returns {THREE.BufferGeometry}
     */
    static generateMesh(profile) {
        const geometry = new THREE.BufferGeometry();
        
        const vertices = [];
        const indices = [];
        const normals = [];
        const uvs = [];

        const outerPoints = profile.outerPoints;
        const innerPoints = profile.innerPoints;
        const radialSegments = this.RADIAL_SEGMENTS;

        // Generate outer surface
        this.generateSurface(outerPoints, radialSegments, vertices, indices, normals, uvs, false);

        // Generate inner surface (reversed normals)
        const innerOffset = vertices.length / 3;
        this.generateSurface(innerPoints, radialSegments, vertices, indices, normals, uvs, true, innerOffset);

        // Generate top rim (connect outer to inner at top)
        const rimTopOffset = vertices.length / 3;
        this.generateRim(
            outerPoints[outerPoints.length - 1],
            innerPoints[innerPoints.length - 1],
            radialSegments, vertices, indices, normals, uvs, rimTopOffset, true
        );

        // Generate bottom (base)
        const baseOffset = vertices.length / 3;
        this.generateBase(innerPoints[0], radialSegments, vertices, indices, normals, uvs, baseOffset);

        // Create buffer geometry
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geometry.setIndex(indices);

        geometry.computeVertexNormals();

        return geometry;
    }

    static generateSurface(points, radialSegments, vertices, indices, normals, uvs, flipNormals, indexOffset = 0) {
        const heightSegments = points.length - 1;

        // Generate vertices
        for (let j = 0; j <= heightSegments; j++) {
            const point = points[j];
            const v = j / heightSegments;

            for (let i = 0; i <= radialSegments; i++) {
                const u = i / radialSegments;
                const theta = u * Math.PI * 2;

                const x = point.r * Math.cos(theta);
                const y = point.h;
                const z = point.r * Math.sin(theta);

                vertices.push(x, y, z);

                // Calculate normal
                const nx = Math.cos(theta);
                const ny = 0;
                const nz = Math.sin(theta);
                
                if (flipNormals) {
                    normals.push(-nx, -ny, -nz);
                } else {
                    normals.push(nx, ny, nz);
                }

                uvs.push(u, v);
            }
        }

        // Generate indices
        for (let j = 0; j < heightSegments; j++) {
            for (let i = 0; i < radialSegments; i++) {
                const a = indexOffset + j * (radialSegments + 1) + i;
                const b = indexOffset + j * (radialSegments + 1) + i + 1;
                const c = indexOffset + (j + 1) * (radialSegments + 1) + i;
                const d = indexOffset + (j + 1) * (radialSegments + 1) + i + 1;

                if (flipNormals) {
                    indices.push(a, c, b);
                    indices.push(b, c, d);
                } else {
                    indices.push(a, b, c);
                    indices.push(b, d, c);
                }
            }
        }
    }

    static generateRim(outerPoint, innerPoint, radialSegments, vertices, indices, normals, uvs, indexOffset, isTop) {
        for (let i = 0; i <= radialSegments; i++) {
            const u = i / radialSegments;
            const theta = u * Math.PI * 2;

            // Outer vertex
            vertices.push(
                outerPoint.r * Math.cos(theta),
                outerPoint.h,
                outerPoint.r * Math.sin(theta)
            );

            // Inner vertex
            vertices.push(
                innerPoint.r * Math.cos(theta),
                innerPoint.h,
                innerPoint.r * Math.sin(theta)
            );

            // Normals pointing up (for top rim)
            const ny = isTop ? 1 : -1;
            normals.push(0, ny, 0);
            normals.push(0, ny, 0);

            uvs.push(u, 0);
            uvs.push(u, 1);
        }

        // Indices
        for (let i = 0; i < radialSegments; i++) {
            const a = indexOffset + i * 2;
            const b = indexOffset + i * 2 + 1;
            const c = indexOffset + (i + 1) * 2;
            const d = indexOffset + (i + 1) * 2 + 1;

            if (isTop) {
                indices.push(a, b, c);
                indices.push(b, d, c);
            } else {
                indices.push(a, c, b);
                indices.push(b, c, d);
            }
        }
    }

    static generateBase(centerPoint, radialSegments, vertices, indices, normals, uvs, indexOffset) {
        // Center vertex
        vertices.push(0, centerPoint.h, 0);
        normals.push(0, -1, 0);
        uvs.push(0.5, 0.5);

        // Rim vertices
        for (let i = 0; i <= radialSegments; i++) {
            const theta = (i / radialSegments) * Math.PI * 2;
            vertices.push(
                centerPoint.r * Math.cos(theta),
                centerPoint.h,
                centerPoint.r * Math.sin(theta)
            );
            normals.push(0, -1, 0);
            uvs.push(
                0.5 + 0.5 * Math.cos(theta),
                0.5 + 0.5 * Math.sin(theta)
            );
        }

        // Indices (fan from center)
        for (let i = 0; i < radialSegments; i++) {
            indices.push(
                indexOffset,
                indexOffset + i + 2,
                indexOffset + i + 1
            );
        }
    }
}
```

### 8.5 Profile Editor Implementation

#### 8.5.1 Canvas Renderer

```javascript
class ProfileEditorCanvas {
    constructor(canvasElement, stateManager) {
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        this.state = stateManager;
        
        this.scale = 1;
        this.panOffset = { x: 0, y: 0 };
        this.selectedSection = null;
        this.hoveredHandle = null;
        this.draggedHandle = null;
        
        this.sectionColors = {
            lip: '#FF6B6B',
            neck: '#4ECDC4',
            shoulder: '#45B7D1',
            body: '#96CEB4',
            waist: '#FFEAA7',
            foot: '#DDA0DD'
        };

        this.setupEventListeners();
        this.state.subscribe('*', () => this.render());
    }

    /**
     * Convert profile coordinates to canvas coordinates
     */
    profileToCanvas(r, h) {
        const state = this.state.getState();
        const maxR = state.global.mouthDiameter / 2 + 50;
        const maxH = state.global.totalHeight + 50;
        
        const scaleX = (this.canvas.width * 0.8) / maxR;
        const scaleY = (this.canvas.height * 0.8) / maxH;
        const scale = Math.min(scaleX, scaleY) * this.scale;

        const centerX = this.canvas.width / 2 + this.panOffset.x;
        const bottomY = this.canvas.height * 0.9 + this.panOffset.y;

        return {
            x: centerX + r * scale,
            y: bottomY - h * scale
        };
    }

    /**
     * Convert canvas coordinates to profile coordinates
     */
    canvasToProfile(x, y) {
        const state = this.state.getState();
        const maxR = state.global.mouthDiameter / 2 + 50;
        const maxH = state.global.totalHeight + 50;
        
        const scaleX = (this.canvas.width * 0.8) / maxR;
        const scaleY = (this.canvas.height * 0.8) / maxH;
        const scale = Math.min(scaleX, scaleY) * this.scale;

        const centerX = this.canvas.width / 2 + this.panOffset.x;
        const bottomY = this.canvas.height * 0.9 + this.panOffset.y;

        return {
            r: (x - centerX) / scale,
            h: (bottomY - y) / scale
        };
    }

    render() {
        const ctx = this.ctx;
        const { width, height } = this.canvas;
        
        // Clear
        ctx.clearRect(0, 0, width, height);
        
        // Draw grid
        this.drawGrid();
        
        // Draw center axis
        this.drawCenterAxis();
        
        // Generate and draw profile
        const profileGen = new ProfileGenerator(this.state);
        const profile = profileGen.generate();
        
        // Draw outer profile
        this.drawProfile(profile.outerPoints, '#FFFFFF', 2);
        
        // Draw inner profile
        this.drawProfile(profile.innerPoints, '#888888', 1);
        
        // Draw section boundaries
        this.drawSectionBoundaries(profile.outerPoints);
        
        // Draw bezier handles for selected section
        if (this.selectedSection) {
            this.drawBezierHandles(this.selectedSection);
        }
        
        // Draw dimensions if enabled
        if (this.state.getState('ui.dimensionsVisible')) {
            this.drawDimensions(profile);
        }
    }

    drawProfile(points, color, lineWidth) {
        const ctx = this.ctx;
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        
        points.forEach((point, index) => {
            const canvasPos = this.profileToCanvas(point.r, point.h);
            if (index === 0) {
                ctx.moveTo(canvasPos.x, canvasPos.y);
            } else {
                ctx.lineTo(canvasPos.x, canvasPos.y);
            }
        });
        
        ctx.stroke();

        // Mirror for full profile (draw left side)
        ctx.beginPath();
        points.forEach((point, index) => {
            const canvasPos = this.profileToCanvas(-point.r, point.h);
            if (index === 0) {
                ctx.moveTo(canvasPos.x, canvasPos.y);
            } else {
                ctx.lineTo(canvasPos.x, canvasPos.y);
            }
        });
        ctx.stroke();
    }

    drawBezierHandles(sectionId) {
        const ctx = this.ctx;
        const section = this.state.getState(`sections.${sectionId}`);
        
        if (!section || !section.bezierHandles) return;
        
        // Get section bounds
        const bounds = this.getSectionBounds(sectionId);
        
        // Calculate handle positions
        const h1Abs = BezierCurve.handleToAbsolute(
            section.bezierHandles.h1,
            { r: bounds.topRadius, h: bounds.topHeight },
            { r: bounds.bottomRadius, h: bounds.bottomHeight }
        );
        const h2Abs = BezierCurve.handleToAbsolute(
            section.bezierHandles.h2,
            { r: bounds.topRadius, h: bounds.topHeight },
            { r: bounds.bottomRadius, h: bounds.bottomHeight }
        );

        // Draw handle lines
        ctx.strokeStyle = '#A259FF';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        // Handle 1 line
        const start = this.profileToCanvas(bounds.topRadius, bounds.topHeight);
        const h1Canvas = this.profileToCanvas(h1Abs.x, h1Abs.y);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(h1Canvas.x, h1Canvas.y);
        ctx.stroke();

        // Handle 2 line
        const end = this.profileToCanvas(bounds.bottomRadius, bounds.bottomHeight);
        const h2Canvas = this.profileToCanvas(h2Abs.x, h2Abs.y);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(h2Canvas.x, h2Canvas.y);
        ctx.stroke();

        ctx.setLineDash([]);

        // Draw handle circles
        this.drawHandle(h1Canvas.x, h1Canvas.y, 'h1');
        this.drawHandle(h2Canvas.x, h2Canvas.y, 'h2');
        
        // Draw endpoint circles
        this.drawEndpoint(start.x, start.y, 'start');
        this.drawEndpoint(end.x, end.y, 'end');
    }

    drawHandle(x, y, id) {
        const ctx = this.ctx;
        const isHovered = this.hoveredHandle === id;
        const isDragged = this.draggedHandle === id;
        
        ctx.beginPath();
        ctx.arc(x, y, isDragged ? 8 : (isHovered ? 7 : 6), 0, Math.PI * 2);
        ctx.fillStyle = isDragged ? '#A259FF' : (isHovered ? '#B87FFF' : '#FFFFFF');
        ctx.fill();
        ctx.strokeStyle = '#A259FF';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    drawEndpoint(x, y, id) {
        const ctx = this.ctx;
        
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.strokeStyle = '#666666';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.onWheel.bind(this));
    }

    onMouseDown(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Check if clicking on a handle
        const handle = this.hitTestHandle(x, y);
        if (handle) {
            this.draggedHandle = handle;
            return;
        }

        // Check if clicking on a section
        const section = this.hitTestSection(x, y);
        if (section) {
            this.selectedSection = section;
            this.state.setState('ui.selectedSection', section);
            this.render();
        }
    }

    onMouseMove(e) {
        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (this.draggedHandle && this.selectedSection) {
            // Update handle position
            const profilePos = this.canvasToProfile(x, y);
            const bounds = this.getSectionBounds(this.selectedSection);
            
            // Convert to normalized handle coordinates
            const normalized = this.absoluteToNormalizedHandle(
                profilePos,
                { r: bounds.topRadius, h: bounds.topHeight },
                { r: bounds.bottomRadius, h: bounds.bottomHeight }
            );

            const handlePath = `sections.${this.selectedSection}.bezierHandles.${this.draggedHandle}`;
            this.state.setState(handlePath, normalized);
        } else {
            // Update hover state
            const handle = this.hitTestHandle(x, y);
            if (handle !== this.hoveredHandle) {
                this.hoveredHandle = handle;
                this.render();
            }
        }
    }

    onMouseUp() {
        this.draggedHandle = null;
    }

    onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.scale = Math.max(0.1, Math.min(5, this.scale * delta));
        this.render();
    }
}
```

### 8.6 Three.js Viewport

#### 8.6.1 Viewport Manager

```javascript
class VesselViewport {
    constructor(container, stateManager) {
        this.container = container;
        this.state = stateManager;
        
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.vesselMesh = null;
        this.crossSectionPlane = null;
        
        this.init();
        this.state.subscribe('*', () => this.updateMesh());
    }

    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1E1E1E);

        // Camera
        const aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 10000);
        this.camera.position.set(300, 200, 300);

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

        // Lighting
        this.setupLighting();

        // Grid
        this.setupGrid();

        // Cross-section plane
        this.setupCrossSection();

        // Animation loop
        this.animate();

        // Resize handler
        window.addEventListener('resize', () => this.onResize());
    }

    setupLighting() {
        // Ambient
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
        keyLight.position.set(200, 400, 200);
        keyLight.castShadow = true;
        this.scene.add(keyLight);

        // Fill light
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-200, 200, -200);
        this.scene.add(fillLight);

        // Rim light
        const rimLight = new THREE.DirectionalLight(0xffffff, 0.2);
        rimLight.position.set(0, 100, -300);
        this.scene.add(rimLight);
    }

    setupGrid() {
        const gridHelper = new THREE.GridHelper(500, 50, 0x444444, 0x333333);
        gridHelper.material.opacity = 0.5;
        gridHelper.material.transparent = true;
        this.scene.add(gridHelper);
        this.gridHelper = gridHelper;
    }

    setupCrossSection() {
        // Clipping plane
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        
        // Plane helper (visual)
        const planeGeom = new THREE.PlaneGeometry(400, 400);
        const planeMat = new THREE.MeshBasicMaterial({
            color: 0xA259FF,
            transparent: true,
            opacity: 0.1,
            side: THREE.DoubleSide
        });
        this.crossSectionHelper = new THREE.Mesh(planeGeom, planeMat);
        this.crossSectionHelper.rotation.y = Math.PI / 2;
        this.crossSectionHelper.visible = false;
        this.scene.add(this.crossSectionHelper);
    }

    updateMesh() {
        // Remove existing mesh
        if (this.vesselMesh) {
            this.scene.remove(this.vesselMesh);
            this.vesselMesh.geometry.dispose();
            this.vesselMesh.material.dispose();
        }

        // Generate new geometry
        const profileGen = new ProfileGenerator(this.state);
        const profile = profileGen.generate();
        const geometry = MeshGenerator.generateMesh(profile);

        // Material
        const material = new THREE.MeshStandardMaterial({
            color: 0xCCCCCC,
            metalness: 0.1,
            roughness: 0.7,
            side: THREE.DoubleSide,
            clippingPlanes: this.state.getState('ui.crossSectionEnabled') 
                ? [this.clippingPlane] 
                : []
        });

        // Create mesh
        this.vesselMesh = new THREE.Mesh(geometry, material);
        this.vesselMesh.castShadow = true;
        this.vesselMesh.receiveShadow = true;
        this.scene.add(this.vesselMesh);
    }

    setCameraPreset(preset) {
        const distance = 400;
        const targets = {
            top: { pos: [0, distance, 0], up: [0, 0, -1] },
            side: { pos: [distance, 100, 0], up: [0, 1, 0] },
            threeQuarter: { pos: [distance * 0.7, distance * 0.5, distance * 0.7], up: [0, 1, 0] },
            bottom: { pos: [0, -distance, 0], up: [0, 0, 1] }
        };

        const target = targets[preset];
        if (target) {
            this.camera.position.set(...target.pos);
            this.camera.up.set(...target.up);
            this.camera.lookAt(0, 100, 0);
            this.controls.update();
        }
    }

    toggleCrossSection(enabled) {
        this.crossSectionHelper.visible = enabled;
        this.renderer.clippingPlanes = enabled ? [this.clippingPlane] : [];
        
        if (this.vesselMesh) {
            this.vesselMesh.material.clippingPlanes = enabled ? [this.clippingPlane] : [];
            this.vesselMesh.material.needsUpdate = true;
        }
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
```

### 8.7 STL Export

```javascript
class STLExporter {
    /**
     * Export geometry to binary STL
     */
    static export(geometry, filename) {
        const buffer = this.geometryToBuffer(geometry);
        this.downloadBuffer(buffer, filename);
    }

    static geometryToBuffer(geometry) {
        // Ensure we have non-indexed geometry
        let geo = geometry;
        if (geometry.index) {
            geo = geometry.toNonIndexed();
        }

        const positions = geo.attributes.position.array;
        const triangleCount = positions.length / 9;

        // Calculate buffer size: 80 header + 4 count + 50 per triangle
        const bufferSize = 80 + 4 + (triangleCount * 50);
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);

        // Write header (80 bytes)
        const header = 'Vessel Generator STL Export';
        for (let i = 0; i < 80; i++) {
            view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
        }

        // Write triangle count
        view.setUint32(80, triangleCount, true);

        // Write triangles
        let offset = 84;
        for (let i = 0; i < triangleCount; i++) {
            const i9 = i * 9;

            // Get vertices
            const v1 = [positions[i9], positions[i9 + 1], positions[i9 + 2]];
            const v2 = [positions[i9 + 3], positions[i9 + 4], positions[i9 + 5]];
            const v3 = [positions[i9 + 6], positions[i9 + 7], positions[i9 + 8]];

            // Calculate normal
            const normal = this.calculateNormal(v1, v2, v3);

            // Write normal
            view.setFloat32(offset, normal[0], true); offset += 4;
            view.setFloat32(offset, normal[1], true); offset += 4;
            view.setFloat32(offset, normal[2], true); offset += 4;

            // Write vertices
            for (const v of [v1, v2, v3]) {
                view.setFloat32(offset, v[0], true); offset += 4;
                view.setFloat32(offset, v[1], true); offset += 4;
                view.setFloat32(offset, v[2], true); offset += 4;
            }

            // Attribute byte count (unused)
            view.setUint16(offset, 0, true); offset += 2;
        }

        return buffer;
    }

    static calculateNormal(v1, v2, v3) {
        const ax = v2[0] - v1[0];
        const ay = v2[1] - v1[1];
        const az = v2[2] - v1[2];
        const bx = v3[0] - v1[0];
        const by = v3[1] - v1[1];
        const bz = v3[2] - v1[2];

        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;

        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        return len > 0 ? [nx / len, ny / len, nz / len] : [0, 1, 0];
    }

    static downloadBuffer(buffer, filename) {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.stl') ? filename : `${filename}.stl`;
        a.click();
        
        URL.revokeObjectURL(url);
    }
}
```

### 8.8 Validation System

```javascript
class ValidationSystem {
    constructor(stateManager) {
        this.state = stateManager;
        this.warnings = [];
    }

    validate() {
        this.warnings = [];
        const state = this.state.getState();

        this.checkWallThickness(state);
        this.checkOverhangs(state);
        this.checkDiameterConstraints(state);
        this.checkFootringGeometry(state);

        this.state.setState('warnings', this.warnings, { silent: true });
        return this.warnings;
    }

    checkWallThickness(state) {
        const thickness = state.global.wallThickness;
        if (thickness < 1.5) {
            this.warnings.push({
                type: 'structural',
                severity: 'warning',
                message: `Wall thickness (${thickness}mm) is below recommended minimum (1.5mm) for FDM printing`,
                parameter: 'global.wallThickness'
            });
        }
    }

    checkOverhangs(state) {
        // Check each section for overhang angles > 45°
        const sections = ['neck', 'shoulder', 'body', 'waist', 'foot'];
        
        sections.forEach(sectionName => {
            const section = state.sections[sectionName];
            if (!section || !section.enabled) return;

            if (sectionName === 'body') {
                section.sections.forEach((bodySection, index) => {
                    const angle = this.calculateOverhangAngle(bodySection);
                    if (Math.abs(angle) > 45) {
                        this.warnings.push({
                            type: 'structural',
                            severity: 'warning',
                            message: `Body section ${index + 1} has overhang angle of ${angle.toFixed(1)}° (may need supports)`,
                            parameter: `sections.body.sections.${index}`
                        });
                    }
                });
            } else {
                const angle = this.calculateOverhangAngle(section);
                if (Math.abs(angle) > 45) {
                    this.warnings.push({
                        type: 'structural',
                        severity: 'warning',
                        message: `${sectionName} has overhang angle of ${angle.toFixed(1)}° (may need supports)`,
                        parameter: `sections.${sectionName}`
                    });
                }
            }
        });
    }

    calculateOverhangAngle(section) {
        if (!section.topDiameter || !section.bottomDiameter || !section.height) {
            return 0;
        }
        const dr = (section.bottomDiameter - section.topDiameter) / 2;
        const dh = section.height;
        return Math.atan2(dr, dh) * (180 / Math.PI);
    }

    checkDiameterConstraints(state) {
        // Mouth shouldn't be larger than body
        const mouthD = state.global.mouthDiameter;
        const maxBodyD = Math.max(
            ...state.sections.body.sections.map(s => s.maxDiameter || Math.max(s.topDiameter, s.bottomDiameter))
        );

        if (mouthD > maxBodyD) {
            this.warnings.push({
                type: 'geometry',
                severity: 'warning',
                message: `Mouth diameter (${mouthD}mm) exceeds maximum body diameter (${maxBodyD}mm)`,
                parameter: 'global.mouthDiameter'
            });
        }
    }

    checkFootringGeometry(state) {
        const foot = state.sections.foot;
        if (!foot.enabled || foot.style !== 'footring') return;

        const outer = foot.outerFootringAngle;
        const inner = foot.innerFootringAngle;
        const width = foot.footringBaseWidth;
        const height = foot.height;

        // Check if angles create impossible geometry
        const outerOffset = height * Math.tan(outer * Math.PI / 180);
        const innerOffset = height * Math.tan(inner * Math.PI / 180);

        if (Math.abs(outerOffset) + Math.abs(innerOffset) > width) {
            this.warnings.push({
                type: 'geometry',
                severity: 'error',
                message: 'Footring angles create impossible geometry',
                parameter: 'sections.foot'
            });
        }
    }
}
```

### 8.9 Project Storage

```javascript
class ProjectStorage {
    static STORAGE_KEY = 'vessel_generator_autosave';
    static AUTOSAVE_INTERVAL = 30000; // 30 seconds

    constructor(stateManager) {
        this.state = stateManager;
        this.autosaveTimer = null;
    }

    startAutosave() {
        this.autosaveTimer = setInterval(() => {
            if (this.state.getState('project.isDirty')) {
                this.saveToLocalStorage();
            }
        }, ProjectStorage.AUTOSAVE_INTERVAL);
    }

    stopAutosave() {
        if (this.autosaveTimer) {
            clearInterval(this.autosaveTimer);
        }
    }

    saveToLocalStorage() {
        const data = this.serializeState();
        localStorage.setItem(ProjectStorage.STORAGE_KEY, JSON.stringify(data));
    }

    loadFromLocalStorage() {
        const saved = localStorage.getItem(ProjectStorage.STORAGE_KEY);
        if (saved) {
            const data = JSON.parse(saved);
            this.deserializeState(data);
            return true;
        }
        return false;
    }

    saveToFile(filename) {
        const data = this.serializeState();
        data.project.name = filename.replace('.json', '');
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename.endsWith('.json') ? filename : `${filename}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        
        this.state.setState('project.isDirty', false);
    }

    async loadFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    reject(new Error('No file selected'));
                    return;
                }
                
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    this.deserializeState(data);
                    resolve(data.project.name);
                } catch (err) {
                    reject(err);
                }
            };
            
            input.click();
        });
    }

    serializeState() {
        const state = this.state.getState();
        return {
            version: '1.0',
            project: { ...state.project },
            global: { ...state.global },
            sections: JSON.parse(JSON.stringify(state.sections)),
            transitions: { ...state.transitions }
        };
    }

    deserializeState(data) {
        // Version migration if needed
        if (data.version !== '1.0') {
            data = this.migrateData(data);
        }

        this.state.batchUpdate([
            { path: 'project', value: data.project },
            { path: 'global', value: data.global },
            { path: 'sections', value: data.sections },
            { path: 'transitions', value: data.transitions }
        ]);
    }

    migrateData(data) {
        // Handle version migrations here
        return data;
    }
}
```

### 8.10 Performance Optimization

#### 8.10.1 Geometry Caching

```javascript
class GeometryCache {
    constructor(maxSize = 20) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    getCacheKey(state) {
        // Create hash from relevant parameters
        const relevant = {
            global: state.global,
            sections: state.sections,
            transitions: state.transitions
        };
        return JSON.stringify(relevant);
    }

    get(state) {
        const key = this.getCacheKey(state);
        return this.cache.get(key);
    }

    set(state, geometry) {
        const key = this.getCacheKey(state);
        
        // Evict oldest if at capacity
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, geometry);
    }

    clear() {
        this.cache.clear();
    }
}
```

#### 8.10.2 Throttled Updates

```javascript
class ThrottledUpdater {
    constructor(callback, delay = 16) { // ~60fps
        this.callback = callback;
        this.delay = delay;
        this.pending = false;
        this.lastArgs = null;
    }

    update(...args) {
        this.lastArgs = args;
        
        if (!this.pending) {
            this.pending = true;
            requestAnimationFrame(() => {
                this.pending = false;
                this.callback(...this.lastArgs);
            });
        }
    }
}
```

### 8.11 Testing Strategy

#### 8.11.1 Unit Test Examples

```javascript
// tests/bezierCurve.test.js
describe('BezierCurve', () => {
    test('evaluate returns start point at t=0', () => {
        const p0 = { x: 0, y: 0 };
        const p1 = { x: 1, y: 0 };
        const p2 = { x: 1, y: 1 };
        const p3 = { x: 0, y: 1 };
        
        const result = BezierCurve.evaluate(0, p0, p1, p2, p3);
        expect(result.x).toBeCloseTo(0);
        expect(result.y).toBeCloseTo(0);
    });

    test('evaluate returns end point at t=1', () => {
        const p0 = { x: 0, y: 0 };
        const p1 = { x: 1, y: 0 };
        const p2 = { x: 1, y: 1 };
        const p3 = { x: 0, y: 1 };
        
        const result = BezierCurve.evaluate(1, p0, p1, p2, p3);
        expect(result.x).toBeCloseTo(0);
        expect(result.y).toBeCloseTo(1);
    });

    test('adaptive sampling produces more points for curved sections', () => {
        const straight = BezierCurve.adaptiveSample(
            { x: 0, y: 0 }, { x: 0, y: 0.33 }, { x: 0, y: 0.67 }, { x: 0, y: 1 }
        );
        const curved = BezierCurve.adaptiveSample(
            { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }
        );
        
        expect(curved.length).toBeGreaterThan(straight.length);
    });
});

// tests/meshGenerator.test.js
describe('MeshGenerator', () => {
    test('generates manifold geometry', () => {
        const profile = createTestProfile();
        const geometry = MeshGenerator.generateMesh(profile);
        
        expect(geometry.attributes.position).toBeDefined();
        expect(geometry.index).toBeDefined();
        
        // Check for watertight mesh (every edge shared by exactly 2 faces)
        const edgeCounts = new Map();
        const indices = geometry.index.array;
        
        for (let i = 0; i < indices.length; i += 3) {
            for (let j = 0; j < 3; j++) {
                const a = indices[i + j];
                const b = indices[i + (j + 1) % 3];
                const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
                edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
            }
        }
        
        for (const count of edgeCounts.values()) {
            expect(count).toBe(2);
        }
    });
});
```

---

## 9. Project Management

### 9.1 New Project
- Creates vessel with sensible defaults
- Prompts to save if current project has unsaved changes

### 9.2 Save Project
- Saves all parameters to JSON file
- File naming: user-specified name + `.json` extension
- Includes all section parameters, wall modes, bezier control points, transition sharpnesses
- Metadata: project name, date created, last modified

### 9.3 Load Project
- Opens file browser filtered to `.json` files
- Loads all parameters and restores vessel state
- Updates project name in header

### 9.4 Project File Format

```json
{
  "version": "1.0",
  "projectName": "MyVessel",
  "dateCreated": "2025-12-26T10:00:00Z",
  "lastModified": "2025-12-26T15:30:00Z",
  "globalParameters": {
    "totalHeight": 250,
    "mouthDiameter": 80,
    "baseDiameter": 60,
    "wallThickness": 3.0,
    "wallThicknessMode": "uniform",
    "globalWallMode": "curved"
  },
  "sections": {
    "lip": {
      "enabled": true,
      "style": "straight",
      "height": 8,
      "thickness": 1,
      "wallModeOverride": "inherit"
    },
    "neck": {
      "enabled": true,
      "height": 50,
      "topDiameter": 80,
      "bottomDiameter": 100,
      "wallModeOverride": "inherit",
      "curveIntensity": 30,
      "bezierHandles": {
        "handle1": { "x": 0.3, "y": 0.2 },
        "handle2": { "x": 0.7, "y": 0.8 }
      }
    },
    "shoulder": { /* ... */ },
    "body": {
      "sectionCount": 1,
      "sections": [
        { /* section 1 params */ }
      ]
    },
    "waist": { /* ... */ },
    "foot": { /* ... */ }
  },
  "transitions": {
    "lipToNeck": 50,
    "neckToShoulder": 20,
    "shoulderToBody": 10,
    "bodyToWaist": 30,
    "waistToFoot": 20
  }
}
```

### 9.5 Auto-Save
- Auto-save to browser LocalStorage every 30 seconds
- Restore last session on app load (with prompt)

---

## 10. Validation & Warnings

### 10.1 Warning Types

#### Structural Warnings
- Wall thickness < 1.5mm (fragile)
- Overhang angles > 45° (may need supports)
- Mouth diameter > body diameter (unstable form)

#### Geometry Warnings
- Impossible footring geometry (angles create intersection)
- Negative dimensions from parameter combinations
- Section diameters create impossible transitions

### 10.2 Warning Display
- Yellow warning badge in parameter panel
- Warning icons in 3D viewport near affected areas
- Expandable warnings list in footer

---

## 11. Future Enhancements (Out of Scope for V1)

- Handle attachment system
- Lid generation with matching profiles
- Flower frog inserts
- Multi-vessel arrangements for sets
- Material/glaze color preview
- Print time and filament estimation
- Direct integration with slicing software
- Undo/redo system
- Export to other 3D formats (OBJ, 3MF)

---

## 12. Success Metrics

### Performance
- 60 FPS viewport interaction during orbit/zoom
- 60 FPS Profile Editor interaction during bezier handle dragging
- < 100ms parameter update latency (slider drag feels instant)
- < 200ms full profile regeneration
- < 3 second STL export

### Quality
- 100% manifold exported geometry
- Zero mesh errors in slicing software
- Smooth curves with no visible faceting at any zoom level

### Usability
- First-time users create custom vessel within 5 minutes
- Profile Editor bezier handles feel natural and responsive
- Transition sharpness effects are visually obvious
- Clear visual feedback for all parameter changes in both 3D and Profile Editor
- Intuitive section-by-section workflow with clear section boundaries

---

---

## 13. Design Decisions Summary

Key decisions made during specification:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Body section count | 1-7 | Maximum flexibility for complex multi-bellied forms |
| Wall mode per section | Yes | Enables hybrid designs (curved body + flat shoulder) |
| Cross-section shape | Circular only | Simplifies geometry, rotational symmetry |
| Curve control | Full bezier handles | Maximum creative control over profiles |
| Transition sharpness | Critical feature | Enables both smooth organic forms and sharp carinations |
| Visual profile editor | Primary feature | Direct manipulation preferred over numeric-only control |
| Presets library | No | Clean slate approach, focus on custom creation |
| Surface textures | Out of scope | Focus on form over surface treatment |
| Symmetry | Rotational only | Keeps geometry generation tractable |
| Primary output | 3D printing (FDM) | Drives mesh quality and validation requirements |

---

## Document Version

**Version**: 1.1  
**Date**: 2025-12-26  
**Status**: Refined based on requirements review

