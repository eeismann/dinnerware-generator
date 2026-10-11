# Playground Ceramics interface proposal

## Recommendation

Use **Option 1 — Floating Shelf** as the shared default. It carries the parts of Shapr3D that translate well to these apps without copying its product structure: a compact object-like icon language, one contextual control shelf, clear pin/hide/close states, a view cube, and a canvas that can become nearly chrome-free.

Borrow one behavior from **Option 4 — Workspaces** for Vessel V2: allow a saved two-pane `Profile + Model` layout. Do not ship Option 4's permanent right shelf everywhere.

## The four directions

| Direction | Layout | Shelf behavior | Best fit | Cost |
| --- | --- | --- | --- | --- |
| 01 Floating Shelf | 54 px floating rail + 296 px shelf | Pin, hide, close; both disappear in Focus | Best shared default | Medium |
| 02 Docked Studio | 58 px rail + 284 px dock | Resizable and collapsible | Long parameter sessions | Low-medium |
| 03 Canvas Focus | Bottom tool shelf + 278 px transient panel | Tool opens; Esc closes | Review and direct manipulation | Medium |
| 04 Workspaces | 48 px rail + 254 px left + 232 px right | Saved layouts and presentation mode | Vessel V2 / mold power users | High |

## Pixel system

- Editor header: 56 px default; 48–54 px by direction.
- Footer/status: 30–34 px.
- Primary icon hit area: 42 × 42 px; glyph: 20–21 px; stroke: 1.65–1.75 px.
- Secondary icon hit area: 34 × 34 px; glyph: 16–18 px.
- Floating shelf: 296 px wide, 12 px canvas inset, 13 px radius, 1 px translucent border.
- Docked shelf: 284 px wide, full workspace height, no radius or shadow.
- Control row: 32 px minimum; section gap: 13 px.
- View cube: 88 × 88 px envelope; click targets extend beyond visible faces.
- Model-canvas tools: 30 px controls inside a 38 px floating group.
- All controls use the same 8/12/16 px spacing rhythm and Geist / Geist Mono typography.

## Icon language

The system uses optical rather than purely mathematical consistency:

- 24 × 24 viewBox, 1.7 px rounded stroke, no filled outline icons.
- One dominant silhouette per icon; internal detail is limited to two strokes.
- Selected state is a light ceramic tile with dark glyph in Option 1; the other options use one accent tint plus a structural marker.
- Product icons preserve object identity: bowl, vessel profile, and mold blocks are recognizable before a label appears.
- Tool icons describe the action: orbit, pan, fit, layers, parameters, import, and export.
- Labels appear on hover or when a tool opens; compact mode never relies on labels for the active state.

## Shelf and window management

The shelf has three explicit states:

1. **Pinned:** stays open while the canvas changes.
2. **Contextual:** changes with the active tool and closes when the action completes.
3. **Focus:** rail and shelf are both hidden; a 40 px `Controls` pull-tab remains at the top-left.

Desktop keyboard behavior:

- `Tab`: show or hide the active shelf.
- `Shift + Tab`: enter or leave Focus mode.
- `Esc`: close an unpinned shelf or leave Pan mode.
- The selected shelf state is stored per app, not globally; Vessel V2 can remember a different layout from Cast Form.

## View and pan behavior

### View cube

- Click a face for orthographic Top, Front, Right, Back, Left, or Bottom.
- Click a corner or edge for an isometric view.
- Drag the cube to orbit with 1:1 pointer motion.
- Double-click the cube to fit the whole model.
- A 150 ms label confirms the resulting view.
- The cube lives 28 px from the top/right canvas edges and moves inward when a right shelf is open.

### Pan

- Mouse: right-drag pans; middle-drag orbits; wheel zooms.
- Temporary mode: hold `Space` and left-drag to pan; releasing `Space` restores the prior tool.
- Persistent mode: click the Pan hand in the view cluster.
- Trackpad: two-finger drag pans; pinch zooms; one-finger drag orbits only after the canvas has focus.
- Touch: one finger orbits; two fingers pan + zoom.
- Recovery is always visible: Fit Selection and Fit All sit beside Pan.
- V2 profile pan stays view-only: it changes the SVG viewBox, never millimeter geometry, snapping, or export.

## Dashboard improvements

- Replace the empty page-first layout with a `Continue making` row of recent projects.
- Keep Create, Import, and Search adjacent; all remain 34–40 px tall.
- Put the product glyph on every project thumbnail so app type is readable before metadata.
- Show one useful state line: app type plus item/part count. Avoid decorative status chips.
- Add Comfortable / Compact density without changing project data.
- In Workspaces mode, the right shelf is a selection detail preview; in other modes, details open on demand.

## Surface-specific treatment

- **Dinnerware Designer:** the shelf groups Set Proportions, Global Style, Surface, and Items. Hide it for visual review without losing the view cube.
- **Vessel V2:** preserve the profile/model split. Profile zoom and pan remain local to the profile; model pan/orbit use the shared navigation cluster.
- **Cast Form Generator:** default to two walls. Build, Case Box, and View are separate shelf sections; Exploded / Assemble / Section are view states, not geometry settings.
- **Dashboard:** the same app rail becomes a launcher and filter, creating continuity between project selection and editing.

## Implementation sequence

1. Build shared `Icon`, `IconButton`, `ToolRail`, `ControlShelf`, `ViewCube`, and `NavigationCluster` primitives with CSS variables for sizing.
2. Add a `CameraAdapter` around each existing OrbitControls instance: `setPreset`, `panBy`, `fitAll`, `fitSelection`, and `resetTarget`.
3. Implement the shared pointer/keyboard gesture map and keep V2 profile navigation on its existing viewBox-only path.
4. Migrate Dinnerware first, then Cast Form, then Vessel V2; move the dashboard last so project-type navigation matches the finished editors.
5. Verify at 1440 × 1000, 1024 × 768, 768 × 1024, and touch widths; test shelf persistence, keyboard recovery, focus loss, and camera target drift.

## Decision

Approve **Option 1 with Vessel V2's saved split workspace from Option 4**. That produces the strongest shared identity, the most direct space gain, and the lowest risk of making the parameter-heavy apps harder to operate.
