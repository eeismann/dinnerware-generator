# Playground Ceramics - Platform Specification

## 1. Executive Summary

**Playground Ceramics** is a web-based parametric design platform for creating custom ceramic objects suitable for 3D printing. The platform consists of multiple specialized applications, each focused on a specific type of ceramic design, unified by a central dashboard and shared design language.

### 1.1 Platform Evolution

**Previous Identity**: Dinnerware 3D Model Generator (single-app)  
**Current Identity**: Playground Ceramics (multi-app platform)

The application has evolved from a single dinnerware generator into a comprehensive ceramic design studio with the following applications:

| Application | Purpose | Status |
|-------------|---------|--------|
| **Dinnerware Designer** | Complete dinnerware sets (plates, bowls, mugs, tumblers) | ✅ Implemented |
| **Vessel Generator** | Custom vases with section-by-section control | ✅ Implemented |
| **Handle Generator** | Mug handles integrated with Dinnerware projects | ✅ Implemented |

### 1.2 Target Users

- Ceramic artists designing custom collections
- Product designers creating drinkware and tableware
- 3D printing enthusiasts crafting home décor
- Small manufacturers prototyping designs before production
- Florists designing vessels for arrangements

### 1.3 Core Value Proposition

- **Multi-App Platform**: Specialized tools for different ceramic types
- **Parametric Design**: Real-time control over all design dimensions
- **Visual Consistency**: Shared UI patterns and design language across apps
- **Real-time 3D Preview**: Interactive visualization with Three.js
- **Export-Ready STL**: High-quality manifold geometry for FDM printing
- **Local-Only Privacy**: Runs entirely in browser with no server required

---

## 2. Platform Architecture

### 2.1 Application Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│                    PLAYGROUND CERAMICS DASHBOARD                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │ Dinnerware  │  │   Vessel    │  │   Handle    │                  │
│  │  Designer   │  │  Generator  │  │  Generator  │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                     PROJECT MANAGEMENT                        │  │
│  │   • Search Projects                                           │  │
│  │   • Import/Export Projects                                    │  │
│  │   • Project Cards with Thumbnails                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      GLOBAL SETTINGS                          │  │
│  │   • Theme (Light/Dark)    • Accent Color                     │  │
│  │   • Typeface Selection    • Thumbnail Size                   │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Directory Structure

```
playground-ceramics/
├── index.html                    # Dinnerware Designer entry point
├── dashboard.html                # Platform dashboard
├── vessel-generator/
│   └── index.html               # Vessel Generator entry point
├── handle-generator/
│   └── index.html               # Handle Generator entry point
├── scripts/
│   ├── main.js                  # Dinnerware app entry
│   ├── dashboard/
│   │   ├── dashboard.js         # Dashboard logic
│   │   └── projectStorage.js    # Cross-app project management
│   ├── geometry/
│   │   ├── meshGenerator.js     # Dinnerware mesh generation
│   │   └── stlExporter.js       # STL export utilities
│   ├── state/
│   │   └── projectState.js      # Dinnerware state management
│   ├── ui/
│   │   ├── themeManager.js      # Global theme system
│   │   └── viewport.js          # Three.js viewport
│   ├── utils/
│   │   └── validation.js        # Warning system
│   ├── vessel/
│   │   ├── vesselMain.js        # Vessel app entry
│   │   ├── geometry/            # Vessel-specific geometry
│   │   ├── state/               # Vessel state management
│   │   └── ui/                  # Vessel UI components
│   └── handle/
│       ├── handleMain.js        # Handle app entry
│       ├── geometry/            # Handle geometry algorithms
│       ├── state/               # Handle state management
│       └── ui/                  # Handle UI components
├── styles/
│   ├── main.css                 # Dinnerware styles
│   ├── dashboard.css            # Dashboard styles
│   ├── vessel-generator.css     # Vessel styles
│   ├── handle-generator.css     # Handle styles
│   ├── shared.css               # Shared UI components
│   └── themes.css               # Theme definitions
├── saved-projects/              # Local project storage
└── dist/                        # Production build output
```

### 2.3 Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| **Language** | JavaScript | ES6+ | Core application logic |
| **3D Rendering** | Three.js | r160+ | WebGL-based 3D viewport |
| **Build Tool** | Vite | 5.x | Development server, bundling |
| **Controls** | OrbitControls | (Three.js addon) | Camera manipulation |
| **Export** | STLExporter | (Three.js addon) | STL file generation |
| **2D Canvas** | HTML5 Canvas API | - | Profile editors |
| **Storage** | LocalStorage | - | Project persistence |

---

## 3. Dashboard

### 3.1 Overview

The dashboard serves as the central hub for the Playground Ceramics platform, providing:

- Project management across all applications
- Application selection for new projects
- Global settings configuration
- Project search and filtering

### 3.2 Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Playground Ceramics              [Search...] [Import] [+ New]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Your Projects (X projects)                                     │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐       │
│  │[Thumbnail]│ │[Thumbnail]│ │[Thumbnail]│ │[Thumbnail]│       │
│  │Project 1  │ │Project 2  │ │Project 3  │ │Project 4  │       │
│  │Dinnerware │ │Vessel     │ │Handle     │ │Vessel     │       │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  [⚙] Settings    Playground Ceramics v1.0    [Clear All Data]   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 App Selection Modal

When creating a new project, users choose which application to use:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Create New Project                            │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   [Plate Icon]  │  │  [Handle Icon]  │  │  [Vase Icon]    │  │
│  │                 │  │                 │  │                 │  │
│  │ Dinnerware Set  │  │   Mug Handle    │  │     Vessel      │  │
│  │                 │  │                 │  │                 │  │
│  │ Create plates,  │  │ Design custom   │  │ Design vessels  │  │
│  │ bowls, mugs,    │  │ handles for     │  │ with bezier     │  │
│  │ and more        │  │ your mugs       │  │ curve controls  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                  │
│                                              [Cancel]            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.4 Project Card Information

Each project card displays:
- **Thumbnail**: Auto-generated preview image
- **Project Name**: User-defined name
- **App Type Badge**: dinnerware / vessel / handle
- **Last Modified Date**: Timestamp

### 3.5 Dashboard Actions

| Action | Description |
|--------|-------------|
| **New Project** | Opens app selection modal |
| **Import Project** | Load .json project file |
| **Search** | Filter projects by name |
| **Open Project** | Navigate to editor with project loaded |
| **Delete Project** | Remove project (with confirmation) |
| **Clear All Data** | Reset all localStorage data |

---

## 4. Global Settings System

### 4.1 Theme Configuration

The platform supports comprehensive theming that persists across all applications. The theme system is implemented in `scripts/ui/themeManager.js` and styled via `styles/themes.css`.

#### 4.1.1 Appearance Mode
- **Light Mode**: Light backgrounds with dark text
- **Dark Mode** (default): Dark backgrounds with light text

**Implementation**:
- Themes use CSS custom properties (variables) prefixed with `--th-`
- Mode is applied via `data-mode` attribute on `<html>` element
- Mode toggle triggers immediate CSS variable recalculation

#### 4.1.2 Accent Colors

| Color | Hex Value | Use Case |
|-------|-----------|----------|
| Purple | `#A259FF` | Default accent (Figma-inspired) |
| Blue | `#1ABCFE` | Alternative |
| Green | `#0FA958` | Alternative |
| Orange | `#F24822` | Alternative |
| Pink | `#FF7262` | Alternative |
| Teal | `#14B8A6` | Alternative |

**Accent Color Variables**:
```css
--th-accent         /* Base accent color */
--th-accent-light   /* Lightened for hover states (+20%) */
--th-accent-dark    /* Darkened for active states (-15%) */
--th-accent-glow    /* RGBA version for glow effects (25% opacity) */
```

#### 4.1.3 Typeface Selection

| Option | Font Stack | Reference |
|--------|------------|-----------|
| System | `-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui` | macOS native |
| Inter | `"Inter", -apple-system` | Figma-style (default) |
| Lato | `"Lato", -apple-system` | Slack-style |
| DM Sans | `"DM Sans", -apple-system` | Arc-style |
| Source Sans | `"Source Sans 3", -apple-system` | Discord-style |

**Typography Variables**:
```css
--th-font-display   /* Headings and titles */
--th-font-primary   /* Body text and UI */
--th-font-mono      /* Numeric values, code */
```

#### 4.1.4 Theme CSS Variables

**Background Colors**:
| Variable | Dark Mode | Light Mode | Usage |
|----------|-----------|------------|-------|
| `--th-bg-deep` | `#1E1E1E` | `#F5F5F5` | Page background |
| `--th-bg-primary` | `#2C2C2C` | `#FFFFFF` | Panel backgrounds |
| `--th-bg-secondary` | `#383838` | `#FAFAFA` | Section backgrounds |
| `--th-bg-tertiary` | `#444444` | `#F0F0F0` | Input backgrounds |
| `--th-bg-hover` | `#4A4A4A` | `#EBEBEB` | Hover states |
| `--th-bg-active` | `#5C5C5C` | `#E0E0E0` | Active states |

**Text Colors**:
| Variable | Dark Mode | Light Mode | Usage |
|----------|-----------|------------|-------|
| `--th-text-primary` | `#FFFFFF` | `#1E1E1E` | Primary text |
| `--th-text-secondary` | `#B3B3B3` | `#666666` | Secondary text |
| `--th-text-muted` | `#7A7A7A` | `#999999` | Muted/disabled text |

**Status Colors**:
| Variable | Value | Usage |
|----------|-------|-------|
| `--th-success` | `#0FA958` | Success states |
| `--th-warning` | `#FFEB3B` | Warning indicators |
| `--th-danger` | `#F24822` | Error/danger states |

### 4.2 View Settings (Per-App)

Each application provides view controls:

| Setting | Description | Apps |
|---------|-------------|------|
| **Camera Presets** | Top, Side, 3/4, Bottom, Reset | All |
| **Cross-Section** | Vertical slice view | All |
| **Show Grid** | Floor grid visibility | All |
| **Background** | Light/Dark viewport background | All |
| **Layout** | Row/Grid arrangement | Dinnerware |
| **Section Colors** | Legend display | Vessel |
| **Mug Display** | Transparent/Wireframe/Solid/Hidden | Handle |

### 4.3 Dashboard-Specific Settings

| Setting | Options | Default |
|---------|---------|---------|
| **Thumbnail Size** | Small, Medium, Large | Medium |
| **Clear All Data** | Confirmation required | N/A |

### 4.4 Settings Persistence

Settings are stored in localStorage with the following keys:

```javascript
// Storage keys (from themeManager.js)
'playground-ceramics-mode'    // 'light' or 'dark'
'playground-ceramics-accent'  // Hex color string
'playground-ceramics-zoom'    // 'small', 'medium', 'large'
'playground-ceramics-font'    // 'system', 'inter', 'lato', 'dm-sans', 'source-sans'
```

**Defaults**:
- Mode: `dark`
- Accent: `#A259FF` (Purple)
- Zoom: `medium`
- Font: `inter`

### 4.5 Theme Manager API

The theme manager exports the following functions:

```javascript
// Get current values
getMode()          // Returns 'light' or 'dark'
getAccentColor()   // Returns hex color string
getZoomLevel()     // Returns 'small', 'medium', or 'large'
getFont()          // Returns font key string

// Set values (persists to localStorage)
setMode(mode)              // 'light' or 'dark'
setAccentColor(color)      // Hex color string
setZoomLevel(zoom)         // 'small', 'medium', 'large'
setFont(fontKey)           // Font key from FONT_FAMILIES

// Utilities
toggleMode()       // Toggles between light and dark
initTheme()        // Apply theme on page load
initSettingsMenu() // Initialize settings UI event handlers
init()             // Full initialization
```

---

## 5. Application Summaries

### 5.1 Dinnerware Designer

**Purpose**: Create complete dinnerware sets with consistent parametric styling.

**Items (7 total)**:
| Item | Description | Default Size |
|------|-------------|--------------|
| Plate | Dinner plate | 280mm × 25mm |
| Soup Bowl | Medium depth bowl | 180mm × 60mm |
| Pasta Bowl | Wide, shallow bowl | 240mm × 50mm |
| Mug | Cylindrical drinking vessel | 90mm × 100mm |
| **Tumbler** | Handleless drinking cup | 80mm × 110mm |
| Saucer | Plate for mug | 150mm × 20mm |
| Serving Bowl | Large capacity bowl | 280mm × 100mm |

**Key Features**:
- Global style parameters (wall angle, thickness, footring)
- Per-item scaling multipliers
- Per-item parameter overrides
- Saucer cup ring (matches mug base)
- Row/Grid layout modes

**Detailed Specification**: See `dinnerware-generator-product-spec.md`

### 5.2 Vessel Generator

**Purpose**: Create custom vases and vessels with section-by-section control.

**Sections (6 total)**:
| Section | Purpose | Toggleable |
|---------|---------|------------|
| Lip | Rim edge treatment | Yes |
| Neck | Narrow section below lip | Yes |
| Shoulder | Outward curve under neck | Yes |
| Body | Main vessel volume | No (always on) |
| Waist | Optional inward narrowing | Yes |
| Foot | Base with footring | Yes |

**Key Features**:
- Per-section height, diameter, curvature controls
- Flat wall mode toggle (per section)
- Section linking (lock bottom diameter to next section)
- Section color legend in footer
- Multi-body support (1-7 body sections)

**Detailed Specification**: See `vessel-generator/vessel-generator-product-spec.md`

### 5.3 Handle Generator

**Purpose**: Design custom mug handles integrated with Dinnerware projects.

**Handle Style (V1)**:
- Squared with Rounded Corners (Hasami-style)

**Key Features**:
- Mug import from Dinnerware projects (required)
- Parametric control over dimensions, cross-section, path
- Real-time preview with mug body
- STL export designed for boolean union
- Cross-section preview inset

**Detailed Specification**: See `handle-generator/handle-generator-product-spec.md`

---

## 6. Shared UI Components

### 6.1 Header Bar

Standard header across all editor applications:

```
┌─────────────────────────────────────────────────────────────────┐
│ [←] App Title           Project Name •        [New][Load][Save][Export]│
└─────────────────────────────────────────────────────────────────┘
```

| Element | Description |
|---------|-------------|
| Back Arrow | Returns to Dashboard |
| App Title | "Dinnerware Designer" / "Vessel Generator" / "Handle Generator" |
| Project Name | Editable via Save dialog |
| Unsaved Indicator | Shows "•" when changes exist |
| Action Buttons | New, Load, Save, Export STL |

### 6.2 Parameter Panel

Left sidebar with collapsible sections:

```
┌─────────────────────┐
│ [▼] Section Name    │
│ ┌─────────────────┐ │
│ │ Label           │ │
│ │ [━━━●━━━] [123] │ │
│ │              mm │ │
│ └─────────────────┘ │
└─────────────────────┘
```

**Control Types**:
- Slider + Numeric Input (synchronized)
- Dropdown Select
- Toggle Switch
- Reset Button

### 6.3 Footer Bar

Standard footer with view controls and status:

```
┌─────────────────────────────────────────────────────────────────┐
│ [⚙] [View ▼] [Items ▼]        [Legend]        Status │ Warnings │
└─────────────────────────────────────────────────────────────────┘
```

| Section | Contents |
|---------|----------|
| Left | Settings menu, View menu |
| Center | App-specific (Items menu, Section legend) |
| Right | Status info, Warning count |

### 6.4 Modal Dialogs

**Standard Modal Structure**:
```
┌─────────────────────────────────────┐
│ Modal Title                    [×]  │
├─────────────────────────────────────┤
│                                     │
│         Modal Content               │
│                                     │
├─────────────────────────────────────┤
│              [Cancel] [Primary]     │
└─────────────────────────────────────┘
```

**Modal Types**:
- Save Project (name input)
- Export STL (item selection)
- Delete Confirmation
- App Selection (dashboard)

---

## 7. Project File Format

### 7.1 Common Structure

All project files share a common base structure:

```json
{
  "version": "1.0",
  "appType": "dinnerware|vessel|handle",
  "projectName": "Project Name",
  "dateCreated": "2025-12-30T10:00:00Z",
  "lastModified": "2025-12-30T15:30:00Z",
  
  // App-specific parameters follow
}
```

### 7.2 File Extensions

| App | Extension | Example |
|-----|-----------|---------|
| Dinnerware | `.dinnerware.json` | `MySet.dinnerware.json` |
| Vessel | `.vessel.json` | `TallVase.vessel.json` |
| Handle | `.handle.json` | `ModernHandle.handle.json` |

### 7.3 Storage Keys

| Key | Purpose |
|-----|---------|
| `playground_projects` | Array of project metadata |
| `playground_current_{appType}` | Auto-saved current state per app |
| `playground_settings` | Global settings (theme, font, etc.) |

---

## 8. STL Export

### 8.1 Export Specifications

| Property | Value |
|----------|-------|
| Format | Binary STL |
| Units | Millimeters |
| Orientation | Base on Z=0 plane |
| Geometry | Manifold (watertight) |

### 8.2 File Naming Convention

| App | Filename Pattern |
|-----|------------------|
| Dinnerware | `{ProjectName}_{item_type}.stl` |
| Vessel | `{ProjectName}_vessel.stl` |
| Handle | `{ProjectName}_handle.stl` |

### 8.3 Export Quality

- **Radial Segments**: 120 (circumference)
- **Height Segments**: Adaptive based on height
- **No separate preview/export quality modes**
- **Single fixed high-quality setting**

---

## 9. Validation & Warning System

### 9.1 Warning Types

| Type | Description | Color |
|------|-------------|-------|
| **Structural** | Thin walls, weak geometry | Yellow |
| **Overhang** | Angles > 45° may need supports | Yellow |
| **Geometry** | Impossible parameter combinations | Red |
| **Ergonomic** | Handle comfort issues | Yellow |
| **Compatibility** | Cross-app issues (Handle + Mug) | Red |

### 9.2 Warning Display

- **Parameter Panel**: Warning badge on affected parameters
- **Footer**: Warning count with expandable list
- **Viewport**: Warning icons on affected geometry

### 9.3 Warning Thresholds

| Warning | Threshold |
|---------|-----------|
| Thin Wall | < 1.2mm (Dinnerware), < 1.5mm (Vessel) |
| Overhang | > 45° from vertical |
| Handle Cross-Section | < 10mm |
| Attachment Width | < 12mm |

---

## 10. Performance Requirements

### 10.1 Real-Time Interaction

| Metric | Target |
|--------|--------|
| Viewport FPS | 60 FPS during orbit/zoom |
| Parameter Update | < 100ms latency |
| Mesh Regeneration | < 500ms for complex items |

### 10.2 File Operations

| Operation | Target |
|-----------|--------|
| Project Save | < 500ms |
| Project Load | < 1000ms |
| STL Export (single) | < 2 seconds |
| STL Export (batch) | < 1 second per item |

### 10.3 Memory

| Metric | Target |
|--------|--------|
| RAM Usage | < 500MB total |
| Per-Item Geometry | < 10MB |

---

## 11. Browser Support

### 11.1 Supported Browsers

| Browser | Minimum Version |
|---------|-----------------|
| Chrome | 90+ (recommended) |
| Firefox | 88+ |
| Safari | 14+ |
| Edge | 90+ |

### 11.2 Requirements

- WebGL 2.0 support
- ES6+ JavaScript support
- LocalStorage API
- File API

---

## 12. Features Added (Since Original Spec)

The following features have been added since the original Dinnerware Generator specification:

### 12.1 Platform-Level Additions

| Feature | Description |
|---------|-------------|
| **Dashboard** | Central project management hub |
| **Multi-App Architecture** | Three specialized applications |
| **Vessel Generator** | Complete new application for vases |
| **Handle Generator** | Complete new application for mug handles |
| **App Selection Modal** | Choose app when creating new project |
| **Global Theme System** | Light/dark mode with accent colors |
| **Typeface Selection** | Multiple font family options |
| **Project Search** | Filter projects by name |
| **Thumbnail Size** | Small/Medium/Large dashboard view |

### 12.2 Dinnerware Designer Additions

| Feature | Description |
|---------|-------------|
| **Tumbler** | 7th item added (handleless cup) |
| **Wall Curve** | Wall curve amount and position controls |
| **Bottom Corner Radius** | Rounded interior bottom corners |
| **Back to Dashboard** | Navigation link in header |
| **Theme Integration** | Consistent with platform theming |

### 12.3 Vessel Generator Features

| Feature | Description |
|---------|-------------|
| **6 Anatomical Sections** | Lip, Neck, Shoulder, Body, Waist, Foot |
| **Section Toggles** | Enable/disable individual sections |
| **Flat Wall Mode** | Per-section flat wall toggle |
| **Section Linking** | Lock bottom diameter to next section |
| **Curvature Control** | Mid-diameter and curvature percentage |
| **Section Color Legend** | Visual identification in footer |
| **Footring Parameters** | Width, angle, and recess controls |
| **Lip Styles** | 7 lip style options |

### 12.4 Handle Generator Features

| Feature | Description |
|---------|-------------|
| **Mug Import** | Import from Dinnerware projects |
| **Squared Handle** | Hasami-style rounded corners |
| **Cross-Section Types** | Oval, Round, Rectangular, D-Profile |
| **Attachment Controls** | Height, angle, blend radius |
| **Corner Radii** | Inner and outer handle corners |
| **Mug Display Modes** | Transparent, wireframe, solid, hidden |
| **Dimension Overlays** | Live measurements in viewport |
| **Cross-Section Preview** | 2D inset panel |

---

## 13. Features Removed/Changed

### 13.1 Naming Changes

| Original | Current |
|----------|---------|
| Dinnerware 3D Model Generator | Playground Ceramics |
| Dinnerware Generator | Dinnerware Designer |

### 13.2 Conceptual Changes

| Aspect | Original | Current |
|--------|----------|---------|
| Architecture | Single application | Multi-app platform |
| Entry Point | Direct to editor | Dashboard first |
| Branding | Generic tool | Playground Ceramics brand |

### 13.3 Planned Features Not Implemented

The following features from original specs remain unimplemented:

| Feature | Spec | Status |
|---------|------|--------|
| Profile Editor (2D) | Vessel | Not visible in current UI |
| Multi-Body Support (1-7) | Vessel | UI shows single body section |
| Transition Sharpness | Vessel | Not in current parameter panel |
| Variable Wall Thickness | Vessel | Not in current UI |
| D-Shaped/C-Shaped Handles | Handle | V1 only has Squared |

---

## 14. Individual App Specifications

For detailed specifications of each application, refer to:

1. **Dinnerware Designer**: `dinnerware-generator-product-spec.md`
2. **Vessel Generator**: `vessel-generator/vessel-generator-product-spec.md`
3. **Handle Generator**: `handle-generator/handle-generator-product-spec.md`

---

## Document Version

**Version**: 1.0  
**Date**: 2025-12-30  
**Status**: Platform Specification (reflects current implementation)

This document supersedes the original `dinnerware-generator-product-spec.md` as the primary platform specification.

