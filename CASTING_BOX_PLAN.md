# Polymer Casting Box — Implementation Plan

Status: **SHIPPED** (concept verified via `casting-box-preview.html`, then built).
- Module: `scripts/castForm/geometry/caseBoxGenerator.js`
- Params: `caseBox` group in `castFormDefaults.js` (constraints included)
- Export: two new entries in the Export modal — `<name>_Case_Box_Wall.stl`,
  `<name>_Case_Box_Foot.stl` (also included in Download ZIP)
- Gate: `npm run verify:cast-box` (`castFormCaseBoxGate.mjs`) — wall counts 2/3/4
- Preview page remains at `/casting-box-preview.html` for parameter exploration.

## Concept (what the preview demonstrates)

Two new printable parts, exported separately from the mold forms, used to cast
the polymer case molds around the printed forms:

1. **Wall case box** (rectangular, open top). The wall form lies
   **outer-face-down** on the box floor, nesting into a shallow **indent**
   (registers the form + seals the underside so polymer cannot creep beneath —
   the flat face later becomes the open screed face when casting plaster in the
   finished polymer case). Box inner walls keep a **consistent gap** from the
   form on all four sides. Interior is **1 inch taller** than the seated form:
   pouring to the brim leaves 1" of polymer above the form for a thick, stable
   case back. **One box serves all N walls** — wall forms are congruent
   (guaranteed by the shared mold-global half-width from the registration-key
   work).
2. **Foot case box** (circular, open top): same construction — floor indent
   sized to the foot's base disc, annular gap, 1" headspace.

Why the concept is geometrically sound: the compact-block lay-flat invariants
(outer face = the form's full silhouette; all side faces vertical or leaning
inward; registration bumps stay inside the lateral planes) mean the floor
indent matches the silhouette exactly and the pour can never undercut the box
walls.

## Parameters (new `caseBox` group in castFormDefaults.js)

| param | default | notes |
|---|---|---|
| enabled | true | include boxes in the export set |
| gap | 10 mm | consistent side gap, form → box wall |
| headspace | 25.4 mm | interior height above seated form (1") |
| wallThickness | 3 mm | box wall (print solid, 100% perimeters recommended) |
| floorThickness | 3 mm | below the indent pocket floor |
| indentDepth | 2.5 mm | pocket the form nests into |
| fitClearance | 0.25 mm | pocket oversize per side |

## Implementation

1. **New module `scripts/castForm/geometry/caseBoxGenerator.js`** — builds two
   watertight solids directly (no CSG; extruded rect/circular rings + base
   slab + pocket ledge — same construction prototyped in the preview page):
   - `buildWallCaseBox(wallGeometry, wallCount, params)` — measures the wall in
     the laid-flat frame (D = max u, uMin, W = max |v|, mold-Y span) exactly as
     the preview's `layFlatWall()` does, then constructs: base slab, pocket
     ledge ring (pocket = 2W×L + clearance), walls to
     `(D − uMin) + headspace`. Output oriented open-top-up = the natural
     support-free print orientation.
   - `buildFootCaseBox(footGeometry, params)` — circular equivalent from the
     foot's measured max radius + height.
2. **Export wiring** (`castFormMain.js` + `castFormSTLExporter.js`): two new
   entries in the Export modal — `<name>_Case_Box_Wall.stl`,
   `<name>_Case_Box_Foot.stl` (always exactly one of each, any wallCount ≥ 2).
   Generated on demand at export time from the export-quality parts.
3. **Optional viewport toggle** (later): "show casting boxes" ghosted around
   the laid-flat forms; not required for v1.
4. **Gate `scripts/benchmarks/castFormCaseBoxGate.mjs`**: box mesh manifold +
   single component; interior clearance ≥ gap − ε all around the seated form
   (sample vertices in laid-flat frame); pocket = silhouette + clearance;
   interior height = form height + headspace ± 0.1; brim open (no faces above
   interior across the opening); foot box radial equivalents. npm script
   `verify:cast-box`.
5. **Docs**: update CAST_FORM_VOLUME_WALL_EXECUTION_PLAN.md gate map.

## Data from the live preview (handle-mug fixture, 3-wall, defaults)

- Wall form seated: 149.2 × 140.0 mm footprint, 54.1 mm tall
- Wall box outer: 175.2 × 166.0 × 82.5 mm → **polymer pour ≈ 1.39 L per wall case**
- Pour volume scales directly with gap + headspace — worth tuning before
  committing to a silicone/urethane purchase.

## Resolved: the foot "discrepancy"

Investigated before the build — **no export bug**. `result.foot` is identical
between preview and export quality. The size difference is input-driven:
`Untitled-mug.stl`'s lowest surface is a tiny Ø9.5 center region (its footring
at r=20 sits ~0.5 mm higher), so the generator sizes the foot plug from that
sliver; the fixture `untitled_mug_6.stl` has a flat Ø85 base → proper Ø84.8
foot. The case box faithfully wraps whatever foot exists. (Foot-detection
robustness against recessed-bottom inputs is a separate, pre-existing mold
generator question.)
