# CLAUDE.MD - Project Context for Claude AI

## Project Overview

**Playground Ceramics** is a web-based parametric design platform for creating custom ceramic objects suitable for FDM 3D printing. It consists of four specialized design tools with a central dashboard for project management.

## Core Applications

### 1. Dinnerware Designer (`index.html`)
- Entry point: `scripts/main.js`
- Creates complete dinnerware sets with 7 item types
- Global style parameters with per-item overrides
- Items: Plate, Soup Bowl, Pasta Bowl, Mug, Tumbler, Saucer, Serving Bowl
- **`dialkit-dinnerware` branch**: every generator and the dashboard use [DialKit](https://www.dialkit.dev)
  (`dialkit/vanilla`). See "DialKit interface" below.

### 2. Vessel Generator (`vessel-generator/`)
- Entry point: `scripts/vessel/vesselMain.js`
- 6 anatomical sections: Lip, Neck, Shoulder, Body, Waist, Foot
- Independent control per section (height, diameter, curvature)
- Multiple lip styles and flat wall mode options

### 3. Handle Generator (`handle-generator/`)
- Entry point: `scripts/handle/handleMain.js`
- Integrates with Dinnerware Designer mug data
- Squared handle style (Hasami-inspired)
- Multiple cross-section profiles: Oval, Round, Rectangular, D-Profile

### 4. Cast Form Generator (`cast-form-generator/`)
- Entry point: `scripts/castForm/castFormMain.js`
- Generates 4-part slip casting molds from vessel geometry
- Automatic mold decomposition (1 foot + 3 wall sections at 120° each)
- Shrinkage compensation, registration keys, slip well generation
- Imports from other generators or external STL/OBJ files

### 5. Dashboard (`dashboard.html`)
- Entry point: `scripts/dashboard/dashboard.js`
- Central hub for managing all projects
- Project storage: `scripts/dashboard/projectStorage.js`
- Theme system (light/dark mode, accent colors, typefaces)

### 6. Vessel Designer V3 (`vessel-v3-generator/`)
- Entry point: `scripts/vesselV3/vesselV3Main.js`
- Forked from Vessel Designer V2's freeform profile editor and per-segment surface
  motif system (points, bezier handles, segment-scoped motifs all carry over unchanged)
- Adds a pulled/pinched **spout**: a local outward-and-downward graft on a chosen wall
  segment, faded to zero at its angular edges so it welds seamlessly into the existing
  wall (`scripts/vesselV3/geometry/spoutGraft.js`)
- Adds an independently generated **lid**, sized off the vessel's own neck radius
  (inset or overcap fit), exported as its own manifold STL alongside the vessel body
  (`scripts/vesselV3/geometry/lidGenerator.js`)
- Handle attachment is not built into V3 directly: the existing Handle Generator app
  now imports Vessel V2/V3 projects as a source (alongside Dinnerware mugs), reusing
  its existing radius-at-height attachment geometry
- Own localStorage key (`playground_ceramics_vessel_v3_projects`), separate from V2

## DialKit interface (`dialkit-dinnerware` branch)

- Each generator's parameters are DialKit panels mounted in a right-hand `.dk-dials-card`
  (`#parameterPanel`), defined per app in `scripts/ui/dialkit/<app>Dials.js` on the shared host
  `scripts/ui/dialkit/dialHost.js`. The app's state stays the source of truth: panels `read`/`change`
  through the app's existing setters, and the app calls `dials.sync()` after anything else changes state
  (undo, load, canvas editors). The host defers DialKit's full re-renders until a drag ends, remembers
  folders, restores focus and follows `<html data-mode>`.
- Shared chrome: `scripts/ui/dialkit/dkChrome.js` (File menu, parameters show/hide toggle; each page
  applies the stored toggle state in an inline `<head>` script) and `styles/dialkit-chrome.css`
  (tokens, header, card, menus, `.dk-modal` dialogs, rows). Page CSS: `styles/<app>-dials.css`,
  `styles/dashboard-dialkit.css`. No footers; Studio/Line shells are not loaded on these pages.
- View controls live in the shared **view dock** (`scripts/ui/dialkit/viewDock.js`): a floating card in
  the lower left of each viewport with the Studio shell's X/Y/Z orientation cube (click a face to snap,
  drag to orbit, reset button) and an expand icon revealing the app's view controls plus global
  Appearance (light/dark). Apps pass sections of toggle/select/slider/actions/group controls.
- Generators that need an input (Cast Form's vessel, Handle's mug/vessel) share one source flow: a
  `.dk-start-card` over the empty viewport until a source is chosen (nothing is generated before), and a
  `.dk-source-card` at the top of the parameter card with a Choose…/Change… button.
- Apps whose main module is imported by Node gates (Handle, V3, Cast Form) load their dials module on
  demand, because DialKit imports CSS.
- Browser suites: `scripts/tests/<app>DialsBrowser.mjs`, all run by `npm run test:browser`.

## Technical Stack

- **Framework**: Vanilla JavaScript (ES modules)
- **3D Rendering**: Three.js r160
- **Build Tool**: Vite 5.0
- **Storage**: Browser localStorage (no backend)
- **Export Format**: STL files for 3D printing

## Project Structure

```
dinnerware-generator/
├── dashboard.html                    # Platform dashboard
├── index.html                        # Dinnerware Designer
├── vessel-generator/index.html       # Vessel Generator
├── handle-generator/index.html       # Handle Generator
├── cast-form-generator/index.html    # Cast Form Generator
├── scripts/
│   ├── main.js                       # Dinnerware entry point
│   ├── dashboard/                    # Dashboard logic & storage
│   ├── vessel/                       # Vessel app (geometry, state, UI)
│   ├── handle/                       # Handle app (geometry, state, UI)
│   ├── castForm/                     # Cast Form app (mold generation)
│   ├── geometry/                     # Dinnerware mesh generation
│   ├── state/                        # Dinnerware state management
│   ├── ui/                           # Shared UI components (viewport, themes)
│   └── utils/                        # Validation & warnings
├── styles/                           # CSS for each app + shared themes
└── saved-projects/                   # Example project JSON files
```

## Key Geometry Generation Patterns

### Dinnerware & Vessel
- 2D profile generation from parameters
- Profile revolution (360°) around vertical axis
- Shell operation for wall thickness
- Footring geometry generation
- Export as manifold STL mesh

### Handle
- 2D cross-section profile generation
- Path calculation with rounded corners
- Cross-section sweep along path
- Attachment blend geometry
- Extension into mug body for boolean union

### Cast Form (Mold Generator)
- Import vessel STL and apply shrinkage scaling
- Auto-detect foot/wall separation plane
- Decompose into 4 parts (1 foot + 3 wall sections)
- Generate registration keys for alignment
- Create slip well integrated into wall sections
- Offset geometry for plaster shell thickness
- Export each part separately

## State Management Pattern

Each application follows similar state patterns:
- Central state object with defaults
- Parameter validation and warnings
- Auto-save to localStorage
- Export/import as JSON
- Real-time 3D preview updates

## Important Files to Know

### Geometry Generation
- `scripts/geometry/meshGenerator.js` - Dinnerware mesh generation (lathes the cross-section chains)
- `scripts/geometry/profileBuilder.js` - Dinnerware closed cross-section: true normal-offset walls,
  tangent fillets, 45° inset chamfer, foot cavity, rim styles; chains run counter-clockwise so
  every lathe faces outward
- `scripts/geometry/setLayout.js` - Stacked / table-setting layouts from cross-sections
- `scripts/vessel/geometry/` - Vessel mesh generation
- `scripts/handle/geometry/` - Handle mesh generation
- `scripts/castForm/geometry/moldGenerator.js` - 4-part mold system
- `scripts/vesselV3/geometry/spoutGraft.js` - Vessel V3 spout graft
- `scripts/vesselV3/geometry/lidGenerator.js` - Vessel V3 lid generation

### State Management
- `scripts/state/projectState.js` - Dinnerware state
- `scripts/vessel/state/` - Vessel state
- `scripts/handle/state/` - Handle state
- `scripts/castForm/state/` - Cast Form state
- `scripts/vesselV3/state/vesselV3Defaults.js` / `vesselV3State.js` - Vessel V3 state

### UI Components
- `scripts/ui/viewport.js` - Dinnerware Three.js viewport (geometry cache, selection, compare ghosts)
- `scripts/ui/profilePanel.js` - Dinnerware 2D profile editor and silhouette lineup
- `scripts/ui/numericFields.js`, `scripts/ui/accessibility.js` - label scrubbing/arithmetic, a11y helpers
- `scripts/state/history.js`, `scripts/state/presets.js` - Dinnerware undo/redo and style presets
- `scripts/ui/line/` - "Line" interface (`?ui=line`, remembered): Patterns Line-edition chrome for every
  page. `lineAppShell.js` is the shared frame; `lineShell.js` (dinnerware), `lineDashboard.js` and
  `adapters/*Line.js` configure it by reparenting classic controls. Styles: `styles/line-base.css`,
  `line-app.css`, `line-dashboard.css`
- `scripts/ui/themeManager.js` - Global theme system
- `scripts/vessel/ui/` - Vessel UI components
- `scripts/handle/ui/` - Handle UI components
- `scripts/castForm/ui/` - Cast Form UI components
- `scripts/vesselV3/ui/` - Vessel V3 UI components (profile editor, spout/lid inspectors)

### Utilities
- `scripts/geometry/stlExporter.js` - STL export utilities
- `scripts/castForm/geometry/castFormSTLExporter.js` - Cast Form STL export
- `scripts/utils/validation.js` - Warning system for print issues
- `scripts/castForm/geometry/inputProcessor.js` - STL/OBJ import

### Project Management
- `scripts/dashboard/projectStorage.js` - localStorage management
- `scripts/dashboard/dashboard.js` - Dashboard UI and logic

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (default: localhost:5173)
npm run build        # Build for production (outputs to dist/)
npm run preview      # Preview production build
npm test             # Node regression suite (unit tests + geometry/cast-form gates)
npm run test:browser # Playwright browser workflows (software WebGL)
npm run benchmark:dinnerware  # Dinnerware preview/export/validation timings
```

## Common Development Tasks

### Adding New Dinnerware Item
1. Add default parameters to `scripts/state/projectState.js`
2. Update mesh generation in `scripts/geometry/meshGenerator.js`
3. Add UI controls in `index.html` and corresponding JS
4. Update export logic in `scripts/geometry/stlExporter.js`

### Adding New Vessel Lip Style
1. Add style to `scripts/vessel/state/vesselDefaults.js`
2. Implement geometry in `scripts/vessel/geometry/`
3. Add UI option in `scripts/vessel/ui/parameterPanel.js`

### Adding New Handle Cross-Section
1. Define profile in `scripts/handle/geometry/`
2. Update state defaults in `scripts/handle/state/`
3. Add UI dropdown option

### Modifying Cast Form Mold Generation
1. Core logic in `scripts/castForm/geometry/moldGenerator.js`
2. Registration keys, slip well, shell generation all in same file
3. Import/export in `scripts/castForm/geometry/inputProcessor.js` and `castFormSTLExporter.js`

## Browser Support & Requirements

- Modern browsers with WebGL support (Chrome recommended)
- No backend required - runs entirely client-side
- All data stored in browser localStorage
- No user accounts or authentication

## 3D Printing Context

All geometries are designed for FDM/FFF 3D printing:
- Recommended materials: PLA, PETG, ABS
- Layer height: 0.2mm (0.1mm for fine details)
- Wall thickness warnings: < 1.2mm (Dinnerware), < 1.5mm (Vessel)
- Overhang warnings: > 45° from vertical
- Mold shells typically printed at 15-20% infill

## Warning System

Each application has validation thresholds:
- **Dinnerware/Vessel**: Wall thickness, overhang angles, footring geometry
- **Handle**: Cross-section size, attachment width
- **Cast Form**: Plaster wall thickness, shrinkage %, draft angle, mold size

## Known Patterns & Conventions

### File Naming
- HTML files: `[app-name].html` or `index.html` in subdirectories
- JS files: camelCase (e.g., `meshGenerator.js`, `projectState.js`)
- CSS files: kebab-case matching HTML names

### Code Style
- ES6 modules (`import`/`export`)
- 2-space indentation
- Descriptive variable names for geometry calculations
- Comments on complex math/geometry operations

### State Updates
- State changes trigger geometry regeneration
- Geometry updates trigger viewport re-render
- Warnings recalculated on parameter changes
- localStorage updated on state changes

### Three.js Patterns
- Scene, camera, renderer setup in viewport modules
- OrbitControls for camera interaction
- Multiple camera presets (Top, Side, 3/4, Bottom)
- Cross-section view using clipping planes

## Design Philosophy

- **Privacy-first**: No server, no tracking, all client-side
- **Modular**: Each generator is independent but shares common utilities
- **Parametric**: All designs driven by adjustable parameters
- **Print-focused**: Geometry optimized for FDM 3D printing
- **Accessible**: Simple UI, real-time preview, clear warnings

## Recent Changes (from git log)

- **Latest**: Fix save/load functionality across all generators
- **Previous**: Add Cast Form Generator and comprehensive improvements
- **Initial**: Dinnerware generator project foundation

## When Working on This Project

1. **Understand the app context**: Each generator has its own state, geometry, and UI structure
2. **Follow existing patterns**: State → Geometry → Viewport update flow
3. **Test STL exports**: Ensure geometry is manifold and printable
4. **Check warnings**: Make sure validation thresholds are appropriate
5. **Consider all apps**: Changes to shared utilities affect all generators
6. **Preserve localStorage compatibility**: State changes may break saved projects

## External Documentation

Detailed specs available in:
- `playground-ceramics-platform-spec.md` - Platform overview
- `dinnerware-generator-product-spec.md` - Dinnerware Designer spec
- `vessel-generator/vessel-generator-product-spec.md` - Vessel spec
- `handle-generator/handle-generator-product-spec.md` - Handle spec
- `cast-form-generator/cast-form-generator-product-spec.md` - Cast Form product spec
- `cast-form-generator/cast-form-generator-technical-spec.md` - Cast Form technical spec
- `mold-generator/mold-generator-product-spec.md` - Alternative mold generator spec

## License

MIT License - Open source project
