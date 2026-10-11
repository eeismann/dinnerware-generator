/**
 * Vessel Designer V3 - Spout Graft (Phase 2)
 *
 * Displaces one existing ring (row) of a lathe-convention BufferGeometry
 * outward and downward to pull a local spout lip, within an angular window
 * `[angle - width/2, angle + width/2]` centered on `spout.angle`. No new
 * vertices or triangles are introduced — only the positions of vertices
 * already on the target ring move — so the graft cannot create a new seam
 * or non-manifold edge on its own: ring topology, winding and adjacency are
 * untouched, only coordinates change, and the angular falloff is evaluated
 * continuously per column so it reaches exactly zero outside the window
 * without needing the window edges to land on a particular vertex column.
 *
 * The angular falloff is a raised-cosine bump — the same shape as
 * scripts/geometry/surfacePattern.js's `ridgeWave('rounded', ...)`
 * (`0.5 * (1 + cos(d * PI))`, zero slope at both the center and the edges,
 * exactly zero past the edges) — reimplemented here as a single
 * non-periodic angular distance function (ridgeWave is phase/period
 * oriented and not exported) instead of imported.
 */

const TWO_PI = Math.PI * 2;

function wrapToPi(angleRad) {
    return ((angleRad + Math.PI) % TWO_PI + TWO_PI) % TWO_PI - Math.PI;
}

/**
 * Raised-cosine angular envelope: 1 at `centerRad`, 0 at
 * |theta - centerRad| >= halfWidthRad, smooth (zero slope) at the center
 * and at both edges. Mirrors surfacePattern.js's rounded ridge waveform,
 * evaluated as one non-periodic bump around the full circle instead of a
 * repeating waveform.
 */
export function spoutAngularEnvelope(thetaRad, centerRad, halfWidthRad) {
    if (!(halfWidthRad > 0)) return 0;
    const d = Math.abs(wrapToPi(thetaRad - centerRad)) / halfWidthRad;
    if (d >= 1) return 0;
    return 0.5 * (1 + Math.cos(d * Math.PI));
}

/**
 * Displace one ring of an existing lathe-convention BufferGeometry to graft
 * a spout lip. The geometry must follow THREE.LatheGeometry's own vertex
 * layout (matched exactly by both `new THREE.LatheGeometry(...)` and
 * `createPatternedLatheGeometry(...)` in surfacePattern.js): vertex index =
 * i * rowCount + row, for i in [0, radialSegments] (radialSegments + 1 phi
 * columns — the seam column is duplicated at i = 0 and i = radialSegments),
 * where `rowCount` is the number of profile points per column and `row` is
 * the profile-point index being grafted (0 = the bottom of this run's local
 * profile, rowCount - 1 = its top).
 *
 * Call this BEFORE merging/welding multiple per-segment runs into one
 * shell — see vesselV3MeshGenerator.js's `applySpoutToRuns()`, which also
 * handles the case where the grafted ring is a boundary shared with an
 * adjacent run (both copies must move identically or mergeVertices() will
 * stop welding them).
 *
 * @param {THREE.BufferGeometry} geometry - Mutated in place. Caller must
 *   recompute normals afterward (this only touches `position`).
 * @param {Object} spoutState - `{ angle, width, length, drop }` in the
 *   units spoutInspector.js already produces (deg, deg, mm, mm).
 * @param {Object} profileContext
 * @param {number} profileContext.radialSegments - Shared radial resolution
 *   of the item (columns = radialSegments + 1).
 * @param {number} profileContext.rowCount - Profile points per column in
 *   this run (n).
 * @param {number} [profileContext.targetRow] - Row to graft; defaults to
 *   rowCount - 1 (this run's top ring).
 * @returns {boolean} true if any vertex was moved.
 */
export function applySpoutGraft(geometry, spoutState, profileContext) {
    if (!geometry?.isBufferGeometry || !spoutState) return false;
    const { radialSegments, rowCount } = profileContext || {};
    if (!(radialSegments > 0) || !(rowCount > 0)) return false;

    const targetRow = Number.isInteger(profileContext.targetRow)
        ? profileContext.targetRow
        : rowCount - 1;
    if (targetRow < 0 || targetRow >= rowCount) return false;

    const position = geometry.getAttribute('position');
    const expectedVertexCount = (radialSegments + 1) * rowCount;
    if (!position || position.count !== expectedVertexCount) return false;

    const centerRad = ((Number(spoutState.angle) || 0) * Math.PI) / 180;
    const halfWidthRad = Math.max(0.001, ((Number(spoutState.width) || 0) * Math.PI) / 360);
    const length = Math.max(0, Number(spoutState.length) || 0);
    const drop = Math.max(0, Number(spoutState.drop) || 0);
    if (length <= 0 && drop <= 0) return false;

    let touched = false;
    for (let i = 0; i <= radialSegments; i++) {
        const theta = (i / radialSegments) * TWO_PI;
        const env = spoutAngularEnvelope(theta, centerRad, halfWidthRad);
        if (env <= 0) continue;

        const idx = i * rowCount + targetRow;
        const x = position.getX(idx);
        const y = position.getY(idx);
        const z = position.getZ(idx);
        const r = Math.hypot(x, z);
        if (r <= 1e-6) continue; // on-axis vertex: nothing to push outward

        const newR = r + length * env;
        const scale = newR / r;
        position.setX(idx, x * scale);
        position.setZ(idx, z * scale);
        position.setY(idx, y - drop * env);
        touched = true;
    }

    if (touched) position.needsUpdate = true;
    return touched;
}

/**
 * Tip wall thickness fed to validateSpout(). `spout.wallThickness` is a
 * design target for the tip, not a quantity derived from the graft
 * (VESSEL_V3_SPOUT_HANDLE_LID_PLAN.md section 3) — the graft above only
 * moves the outer wall's rim ring, it does not sculpt a matching pull into
 * the independently-offset inner wall, so there is no cheap "actual" inner
 * gap at that ring to measure without a second raycast against the inner
 * profile. Per the phase-2 task brief this is an accepted scope cut:
 * validate the design parameter alone against the print-safety floor.
 */
export function estimateSpoutTipWallThickness(spoutState) {
    return Number(spoutState?.wallThickness);
}
