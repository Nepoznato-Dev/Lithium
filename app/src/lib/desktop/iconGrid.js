/* Desktop icon grid — pure layout math shared by the desktop renderer, the
   Settings UI and the desktop context menu so every surface agrees on what a
   density mode means. No DOM access here: everything is a plain function of
   (mode, desktop area) so the grid stays deterministic and testable.

   A "mode" is a target cell size plus a density guarantee. On a display too
   small to fit the guaranteed number of cells at the target size, the resolved
   cell shrinks below it rather than letting icons run off the desktop. */

export const MIN_GAP = 10;   // Gap kept between cells in every mode
export const DEFAULT_ICON_MODE = 'balanced';

export const ICON_MODES = {
  compact: { base: 78, minCols: 25, minRows: 12, label: 'Compact' },
  balanced: { base: 100, minCols: 18, minRows: 8, label: 'Balanced' },
  large: { base: 140, minCols: 12, minRows: 6, label: 'Large' },
};

const MIN_ICON_SIZE = 40;    // Floor for extremely small viewports
const MAX_ICON_SIZE = 180;   // Ceiling so huge displays stay sane

export function getModeSpec(mode) {
  return ICON_MODES[mode] || ICON_MODES[DEFAULT_ICON_MODE];
}

/** Human-readable density guarantee, e.g. "≥ 18 × 8 icons". */
export function modeDensityLabel(mode) {
  const spec = getModeSpec(mode);
  return `${spec.minCols} × ${spec.minRows} icons`;
}

/** Largest cell both density guarantees fit into a w × h desktop area. */
export function resolveIconSize(mode, w, h) {
  const spec = getModeSpec(mode);
  const fitsCols = w > 0 ? Math.floor(w / spec.minCols) - MIN_GAP : spec.base;
  const fitsRows = h > 0 ? Math.floor(h / spec.minRows) - MIN_GAP : spec.base;
  const size = Math.min(spec.base, fitsCols, fitsRows);
  return Math.max(MIN_ICON_SIZE, Math.min(MAX_ICON_SIZE, size));
}

/** Glyph, label and inner spacing derived from the cell, so icons keep the same
   proportions in every mode instead of just being cropped tiles. */
export function iconMetrics(size) {
  const glyphBox = Math.round(Math.min(64, Math.max(22, size * 0.48)));
  return {
    glyphBox,
    glyph: Math.round(glyphBox / 2),
    font: Math.round(Math.min(14, Math.max(9, size * 0.11))),
    pad: Math.round(Math.min(10, Math.max(3, size * 0.08))),
    gap: Math.round(Math.min(8, Math.max(2, size * 0.08))),
    radius: Math.round(Math.min(16, Math.max(6, size * 0.1))),
  };
}

/** The desktop area is divided evenly into cols × rows cells, so every icon
    receives identical spacing at any screen size. */
export function computeGrid(w, h, iconSize) {
  const cols = Math.max(1, Math.floor(w / (iconSize + MIN_GAP)));
  const rows = Math.max(1, Math.floor(h / (iconSize + MIN_GAP)));
  return { cols, rows, cellW: w / cols, cellH: h / rows, iconSize };
}

/** Top-left pixel of the icon centered inside its cell. */
export function cellToPos(g, col, row) {
  return {
    x: Math.round(col * g.cellW + (g.cellW - g.iconSize) / 2),
    y: Math.round(row * g.cellH + (g.cellH - g.iconSize) / 2),
  };
}

/** Inverse of cellToPos — a pixel always snaps back to the cell it renders in. */
export function posToCell(g, x, y) {
  return {
    col: Math.max(0, Math.min(g.cols - 1, Math.round((x - (g.cellW - g.iconSize) / 2) / g.cellW))),
    row: Math.max(0, Math.min(g.rows - 1, Math.round((y - (g.cellH - g.iconSize) / 2) / g.cellH))),
  };
}
