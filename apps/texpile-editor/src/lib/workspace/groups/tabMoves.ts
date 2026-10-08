// VS Code's tab drag between editor groups: onto a slot's strip or editor the tab moves there. The tab
// leaves its own slot through the workspace, so that slot shows the tab beside it, or stays empty
import { tabs, tabKey, type Tab } from '../tabs.svelte';
import { editorGroups } from './editorGroups.svelte';
import type { SplitTarget } from './splitDrop';

export type TabDrop = {
	tab: Tab;
	from: number;
	to: number;
	/** where on the target's strip, when dropped on it */
	index: number | null;
};

/** `close` is the workspace's own tab close, which focuses the neighbour */
export async function dropTab(drop: TabDrop, close: (tab: Tab) => void): Promise<void> {
	editorGroups.moving++;
	try {
		await moveTab(drop, close);
	} finally {
		editorGroups.moving--;
	}
	editorGroups.closeIfEmpty(drop.from);
}

async function moveTab(drop: TabDrop, close: (tab: Tab) => void): Promise<void> {
	const { tab, from, to, index } = drop;
	const key = tabKey(tab);
	if (from === to) {
		if (index !== null) editorGroups.moveWithin(from, key, index);
		return;
	}
	const shown = editorGroups.activeOf(from);
	if (!shown || tabKey(shown) !== key) editorGroups.removeTab(from, key);
	else {
		// the slot shows the tab: it moves on to the one beside it, as closing the tab there would
		editorGroups.focus(from);
		await editorGroups.whenDrawn();
		close(tab);
		await editorGroups.whenDrawn();
		// the close waits on the unsaved-changes question: the tab stays where it is until that is answered
		if (editorGroups.tabsOf(from).some((t) => tabKey(t) === key)) return;
	}
	editorGroups.focus(to, tab);
	if (index !== null) editorGroups.moveWithin(to, key, index);
	await editorGroups.whenDrawn();
}

/** a tab dragged out of the window, or moved by its menu: the file opens in a window of its own, at `at` on the screen */
export async function moveToWindow(tab: Tab, from: number, at: { x: number; y: number }, close: (tab: Tab) => void): Promise<void> {
	const to = editorGroups.addWindow(tab, editorGroups.modeOf(from), at);
	await dropTab({ tab, from, to, index: null }, close);
	// a preview tab would give its place to the next file opened in it
	if (editorGroups.focusedId === to) tabs.keep(tabKey(tab));
}

/** a tab or files dropped on a slot's edge: the layout grows, and the new slot holds only what was dropped */
/** `on`: the slot whose edge took the drop */
export async function dropToSplit(
	target: SplitTarget,
	on: number,
	drop: { tab: Tab; from: number } | string[],
	close: (tab: Tab) => void
): Promise<void> {
	const before = new Set(editorGroups.grid.map((g) => g.id));
	editorGroups.setLayout(target.layout);
	if (target.trade) editorGroups.tradePlaces(...target.trade);
	const to = editorGroups.grid[target.place]?.id;
	if (to === undefined) return;
	// new slots open on the focused file; here one is for the drop alone and the grid's other one stays empty
	for (const g of editorGroups.grid) if (!before.has(g.id)) editorGroups.empty(g.id);
	if (Array.isArray(drop)) editorGroups.openIn(to, drop, null);
	// a slot's only tab split off its own edge: the file shows in both, as VS Code's Split Editor
	else if (drop.from === on && editorGroups.tabsOf(drop.from).length <= 1) editorGroups.focus(to, drop.tab);
	else await dropTab({ tab: drop.tab, from: drop.from, to, index: null }, close);
}
