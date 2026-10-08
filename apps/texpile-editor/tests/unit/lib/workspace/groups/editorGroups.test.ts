// The editor layouts: each slot keeps its own tabs while focus moves, a bigger layout opens the focused
// file in its new slots, and a smaller one hands the tabs of the slots that go to the first
import { beforeEach, describe, expect, it } from 'vitest';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { tabs, tabKey, type Tab } from '$lib/workspace/tabs.svelte';
import { activeFilePath, openFile } from '$lib/workspace/workspaceStore';

const tab = (path: string): Tab => ({ path });
const paths = (list: Tab[]) => list.map((t) => t.path);

beforeEach(() => {
	tabs.bind(null, false);
	editorGroups.attach({
		capture: () => ({ loadedPath: activeFilePath.current, openTabs: tabs.list }),
		activeTab: () => (activeFilePath.current ? tab(activeFilePath.current) : null),
		mode: () => 'visual',
		setMode: () => {},
		parseFile: async () => null,
		enter: (t) => (activeFilePath.current = t?.path ?? null),
		beforeSplit: () => {},
		placeSplitCaret: () => {}
	});
	editorGroups.restore(null);
	tabs.noteOpened('/w/a.tex');
	tabs.keep('/w/a.tex');
	tabs.noteOpened('/w/b.tex');
	activeFilePath.current = '/w/b.tex';
});

describe('editor layouts', () => {
	it('opens the focused file in each new slot of a bigger layout', () => {
		const first = editorGroups.focusedId;
		editorGroups.setLayout('grid');
		expect(editorGroups.list).toHaveLength(4);
		expect(editorGroups.focusedId).toBe(first);
		for (const g of editorGroups.list.slice(1)) {
			expect(paths(editorGroups.tabsOf(g.id))).toEqual(['/w/b.tex']);
			expect(editorGroups.activeOf(g.id)?.path).toBe('/w/b.tex');
		}
		// each keeps its own tabs as focus moves, and a rename in the tree reaches the parked ones
		const second = editorGroups.list[1].id;
		editorGroups.focus(second);
		expect(paths(tabs.list)).toEqual(['/w/b.tex']);
		expect(paths(editorGroups.tabsOf(first))).toEqual(['/w/a.tex', '/w/b.tex']);
		tabs.rename('/w/a.tex', '/w/c.tex');
		expect(paths(editorGroups.tabsOf(first))).toEqual(['/w/c.tex', '/w/b.tex']);
	});

	// the slot left behind shows this snapshot when focus comes back, until its file is drawn again
	it('snapshots the slot focus leaves with its own strip, not the one it hands over to', () => {
		editorGroups.setLayout('columns');
		const [first, second] = editorGroups.list.map((g) => g.id);
		editorGroups.focus(second, tab('/w/c.tex'));
		const left = editorGroups.list.find((g) => g.id === first);
		expect(paths((left?.frozen as { openTabs: Tab[] }).openTabs)).toEqual(['/w/a.tex', '/w/b.tex']);
	});

	it('closes a slot left empty once the slots with tabs fit a smaller layout, four to two to one', () => {
		editorGroups.setLayout('grid');
		const [first, second, third, fourth] = editorGroups.list.map((g) => g.id);
		editorGroups.empty(second);
		editorGroups.closeIfEmpty(second);
		expect(editorGroups.layout).toBe('grid');
		editorGroups.empty(fourth);
		editorGroups.closeIfEmpty(fourth);
		expect(editorGroups.layout).toBe('rows');
		expect(editorGroups.grid.map((g) => g.id)).toEqual([first, third]);
		editorGroups.focus(third);
		tabs.close(tabKey(tab('/w/b.tex')));
		editorGroups.closeIfEmpty(third);
		expect(editorGroups.layout).toBe('one');
		expect(editorGroups.focusedId).toBe(first);
	});

	// the split preview's divider drags the editors' one: a pixel position, held to the rows' least height
	it('moves the row divider to a height, never leaving a row under its least', () => {
		editorGroups.setLayout('rows');
		editorGroups.rowSizes = [400, 400];
		editorGroups.rowTops = [0, 401];
		editorGroups.moveRowDividerTo(500);
		expect(editorGroups.split.row).toBeCloseTo(500 / 800);
		editorGroups.moveRowDividerTo(700);
		expect(editorGroups.split.row).toBeCloseTo(560 / 800);
	});

	it('hands the tabs of the slots that go to the first slot, each once, also from the focused one', () => {
		editorGroups.setLayout('grid');
		const [first, , third, fourth] = editorGroups.list.map((g) => g.id);
		editorGroups.focus(third, tab('/w/c.tex'));
		editorGroups.focus(fourth, tab('/w/d.tex'));
		editorGroups.setLayout('columns');
		expect(editorGroups.list).toHaveLength(2);
		expect(editorGroups.focusedId).toBe(first);
		expect(paths(tabs.list)).toEqual(['/w/a.tex', '/w/b.tex', '/w/c.tex', '/w/d.tex']);
		expect(paths(editorGroups.tabsOf(editorGroups.list[1].id))).toEqual(['/w/b.tex']);
	});
});

describe('an editor in a window of its own', () => {
	it('keeps the folder on the main window while it has focus, and gives focus back when it closes', () => {
		const home = editorGroups.focusedId;
		const id = editorGroups.addWindow(tab('/w/c.tex'), 'visual', { x: 0, y: 0 });
		editorGroups.focus(id);
		expect(paths(tabs.list)).toEqual(['/w/c.tex']);
		// the folder reopens with the main window's tabs, and the window is no slot of the layout
		expect(paths(tabs.persistedList?.() ?? [])).toEqual(['/w/a.tex', '/w/b.tex']);
		expect(editorGroups.grid.map((g) => g.id)).toEqual([home]);
		editorGroups.removeWindow(id);
		expect(editorGroups.focusedId).toBe(home);
		expect(editorGroups.list).toHaveLength(1);
		expect(paths(tabs.list)).toEqual(['/w/a.tex', '/w/b.tex']);
		expect(tabs.persistedList?.()).toBeNull();
	});

	it('opens a file it jumps to in the main window, keeping its own', () => {
		const home = editorGroups.focusedId;
		const id = editorGroups.addWindow(tab('/w/c.tex'), 'visual', { x: 0, y: 0 });
		editorGroups.focus(id);
		openFile('/w/a.tex');
		expect(editorGroups.focusedId).toBe(home);
		expect(activeFilePath.current).toBe('/w/a.tex');
		expect(paths(editorGroups.tabsOf(id))).toEqual(['/w/c.tex']);
	});
});
