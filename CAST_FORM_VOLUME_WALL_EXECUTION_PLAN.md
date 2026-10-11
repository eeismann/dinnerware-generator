# Cast Form Volume-First Wall Compiler - Execution Plan

Date: 2026-02-11
Owner: Codex session

## Goal

Fix the cast-form STL wall-loss defect by replacing stitched shell-face construction with a volume-first wall compiler that emits a closed manifold directly from occupied volume cells.

## Why This Is New

This does not attempt another seam/cap face rewiring, triangle dedupe pass, or exporter-only validation tweak. It replaces wall generation architecture:
- old: handcrafted surface stitching
- new: parametric volume occupancy -> exposed-face extraction

## Implementation Steps

1. Add `wallVolumeCompiler.js` in cast-form geometry.
- Build wall shells from a 3D occupancy field in `(height, angle, depth)` coordinates.
- Compute cavity radius and outer boundary radius per `(height, angle)` sample.
- Fill shell volume using thickness bands (inner, outer, seam, top, bottom).
- Emit mesh by extracting only exposed cell faces.

2. Integrate into `moldGenerator.js`.
- Add feature flag `params.experimental.volumeWallCompiler` (default on).
- Route wall generation to volume compiler when enabled.
- Keep legacy wall generator as fallback path only.

3. Preserve preview/export parity.
- Use the same output geometry objects for viewport and STL export.
- Use quality mode to control compiler depth resolution.

4. Add slicer-parity benchmark.
- Create `scripts/benchmarks/castFormSliceParityGate.mjs`.
- Slice generated walls across Y layers.
- Verify seam-adjacent wall bands contain material per layer.
- Fail if those regions vanish in slicer-like intersections.

5. Validate and report.
- Run existing cast-form diagnostics and quality/perf gate.
- Run new slice parity gate.
- Document outcomes.

## Acceptance Criteria

1. Wall meshes are visible in viewport in assembly/exploded modes.
2. STL exports contain those wall meshes.
3. Slice-parity gate confirms seam wall bands are present across layers.
4. Resulting walls are closed and manifold under strict validation.

## Rollout

1. Feature flag defaults to enabled.
2. Legacy path retained temporarily for fallback.
3. If parity and diagnostics remain stable, remove legacy path in a follow-up cleanup.

## Update (2026-07-08): Compact Wall Blocks

The wall envelope changed from triangle wedges to compact blocks
(`experimental.compactWallBlocks`, default on):

- Each wall is clipped by two vertical lateral planes parallel to its bisector at
  an auto-derived half-width (inner envelope incl. spare/slip-well ring +
  plaster wall thickness). Implemented as clip-plane candidates inside
  `wallVolumeCompiler.computeOuterRadius()` — no CSG, no stitching changes.
- Rationale: each printed wall form is cast into a polymer case mold, laid
  outer-face-down. The side faces must be exactly vertical at 90° to the outer
  face with zero undercuts along the bisector (lay-flat prism), so the form
  releases straight up out of the cured polymer.
- `mold.cornerCutWidth` and `experimental.additiveSeamStock`/
  `perpendicularSideWalls` are inert while compact blocks are on. Setting
  `experimental.compactWallBlocks: false` restores the legacy wedge exactly.
- 2-wall molds got slightly wider at the seams (deliberate: the legacy corner
  cut planes capped the half-width at outerWallDistance, leaving <20mm plaster
  beside the spare ring).
- Gate: `npm run verify:cast-compact` (`castFormCompactWallBlockGate.mjs`)
  asserts containment, lateral-face planarity/verticality, crisp 90° corner
  edges, full-height prism property, plaster guarantee, and seam-face spans for
  wall counts 2/3/4. `castFormAdditiveSeamStockGate.mjs` now pins the flag off
  and covers the legacy path.

## Update (2026-07): Multi-Wall Registration Keys

Registration keys (natches) now generate on every wall-to-wall seam for 3- and
4-wall molds, not just 2-wall:

- **Per-face roles**: each wall's END face (higher angle) carries male keys,
  each START face carries female sockets (diameter + 2×toleranceOffset). Every
  seam pairs exactly one male with one female face. Per-wall male/female (the
  2-wall legacy scheme) is a 2-coloring of the seam cycle and is impossible on
  the odd 3-wall cycle — per-face assignment works for any wall count and makes
  all walls congruent under rotation for lathe vessels. wallCount === 2 keeps
  the legacy per-wall mapping (wall 0 male on both faces) byte-identical.
- **Shared mold-global half-width**: keyed N>=3 compact-block molds derive one
  W = max over per-wall estimates (`estimateConnectedWallLateralHalfWidth`,
  hoisted in `moldGenerator.generateWallShellsFromProfile`). Key centers sit at
  inner + 0.62·faceLength; inner is shared at the seam angle, so identical W is
  what makes male and female centers coincide exactly. Lay-flat prism
  invariants are unchanged — W is still one constant per wall with vertical
  side planes, only its value is mold-global.
- **1-wall stays keyless**: enabling natches on a closed ring would wake the
  dormant radial computeNatchOffset path at the wrap seam; gates are wallCount
  >= 2 explicitly and the two-part gate permanently asserts 1-wall invariance.
  The voxel escape hatch (connectedWallTopology: false) also stays keyless for
  3/4 walls (its radial mechanism assigns roles per wall — broken on odd cycles).
- **Gate map**: `castFormTwoPartRegistrationKeyGate.mjs` = 2-wall behavior +
  1-wall invariance; `npm run verify:cast-registration`
  (`castFormMultiWallRegistrationKeyGate.mjs`) = 3/4-wall per-seam mating,
  shared-W, center agreement, boundary preservation;
  `npm run verify:cast-compact` = natches-off compact-block invariants.

## Update (2026-07): Polymer Case Boxes

Two open-top pour boxes export alongside the mold shells for casting polymer
case molds around the printed forms (`scripts/castForm/geometry/caseBoxGenerator.js`,
`caseBox` params group): a rectangular wall box (the wall form lies
outer-face-down in a floor indent; one box serves all congruent walls) and a
circular foot box. Interior height = seated form + headspace (default 1").
Boxes are single closed manifold "terraced tub" solids built face-by-face (no
CSG). Gate: `npm run verify:cast-box`. Concept/parameter preview page:
`/casting-box-preview.html`.
