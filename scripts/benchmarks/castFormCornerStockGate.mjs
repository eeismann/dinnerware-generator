#!/usr/bin/env node
/**
 * Compatibility entry point (legacy escape-hatch coverage).
 *
 * The product default is now compact wall blocks (experimental.compactWallBlocks;
 * validated by castFormCompactWallBlockGate.mjs), which clip the wedge corners
 * into vertical lateral faces so the printed form releases from a cast polymer
 * case mold. This route runs the additive seam-stock gate, which pins the flag
 * off and validates the legacy wedge envelope.
 */

import './castFormAdditiveSeamStockGate.mjs';
