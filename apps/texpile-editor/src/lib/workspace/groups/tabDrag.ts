// A tab being dragged, from dragstart to drop: a drop target needs to know what is coming while the
// pointer moves, and dataTransfer only hands its data over on the drop
import { tabKey, type Tab } from '../tabs.svelte';

export const TAB_DRAG_TYPE = 'application/x-texpile-tab';

export type DraggedTab = { tab: Tab; group: number };

let dragged: DraggedTab | null = null;

export function startTabDrag(event: DragEvent, tab: Tab, group: number): void {
	dragged = { tab, group };
	const transfer = event.dataTransfer;
	transfer?.setData(TAB_DRAG_TYPE, tabKey(tab));
	if (transfer) transfer.effectAllowed = 'move';
}

/** the tab over a drop target, or null when what is dragged is not a tab of ours */
export function draggedTab(event: DragEvent): DraggedTab | null {
	return event.dataTransfer?.types.includes(TAB_DRAG_TYPE) ? dragged : null;
}

export function endTabDrag(): void {
	dragged = null;
}
