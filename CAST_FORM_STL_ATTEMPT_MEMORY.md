# Cast Form STL Issue Memory (Failed Attempts, Do-Not-Repeat)

Date: 2026-02-11
Scope: Cast-form STL output defect remains unresolved.
Decision: Treat all strategies below as failed for this issue and do not reuse them in the next solution attempt.

## Failed Attempt Set (Do Not Repeat)

1. Shared STL exporter refactor and validation gating
- Replaced per-app STL writers with shared `scripts/geometry/stlCore.js`.
- Routed cast-form export through shared binary writer + validation hooks (`scripts/castForm/geometry/castFormSTLExporter.js`).
- Added validation modes (`off`/`warn`/`strict`) and shared geometry checks.
- Result: Did not resolve the cast-form STL defect.

2. Mesh-quality diagnostics and gate tooling
- Added shared quality module (`scripts/geometry/meshQuality.js`) and diagnostics/benchmark scripts.
- Added checks for degenerates, boundary edges, over-connected edges, orientation conflicts, and coplanar overlap.
- Added release gate scripts and README quality budgets.
- Result: Tooling improved visibility but did not fix the underlying cast-form STL output issue.

3. Input preprocessing / manifold heuristics changes
- In cast-form input processing, merged vertices before validation.
- Replaced manifold edge counting with welded edge-valence statistics.
- Result: Validation behavior changed, but STL issue persisted.

4. Cast-form mold generation topology rewrite
- Added adaptive sampling presets (`preview-fast`, `preview-balanced`, `preview-high`, `export`).
- Added profile/bottom-grid caching and progress callbacks.
- Added cleanup pass to remove degenerate triangles and duplicate triangles, then weld vertices.
- Reworked base shell construction (ring layout, cap topology, center fan handling).
- Reworked wall shell generation:
  - seam/cut-plane clipping rewrites,
  - spare-rim radius blending,
  - shell inversion clamping near seams,
  - cap construction rewrites using quad helpers,
  - integrated natch-driven seam offsets.
- Result: Large geometry rewrite did not solve the reported STL output problem.

5. Worker offload and export regeneration flow changes
- Added `scripts/castForm/geometry/moldWorker.js` for worker-based generation.
- Added cancellation/restart job orchestration, progress UI, and export-quality regeneration before export.
- Result: Performance/UX path changed, but STL correctness issue remained.

## Evidence Captured During Review

- Local synthetic quality/performance gates pass, but this does not guarantee resolution of the real user-reported defect.
- Existing saved cast-form outputs in `saved-projects/` still fail strict topology checks:
  - `saved-projects/Untitled_Cast_Form_Shell_Foot.stl`: boundary edges = 128 (not watertight)
  - `saved-projects/Untitled_Cast_Form_Shell_Wall_1.stl`: orientation-conflict edges = 3072

## Hard Constraint For Next Conversation

Do not propose or implement another variant of the same families of fixes above (exporter refactor, more validation gates, more sampling/caching tweaks, more seam/cap rewiring in the current generator style, or worker/export orchestration changes). Use a fundamentally different strategy.
