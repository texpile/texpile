// What is dragged toward the editor slots, from dragstart to drop: a tab from a strip, or files from the
// tree. A drop target needs to know what is coming while the pointer moves, and dataTransfer only hands
// its data over on the drop
import { tabKey, type Tab } from '../tabs.svelte';
import { nativeBridge } from '../fileSystem';
import { childWindows, overAnyWindow } from '$lib/childWindows/childWindowRegistry.svelte';

export const TAB_DRAG_TYPE = 'application/x-texpile-tab';

export type DraggedTab = { tab: Tab; group: number };

let dragged = $state.raw<DraggedTab | null>(null);
/** the files of a drag out of this window's tree; its folders stay behind */
let files = $state.raw<string[] | null>(null);

/** something a slot takes is in flight, for what is drawn only while one is */
export const slotDrag = {
	get current(): DraggedTab | string[] | null {
		return dragged ?? files;
	}
};

export function startTabDrag(event: DragEvent, tab: Tab, group: number): void {
	dragged = { tab, group };
	const transfer = event.dataTransfer;
	transfer?.setData(TAB_DRAG_TYPE, tabKey(tab));
	if (transfer) transfer.effectAllowed = 'move';
	endOnDrop();
}

export function startFileDrag(paths: string[]): void {
	files = paths.length ? paths : null;
	if (files) endOnDrop();
}

// a tab that moves on its drop leaves the page before its own dragend, which then reaches no one
function endOnDrop(): void {
	for (const w of [window, ...childWindows.list]) w.addEventListener('drop', endAfterDrop, { capture: true, once: true });
}

function endAfterDrop(): void {
	setTimeout(endSlotDrag);
}

/** the tab over a drop target, or null when what is dragged is not a tab of ours */
export function draggedTab(event: DragEvent): DraggedTab | null {
	return event.dataTransfer?.types.includes(TAB_DRAG_TYPE) ? dragged : null;
}

/** the files over a drop target, or null when what is dragged is not files from the tree */
export function draggedFiles(event: DragEvent): string[] | null {
	return event.dataTransfer?.types.includes(TAB_DRAG_TYPE) ? null : files;
}

export function endSlotDrag(): void {
	dragged = null;
	files = null;
	for (const w of [window, ...childWindows.list]) w.removeEventListener('drop', endAfterDrop, { capture: true });
}

/** set by the editor slots: a tab let go outside every window of the app opens there, in a window of its own */
export const tabOut: { current: ((drag: DraggedTab, at: { x: number; y: number }) => void) | null } = { current: null };

/** the tab's own dragend. As VS Code does: the pointer is asked of the main process, a drag's screen point is not kept everywhere */
export async function endTabDrag(event: DragEvent): Promise<void> {
	const drag = dragged;
	endSlotDrag();
	if (!drag || event.dataTransfer?.dropEffect !== 'none') return;
	const at = (await nativeBridge()?.cursorScreenPoint?.()) ?? { x: event.screenX, y: event.screenY };
	if (!overAnyWindow(at.x, at.y)) tabOut.current?.(drag, at);
}
