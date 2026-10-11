#!/usr/bin/env node
/**
 * Deprecated compatibility entry point (legacy escape-hatch coverage).
 *
 * History: the original side-stock cut gate required every wall vertex to stay
 * inside the side cut planes ("clean hex"); that was replaced by the additive
 * seam-stock target, and both are now superseded by compact wall blocks
 * (experimental.compactWallBlocks; validated by castFormCompactWallBlockGate.mjs),
 * which clip each wall to vertical lateral planes for polymer case-mold release.
 * This route runs the additive seam-stock gate, which pins the flag off and
 * validates the legacy wedge envelope.
 */

import './castFormAdditiveSeamStockGate.mjs';
