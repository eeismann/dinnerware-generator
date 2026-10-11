# Vessel V3 — Spout, Handle, Lid — Plan

> Status: DRAFT, executing now. New app, forked from Vessel V2, not a modification of it.
> V2 stays untouched at `vessel-v2-generator/` + `scripts/vesselV2/`.

## 1. Scope decision (made, not asked — matches existing project philosophy)

Three new capabilities: **spout**, **handle**, **lid**. They are architecturally very
different in cost:

- **Spout** — a local deformation of the vessel wall (pulled/pinched lip), same family
  of technique as the V2 motif system (fade-to-zero graft onto the existing lathe
  profile). Cheap, belongs **inside** V3's own mesh generator.
- **Lid** — an independent revolved body sized off the vessel's own rim/neck radius,
  exported as a second STL part. Same shape of problem Cast Form already solves
  (multi-part export, one part derived from another's geometry). Belongs **inside**
  V3, as a second lathe + second export.
- **Handle** — CLAUDE.md's stated philosophy is "modular: each generator is
  independent but shares common utilities," and the Handle Generator **already**
  exists for exactly this: attach a handle to an arbitrary vessel wall, given only
  wall radius/thickness at an attach band, imported from another app's saved project
  (today: Dinnerware mugs, via `scripts/handle/ui/mugImporter.js`). Reimplementing
  handle grafting a second time inside V3 would duplicate
  `scripts/handle/geometry/*` (cross-section, path, sweep, attachment blend) for no
  benefit. **Decision: extend the existing Handle Generator to also import Vessel V2/V3
  projects**, instead of building handle geometry inside V3.

So "V3 adds spout, handle, lid" = V3 owns spout + lid natively, and gains handle
support by being a valid import source for the existing Handle Generator app.

## 2. New app scaffold

- `vessel-v3-generator/index.html` — forked from `vessel-v2-generator/index.html`.
- `scripts/vesselV3/` — forked from `scripts/vesselV2/` (state, geometry, ui,
  `vesselV3Main.js`, `vesselV3Storage.js`). Reuses `scripts/vessel/ui/vesselViewport.js`
  and `scripts/vessel/geometry/vesselSTLExporter.js` the same way V2 does (no fork of
  those — they're already shared).
- `styles/vessel-v3-generator.css` — forked from `vessel-v2-generator.css`, same
  design tokens/theme system, own accent if the studio-shell adapter is extended later
  (out of scope for v1 — classic UI only, matching how V2 shipped before its studio
  adapter existed).
- Dashboard (`scripts/dashboard/dashboard.js`, `appIcons.js`): register `appType ===
  'vessel-v3'` alongside the existing `'vessel-v2'` branches (storage key, icon,
  open/rename/duplicate routing, `resolveAppUrl('vessel-v3-generator/index.html')`).
- Storage: new localStorage key `playground_ceramics_vessel_v3_projects` (namespaced
  like every other app — no shared key with V2).
- `CLAUDE.MD` gets a new "Vessel Designer V3" section once shipped.

## 3. Data model additions (`scripts/vesselV3/state/vesselV3Defaults.js`)

Everything from V2 (points, per-segment motifs) carries over unchanged. New top-level
state:

```js
spout: {
  enabled: false,
  segmentId: null,       // which profile segment/point the spout is pulled from
  angle: 0,              // ° around circumference, spout center
  width: 30,             // ° angular width of the pulled lip
  length: 18,            // mm, how far the spout projects outward
  drop: 6,                // mm, tip droop below the rim
  wallThickness: 2.2,     // mm at the spout tip (validated against min print wall)
},
lid: {
  enabled: false,
  fit: 'inset',           // inset (drops inside neck) | overcap (caps over rim)
  domeHeight: 20,
  wallThickness: 2.4,
  clearance: 0.4,         // mm radial gap, FDM tolerance (no shrinkage — same material system)
  knob: { style: 'ball', height: 10, width: 12 },
  flangeDepth: 8,         // for inset: how far the skirt drops into the neck
},
```

No `handle` block in V3 state — handle data lives entirely in the Handle Generator's
own project, same as it does today for mugs.

## 4. Geometry pipeline

### Spout (`scripts/vesselV3/geometry/spoutGraft.js`, new)
Reuse the fade-envelope technique from `surfacePattern.js` / the V2 motif adapter:
displace a band of the rim outward + down within `[angle - width/2, angle + width/2]`,
fading displacement to zero at the band edges so the graft welds to the existing rim
ring with no new seams. This is the same mathematical shape as a motif, just non-periodic
and asymmetric (one lip instead of N repeating ridges) — expect to share
`resamplingProfile`/fade helpers from `scripts/geometry/surfacePattern.js`, not
duplicate them.

### Lid (`scripts/vesselV3/geometry/lidGenerator.js`, new)
1. At export/preview time, read the vessel's own rim/neck radius + wall thickness from
   the compiled profile (same sampled-profile data V2 already produces).
2. Build a lid profile: flat/domed top → skirt (inset flange or overcap band) sized to
   `neckRadius ± clearance`.
3. Revolve with the existing shared lathe builder (`vesselMeshGenerator`/V2's lathe
   path) — no new revolution code, just a new profile fed into it.
4. Independent mesh, independent manifold check, independent STL export — mirrors how
   Cast Form already emits N independent parts from
   `scripts/castForm/geometry/castFormSTLExporter.js`.

### Handle (no V3 geometry work)
Extend `scripts/handle/ui/mugImporter.js` (rename conceptually to a generic vessel
importer, keep the mug path working):
- Add `getVesselV2Projects()` / `getVesselV3Projects()` reading their own storage keys.
- Add `extractVesselDimensions(project)` pulling wall radius + thickness at whatever
  height the user designates as the attach band (V2/V3 profile is a point list, not a
  fixed mug shape — need a simple "pick attach height" control reusing the existing
  handle attach-height UI, just fed a vessel radius-at-height function instead of a
  fixed mug radius).
- Handle Generator's source picker (`showMugImportModal`) gains a source-type toggle:
  Dinnerware Mug / Vessel V2 / Vessel V3.
- No changes to `scripts/handle/geometry/*` — attachment blend math is already generic
  over "radius + wall thickness at a height."

## 5. UI additions (`scripts/vesselV3/ui/`)

- `spoutInspector.js` — contextual card, same interaction pattern as V2's
  `motifInspector.js`: appears when spout is enabled, sliders for angle/width/length/
  drop/wall, live warning line for min wall thickness at the tip.
- `lidInspector.js` — panel for fit style, dome height, knob, clearance; toggle to
  preview the lid seated on the vessel in the viewport (ghost/transparent material)
  vs. viewing it standalone for export.
- Viewport: extend `VesselViewport` (or a thin V3-only wrapper) with a lid
  show/hide toggle and ghost-preview mode — additive API, same shape as how Cast Form
  added `setPartVisible()` for the studio shell without touching its core.
- Export panel: "Export Vessel STL" (body incl. spout) + "Export Lid STL" as two
  buttons, mirroring Cast Form's per-part export buttons.
- Visual language: reuse V2's classic CSS almost verbatim (same panel/card/slider
  components) so V3 doesn't invent new UI idioms — a new user moving V2→V3 should
  recognize every control.

## 6. Validation/warnings (`scripts/vesselV3/geometry/vesselV3Validation.js`, new — extends V2's `validateVesselV2Profile`)

- Spout tip wall thickness < 1.2mm → warn (same threshold as vessel wall warnings).
- Spout width/angle overlapping itself (width > 300°) → clamp + warn.
- Lid clearance < 0.2mm → "may not fit without sanding" warning (FDM tolerance, not
  shrinkage — no kiln step in this app, unlike Cast Form).
- Lid dome height causing overhang > 45° with `square`-equivalent profile → reuse the
  existing overhang-warning convention.

## 7. Phasing

| Phase | Scope | Proves |
|---|---|---|
| 0 | Scaffold `vessel-v3-generator/` + `scripts/vesselV3/` as an exact fork of V2, dashboard registration, own storage key | V3 builds, runs, and is pixel-identical to V2 as a regression baseline |
| 1 | State + UI shells for spout/lid (toggles, sliders, no geometry yet — placeholders) | Panels wired, state persists, no visual change to mesh yet |
| 2 | Spout geometry (`spoutGraft.js`) wired into V3's mesh generator | Spout visible in viewport, watertight STL export |
| 3 | Lid geometry (`lidGenerator.js`) + second STL export button | Lid previews seated on vessel, exports as separate manifold STL |
| 4 | Handle Generator import extension (Vessel V2/V3 as a source) | Handle Generator can attach a handle to a V3-designed vessel end to end |
| 5 | Validation/warnings pass, `CLAUDE.MD` update | Warnings appear at the right thresholds |
| 6 | Verification loop — agents check build health + wiring, and review UI usability/style consistency against the rest of the platform; fix and re-check until clean | Ships |

## 8. Verification approach (phase 6, ongoing)

- Build/regression agent: `npm run build`, load V3 in a headless browser (existing
  Playwright pattern from the Studio Shell work — software WebGL flags), exercise
  spout + lid controls, confirm STL exports are non-empty and manifold, confirm V2 is
  untouched (`git diff` scoped to `scripts/vesselV2/`, `vessel-v2-generator/` must be
  empty).
- UI/design review agent: compare V3's new spout/lid panels against V2's existing
  motif inspector and the platform's general visual language (per CLAUDE.md
  conventions + existing CSS), flag anything that reads as foreign or inconsistent.
- Loop: fix findings, re-run both agents, repeat until both come back clean.
