# Stacked Cylinder Mold Generator: Analysis and Implementation Plan

Status: **built** (2026-10-13) as `stacked-mold-generator/` (`scripts/stackedMold/`) on the
`dialkit-dinnerware` branch. All design decisions below were confirmed by the user while iterating on
the concept schematics. Don't re-open them without asking. See §10 for what the build added or changed.

## Files in this folder / related

| File | What it is |
|---|---|
| `stacked-cylinder-mold/PLAN.md` | this plan |
| `stacked-cylinder-mold/concept.html` | concept page: rules, key/pour diagrams, well detail, six sliced forms. The slicing algorithm in its inline `<script>` (`analyze()`) is the **reference prototype**: port it, don't reinvent it. Open via the dev server: `http://localhost:<port>/stacked-cylinder-mold/concept.html` |
| `scripts/concepts/stackedMoldAnatomy.js` | Three.js anatomy viewer (exploded / quarter-cut / top / side views per unit type). Its part builders (`bedPlate`, `sleeveHalf`, `keyLid`, `plasterPiece`, `ringUnit`, `splitUnit`, `wellUnit`, `footerUnit`) are the **reference for printable part geometry**. They are visual only (no CSG, pockets faked with layered plates) |

---

## 1. What the user wants

A new generator, separate from the existing Cast Form Generator, for **slip-casting molds made by pouring
plaster directly into 3D-printed PLA casting units**:

- PLA units are **case molds**. Plaster is poured into them, and each unit yields one plaster piece. The plaster
  pieces stack into the working slip-casting mold. PLA itself never touches slip.
- The assembled mold is **one uniform cylinder**: every plaster piece is a slice of the same cylinder, with flat
  horizontal parting faces.
- Stack order: a **footer** at the bottom, **section units** keyed down into the one below, and a **well collar**
  on top for pouring.
- **Overhangs drive the unit computation**: print overhangs, plaster-from-PLA release and ware-from-plaster
  release.

## 2. Confirmed design decisions

1. **Cylindrical outer shape.** Ø = `ceil10(2·r_max + 2·plasterMin)`, where r_max includes the well bore radius.
2. **Keys:** three 90° cones (Ø12 × 5 mm) at 120° on the annular parting face, at radius `R − 13`.
   - **No D-shaped or polarising key** (the user rejected it). For a patterned (non-round) form, use 110°/120°/130°
     spacing instead.
   - Key angles must avoid the split divider plane: in 3D with the divider at x = 0, use 0°/120°/240°
     (measured from +x).
   - Each socket is 0.3 mm wider and 1 mm deeper than its cone.
3. **Key gender rule (fixed, never user-chosen):** every piece has **male cones on its bottom face** and
   **sockets on its top face**.
   - The footer's bottom face is a flat bench face. The well collar's top face is the open pour face.
   - So every middle piece carries both genders.
   - Split halves also key to each other across the divider: half A sockets, half B male.
4. **PLA forms the inverse.** A PLA bump makes a plaster socket; a PLA pocket makes a plaster male cone. Each unit
   has a **bed plate** (it stands on this) and usually a **key lid**:
   - The plate that forms the plaster's bottom face gets pockets; the plate that forms its top face gets bumps.
   - An inverted unit swaps which plate is which.
5. **Pour open, then press on the lid.** Fill to about 2 mm above the sleeve rim, then press the key lid down.
   - Lid has Ø3 **bleed holes**: one at the tip of every lid pocket (otherwise the pocket traps air) plus two
     between the keys.
   - **No pour/vent ports.** The user found those confusing, and pouring through a small port is impractical.
6. **Well collar:**
   - **Vertical walls** (plain cylindrical bore).
   - Bore radius = `ceil(r_lip + 6.35 mm)`, giving a **≥ ¼″ flat horizontal ledge** for the slip to pool on.
   - The ledge is the **top face of the piece below** the collar, not part of the collar.
   - No funnel spare. The clay flange is cut at the lip line before lifting the collar.
   - Poured upright with no lid (open top screeded flat).
   - Core is a thin **slit tube** whose edges meet (taped inside, no wedge), so the zero-draft bore releases.
7. **Reusable sleeve:** the outer PLA wall is two half-tubes with bolt ears on the seams. They drop inside a
   locating rim on the bed plate. One diameter serves every unit of a mold; print at standard heights.
8. **Footer:**
   - Poured inverted: the bed plate forms its top (parting) face with bumps (→ sockets).
   - The open side is screeded flat into the bench face. No lid.
   - The core is a stub shaped like the vessel's base below the foot seam.

## 3. Core algorithm: monotonic band slicing

Port `analyze()` from `concept.html`. Summary:

1. **Profile:** outer profile r(z) of the vessel at mold size, i.e. scaled by `1/(1 − shrinkage)`.
2. **Foot seam** f = 6 mm, but only if r is non-decreasing on [0, f]; otherwise f = 0 (pedestal foot).
3. **Cuts:** at every turning point of r(z) (belly = local max, waist/neck = local min), ignoring cuts within
   5 mm of f or H. Each band between cuts is **monotonic**.
4. **Why monotonic bands work.** One rule settles all three overhang questions:
   - **Print:** each ring unit is printed and poured with its band's **wide end on the bed**. The core then narrows
     upward and needs no supports.
   - **Plaster from PLA:** set plaster can only slide toward the core's narrow end, which is straight up.
   - So `dec` bands (r shrinks upward) pour **upright** and `inc` bands pour **inverted**.
5. **Ware release decides ring vs split:**
   - `inc` band → a ring that slides **down**, if `r(a) ≥ max r on [0, a]`.
   - `dec` band → a ring that lifts **up**, if `r(b) ≥ max r on [b, H]`.
   - No draft → split. A band counts as having no draft if it is flat (|Δr| ≤ 0.3) or has a run longer than
     12 mm with |slope| < tan 1°.
   - Anything else → **split** (two halves divided through the axis), which always releases a surface of
     revolution.
6. **Merge neighbouring split bands.** Split halves print lying on the divider, so monotonicity no longer matters.
7. **Height limits:** ring ≤ 90 mm and split ≤ 180 mm. Longer bands are subdivided evenly.
8. **Units:** footer `[−footerT, f]` + bands + well collar `[H, H + wellH]`.
9. **Demold order** (always valid; geometry makes conflicts impossible):
   1. Cut the clay flange and lift the well collar.
   2. Lift the ↑ rings from the top down.
   3. Open the splits sideways.
   4. Invert, lift the footer off.
   5. Slide the ↓ rings off.

Default parameters (from the prototype):

```
plasterMin 25, footerT 30, footSeam 6, maxRingH 90, maxSplitH 180, wellH 30,
ledgeMin 6.35, minDraftDeg 1, maxFlatRun 12, keyInset 13, bed 256 (printer bed, mm)
```

Expected results on the six concept forms (use these as regression fixtures; the profiles are in `FORMS` in
`concept.html`):

| Form | Units | Cylinder Ø |
|---|---|---|
| tapered tumbler | footer + 2 rings (height cut) + well | 150 |
| open bowl | footer + ring + well | 230 |
| belly jar | footer + ring↓ + 2 rings↑ + well | 190 |
| bottle with flared lip | footer + ring↓ + split (60–172) + well | 180 |
| hourglass vase | footer + ring↓ + split (48–150) + well | 180 |
| straight cylinder | footer + split (no draft) + well | 150 |

All six forms have a 7.0 mm ledge.

## 4. Printable parts per unit (what gets exported as STL)

Use `stackedMoldAnatomy.js` for layout and dimensions, but build **real watertight solids**: real conical pockets,
real holes. Reuse the repo's manifold/CSG approach (see how `scripts/castForm/geometry/caseBoxGenerator.js` builds
watertight solids without general CSG).

| Unit | Parts |
|---|---|
| Ring (upright/inverted) | bed plate **with the core fused on** (one print), key lid (skirt, bumps or pockets, bleed holes) |
| Split | bed half-plate, insert A (divider + half-core + 4 divider bumps + flange bolt holes), insert B (same with pockets), half key lid. Inserts print lying on the divider face |
| Well collar | bed plate (pockets), slit tube taped shut inside. No lid |
| Footer | bed plate (bumps) with base stub fused on. No lid |
| Shared | sleeve half-tubes, generated per distinct unit height (or at standard heights), with seam ears + bolt holes and a 45° chevron rib for the strap groove; half-sleeve for split units |

Geometry rules:
- Bed plate: radius `R + wall + 7`, 5 mm thick, with a locating rim 3 mm tall at `R + wall + 0.4 … +2.6`.
- Lid skirt hangs 5 mm outside the sleeve.
- All print overhangs ≤ 45°. Cone flanks are 45°, and the chevron rib is a 45° triangle.

## 5. Warnings / validation

- Sockets too close to the well bore: `(R − keyInset − 6) − rw < 3 mm`.
- Cylinder Ø larger than the printer bed (bed plate and lid must fit), and split-insert length larger than the bed.
- A band with a long no-draft run: suggest a 1.5° taper or accept a split.
- Surfaces steeper than 70° from vertical: layer-line terracing on the core, so recommend 0.12 mm layers.
- Heat while setting: plaster reaches about 45 °C and PLA softens around 60 °C. Warn on very thick pieces (footer,
  wide bowls). Recommend ≥ 4 perimeters, or PETG.
- Plaster volume per piece (L), shown per unit. The prototype computes `π R² h − cavity`.

## 6. App architecture (follow repo conventions; see `CLAUDE.md`)

- New app folder: `stacked-mold-generator/index.html`. Add it to `rollupOptions.input` in `vite.config.js` and to
  the dashboard.
- Scripts: `scripts/stackedMold/`:
  - `state/stackedMoldDefaults.js` and `state/stackedMoldState.js`: central state, validation, autosave, JSON
    import/export.
  - `geometry/bandSlicer.js`: pure function `profile → units`. Port of `analyze()`, no Three.js, Node-testable.
  - `geometry/castingUnitParts.js`: units → printable solids.
  - `geometry/stackedMoldExporter.js`: one STL per print part plus a ZIP, file names like `<name>_U3_ring_bedplate.stl`.
  - `ui/`: viewport with stack and per-unit views. Reuse the anatomy viewer's exploded / quarter-cut / top / side
    views.
  - `stackedMoldMain.js`: entry.
- UI on the **DialKit** host (`scripts/ui/dialkit/dialHost.js`), with a new `scripts/ui/dialkit/stackedMoldDials.js`,
  shared chrome (`dkChrome.js`) and the view dock (`viewDock.js`). Load the dials module on demand if Node imports
  the main module.
- **Source flow** like Cast Form / Handle: a `.dk-start-card` until a source is chosen, and a `.dk-source-card` with
  Choose…/Change….
  - Sources: Dinnerware items (`scripts/castForm/geometry/dinnerwareImport.js`), Vessel V2/V3 projects (see how
    `scripts/handle/ui/mugImporter.js` reads `playground_ceramics_vessel_v3_projects` etc.) and external STL/OBJ
    (`scripts/castForm/geometry/inputProcessor.js`).
  - The slicer needs an **outer r(z) profile**. Extract it analytically from generator state where possible, or
    sample a revolved mesh radially.
- Own localStorage key: `playground_ceramics_stacked_mold_projects`. Register it in
  `scripts/dashboard/projectStorage.js` (`appType: 'stackedmold'`).

## 7. Tests

- `scripts/benchmarks/stackedMoldSlicerGate.mjs` (Node, add to `npm test`): the six fixture forms produce exactly
  the units, release directions, Ø and ledge in section 3. Also check:
  - the key/plate bookkeeping table (bed plate / lid formers per unit, as listed in each form's table in
    `concept.html`)
  - that every band is monotonic
  - a pedestal foot gives f = 0
- Geometry gate: every exported part is watertight/manifold, no print overhang beyond 45° in its print
  orientation, pockets and bumps mate (same key circle and angles across each joint).
- `scripts/tests/stackedMoldDialsBrowser.mjs`, added to `npm run test:browser`: choose a source, units render,
  export produces the expected file list.

## 8. Suggested phases

1. `bandSlicer.js` + slicer gate (pure logic, matches the prototype).
2. App shell: DialKit panel, source flow, stack viewport with 2D schematic views (can embed the concept page's
   drawing functions).
3. Printable part solids + STL/ZIP export + geometry gate.
4. Per-unit 3D anatomy views (port `stackedMoldAnatomy.js`), dashboard entry, browser test.

## 9. Open questions to confirm with the user before or while building

- One Ø fitted per mold (current plan) vs. a few standard diameters so sleeves can be reused between molds.
- Fixed male/female keys (current plan) vs. the loose-key alternative (sockets on every face plus loose double cones).
- Well collar core: taped slit tube (current plan) vs. a hidden 0.5° bore draft.
- Should the generator suggest profile tweaks (taper, lip size) to turn split units back into one-piece rings?
- Sleeve height policy: one sleeve per distinct unit height vs. standard heights with a spacer ring.

## 10. Build notes (2026-10-13)

Implemented phases 1–4. The slicer reproduces §3's table exactly (control points and dense samples).
User test forms in `test-files/stacked-mold/`: `Braz_3_mug.stl` → footer (seam at 10 mm) + ring↓ + well, Ø170;
`Untitled_Vessel_V2.stl` → footer + ring↓ + split (78–135) + well, Ø200.

Additions and deviations, each small and none touching §2:
- **Fewest sections (user, 2026-10-14):** the 90 mm ring / 180 mm split caps are gone. A unit is only
  height-cut when its printed parts would not fit the printer (ring ≤ bed − 10, split insert ≤ bed − 4).
  Defaults now give: tumbler footer + ring + well, belly jar footer + ring↓ + ring↑ + well, Braz mug
  footer + one ring + well. The slicer gate still checks the prototype table by passing its caps.
- **Foot seam on the crease (user, 2026-10-14):** the seam moves from the fixed 6 mm to the highest
  foot/wall crease (slope change ≥ 20°) within 25 mm that the base still flares up to, so the unit
  above starts on one wall angle and the footer takes the whole foot. Smooth bases keep 6 mm. Braz mug:
  seam at its chamfer top (10 mm), which also puts the 10 mm foot recess inside the footer (no boss).
  Angle / Cast-registration mugs: the flare runs to the belly, so footer + ring↑ + well (3 units, was 5).
- **Ring slivers:** a ring band shorter than `minRingH` (15 mm) merges into a neighbouring split
  (keys need the height; a ribbed/patterned wall otherwise leaves a 5 mm ring). None of the six forms
  are affected.
- **Pocket plates are 7 mm**, not 5: a 5 mm pocket needs a floor under it. Split dividers are 7 mm for
  the same reason.
- **Foot recesses deeper than the seam** (both user forms have ~10 mm recesses vs f = 6): the footer
  core profile dips into its bed plate, so the plaster footer gets a boss that forms the recess.
- **Split halves key differently:** half A carries the 0° key, half B the 120°/240° keys, so each half
  has its own bed half-plate and half lid (A and B), plus insert A (bumps) / insert B (pockets).
- **Ears vs rim/skirt:** the bed-plate rim and lid skirt are arcs with gaps at the sleeve seams so the
  bolt ears (and split divider flanges) clear them. The lid is R + wall + 4.6 so the skirt sits inside it.
- **Sources:** STL/OBJ and Dinnerware items are sampled radially (median over 72 angles, so handles and
  patterns are ignored and reported as asymmetry); Vessel V2/V3 profiles are read analytically.

## 11. Kit system (2026-10-14)

Built from printing-analysis.html, after the user chose standard diameters, separate cores, jack screws and
pry points, one tall sleeve per diameter and the tier-2 ware parts:

- **Standard diameters** Ø150 / 175 / 200 / 230 / 250 / 280 / 310 / 360 (`kitSpec.js`); a mold uses the
  smallest that holds it (Kit panel: Auto, a size, or Fitted). Printer default: Bambu H2S.
- **Universal kit per diameter**: bed plate with a centre pit and three key-plug bores (bump/pocket plugs swap
  in from outside, so one plate serves every unit), three M5 jack-screw bores; a **drop-in lid** that rests on the
  core top, so **one tall sleeve** (2+ segments, pry bevels on the ears) serves every unit height; locating puck.
  Plates and lids too wide for the printer split into dovetailed tiles. The plate rim is 4 mm tall.
- **Ware parts (tier 2)**: ring cores register on the puck through a cone pit in their base. The footer stub and
  a 2 mm **locating ring** print as one **footer base** (user, 2026-10-20: the stub alone is hard to extract): the
  ring fills the plate rim under the sleeve (the rim centres it, the sleeve stands on it and holds it down), its
  face carries the footer's key bumps (no plugs or pit cap on a footer), and two pull tabs through the rim gaps at
  the sleeve seams pull the whole base out, the ring peeling and the stub following straight out of the foot
  cavity. No joint at the plaster face near the ware. Bases too wide for the bed (Ø360 kit) print as a centre (the
  stub on a flange as wide as the bed allows, with a 45° edge) ringed by dovetailed tiles that seat on that edge.
  Jack screws are headless M5 × T set screws, flush with both plate faces (the plate lies flat, the bench holds
  the plugs in). Well: slit tube whose
  edges meet (0.6 mm print kerf, sized so the taped tube is the bore) + spoked locator; no wedge (2026-10-20,
  user: the wedge left ridges in the bore). Split inserts with flange holes at the sleeve's bolt pitch.
- **Slicer**: a short (≤ 25 mm) first ring that only flares folds into the footer (plates and saucers: footer +
  well); the seam rises above a foot recess when the base flares that high (no fused footer plate needed).
- **Braz set** (7 wares): 3 kits (Ø175 tumbler+mug, Ø250 saucer+soup, Ø360 pasta+plate+serving), 19 plaster
  pieces, ≈ 6.5 kg PLA and 72 prints for the whole system. `output/stacked-mold/braz-set/REPORT.md`.

Still open from §9: loose keys vs fixed genders, bore draft vs slit tube, profile-tweak suggestions.
