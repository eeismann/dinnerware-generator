# Playground Ceramics

A web-based parametric design platform for creating custom ceramic objects suitable for FDM 3D printing. Design dinnerware sets, custom vessels, and mug handles with intuitive controls and real-time 3D preview.

![Playground Ceramics](https://img.shields.io/badge/Status-Active-brightgreen)
![Three.js](https://img.shields.io/badge/Three.js-r160-blue)
![Vite](https://img.shields.io/badge/Vite-5.0-purple)

## Platform Overview

Playground Ceramics is a multi-application design studio with three specialized tools:

| Application | Description |
|-------------|-------------|
| **Dinnerware Designer** | Create complete dinnerware sets with consistent parametric styling |
| **Vessel Generator** | Design custom vases with section-by-section control |
| **Handle Generator** | Create mug handles that integrate with Dinnerware projects |

## Features

### Platform-Wide
- **Central Dashboard**: Manage all projects from a single hub
- **Theme System**: Light/dark mode with accent color selection
- **Typeface Selection**: Choose from multiple font options
- **Project Management**: Search, import, export, and organize projects
- **Local-Only Privacy**: Runs entirely in your browser with no server required

### Dinnerware Designer
- **7 Dinnerware Items**: Plate, Soup Bowl, Pasta Bowl, Mug, Tumbler, Saucer, Serving Bowl
- **Global Style Parameters**: Wall angle, thickness, footring settings
- **Per-Item Overrides**: Customize individual pieces while maintaining consistency
- **Row/Grid Layout**: Arrange items in different viewing modes

### Vessel Generator
- **6 Anatomical Sections**: Lip, Neck, Shoulder, Body, Waist, Foot
- **Section Controls**: Independent height, diameter, and curvature per section
- **Flat Wall Mode**: Toggle between curved and flat walls per section
- **Section Linking**: Lock diameters between adjacent sections
- **Multiple Lip Styles**: Straight, Flared, Rolled, Beaded, Squared, and more

### Handle Generator
- **Mug Integration**: Import mug data from Dinnerware projects
- **Squared Handle Style**: Modern Hasami-inspired design with rounded corners
- **Cross-Section Options**: Oval, Round, Rectangular, D-Profile
- **Attachment Controls**: Height, angle, blend radius
- **Preview Modes**: View handle with transparent, wireframe, or solid mug

### All Applications
- **Real-time 3D Preview**: Interactive viewport with orbit controls
- **STL Export**: High-quality manifold geometry for 3D printing
- **Warning System**: Alerts for potential printing issues
- **Project Save/Load**: Save and share designs as JSON files

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Usage

### Getting Started

1. Open the application to see the **Dashboard**
2. Click **"New Project"** to see application options
3. Choose an application (Dinnerware, Vessel, or Handle)
4. Adjust parameters in the left panel
5. Preview your design in the 3D viewport
6. Export as STL when ready

### Viewport Controls

- **Left Mouse Drag**: Rotate camera
- **Right Mouse Drag**: Pan view
- **Mouse Wheel**: Zoom in/out
- **Camera Presets**: Top, Side, 3/4, Bottom views
- **Cross-Section**: Toggle to view internal geometry

### Export

1. Click **"Export STL"**
2. Select items to export (Dinnerware) or export directly (Vessel/Handle)
3. Each item exports as a separate STL file
4. Files are named `ProjectName_item_type.stl`

## Project Structure

```
playground-ceramics/
├── dashboard.html              # Platform dashboard
├── index.html                  # Dinnerware Designer
├── vessel-generator/
│   └── index.html             # Vessel Generator
├── handle-generator/
│   └── index.html             # Handle Generator
├── scripts/
│   ├── main.js                # Dinnerware entry point
│   ├── dashboard/
│   │   ├── dashboard.js       # Dashboard logic
│   │   └── projectStorage.js  # Project management
│   ├── vessel/
│   │   ├── vesselMain.js      # Vessel entry point
│   │   ├── geometry/          # Vessel mesh generation
│   │   ├── state/             # Vessel state management
│   │   └── ui/                # Vessel UI components
│   ├── handle/
│   │   ├── handleMain.js      # Handle entry point
│   │   ├── geometry/          # Handle mesh generation
│   │   ├── state/             # Handle state management
│   │   └── ui/                # Handle UI components
│   ├── geometry/
│   │   ├── meshGenerator.js   # Dinnerware mesh generation
│   │   └── stlExporter.js     # STL export utilities
│   ├── state/
│   │   └── projectState.js    # Dinnerware state
│   ├── ui/
│   │   ├── viewport.js        # Three.js viewport
│   │   └── themeManager.js    # Global theme system
│   └── utils/
│       └── validation.js      # Warning system
├── styles/
│   ├── main.css               # Dinnerware styles
│   ├── dashboard.css          # Dashboard styles
│   ├── vessel-generator.css   # Vessel styles
│   ├── handle-generator.css   # Handle styles
│   ├── shared.css             # Shared components
│   └── themes.css             # Theme definitions
├── package.json
└── vite.config.js
```

## Technical Details

### Geometry Generation

**Dinnerware & Vessel**: Generated using parametric profile revolution:
1. Generate 2D profile based on parameters
2. Revolve profile 360° around vertical axis
3. Apply wall thickness (shell operation)
4. Generate footring geometry
5. Export as manifold mesh

**Handle**: Generated using cross-section sweep:
1. Generate 2D cross-section profile
2. Calculate path with rounded corners
3. Sweep profile along path
4. Generate attachment blend geometry
5. Extend into mug body for boolean union

### Default Dimensions

**Dinnerware**:
| Item | Diameter | Height |
|------|----------|--------|
| Plate | 280mm | 25mm |
| Soup Bowl | 180mm | 60mm |
| Pasta Bowl | 240mm | 50mm |
| Mug | 90mm | 100mm |
| Tumbler | 80mm | 110mm |
| Saucer | 150mm | 20mm |
| Serving Bowl | 280mm | 100mm |

**Vessel** (defaults):
| Section | Height | Diameter |
|---------|--------|----------|
| Lip | 8mm | 80mm |
| Neck | 50mm | 80-100mm |
| Shoulder | 40mm | 100-140mm |
| Body | 100mm | 100-140mm |
| Foot | 15mm | 60-100mm |

### Warning Thresholds

- **Wall Thickness**: Warning if < 1.2mm (Dinnerware) or < 1.5mm (Vessel)
- **Overhang Angle**: Warning if > 45° from vertical
- **Footring Geometry**: Warning if angles create impossible intersections
- **Handle Cross-Section**: Warning if < 10mm (structural)
- **Attachment Width**: Warning if < 12mm (weak connection)

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

Requires WebGL support.

## Documentation

For detailed specifications, see:

- **Platform Overview**: `playground-ceramics-platform-spec.md`
- **Dinnerware Designer**: `dinnerware-generator-product-spec.md`
- **Vessel Generator**: `vessel-generator/vessel-generator-product-spec.md`
- **Handle Generator**: `handle-generator/handle-generator-product-spec.md`

## License

MIT License - Feel free to use and modify for your projects.
