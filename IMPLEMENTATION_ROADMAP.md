# Dinnerware Generator Implementation Roadmap

This roadmap converts architecture findings into executable PR slices. It is ordered to reduce risk while improving STL quality, printability, and web performance.

## Global Objectives

1. Export only print-safe geometry by default.
2. Keep interactive editing responsive on the web.
3. Unify duplicated geometry/export logic across apps.
4. Add measurable quality and performance budgets.

## Milestones

M1: Shared quality infrastructure and exporter unification.

M2: App-level topology fixes (dinnerware, handle, vessel).

M3: Cast Form performance and correctness overhaul.

M4: Cross-app geometry handoff and release hardening.

## PR Slice Plan

### PR-01: Shared Mesh Quality Core (No Behavior Change)

Scope:
- Add shared geometry diagnostics module.
- Add benchmark/diagnostic scripts to capture baseline metrics.

Planned files:
- `scripts/geometry/meshQuality.js` (new)
- `scripts/geometry/meshDiagnostics.js` (new)
- `package.json` (scripts)

Acceptance criteria:
- Can compute: triangle count, degenerate triangles, boundary edges, edge valence >2.
- Diagnostics runnable via npm script.
- No UI/export behavior changes yet.

Risk:
- Low.

---

### PR-02: Unify STL Exporters Behind One Core Writer

Scope:
- Add one shared binary STL writer and validation gate API.
- Refactor app-specific exporters to call shared writer.

Planned files:
- `scripts/geometry/stlCore.js` (new)
- `scripts/geometry/stlExporter.js`
- `scripts/vessel/geometry/vesselSTLExporter.js`
- `scripts/handle/geometry/handleSTLExporter.js`
- `scripts/castForm/geometry/castFormSTLExporter.js`

Acceptance criteria:
- All four apps export identical triangle/vertex content for unchanged meshes.
- One validation codepath used by all exporters.

Risk:
- Medium (touches all export paths).

---

### PR-03: Dinnerware Topology Closure and Seam Stitching

Scope:
- Remove centerline hacks that create open/non-manifold conditions.
- Stitch cap interfaces robustly while preserving intended sharp shading.

Planned files:
- `scripts/geometry/meshGenerator.js`
- `scripts/utils/validation.js`

Acceptance criteria:
- Default dinnerware items pass shared print-safe checks.
- No visible regressions in rim/footring silhouette.

Risk:
- Medium (geometry behavior changes).

---

### PR-04: Handle Mesh Closure + Degenerate Cleanup

Scope:
- Ensure cross-section sweep does not duplicate seam point unexpectedly.
- Add explicit start/end cap generation or explicit supported-open-mode.
- Reduce/resolve degenerate triangles at attachment transitions.

Planned files:
- `scripts/handle/geometry/handleMeshGenerator.js`
- `scripts/handle/geometry/handleCrossSectionBuilder.js`
- `scripts/handle/geometry/handleSTLExporter.js`

Acceptance criteria:
- Default handle passes print-safe checks (or open-mode explicitly declared and blocked for STL by default).
- Degenerate triangle count significantly reduced (target: 0 in closed mode).

Risk:
- Medium.

---

### PR-05: Vessel Geometry and Update Loop Stabilization

Scope:
- Improve inner-wall offset method for thickness fidelity.
- Stop creating disposable per-mesh materials in generator path.
- Reduce regen churn by filtering subscriptions and debouncing slider-driven updates.

Planned files:
- `scripts/vessel/geometry/profileGenerator.js`
- `scripts/vessel/geometry/vesselMeshGenerator.js`
- `scripts/vessel/vesselMain.js`
- `scripts/vessel/ui/parameterPanel.js`
- `scripts/vessel/ui/vesselViewport.js`

Acceptance criteria:
- Vessel regen frequency reduced during interaction.
- No material leaks from repeated updates.
- Default vessel export passes print-safe checks.

Risk:
- Medium-high (core vessel behavior path).

---

### PR-06: Cast Form Performance Phase 1 (Main Thread Optimization)

Scope:
- Introduce adaptive sampling presets (preview/export quality).
- Add caching for expensive sampling stages keyed by geometry + relevant params.
- Add stale-job cancellation to prevent applying outdated results.

Planned files:
- `scripts/castForm/geometry/moldGenerator.js`
- `scripts/castForm/castFormMain.js`
- `scripts/castForm/state/castFormState.js`
- `scripts/castForm/ui/parameterPanel.js`

Acceptance criteria:
- Preview interactions materially faster on same input.
- Regeneration ignores stale in-flight jobs.
- Export mode still available for max quality.

Risk:
- High (largest runtime hotspot).

---

### PR-07: Cast Form Worker Offload + BVH Acceleration

Scope:
- Move mold generation off main thread to Web Worker.
- Use BVH acceleration for ray intersections.
- Add progress reporting and cancel/restart behavior.

Planned files:
- `scripts/castForm/geometry/moldWorker.js` (new)
- `scripts/castForm/geometry/moldGenerator.js` (worker-compatible split)
- `scripts/castForm/castFormMain.js`
- `scripts/castForm/ui/castFormViewport.js`
- `package.json` (dependency, if needed)

Acceptance criteria:
- UI remains responsive during heavy cast-form generation.
- Worker cancellation works when sliders change rapidly.
- Generation time scales better with input complexity.

Risk:
- High.

---

### PR-08: Cast Form Geometry Correctness + Registration Keys Completion

Scope:
- Integrate natch geometry into produced wall shells.
- Fix incomplete multi-geometry merge behavior (`groupToGeometry`).
- Eliminate known degenerate regions in base shell center/caps.

Planned files:
- `scripts/castForm/geometry/moldGenerator.js`
- `scripts/castForm/ui/castFormViewport.js`
- `scripts/castForm/castFormMain.js`

Acceptance criteria:
- Natch controls impact actual output geometry.
- Generated parts pass shared print-safe checks.
- Foot/wall shell degenerates reduced to acceptable threshold (target 0).

Risk:
- High.

---

### PR-09: Cross-App Geometry Handoff (Vessel/Dinnerware -> Cast Form)

Scope:
- Wire platform import path so cast form can consume in-memory geometry from other apps.
- Preserve orientation/units and avoid redundant file round-trip.

Planned files:
- `scripts/castForm/geometry/inputProcessor.js`
- `scripts/castForm/castFormMain.js`
- `scripts/dashboard/dashboard.js`
- `scripts/dashboard/projectStorage.js`
- App launch links/pages as needed

Acceptance criteria:
- One-click flow from source project to cast-form input.
- Imported geometry matches source scale/orientation.

Risk:
- Medium.

---

### PR-10: Benchmarks, Budgets, and Release Gating

Scope:
- Add automated quality/perf checks for representative fixtures.
- Document budgets and fail build on regressions.

Planned files:
- `scripts/benchmarks/*.mjs` (new)
- `package.json` (scripts)
- CI workflow file(s) if repository uses CI
- `README.md` (quality/perf section)

Acceptance criteria:
- Reproducible benchmark command.
- Defined pass/fail thresholds for:
  - topology quality metrics
  - cast-form generation latency tiers
  - export validation status

Risk:
- Low-medium.

## Execution Order

1. PR-01
2. PR-02
3. PR-03 and PR-04 in parallel
4. PR-05
5. PR-06
6. PR-07
7. PR-08
8. PR-09
9. PR-10

## Recommended Working Rules

1. Ship each PR with before/after metrics.
2. Keep behavior-changing geometry PRs isolated by app.
3. Do not combine Cast Form perf and correctness into a single large PR.
4. Gate STL export on shared quality checks once PR-02 is complete.
