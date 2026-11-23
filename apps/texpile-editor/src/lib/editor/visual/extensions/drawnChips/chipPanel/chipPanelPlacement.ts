// where the panel stands: under the chip at its left edge, above it when there is no room below, always inside the pane
// that scrolls the text (never over the toolbar or the terminal)
type Box = { left: number; top: number; right: number; bottom: number };
type Size = { width: number; height: number };

const GAP = 4;
const MARGIN = 8;

/** part of the chip is still inside the pane */
export function chipInPane(chip: Box, pane: Box): boolean {
	return chip.bottom > pane.top && chip.top < pane.bottom && chip.right > pane.left && chip.left < pane.right;
}

export function chipPanelPlacement(chip: Box, panel: Size, pane: Box): { x: number; y: number } {
	const x = Math.max(pane.left + MARGIN, Math.min(chip.left, pane.right - panel.width - MARGIN));
	const below = chip.bottom + GAP;
	const above = chip.top - GAP - panel.height;
	const y = below + panel.height <= pane.bottom - MARGIN || above < pane.top + MARGIN ? below : above;
	return { x, y: Math.max(pane.top + MARGIN, Math.min(y, pane.bottom - panel.height - MARGIN)) };
}
