# Cast Form: Patterned-Vessel Molds — Performance + Fidelity Plan

> **Status: IMPLEMENTED (2026-07-09).** All four phases shipped. Measured results:
> Pattern_mug.stl preview ~4min → 0.9s; export 1.7s. Tier 2 mold carries 16/16 ridges
> at 96% relief; Tier 1 (analytic) carries 48/48 knurl ridges at 97% relief,
> phase-locked to the vessel within 0.06mm. Regression gate:
> `node scripts/benchmarks/castFormPatternMoldGate.mjs` (22 checks).
> Tier 1 entry point: dashboard "Open in Cast Form" → cast form URL
> `?sourceApp=dinnerware&sourceProject=<id>&sourceItem=<item>` (flow completed in
> `castFormMain.loadFromDinnerwareProject` + `geometry/dinnerwareImport.js`).
>
> **Footring follow-up (2026-07-09):** the footring motif is formed by the wall
> molds' lower band (the foot mold is only the recess plug). Detector probe rings
> were added at 3/5/8% of vessel height so footring-band patterns on external STLs
> are detected (previously only the wall band was probed), the detector keeps the
> *finest* confirmed frequency rather than the strongest, and the analytic-tier
> grid stays an exact wall-count multiple while also covering a finer footring
> count. Gate extended to 31 checks incl. footring + mixed wall/footring cases.

One combined solution for two coupled problems observed with `test-files/Pattern_mug.stl`
(484,848 triangles, 24MB — a knurled mug exported from the Dinnerware Designer):

1. **Performance**: mold generation takes minutes instead of seconds.
2. **Fidelity**: even when it finishes, the mold cavity aliases/smears the motif.

They must ship together: fixing fidelity means *raising* sampling density, which is
unaffordable until raycasting is fixed — and fixing performance without fidelity produces
fast molds of a blurry pattern.

---

## 1. Measured Diagnosis

### Performance: brute-force raycasting, O(triangles) per ray

The mold pipeline's only view of the vessel is a polar radius grid built by raycasting
(`moldGenerator.js:465` `sampleVesselProfile`, plus three vertical-ray passes for the
bottom grid). `THREE.Raycaster.intersectObject()` has no spatial index — every ray tests
every triangle.

Measured (Node, same machine):

| Input | Triangles | ms/ray | Preview (~20.5k rays) | Export (~69.6k rays) |
|---|---|---|---|---|
| Angle_mug.stl | 1,152 | 0.06 | ~1.1 s | ~3.9 s |
| Pattern_mug.stl | 484,848 | 11.8 | **~4 min** | **~14 min** |

### Fidelity: three independent ceilings

1. **Anti-adaptive preset selection.** `selectSamplingPreset` (`moldGenerator.js:52`)
   *downgrades* sampling as triangle count rises: >7,000 triangles → `previewFast`
   (96×96). It's a perf guard for the brute-force raycaster — so the patterned mug gets
   the *coarsest* grid exactly when it needs the finest. 96 angular samples across a
   48-ridge knurl = 2 samples/ridge = Nyquist limit; the pattern aliases into noise.
2. **Grid-then-smooth pipeline eats relief.** The bottom grid applies median despiking +
   feature-aware smoothing (`removeSpikesByMedian`, `smoothHeightGridFeatureAware`,
   `moldGenerator.js:797-804`). A 0.3–0.4 mm footring pattern *is* high-frequency
   "spike" signal — the cleanup passes flatten precisely what we want to keep.
3. **Reconstruction band-limits.** Wall shells sample the grid with bilinear
   interpolation (`sampleProfileRadius`) at the same `angleSteps` resolution — the mold
   mesh can't carry more pattern than the grid holds, and interpolation rounds off
   whatever survives.

### Two facts that shape the solution

- Raycasting runs **inside the worker** (`moldWorker.js` constructs `MoldGenerator`),
  and the worker is **terminated after every job** — any acceleration structure must be
  built per job in the worker, so its build time matters.
- The pattern in these meshes is not arbitrary: for vessels from our own generators, we
  *know* the exact pattern function — `scripts/geometry/surfacePattern.js` generated it.

---

## 2. Solution Overview — three tiers, one pipeline

```
                      ┌──────────────────────────────────────────────┐
 Import               │ Tier 1 — EXACT (internal handoff w/ metadata)│
 ──────────►          │ Evaluate patternAmplitude() analytically on  │
 pattern params known │ the mold cavity surface. No sampling ceiling.│
                      └──────────────────────────────────────────────┘
                      ┌──────────────────────────────────────────────┐
 External STL/OBJ     │ Tier 2 — MEASURED (frequency detection)      │
 ──────────►          │ BVH raycasting + detect dominant angular &   │
 pattern unknown      │ vertical frequency → Nyquist-scaled grid.    │
                      └──────────────────────────────────────────────┘
                      ┌──────────────────────────────────────────────┐
 Smooth vessel        │ Tier 3 — FLOOR (today's presets)             │
 ──────────►          │ Current preset grid, now BVH-fast.           │
                      └──────────────────────────────────────────────┘
```

All tiers share the BVH acceleration (Phase A). Tier detection is automatic; the UI
shows which tier is active via the existing sampling-info readout.

---

## 3. Phase A — BVH Raycast Acceleration (the enabler)

**Add `three-mesh-bvh`** (the standard three.js BVH library, zero transitive deps).

- In `MoldGenerator`, before any sampling pass: build `geometry.boundsTree = new MeshBVH(geometry)`
  once per input geometry (cache alongside the existing `profileCache`), and patch
  `THREE.Mesh.raycast` via the library's `acceleratedRaycast` inside the worker module.
- Set `raycaster.firstHitOnly = true` in `sampleVesselProfile` — the code only reads
  `intersections[0]`, so this is free and skips full-hit sorting.
  ⚠️ The bottom-grid passes inspect deeper hits — audit each raycast site individually;
  only enable `firstHitOnly` where `[0]` is provably the only hit used.
- Expected: ~0.01–0.05 ms/ray on 485k triangles (vs 11.8), + ~0.3–0.8 s one-time BVH
  build per job. Preview drops from ~4 min to **~1–2 s**.
- Worker lifecycle: keep per-job build for v1 (simple, still a 100× win). Optional
  follow-up: reuse a warm worker between parameter tweaks so the BVH survives jobs.

**Remove the anti-adaptive guard.** With BVH, `selectSamplingPreset`'s triangle-count
downgrade is obsolete — delete it. Presets become quality floors; Phase B raises them
when the content demands it.

## 4. Phase B — Tier 2: Measured Fidelity for External Meshes

**Frequency detection (cheap with BVH):**

1. Cast 2–3 dense rings of rays (1,024 angular samples each) at heights sampled inside
   the wall band, and 2–3 dense vertical columns across the height. Cost: ~5k rays ≈
   tens of ms post-BVH.
2. On each radius signal, measure the dominant frequency (zero-crossing count of the
   mean-removed signal is sufficient and dependency-free; no FFT needed) and the
   peak-to-peak amplitude.
3. If amplitude > ~0.15 mm (above scanner/tessellation noise), classify as patterned:
   - `angleSamples = clamp(nextMultipleOf8(detectedRidges × 8), presetFloor, 1024)`
   - `heightSamples = clamp(height / (verticalPeriod / 8), presetFloor, 768)`
   - 8 samples/period ≈ faithful ridge shape, not just presence (48-ridge knurl → 384).

**Cache correctness:** `profileCache`/`bottomGridCache`/`resultCache` keys must include
the *computed* grid density, not just the preset key.

**Budget guard:** cap total grid at ~1,024 × 768. At BVH speeds that's ≤ ~30 s export /
~8 s preview worst case; preview may halve the detected density (pattern visibly present
but soft) with full density on export — surfaced in the sampling-info UI.

**Smoothing must not eat the pattern:** make the bottom-grid cleanup pattern-aware.
- Despike threshold: only reject deviations > max(current threshold, 3 × detected
  pattern amplitude) so coherent ridges are kept and genuine spikes still die.
- Skip `smoothHeightGridFeatureAware` entirely when the patterned classification is
  active for the foot region (the detected-frequency signal *is* the feature).

## 5. Phase C — Tier 1: Exact Analytic Patterns for Internal Handoffs

For vessels coming from Dinnerware Designer / Vessel Generator, skip the
sample-and-reconstruct loop for the pattern itself:

1. **Metadata handoff.** When exporting to Cast Form (`importFromPlatform` path and the
   project-storage handoff), attach the resolved pattern params (`wallPattern*`,
   `footringPattern*`, plus item dimensions) alongside the mesh. Plumb through
   `castFormMain.js → worker postMessage → MoldGenerator.generate(…, options.patternMeta)`.
2. **Split the surface into carrier + relief.** Sample the profile grid from the
   *smooth* carrier at today's cheap preset density (the smooth shape needs no dense
   grid). Regenerating the smooth carrier mesh from handoff params is preferable;
   raycasting the patterned mesh coarsely and low-pass filtering is the fallback.
3. **Evaluate relief analytically on the cavity.** In the wall/foot shell builders,
   where `sampleProfileRadius` returns the cavity radius, subtract
   `patternAmplitude(theta, t, meanRadius, params) × depth × fadeEnvelope` — importing
   the *same* `surfacePattern.js` module the Dinnerware Designer used. The mold carries
   the motif at whatever tessellation the mold mesh has, with zero aliasing and zero
   extra raycasts. Shrinkage scaling applies to the carrier; pattern depth is scaled by
   the same factor.
4. **Mirror-image correctness:** the mold is the negative — raised vessel ridges become
   recessed mold grooves automatically via the radial subtraction; no special casing.
5. Mold mesh tessellation in the patterned band follows the same Nyquist rule as Tier 2
   (`ridges × 8` angular vertices), reusing the quantize-to-8 convention from
   `surfacePattern.js` so seams stay welded.

Tier 1 makes preview of a knurled mug mold roughly as fast as a smooth mug mold —
the dense work moves from 100k raycasts to a closed-form function evaluated at mesh
vertices.

## 6. Files Touched

| File | Change |
|---|---|
| `package.json` | add `three-mesh-bvh` |
| `scripts/castForm/geometry/moldGenerator.js` | BVH build+cache, `firstHitOnly` audit, delete triangle-count downgrade, frequency detector, density-aware cache keys, pattern-aware despike/smoothing, analytic relief in shell builders |
| `scripts/castForm/geometry/moldWorker.js` | accept `patternMeta`, BVH raycast patch applied in worker scope |
| `scripts/castForm/castFormMain.js` | pass `patternMeta` through worker message; sampling-info UI shows tier |
| `scripts/castForm/geometry/inputProcessor.js` | platform-import path carries pattern metadata |
| `scripts/geometry/surfacePattern.js` | export `patternAmplitude`/fade for reuse (already module-scoped — make public) |
| Dinnerware/vessel handoff sites | attach pattern params to the export-to-cast-form payload |
| `scripts/benchmarks/` | new `castFormPatternMoldGate.mjs` |

## 7. Verification Gates (all in `castFormPatternMoldGate.mjs`)

1. **Perf floor:** Pattern_mug.stl preview mold < 5 s, export < 30 s (Node, same
   machine class as the measured baseline).
2. **No regression:** Angle_mug.stl preview within 1.5× of current timing.
3. **Fidelity (Tier 2):** sample the generated mold cavity along a ring; assert the
   detected ridge count matches the vessel's (48) and peak-to-peak relief ≥ 70% of the
   vessel's pattern depth.
4. **Fidelity (Tier 1):** same assertion with metadata supplied; relief ≥ 95% of exact.
5. **Manifold:** all mold parts still pass the existing strict STL validation.
6. **Visual:** Playwright screenshots of the mold preview for knurl + vertical, eyeball
   pass on ridge crispness in the cavity.

## 8. Phasing & Effort

| Phase | Scope | Effort (CC) | Unblocks |
|---|---|---|---|
| **A** | BVH + firstHitOnly audit + remove downgrade | ~30 min | usable perf today, at today's fidelity |
| **B** | frequency detection + density scaling + smoothing guards + cache keys | ~1–2 h | faithful molds from any STL |
| **C** | metadata handoff + analytic relief | ~2–3 h | exact molds for our own generators |
| **D** | gate + visual QA | ~1 h | regression safety |

A→B→D ships a complete external-file solution; C layers exactness on top for the
in-platform workflow. Recommend executing all four — C is where slip-cast molds of our
own patterned designs become genuinely production-grade.

## 9. Explicit Non-Goals

- No mesh decimation of patterned imports (defeats the purpose of a patterned mold).
- No boolean/CSG mold construction (out of scope; current profile-grid architecture is
  kept).
- Handle molds and case boxes unchanged (no raycast hot loops against imported meshes —
  confirmed by grep).
