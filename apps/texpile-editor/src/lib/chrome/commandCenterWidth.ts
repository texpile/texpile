// How wide the title bar's command center is. It stands on the window's center, as in VS Code, while both sides leave
// it MIN_WIDTH; past that it moves into the room between the sides
export const SIDE_GAP = 12; // the least it keeps from either side
export const MIN_WIDTH = 140; // narrower than this the field is not worth showing
const ASK_WIDTH = 200; // the least it asks of the sides before it shrinks
const MAX_WIDTH = 460; // a title is short; past this the field is mostly empty however you align it
const SHARE = 0.24; // of the window, as VS Code sizes its search, so the menus keep air before it

/** the width it asks for: the sides give way (labels, then menus) before it narrows below this */
export function askedWidth(windowWidth: number): number {
	return Math.min(MAX_WIDTH, Math.max(ASK_WIDTH, Math.round(windowWidth * SHARE)));
}

/** 0 leaves it off the window's center: the heavier side is too close to it */
export function centeredWidth(windowWidth: number, leftWidth: number, rightWidth: number): number {
	const half = windowWidth / 2 - Math.max(leftWidth, rightWidth) - SIDE_GAP;
	const width = Math.min(askedWidth(windowWidth), Math.floor(2 * half));
	return width >= MIN_WIDTH ? width : 0;
}

/** 0 leaves it out: the room between the sides is under its least width */
export function betweenWidth(windowWidth: number, leftWidth: number, rightWidth: number): number {
	const room = windowWidth - leftWidth - rightWidth - 2 * SIDE_GAP;
	return room >= MIN_WIDTH ? Math.min(askedWidth(windowWidth), room) : 0;
}

/** the widest the menus may be: room for the box the right side allows on the center, or failing that between the sides */
export function menuBudget(windowWidth: number, rightWidth: number): number {
	const rightHalf = windowWidth / 2 - rightWidth - SIDE_GAP;
	if (rightHalf < MIN_WIDTH / 2) return windowWidth - rightWidth - MIN_WIDTH - 2 * SIDE_GAP;
	return windowWidth / 2 - Math.min(askedWidth(windowWidth) / 2, rightHalf) - SIDE_GAP;
}
