// Where the restored panes land, as a pure function of the persisted layout and the window width.
//
// Shared with the launch skeleton, which is on screen for the whole editor load and has to place
// the panes exactly where PaneLayout is about to place them - anything it puts elsewhere moves
// under the reader the moment the real workspace replaces it.
import type { LayoutState } from '$lib/storage/layout';

// the header collapses its actions into one "..." button, so the folder name is all that has to fit
export const SIDEBAR_MIN = 140;
export const SIDEBAR_MAX = 600;
export const PDF_MIN = 280;
/** keep this much room for the editor no matter how wide the preview was saved */
export const EDITOR_RESERVE = 360;
/** Version History's panel beside the document, which the editor's room holds as well */
export const HISTORY_PANEL_WIDTH = 256;
/** the editor's least room beside that panel: the comparison's bar, with Copy and Restore, on one line */
export const HISTORY_EDITOR_MIN = 520;
export const COMMENT_RAIL_WIDTH = 258;
export const COMMENT_RAIL_PEEK = 40;
export const EDITOR_TEXT_MIN = 440;
/** the visual editor's side padding: the block handles' gutters (VisualEditorHost) */
export const EDITOR_TEXT_PAD = 78;
/** the same with the handles stacked on the left, while comments crowd a narrow pane */
export const EDITOR_TEXT_PAD_STACKED = 34;

/** the saved sidebar width, or the default if it is out of bounds */
export function sidebarWidthOf(s: LayoutState): number {
	return s.sidebarWidth >= SIDEBAR_MIN && s.sidebarWidth <= SIDEBAR_MAX ? s.sidebarWidth : 256;
}

/** cap: whatever is left after the sidebar, keeping room for the editor */
export function pdfMaxWidth(sidebarWidth: number, windowWidth: number): number {
	return Math.max(320, windowWidth - sidebarWidth - EDITOR_RESERVE);
}

/** the preview is persisted as a FRACTION of window width, so it stays proportional across sizes */
export function pdfWidthOf(s: LayoutState, windowWidth: number): number {
	const frac = s.pdfPaneFraction > 0 && s.pdfPaneFraction < 1 ? s.pdfPaneFraction : 0.4;
	const sidebar = s.sidebarOpen ? sidebarWidthOf(s) : 0;
	return Math.min(pdfMaxWidth(sidebar, windowWidth), Math.max(PDF_MIN, frac * windowWidth));
}
