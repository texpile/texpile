// A drop on a slot's edge grows the layout that way, the dropped slot on the side it was dropped on
import { beforeEach, describe, expect, it } from 'vitest';
import { splitTarget, zoneAt } from '$lib/workspace/groups/splitDrop';
import { dropToSplit } from '$lib/workspace/groups/tabMoves';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { tabs, type Tab } from '$lib/workspace/tabs.svelte';
import { activeFilePath } from '$lib/workspace/workspaceStore';

const tab = (path: string): Tab => ({ path });
const paths = (list: Tab[]) => list.map((t) => t.path);

describe('split drop', () => {
	it('reads the outer quarter of each side as its edge', () => {
		const box = { left: 0, top: 0, width: 400, height: 200 };
		expect(zoneAt(box, 380, 100)).toBe('right');
		expect(zoneAt(box, 200, 10)).toBe('top');
		expect(zoneAt(box, 200, 100)).toBe('center');
	});

	it('grows one editor and two editors toward the edge, and nothing past the grid', () => {
		expect(splitTarget('one', 0, 'right')).toEqual({ layout: 'columns', place: 1, trade: null });
		expect(splitTarget('one', 0, 'left')).toEqual({ layout: 'columns', place: 0, trade: [0, 1] });
		// the right column's top edge: the new slot takes the top right, the slot dropped on goes under it
		expect(splitTarget('columns', 1, 'top')).toEqual({ layout: 'grid', place: 1, trade: [1, 3] });
		expect(splitTarget('columns', 0, 'right')).toBeNull();
		expect(splitTarget('grid', 2, 'bottom')).toBeNull();
	});
});

describe('a drop that splits', () => {
	beforeEach(() => {
		tabs.bind(null, false);
		editorGroups.attach({
			capture: () => ({ loadedPath: activeFilePath.current, openTabs: tabs.list }),
			activeTab: () => (activeFilePath.current ? tab(activeFilePath.current) : null),
			mode: () => 'visual',
			setMode: () => {},
			parseFile: async () => null,
			enter: (t) => {
				activeFilePath.current = t?.path ?? null;
				// drawn at once: no editor to wait for here
				queueMicrotask(() => editorGroups.markDrawn(activeFilePath.current));
			},
			beforeSplit: () => {},
			placeSplitCaret: () => {}
		});
		editorGroups.restore(null);
		tabs.noteOpened('/w/a.tex');
		tabs.keep('/w/a.tex');
		activeFilePath.current = '/w/a.tex';
	});

	it('puts only what was dropped in the new slot, not the focused file the layout would open there', async () => {
		const on = editorGroups.focusedId;
		await dropToSplit({ layout: 'columns', place: 0, trade: [0, 1] }, on, ['/w/c.tex'], () => {});
		expect(editorGroups.layout).toBe('columns');
		const [left, right] = editorGroups.grid.map((g) => g.id);
		// the drop is on the left and has the focus; the slot dropped on moved over with its own tabs
		expect(editorGroups.focusedId).toBe(left);
		expect(paths(tabs.list)).toEqual(['/w/c.tex']);
		expect(paths(editorGroups.tabsOf(right))).toEqual(['/w/a.tex']);
	});

	it("keeps a slot's only tab in it when split off its own edge, and moves it when dropped on another slot's edge", async () => {
		const own = editorGroups.focusedId;
		await dropToSplit({ layout: 'columns', place: 1, trade: null }, own, { tab: tab('/w/a.tex'), from: own }, () => {});
		const [left, right] = editorGroups.grid.map((g) => g.id);
		expect([paths(editorGroups.tabsOf(left)), paths(editorGroups.tabsOf(right))]).toEqual([['/w/a.tex'], ['/w/a.tex']]);
		// the right one's only tab onto the left one's bottom edge: it moves there, it is not copied
		await dropToSplit({ layout: 'grid', place: 2, trade: null }, left, { tab: tab('/w/a.tex'), from: right }, (t) => tabs.close(t.path));
		expect(editorGroups.grid.map((g) => paths(editorGroups.tabsOf(g.id)).join())).not.toContain('/w/a.tex,/w/a.tex');
		expect(paths(editorGroups.tabsOf(right))).toEqual([]);
	});
});
