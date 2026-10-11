# Surface Pattern Clean Lines — Diagnosis & Fix Plan

Status: implemented and verified (2026-07-10)
Date: 2026-07-10

## 0. Results

- Reproduction settings (diagonal 43 / 60% / square / 40° / right / 1.5mm):
  ridge-edge phase wobble measured by ray probing dropped from ~0.076 period
  (pre-fix simulation) to 0.0005 period; ridge width variation along a ridge
  dropped from 29% to probe-quantization floor. All ridges identical.
- Cross-hatch / knurl period-to-period deviation: 0.15-0.35% of relief
  (every lattice cell renders identically; no moiré).
- Gates: surfacePatternGate, surfacePatternCleanlinessGate (new),
  castFormPatternMoldGate (knurl phase-lock 0.129mm < 0.2mm),
  vesselV2MotifGate, qualityPerfGate — all pass.
- Visual: output/clean-lines-verification/ has app screenshots at the
  reproduction settings; ridges are clean and straight.
- One mold-gate assertion re-anchored: "tier 1 relief >= tier 2 relief" held
  only because the old vessel undersampled knurl apexes; both tiers are now
  compared against the vessel (see comment in castFormPatternMoldGate.mjs).
- Re-verify any time with:
  `node scripts/benchmarks/surfacePatternCleanlinessGate.mjs` and
  `node scripts/benchmarks/_verifyCleanLines.mjs` (needs `npx vite --port 5199`).

## 1. Symptom

Diagonal Lines (and Cross-Hatch / Knurling) render as ragged, braided ridges
instead of clean straight helical lines. Reproduction: mug, Diagonal Lines,
count 43, width 60%, Square profile, 40°, Right, depth 1.5mm. Vertical and
horizontal lines look acceptable; every diagonal-family pattern degrades.

## 2. Root cause

The pattern engine (`scripts/geometry/surfacePattern.js`) evaluates a periodic
height field on an axis-aligned grid (columns = uniform theta, rows = profile
arc length) and displaces vertices along the profile normal. Three compounding
sampling defects:

1. **Columns undersample the waveform and are non-commensurate with it.**
   `computePatternRadialSegments` gives `ceil(count*6/8)*8` columns. For
   count 43 that is 264 columns = 6.14 samples per ridge period. The square
   profile's flank occupies 4.5% of a period, far below the ~16% sample
   spacing, so a ridge edge lands up to half a sample away from its true
   position. Because 264/43 is not an integer, every ridge is sampled at
   different phase offsets, so ridges differ from one another.

2. **Rows shift the field's phase by a non-commensurate step.** A diagonal
   field advances `count·tan(angle)/(2πR)` periods per mm of profile arc. At
   the reproduction settings each ~0.96mm row advances the phase 0.125 period
   while the column quantum is 0.163 period. The quantized ridge edge
   therefore jumps sideways pseudo-randomly from row to row. Measured on the
   reproduction settings: rendered ridge width oscillates 3↔4 columns (29%
   wobble) and the rising edge wanders between f=0.223 and f=0.375 against an
   analytic edge at f=0.200, with a ~1.0mm surface quantum. That is the braid
   in the screenshot.

3. **Rows themselves are irregular.** `resampleProfile` ceil-divides each
   polyline segment independently and preserves every original vertex, so row
   spacing varies along the profile and the phase stagger is aperiodic, which
   reads as organic raggedness instead of a regular texture.

`computeVertexNormals` then shades every one of these quantization steps,
amplifying the visual noise. This is a sampling-alignment problem; the field
definition (`patternAmplitude`) is correct.

## 3. Fix architecture

Principle: **make the sampling grid commensurate with the pattern field** so
that every ridge is sampled identically at every row. Brute-force resolution
alone cannot deliver clean edges (a finite axis-aligned grid always staircases
a diagonal step edge) and would blow up vertex counts; alignment delivers
exact straight lines at today's cost.

### 3.1 Commensurate columns (all circumferential patterns)

`computePatternRadialSegments` picks the smallest column count that is a
multiple of the ridge `count` (all ridges sampled at identical phases), a
multiple of 8 (cap/ring helper contract), at least `max(96, 6·count)`, and at
most 960. Fallback to the legacy rule when no such multiple exists (very high
odd counts); lines stay straight there via 3.2, with slight per-ridge width
variance on fine patterns. With wall + footring patterns active the search
satisfies both counts via a common multiple when it fits, else prioritizes
the first (wall) pattern.

### 3.2 Diagonal: ridge-aligned (sheared) grid — exact fix

Generate the grid so vertex columns follow constant-phase helical lines:
`theta(i, t) = phi_i − dirSign·tan(angle)·t/meanRadius`. Along such a column
the field amplitude is constant, so each ridge is an extruded helical strip
whose edges are actual mesh edges: perfectly straight and identical at any
resolution, for any angle, count, width, profile, direction, or depth.

Boundary contract: the t=0 ring stays a uniform lathe ring. The far ring is
rotated by the total twist δ; snap δ to the nearest non-zero multiple of the
ring spacing `2π/segments` so its vertex set coincides positionally with the
neighboring smooth segment's ring (weld-by-position holds; STL stays
watertight). The snap keeps twist linear in t, so ridges remain perfectly
straight; it changes the effective helix angle by at most `π/segments` radians
of total twist (≤0.7° over the whole band), visually imperceptible.

Rows no longer need to resolve the pattern (amplitude is constant per
column), only profile curvature, fade envelopes, and helix chord smoothness:
uniform arc-length steps ≤1.2mm, tightened when twist-rate·step would exceed
0.1 rad, with kink vertices of the source polyline preserved.

### 3.3 Cross-hatch / knurl: commensurate lattice

Two crossing helical families cannot both be shear-aligned. Instead keep the
axis-aligned grid but make it commensurate in both directions: columns as per
3.1 (m = segments/count integer samples per period) and uniform rows whose
per-row phase advance is an exact rational k/(m·q) of a period. Row spacing
derives from the helix axial period; the row count is rounded to span the
band exactly and the field's effective angle is snapped (same trick as 3.2,
error one part in ~2·rows) so commensurability is exact. Result: every
diamond/crossing cell is sampled identically — a regular, clean lattice with
no moiré. Both families get symmetric treatment.

### 3.4 Horizontal: breakpoint rows

Horizontal ridges are already straight (rings), but square/V flanks land
between rows. Insert rows exactly at the waveform's breakpoints (ridge edges,
square shoulder corners, V apex) for crisp profiles. Interior rows are full
rings, so welding is unaffected.

### 3.5 Vertical

Fixed by 3.1 alone (identical per-ridge sampling); amplitude was already
constant along columns.

### 3.6 Uniform row sampler

Replace `resampleProfile` usage with an arc-length-uniform sampler that
preserves exact endpoints, supports must-include interior stations
(breakpoints, kinks), and never exceeds the legacy 1.2mm step. The exported
`resampleProfile` stays (no external callers, kept for compatibility).

## 4. Mold parity (Cast Form Tier 1)

`moldGenerator.prepareAnalyticRelief` re-evaluates `patternAmplitude`
analytically on mold cavities and must reproduce the vessel's field including
the snapped effective angle (the knurl phase-lock gate allows <0.2mm
deviation; the snap alone could consume most of that budget at band ends).

- `surfacePattern.js` exports `computeEffectivePattern(pattern, meanRadius,
  bandLength, radialSegments)` — the pure snap used by the mesh generator.
- `meshGenerator.js` exports `computePatternBandMeta(params, geoVals)`
  returning each patterned band's engine meanRadius and arc length from the
  same profile builders the mesh uses.
- `dinnerwareImport.js` adds `engineMeanRadius`, `bandArcLength`,
  `radialSegments` to the per-surface metadata.
- `moldGenerator.js` applies `computeEffectivePattern` when those fields are
  present; falls back to the raw angle otherwise (older payloads).

`patternAmplitude`, `fadeEnvelope`, and the parameter model are unchanged.

## 5. Validation

1. **New gate** `scripts/benchmarks/surfacePatternCleanlinessGate.mjs`:
   - Ray-sampled ring signals (as in castFormPatternMoldGate) at many heights
     on patterned items across a sweep: counts {8, 43, 120, 240}, angles
     {15, 40, 75}, both directions, profiles {rounded, v, square}, widths
     {10, 60, 90}, raised/recessed, all five pattern types.
   - Asserts: exact `count` cycles per ring; fundamental phase advances
     linearly with height (max residual a small fraction of a period — the
     straightness metric; pre-fix code measures ~0.08 period); ridge width
     constant along each ridge and across ridges; print validity
     (`validateGeometryForPrint`) on the sweep corners.
2. **Existing gates**: surfacePatternGate (watertight/manifold across types ×
   relief × items × fillet/curve stress), castFormPatternMoldGate (Tier-1
   analytic parity incl. knurl phase lock), vesselV2MotifGate,
   qualityPerfGate.
3. **Visual**: vite + playwright screenshot of the mug at the exact
   reproduction settings; before/after comparison.

## 6. Risks / notes

- Multiple-of-4-but-not-8 segment counts are documented as "probably safe"
  for cap/ring helpers; the implementation only uses multiples of 8, falling
  back to the legacy rule instead of gambling on multiples of 4.
- Uniform rows drop non-kink interior polyline vertices; chordal error at
  ≤1.2mm steps on ≥8mm-radius curves is ≤0.02mm, below the 0.05mm print
  tolerance. Kink detection (>3° turn) preserves genuine corners.
- Effective-angle snap: ≤0.7° twist change over a band; recorded nowhere
  user-visible (the control still shows the requested angle). Mold parity is
  exact via the shared helper.
- Vessel V2 uses the same engine and inherits the fix; its per-segment motif
  stacks flow through the same commensurate segment search.
