import type { Component } from 'svelte';

/** one btn-icon-xs and its gap, rounded up as Texpile's sidebar counts it */
const ACTION_PX = 28;
/** the title truncates down to this before any action gives way */
const TITLE_MIN_PX = 24;
/** px-3 on both sides and the gap after the title */
const HEADER_CHROME_PX = 24 + 8;

export type SidebarAction = {
	key: string;
	icon: Component;
	label: string;
	/** the hint, with its shortcut or why it is grayed */
	hint: string;
	disabled: boolean;
	run: () => void;
};

/** how many actions stay as icons in a header this wide; the rest go in "...", which takes a slot of its own */
export function inlineActionCount(width: number, count: number): number {
	const room = Math.max(0, width - HEADER_CHROME_PX - TITLE_MIN_PX);
	return count * ACTION_PX <= room ? count : Math.max(0, Math.floor((room - ACTION_PX) / ACTION_PX));
}
