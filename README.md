# Playground Ceramics

A web-based parametric design platform for creating custom ceramic objects suitable for FDM 3D printing. Design dinnerware sets, custom vessels, mug handles, and slip casting molds with intuitive controls and real-time 3D preview.

![Playground Ceramics](https://img.shields.io/badge/Status-Active-brightgreen)
![Three.js](https://img.shields.io/badge/Three.js-r160-blue)
![Vite](https://img.shields.io/badge/Vite-5.0-purple)
![License](https://img.shields.io/badge/License-MIT-green)

## Table of Contents

- [Platform Overview](#platform-overview)
- [Features](#features)
- [3D Printing Requirements](#3d-printing-requirements)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Technical Details](#technical-details)
- [Dependencies](#dependencies)
- [Browser Support](#browser-support)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## Platform Overview

Playground Ceramics is a multi-application design studio with four specialized tools:

| Application | Description |
|-------------|-------------|
| **Dinnerware Designer** | Create complete dinnerware sets with consistent parametric styling |
| **Vessel Generator** | Design custom vases with section-by-section control |
| **Handle Generator** | Create mug handles that integrate with Dinnerware projects |
| **Cast Form Generator** | Generate 4-part slip casting molds from vessel geometry |

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

### Cast Form Generator
- **4-Part Mold System**: Automated decomposition into foot + three wall sections
- **Shrinkage Compensation**: Built-in scaling for clay shrinkage (anisotropic support)
- **Slip Well Generation**: Integrated spare/reservoir for slip casting workflow
- **Registration Keys**: Automatic notch/key generation for precise mold alignment
- **Shell Thickness Control**: Adjustable plaster wall thickness
- **Import Flexibility**: Load vessels from Vessel Generator, Dinnerware Designer, or external STL/OBJ files
- **Multi-Part Export**: Export all four mold components as separate STL files

### All Applications
- **Real-time 3D Preview**: Interactive viewport with orbit controls
- **STL Export**: High-quality manifold geometry for 3D printing
- **Warning System**: Alerts for potential printing issues
- **Project Save/Load**: Save and share designs as JSON files

## 3D Printing Requirements

### Recommended Printer Specifications
- **Technology**: FDM/FFF (Fused Deposition Modeling)
- **Build Volume**: Minimum 200mm x 200mm x 200mm
- **Heated Bed**: Recommended for PLA and PETG
- **Layer Height**: 0.2mm recommended, 0.1mm for fine details

### Recommended Materials
- **PLA**: Easy to print, food-safe varieties available
- **PETG**: More durable, slightly flexible, food-safe options available
- **ABS**: Heat-resistant, requires enclosed printer

### Post-Processing
- **Smoothing**: Consider acetone vapor (ABS) or sanding for finished surfaces
- **Food Safety**: Use food-safe filaments and seal with food-safe epoxy resin if needed
- **Mold Shells**: PLA or PETG work well for plaster casting molds

### Recommended Print Settings
- **Infill**: 15-20% for decorative pieces, 100% for structural components
- **Wall Thickness**: 3-4 perimeters minimum
- **Supports**: May be required for overhangs > 45°
- **Adhesion**: Brim or raft recommended for large plates

## Quick Start

```bash
# Clone the repository
git clone https://github.com/eeismann/dinnerware-generator.git
cd dinnerware-generator

# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The development server will start at `http://localhost:5173` (default Vite port).

## Usage

### Getting Started

1. Open the application to see the **Dashboard**
2. Click **"New Project"** to see application options
3. Choose an application (Dinnerware, Vessel, Handle, or Cast Form)
4. Adjust parameters in the left panel
5. Preview your design in the 3D viewport
6. Export as STL when ready

### Cast Form Workflow

1. Design a vessel in **Vessel Generator** or **Dinnerware Designer**
2. Open **Cast Form Generator**
3. Import your vessel design or upload external STL/OBJ file
4. Configure shrinkage compensation (typically 10-14% for ceramics)
5. Adjust mold parameters (wall thickness, spare height, registration keys)
6. Preview all four mold parts in the viewport
7. Export all parts as separate STL files for 3D printing
8. Print mold shells, cast with plaster, and use for slip casting

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
dinnerware-generator/
├── dashboard.html                    # Platform dashboard
├── index.html                        # Dinnerware Designer
├── vessel-generator/
│   └── index.html                   # Vessel Generator
├── handle-generator/
│   └── index.html                   # Handle Generator
├── cast-form-generator/
│   └── index.html                   # Cast Form Generator (slip casting molds)
├── mold-generator/
│   └── index.html                   # Mold Generator (alternative implementation)
├── scripts/
│   ├── main.js                      # Dinnerware entry point
│   ├── dashboard/
│   │   ├── dashboard.js             # Dashboard logic
│   │   └── projectStorage.js        # Project management
│   ├── vessel/
│   │   ├── vesselMain.js            # Vessel entry point
│   │   ├── geometry/                # Vessel mesh generation
│   │   ├── state/                   # Vessel state management
│   │   └── ui/                      # Vessel UI components
│   ├── handle/
│   │   ├── handleMain.js            # Handle entry point
│   │   ├── geometry/                # Handle mesh generation
│   │   ├── state/                   # Handle state management
│   │   └── ui/                      # Handle UI components
│   ├── castForm/
│   │   ├── castFormMain.js          # Cast Form entry point
│   │   ├── geometry/                # Mold decomposition & generation
│   │   │   ├── moldGenerator.js     # 4-part mold system
│   │   │   ├── inputProcessor.js    # STL/OBJ import
│   │   │   └── castFormSTLExporter.js
│   │   ├── state/                   # Cast Form state management
│   │   │   ├── castFormState.js
│   │   │   └── castFormDefaults.js
│   │   └── ui/                      # Cast Form UI components
│   │       ├── castFormViewport.js
│   │       └── parameterPanel.js
│   ├── geometry/
│   │   ├── meshGenerator.js         # Dinnerware mesh generation
│   │   └── stlExporter.js           # STL export utilities
│   ├── state/
│   │   └── projectState.js          # Dinnerware state
│   ├── ui/
│   │   ├── viewport.js              # Three.js viewport
│   │   └── themeManager.js          # Global theme system
│   └── utils/
│       └── validation.js            # Warning system
├── styles/
│   ├── main.css                     # Dinnerware styles
│   ├── dashboard.css                # Dashboard styles
│   ├── vessel-generator.css         # Vessel styles
│   ├── handle-generator.css         # Handle styles
│   ├── cast-form-generator.css      # Cast Form styles
│   ├── shared.css                   # Shared components
│   └── themes.css                   # Theme definitions
├── saved-projects/                  # Example projects
├── package.json
├── vite.config.js
└── README.md
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

**Cast Form**: Generated using mold decomposition:
1. Import vessel STL and apply shrinkage scaling
2. Automatically detect foot/wall separation plane
3. Decompose into 4 parts: 1 foot + 3 wall sections (120° each)
4. Generate registration keys (notches) for alignment
5. Create slip well (spare) integrated into wall sections
6. Offset geometry to create plaster shell thickness
7. Export each mold part as separate STL file

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

**Cast Form** (defaults):
| Parameter | Default | Range |
|-----------|---------|-------|
| Shrinkage Compensation | 12% | 8-15% |
| Plaster Wall Thickness | 30mm | 20-50mm |
| Spare Height | 45mm | 30-80mm |
| Registration Key Size | 8mm | 5-15mm |
| Draft Angle | 5° | 0-10° |

### Warning Thresholds

**Dinnerware & Vessel:**
- **Wall Thickness**: Warning if < 1.2mm (Dinnerware) or < 1.5mm (Vessel)
- **Overhang Angle**: Warning if > 45° from vertical
- **Footring Geometry**: Warning if angles create impossible intersections

**Handle:**
- **Handle Cross-Section**: Warning if < 10mm (structural integrity)
- **Attachment Width**: Warning if < 12mm (weak connection)

**Cast Form:**
- **Plaster Wall Thickness**: Warning if < 20mm (too fragile)
- **Shrinkage Compensation**: Warning if outside 8-15% range
- **Draft Angle**: Warning if > 10° (excessive taper)
- **Mold Size**: Warning if mold parts exceed typical printer build volume

## Dependencies

This project uses the following key libraries:

| Library | Version | Purpose |
|---------|---------|---------|
| [Three.js](https://threejs.org/) | r160 | 3D rendering and viewport |
| [Vite](https://vitejs.dev/) | 5.0+ | Build tool and dev server |

All dependencies are managed via npm and defined in `package.json`.

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
- **Cast Form Generator**:
  - Product Spec: `cast-form-generator/cast-form-generator-product-spec.md`
  - Technical Spec: `cast-form-generator/cast-form-generator-technical-spec.md`
- **Mold Generator**:
  - Product Spec: `mold-generator/mold-generator-product-spec.md`
  - Technical Spec: `mold-generator/mold-generator-technical-spec.md`

## Contributing

Contributions are welcome! Here's how you can help:

### Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes
4. Test thoroughly in all affected applications
5. Commit with clear messages: `git commit -m "Add feature: description"`
6. Push to your fork: `git push origin feature/your-feature-name`
7. Open a Pull Request

### Code Style Guidelines

- Use consistent indentation (2 spaces)
- Follow existing code patterns and naming conventions
- Add comments for complex geometry calculations
- Test STL exports to ensure manifold geometry
- Update documentation for new features

### Areas for Contribution

- **New Features**: Additional dinnerware items, lip styles, cross-section profiles
- **Performance**: Optimize mesh generation for complex geometries
- **UI/UX**: Improve parameter controls, add keyboard shortcuts
- **Documentation**: Tutorials, troubleshooting guides, video walkthroughs
- **Testing**: Add unit tests for geometry generation
- **Export Formats**: Support for additional 3D file formats (OBJ, 3MF, etc.)

### Reporting Issues

When reporting bugs, please include:
- Browser and version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or exported STL files if relevant
- Console error messages (F12 Developer Tools)

## Troubleshooting

### Common Issues

**Problem: "App won't load / blank screen"**
- Solution: Check browser console (F12) for errors
- Ensure WebGL is enabled in browser settings
- Try a different browser (Chrome recommended)
- Clear browser cache and reload

**Problem: "STL export fails or produces invalid geometry"**
- Solution: Check warnings in the parameter panel
- Reduce complexity (fewer segments, simpler curves)
- Ensure wall thickness is adequate (> 1.2mm)
- Try exporting individual items instead of all at once

**Problem: "Mold parts don't align properly after printing"**
- Solution: Ensure registration keys are enabled
- Check that printer is properly calibrated
- Verify shrinkage compensation is applied consistently
- Sand mating surfaces if needed for better fit

**Problem: "3D printed vessel is not watertight"**
- Solution: Increase wall thickness in design
- Use 100% infill or increase perimeter count in slicer
- Apply food-safe sealant or epoxy resin
- Check for gaps in STL mesh (use mesh repair tool)

**Problem: "Development server won't start"**
- Solution: Ensure Node.js is installed (v16+)
- Delete `node_modules` and `package-lock.json`, run `npm install` again
- Check that port 5173 is not already in use
- Try `npm run dev -- --port 3000` to use different port

**Problem: "Handle doesn't attach properly to mug"**
- Solution: Ensure mug data is imported correctly
- Increase blend radius for smoother attachment
- Check attachment height is within mug bounds
- Export handle and mug separately, use boolean union in CAD software

### Performance Tips

- **Reduce segment count** for faster preview (increase for final export)
- **Close unused applications** to free up GPU resources
- **Use Chrome** for best WebGL performance
- **Disable cross-section view** when not needed
- **Export one item at a time** for large dinnerware sets

### Getting Help

- Check existing [GitHub Issues](https://github.com/eeismann/dinnerware-generator/issues)
- Open a new issue with detailed description
- Include browser info, screenshots, and steps to reproduce
- Check documentation files for detailed specifications

## License

MIT License - Feel free to use and modify for your projects.
