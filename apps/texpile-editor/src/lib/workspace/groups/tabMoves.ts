// VS Code's tab drag between editor groups: onto a strip or the middle of a group the tab moves there,
// onto a group's left or right side it opens in a new group on that side. The tab leaves its own group
// through the workspace, so that group shows the tab beside it, or goes when it had no other
import { tabKey, type Tab } from '../tabs.svelte';
import { editorGroups } from './editorGroups.svelte';

export type TabDrop = {
	tab: Tab;
	from: number;
	to: number;
	/** a side of the target group: a new group there */
	side: 'left' | 'right' | null;
	/** where on the target's strip, when dropped on it */
	index: number | null;
};

/** `close` is the workspace's own tab close, which focuses the neighbour */
export async function dropTab(drop: TabDrop, close: (tab: Tab) => void): Promise<void> {
	const { tab, from, to, side, index } = drop;
	const key = tabKey(tab);
	const own = editorGroups.tabsOf(from);
	if (!side && from === to) {
		if (index !== null) editorGroups.moveWithin(from, key, index);
		return;
	}
	// a group's only tab split off beside itself would leave the same picture
	if (side && from === to && own.length === 1) return;
	const leaving = own.length === 1;
	editorGroups.focus(from, tab);
	await editorGroups.whenDrawn();
	if (!leaving) {
		close(tab);
		await editorGroups.whenDrawn();
	}
	if (side) editorGroups.split(tab, side, to);
	else {
		editorGroups.focus(to, tab);
		if (index !== null) editorGroups.moveWithin(to, key, index);
	}
	await editorGroups.whenDrawn();
	if (leaving) editorGroups.close(from);
}
