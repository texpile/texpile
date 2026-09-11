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
export const COMMENT_RAIL_WIDTH = 272;
export const COMMENT_RAIL_PEEK = 40;
export const EDITOR_TEXT_MIN = 440;
export const EDITOR_TEXT_PAD = 96;

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
