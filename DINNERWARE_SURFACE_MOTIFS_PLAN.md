# Dinnerware Surface Motifs — Plan & Proposal

> **Status: IMPLEMENTED (2026-07-08).** Engine in `scripts/geometry/surfacePattern.js`,
> integration in `meshGenerator.js`, params in `projectState.js`, UI in `index.html`/`main.js`,
> warnings in `validation.js`. Regression gate: `node scripts/benchmarks/surfacePatternGate.mjs`.

Add decorative surface motifs (vertical lines, horizontal lines, cross-hatch, diagonal lines, knurling) to the **outer wall** and **outer footring** of dinnerware items. Each surface can be Smooth or Patterned independently, patterns have their own variation controls, and everything must survive STL export as real printable geometry.

---

## 1. Core Technical Concept

### One engine, five motifs: height-field displacement on the revolved surface

Every requested motif is a 2D height field on the "unwrapped" surface of a revolved profile, parameterized by:

- `θ` — angle around the circumference (0 to 2π)
- `t` — arc-length position along the 2D profile (bottom to top of the region)

| Motif | Height field |
|---|---|
| Vertical lines | `f(θ · N)` — N ridges around the circumference |
| Horizontal lines | `f(t / pitch)` — ridges stacked along the height |
| Diagonal lines | `f(θ · N ± t / pitch)` — helical ridges, leaning left or right |
| Cross-hatch | combine two opposing diagonal fields (`max` for raised, `min` for recessed) |
| Knurling | the two opposing diagonal fields multiplied/intersected with a V-profile → classic machined diamond peaks |

`f` is a periodic waveform whose shape is itself a variation parameter (rounded, V, or square ridge cross-section) with a duty-cycle parameter (line width relative to pitch).

The displacement is applied to each vertex **along the profile's 2D outward normal** (computed in the r–y profile plane, then rotated to the vertex's angle θ). This works identically on straight walls, curved walls (`wallCurveAmount`), and the angled footring — the pattern "wraps" the surface.

Why displacement rather than CSG/booleans: it is orders of magnitude faster (must run in real time on slider drag), it cannot produce non-manifold results if the grid is built correctly, and the existing strict STL validator (`stlCore.js`) will pass it. This is the same reason knurling on cups is done with displacement in tools like Fusion 360's coil-emboss and most parametric cup generators.

### Seam correctness (critical detail)

The pattern must close seamlessly where the revolution wraps around:

- Vertical / diagonal / cross-hatch / knurl density is specified as an **integer count of ridges (or "starts") around the circumference** — never a free-floating mm pitch — so `θ = 0` and `θ = 2π` always align.
- Horizontal lines have no seam issue (field depends on `t` only).

### Edge behavior (fades and margins)

Raw displacement running into an edge creates ragged rims and feet. The engine applies smooth fade-to-zero envelopes:

- **Rim margin**: pattern fades out over the top ~2 mm of the wall so the rim stays clean and comfortable to drink from.
- **Fillet/transition margin**: fades out ~1.5 mm before the bottom-corner fillet or wall/footring junction.
- **Foot seat margin**: bottom ~1 mm of the footring stays smooth so the piece sits flat.
- Fade shape: smoothstep on the displacement amplitude.

### Mesh resolution

Today a straight wall is 2 profile points × 64 radial segments — far too coarse to carry a pattern. When a region is patterned:

- **Radial segments**: `clamp(rigdeCount × 10, 64, 512)` so each ridge gets ~10 segments across.
- **Axial resampling**: the region's profile polyline is resampled to ~0.6 mm steps (capped) before revolution.
- Unpatterned regions keep today's resolution — only the patterned segments get dense.

Expected cost: a patterned mug wall ≈ 512 × 170 grid ≈ 170k triangles (vs ~17k today). Acceptable for 7 items with debounced regeneration; see §6 Performance.

---

## 2. Parameter Model

Two independent parameter groups, `wallPattern*` and `footringPattern*`, added as flat scalars/enums to the existing `globalParameters` + `itemOverrides` system (so per-item overrides work exactly like `wallAngle` does today).

| Parameter (× wall/footring) | Type | Range / options | Default | Applies to |
|---|---|---|---|---|
| `…PatternType` | enum | `none, vertical, horizontal, diagonal, crosshatch, knurl` | `none` | — |
| `…PatternDepth` | mm | 0.1 – 1.5, step 0.05 | 0.4 | all |
| `…PatternRelief` | enum | `raised, recessed` | `raised` | all |
| `…PatternCount` | int | 8 – 240, step 1 | 48 | vertical, diagonal, crosshatch, knurl (ridges around circumference) |
| `…PatternPitch` | mm | 1 – 20, step 0.5 | 4 | horizontal (spacing along height); also sets rise-per-turn feel for diagonals via angle |
| `…PatternLineWidth` | % duty | 10 – 90, step 5 | 50 | all except knurl |
| `…PatternProfile` | enum | `rounded, v, square` | `rounded` | all except knurl (knurl is inherently V/diamond) |
| `…PatternAngle` | ° | 15 – 75, step 5 | 45 (knurl: 30) | diagonal, crosshatch, knurl |
| `…PatternDirection` | enum | `right, left` | `right` | diagonal only |
| `wallPatternStart` / `wallPatternEnd` | % of wall height | 0 – 100 | 0 / 100 | wall only — pattern a band instead of the full wall (v2, optional) |

Notes:

- `none` = smooth = today's behavior and the default, so **existing saved projects load unchanged** (state `mergeWithDefaults` already backfills missing params from defaults).
- Enum parameters are new to the constraint system — `PARAMETER_CONSTRAINTS` gains an `options: [...]` form alongside `min/max/step`.
- `getAllParameters()` parameter list grows by these names; the resolver needs no other changes.

---

## 3. UI Proposal

### New "Surface Pattern" panel section (below Global Style)

Progressive disclosure — smooth by default, controls appear only when relevant:

```
▼ Surface Pattern
   WALL
   Pattern          [ Smooth ▾ ]        ← select: Smooth / Vertical Lines /
                                           Horizontal Lines / Diagonal Lines /
                                           Cross-Hatch / Knurling
   ── shown only when Pattern ≠ Smooth ──
   Depth            [───●────] 0.4 mm
   Relief           [ Raised ▾ ]
   Line Count       [───●────] 48        (or Pitch 4 mm for Horizontal)
   Line Width       [───●────] 50 %      (hidden for Knurling)
   Ridge Profile    [ Rounded ▾ ]        (hidden for Knurling)
   Angle            [───●────] 45°       (Diagonal / Cross-Hatch / Knurling only)
   Direction        [ Right ▾ ]          (Diagonal only)

   FOOTRING
   Pattern          [ Smooth ▾ ]
   … same controls, independent values …
   [ ⧉ Copy wall pattern to footring ]   ← convenience button
```

- Wall and footring are fully independent, satisfying "both, or just one or the other." The copy button is a one-tap way to match them.
- Conditional show/hide of rows uses the same mechanism as the existing saucer `cupRingDepth` row toggle (`scripts/main.js:947`).
- A new **select-row control type** is needed: the parameter panel and the per-item override renderer (`scripts/main.js:262–345`) currently only build range+number rows. The select row reuses `parameter-row`/`control-group` styling, includes the same ↺ reset button, and in the override panel gets the same `has-override` highlight.
- Per-item overrides: all pattern params appear in the override panel, so e.g. the set can be smooth globally with a knurled tumbler, or vertically-lined everywhere with a smooth saucer.

### Viewport

No viewport changes required — patterns are real geometry and show up automatically, including in cross-section view. Optional polish: slightly increase material roughness contrast so shallow patterns read well in the preview.

---

## 4. Implementation Plan

### New file: `scripts/geometry/surfacePattern.js`

The whole engine in one module:

- `waveform(x, profile, dutyCycle)` → 0..1 periodic ridge shape (rounded / V / square)
- `patternField(theta, t, params, regionInfo)` → signed offset in mm (handles all 5 motifs + relief direction + fade envelopes)
- `resampleProfilePolyline(points, maxStep)` → densified profile with per-point arc length and 2D normals
- `createPatternedLatheGeometry(profilePoints, patternParams, regionInfo)` → dense displaced grid with correct normals and winding, drop-in replacement for `THREE.LatheGeometry` output

### Modified: `scripts/geometry/meshGenerator.js`

In `generateItemMesh`, the **outer wall segments** (`generateOuterMainWallProfile`, `generateOuterWallToFilletProfile`) route through `createPatternedLatheGeometry` when `wallPatternType !== 'none'`; the **outer footring segments** (`generateOuterFootringWallProfile`, `generateOuterFootringFromFilletProfile`) likewise for `footringPatternType`. All other segments (inner surfaces, fillets, caps, base) are untouched — inner surfaces stay smooth for cleanability.

Adjacent-segment stitching: because fades bring displacement to exactly 0 at each region's ends, patterned segments still share their boundary rings with neighboring smooth segments — the merged mesh stays watertight and the strict STL validator passes.

### Modified: `scripts/state/projectState.js`

- Add the ~19 new parameters to `DEFAULT_PARAMETERS`
- Add constraints (including the new `options` enum form) to `PARAMETER_CONSTRAINTS`
- Add names to the `getAllParameters` list

### Modified: `index.html`, `scripts/main.js`, `styles/main.css`

- New Surface Pattern panel section markup
- Select-row control type (global panel + override panel renderer)
- Conditional row visibility per pattern type
- "Copy wall → footring" action

### Modified: `scripts/utils/validation.js`

New checks (see §5).

### Untouched

`stlExporter.js` / `stlCore.js` (geometry-agnostic), viewport, dashboard, storage format (new params ride along in `globalParameters`/`itemOverrides`).

---

## 5. Print-Safety Warnings

New `WarningSystem` checks, per item, when a pattern is active:

1. **Remaining wall thickness** — for `recessed` relief: warn if `wallThickness − depth < 1.2 mm`. Also hard-clamp recess depth in the engine to `wallThickness − 1.0 mm` so geometry can never self-intersect.
2. **Minimum feature size** — computed ridge width (`circumference × duty / count`, or `pitch × duty`) `< 0.8 mm` (≈2 nozzle widths): "pattern lines may not resolve when printed."
3. **Horizontal-ridge overhang** — raised horizontal or shallow-angle diagonal ridges with `square` profile and depth `> 0.8 mm`: "ridge undersides exceed 45° overhang."
4. **Complexity note** — estimated triangle count across visible items `> ~1M`: "pattern density may slow preview and slicing."

---

## 6. Performance Strategy

- Regeneration already runs per-item on state change; patterned items will take ~50–150 ms instead of ~5 ms. Mitigations, in order of need:
  1. Debounce slider-drag regeneration (hook into existing `renderScheduler.js`).
  2. While a pattern slider is being dragged, generate at half radial density; snap to full density on release.
  3. Hard caps: 512 radial segments, 0.6 mm axial floor.
- No worker needed for v1 (the cast-form app's `moldWorker.js` pattern is available if profiling says otherwise).

---

## 7. Phasing

| Phase | Scope | Proves |
|---|---|---|
| **1. Engine + pipeline** | `surfacePattern.js`; state params; vertical + horizontal on the wall only; temporary minimal UI (type select + depth) | End-to-end: displaced geometry → viewport → strict STL validation → slicer |
| **2. Full motif set + footring** | diagonal, cross-hatch, knurling; footring region; seam integrity; fade polish on fillets/rim/foot | All 5 motifs on both surfaces |
| **3. Full UI** | Surface Pattern section, conditional variation controls, select-rows in the override panel, copy button | Independent wall/footring control + per-item overrides |
| **4. Hardening** | validation warnings, perf tuning (drag debounce, density caps), test matrix: each motif × raised/recessed × each item type × curved walls × fillets, export QA in a slicer | Ship |

---

## 8. Decisions Taken (flag if you disagree)

- **Outer surfaces only.** Inner walls stay smooth (food contact, cleanability). Could add an "inner wall" region later for tumbler grip texture.
- **Raised is the default relief** — safer for FDM than recessing into a 2.5 mm wall.
- **Density as integer count** (not mm pitch) for anything that wraps the circumference — guarantees seamless wrap; the UI can display the equivalent mm spacing as read-only hint text.
- **Knurling has no line-width/profile controls** — a knurl is definitionally a full-coverage diamond; its variations are count, angle, and depth.
- **No pattern on plate/saucer *floors*** — "walls" on a plate means the short outer rim wall, which works fine; patterning the flat eating surface is out of scope.
