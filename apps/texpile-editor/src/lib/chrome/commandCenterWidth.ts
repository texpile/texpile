// How wide the title bar's command center is in the room between the two sides, where it stands in the middle: the
// window buttons and the project's controls weigh on the right, and a box on the window's center leaned on them
export const SIDE_GAP = 12; // the least it keeps from either side
export const MIN_WIDTH = 200; // narrower than this the field is not worth showing
const MAX_WIDTH = 460; // a title is short; past this the field is mostly empty however you align it
const SHARE = 0.24; // of the window, as VS Code sizes its search, so the menus keep air before it

/** 0 leaves it out: the room between the sides is under its least width */
export function commandCenterWidth(windowWidth: number, leftWidth: number, rightWidth: number): number {
	const room = windowWidth - leftWidth - rightWidth - 2 * SIDE_GAP;
	return room >= MIN_WIDTH ? Math.min(MAX_WIDTH, room, Math.max(MIN_WIDTH, Math.round(windowWidth * SHARE))) : 0;
}
