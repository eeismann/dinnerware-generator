# Vessel V2 — Per-Segment Surface Motifs — Plan & Proposal

> **Status: IMPLEMENTED (2026-07-09).** Reuses the shipped dinnerware engine in
> `scripts/geometry/surfacePattern.js` (`getMotifPattern` adapter). Shared
> options in `scripts/geometry/surfacePatternOptions.js`; per-segment model in
> `scripts/vesselV2/state/`; segment-aware mesh in
> `scripts/vesselV2/geometry/vesselV2MeshGenerator.js`; segment selection in
> `ui/profileEditor.js`; contextual inspector in `ui/motifInspector.js`.
> Watertightness gate: `node scripts/benchmarks/vesselV2MotifGate.mjs`.
> UI proposal preserved in `vessel-v2-motif-ui-demo.html`.

Apply the existing surface-motif system (vertical / horizontal / diagonal lines,
cross-hatch, knurling) to the **Vessel Designer V2**, but **per profile segment**
instead of per whole-surface. The user selects a segment of the drawn profile;
a contextual inspector then exposes a motif type and its settings for *that
segment only*. Different segments can carry different motifs (or none), and it
all survives STL export as real, printable, watertight geometry.

---

## 1. Why this is mostly reuse, not new engine work

The dinnerware motif engine is already **region-based**. Its core builder —

```js
createPatternedLatheGeometry(points, radialSegments, pattern, opts)
```

— takes *any* profile polyline run `points` (an array of `THREE.Vector2` in the
`r,y` plane), displaces it by a height field, and **fades displacement to exactly
zero at both ends** so the run's boundary rings stay coincident with whatever is
adjacent (`surfacePattern.js:269`, fade logic `:157`, `:313`). That is precisely
what a per-segment application requires: a vessel "segment" is just a contiguous
run of the sampled outer profile, and its neighbors are the runs above and below.

So the engine (`surfacePattern.js`) needs **no changes** beyond one thin adapter
(§3). The work is: a data model for per-segment motifs, a segment-aware outer-wall
build in the V2 mesh generator, segment selection in the editor, and the inspector
UI.

### What a "segment" is in V2

V2's profile is a freeform point list (`vesselV2Defaults.js:24`), each point a
world-space anchor `{ id, r, h, inHandle, outHandle, kind, cornerRadius, locked }`.
A **segment** is the edge between two consecutive points, `points[i-1] → points[i]`
— exactly the unit the sampler already iterates (`profileSampler.js:209`). Points
carry **stable ids** (`p0`, `p1`, …), so a segment can be keyed stably by its
**upper** anchor: `points[i]` owns the segment beneath it. (`p0`, the base center,
owns nothing.)

---

## 2. Data Model

### Store the motif on the segment's upper anchor point

Co-locate motif data with the point list so it rides through V2's existing
normalization, autosave, and file format with **zero storage-schema changes**.

```js
// scripts/vesselV2/state/vesselV2Defaults.js — each non-base point gains:
{
  id: 'p2', r: 62, h: 78, inHandle: {…}, outHandle: {…}, kind: 'smooth',
  cornerRadius: 0,
  motif: {                 // NEW — describes the segment BELOW this point
    type: 'none',          // none | vertical | horizontal | diagonal | crosshatch | knurl
    depth: 0.4,            // mm   0.1–1.5
    relief: 'raised',      // raised | recessed
    count: 32,             // int  8–240  (ridges around circumference)
    pitch: 4,              // mm   1–20    (horizontal spacing)
    lineWidth: 50,         // %    10–90   (duty cycle)
    profile: 'rounded',    // rounded | v | square
    angle: 45,             // °    15–75   (diagonal/crosshatch/knurl)
    direction: 'right'     // right | left (diagonal only)
  }
}
```

The field names mirror the dinnerware params **minus the `wall`/`footring` prefix**
(a vessel segment is a single surface). The option sets and constraints are the
same and should be exported from a shared module (see §3).

### Selection state

```js
// vesselV2Defaults.js → ui:
ui: {
  …,
  selectedSegmentId: null   // NEW — the upper-anchor id of the selected segment
}
```

Point selection (`selectedPointId`) and segment selection are independent and
mutually exclusive in the UI (selecting a segment clears the point selection and
vice-versa).

### Base segment is not motif-able

The `p0 → p1` run is the flat bottom (revolves to a disc, not a wall). Like the
dinnerware decision to leave plate/saucer *floors* smooth, the base segment is
excluded — it never gets a motif and the inspector shows it as "Base (flat)".

### Backward compatibility

`normalizePoints()` (`vesselV2State.js:105`) backfills `motif: { type: 'none', …defaults }`
on any point lacking it, so **existing saved V2 projects load unchanged and smooth**.
No `fileFormat.js` / `vesselV2Storage.js` changes — motifs live inside
`profile.points`, which is already serialized.

---

## 3. Engine: one small adapter, everything else reused

### New in `scripts/geometry/surfacePattern.js`

```js
// Normalize a per-segment motif object into the internal pattern shape.
// Mirrors getPatternParams() but reads flat keys instead of prefixed ones.
export function getMotifPattern(motif) {
  if (!motif || !motif.type || motif.type === 'none') return null;
  if (!motif.depth || motif.depth < 0.05) return null;
  return {
    type: motif.type,
    depth: motif.depth,
    relief: motif.relief === 'recessed' ? 'recessed' : 'raised',
    count: Math.max(1, Math.round(motif.count || 48)),
    pitch: Math.max(0.5, motif.pitch || 4),
    duty: Math.min(0.9, Math.max(0.1, (motif.lineWidth || 50) / 100)),
    profile: motif.profile || 'rounded',
    angleRad: (Math.min(75, Math.max(15, motif.angle || 45)) * Math.PI) / 180,
    dirSign: motif.direction === 'left' ? -1 : 1
  };
}
```

Reused **unchanged**: `computePatternRadialSegments()`, `createPatternedLatheGeometry()`,
`latheWithOptionalPattern()`, `resampleProfile()`, `ridgeWave()`, `patternAmplitude()`,
fade envelopes, seam-normal averaging. The height field and watertight guarantees
are identical to production dinnerware.

### Shared option/constraint module

Extract the enum option lists (`PATTERN_TYPE_OPTIONS`, `PATTERN_RELIEF_OPTIONS`,
`PATTERN_PROFILE_OPTIONS`, `PATTERN_DIRECTION_OPTIONS`) and the
`PATTERN_VISIBLE_SUFFIXES` visibility map out of `projectState.js` / `main.js`
into `scripts/geometry/surfacePatternOptions.js`, so both the dinnerware app and
V2 import one source of truth. (Dinnerware keeps working via re-export.)

---

## 4. Geometry Pipeline (V2)

### `scripts/vesselV2/geometry/profileSampler.js`

Tag every sampled outer point with the id of the segment that produced it. The
loop already runs `for (i = 1; i < points.length; i++)` per segment — set
`segmentId = points[i].id` on each sample it emits, and record boundary indices.

```js
// each sample gains: { r, h, section, isTransition, segmentId }
// plus return: segmentRuns = [{ id, startIndex, endIndex }, …]
```

### `scripts/vesselV2/geometry/vesselV2MeshGenerator.js`

Today the outer wall is one `LatheGeometry` of the whole profile. Change the
**outer** build only:

1. Collect active motifs: `motifs = points.map(p => getMotifPattern(p.motif))`.
2. If **all null** → keep today's single-lathe path (zero cost, zero risk for
   existing/smooth vessels).
3. Otherwise compute **one shared** radial resolution for the whole vessel:
   `radialSegments = computePatternRadialSegments(...motifs.filter(Boolean))`
   (so every ring aligns and the mesh welds watertight — same rule dinnerware
   relies on, `surfacePattern.js:70`).
4. Split the sampled outer profile into per-segment runs (from `segmentRuns`),
   and for each run:
   ```js
   const geo = latheWithOptionalPattern(runPtsVec2, radialSegments, motifOrNull, {
     fadeStart: isBottomOfWall ? FOOT_FADE : JUNCTION_FADE,
     fadeEnd:   isTopOfWall    ? RIM_FADE  : JUNCTION_FADE,
     maxRecessDepth: Math.max(0, wallThickness - 1.0)   // never gut the wall
   });
   ```
5. Merge all runs + base disc + **smooth inner wall** + rim cap. Inner surface
   stays smooth (contact/cleanability), matching the dinnerware decision.

Fades → 0 at every run boundary + shared `radialSegments` ⇒ adjacent runs share
identical boundary rings ⇒ the strict `stlCore.js` validator passes, unchanged.

`FOOT_FADE ≈ 1.0`, `JUNCTION_FADE ≈ 1.5`, `RIM_FADE ≈ 2.0` mm (reuse dinnerware
values).

---

## 5. UI Proposal — a *contextual* Segment Motif inspector

The core requirement: **the UI is driven by the selected segment.** V2's left
column is the profile workspace; the right column is the 3D viewport. Rather than
crowd the profile controls row, the motif UI is a **floating inspector card** that
appears when a segment is selected — a properties-inspector pattern.

### Selection interaction (profile editor)

- Reuse the existing `.profile-segment-hit` strips (`vessel-v2-generator.css:176`).
  In **Edit** tool, a plain click on a segment sets `ui.selectedSegmentId`
  (double-click keeps today's insert-point behavior).
- The selected segment's path is drawn in the accent color (add
  `.profile-path-segment.selected`).
- Each segment that has an active motif shows a small **family-colored badge**
  at its midpoint, so motif coverage is legible at a glance on the profile.

### The inspector (appears on selection)

```
╭─ ◆ Segment · Body ─────────────────  ✕ ╮
│  Motif      [ Vertical Lines ▾ ]         │   ← Smooth / Vertical / Horizontal /
│  ───────────── shown when ≠ Smooth ───── │     Diagonal / Cross-Hatch / Knurling
│  Depth      [──●─────] 0.4 mm            │
│  Relief     ( Raised | Recessed )        │   segmented control
│  Count      [────●───] 32                │   (Pitch mm for Horizontal)
│  Line Width [───●────] 50 %              │   (hidden for Knurl)
│  Ridge      [ Rounded ▾ ]                │   (hidden for Knurl)
│  Angle      [──●─────] 45°               │   (Diagonal / Cross-Hatch / Knurl)
│  Direction  ( Right | Left )             │   (Diagonal only)
│  ┌───────────────────────────────────┐  │
│  │  live unwrapped motif preview      │  │   ← canvas swatch of the height field
│  └───────────────────────────────────┘  │
│  ⚠ recessed leaves 1.6 mm wall           │   ← per-segment print warnings
│  [ Smooth ]  [ Copy to adjacent ]  [ All ]│
╰──────────────────────────────────────────╯
```

- **Conditional rows** reuse the exact `PATTERN_VISIBLE_SUFFIXES` map from
  dinnerware (`main.js`) — no new visibility logic.
- **Empty state:** when nothing is selected, a hint pill reads "Select a segment
  to add a surface motif." Selecting the base segment shows "Base (flat) — motifs
  not available here."
- **Actions:** *Smooth* resets the segment to `type:'none'`; *Copy to adjacent*
  copies this motif to the neighbor segments; *All* applies it to every wall
  segment.
- **Live preview:** a small canvas renders the unwrapped height field (same
  semantics as the engine) so the user reads the motif without waiting on a mesh
  rebuild.

No changes to the viewport itself — patterns are real geometry and show up in the
existing preview and cross-section automatically.

---

## 6. Print-Safety Warnings (per segment)

Extend `validateVesselV2Profile` (or a sibling `validateVesselV2Motifs`) with the
dinnerware checks, evaluated per segment against that segment's mean radius:

1. **Recessed wall thickness** — `wallThickness − depth < 1.2 mm` → warn; engine
   hard-clamps to `wallThickness − 1.0`.
2. **Minimum feature size** — ridge width `< 0.8 mm` (`2πr·duty/count`, or
   `pitch·duty`) → "lines may not resolve when printed."
3. **Raised horizontal overhang** — raised horizontal / shallow diagonal, `square`
   profile, depth `> 0.8 mm` → "ridge undersides exceed 45° overhang."
4. **Complexity note** — total triangles across all patterned segments `> ~1M`.

Surfaced in the existing `.profile-warnings` strip and inline in the inspector.

---

## 7. Performance

- Only patterned segments densify; smooth vessels take today's single-lathe path
  at zero added cost.
- One shared `radialSegments` for the whole vessel (driven by the densest motif),
  capped at 960 (`surfacePattern.js:24`).
- Reuse V2's existing debounced regeneration (`vesselV2Main.js` viewport update,
  ~40 ms). If needed, drop to half radial density during slider drag, snap to full
  on release (same mitigation noted for dinnerware).

---

## 8. Phasing

| Phase | Scope | Proves |
|---|---|---|
| **1. Model + selection** | `motif` on points, `selectedSegmentId`, segment click-select + highlight, normalization/backfill | Segments are selectable; state persists |
| **2. Engine + mesh** | `getMotifPattern` adapter, per-segment outer-wall build, shared radial res, fades, inner wall smooth | Displaced geometry → viewport → strict STL validation |
| **3. Inspector UI** | contextual card, motif dropdown, conditional controls, live preview, actions, badges | Full per-segment authoring |
| **4. Hardening** | per-segment warnings, perf tuning, test matrix (each motif × raised/recessed × bezier & straight-rounded segments × curved walls), slicer export QA | Ship |

---

## 9. Decisions Taken (flag if you disagree)

- **Motif stored on the upper anchor.** Deleting/merging a point drops its owned
  segment motif — acceptable and predictable. (Alternative: a separate
  `segmentMotifs` map keyed by anchor id — more plumbing, same failure mode.)
- **Outer surface only; inner wall smooth.** Contact/cleanability, matches
  dinnerware.
- **Base segment excluded.** Flat bottom is not a wall.
- **Density as integer ridge count** for circumferential motifs — guarantees a
  seamless wrap at θ = 2π (`surfacePattern.js:124`).
- **Contextual floating inspector** rather than a permanent panel — keeps the
  profile workspace uncluttered and makes "UI follows the selected segment"
  literal. (Alternative: a docked right-rail inspector; easy to switch.)
- **Shared option lists extracted** to `surfacePatternOptions.js` so dinnerware
  and V2 never drift.
