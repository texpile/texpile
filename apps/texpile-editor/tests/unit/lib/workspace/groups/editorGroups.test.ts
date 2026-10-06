// The editor groups: each keeps its own tabs while focus moves between them, and a group that goes gives
// its width to the one beside it
import { beforeEach, describe, expect, it } from 'vitest';
import { editorGroups } from '$lib/workspace/groups/editorGroups.svelte';
import { tabs, type Tab } from '$lib/workspace/tabs.svelte';
import { activeFilePath } from '$lib/workspace/workspaceStore';

const tab = (path: string): Tab => ({ path });

beforeEach(() => {
	tabs.bind(null, false);
	editorGroups.attach({
		capture: () => ({ loadedPath: activeFilePath.current }),
		activeTab: () => (activeFilePath.current ? tab(activeFilePath.current) : null),
		mode: () => 'visual',
		enter: (t) => (activeFilePath.current = t?.path ?? null),
		beforeSplit: () => {}
	});
	editorGroups.restore(null);
	tabs.noteOpened('/w/a.tex');
	tabs.keep('/w/a.tex');
	tabs.noteOpened('/w/b.tex');
	activeFilePath.current = '/w/b.tex';
});

describe('editor groups', () => {
	it('keeps each group its own tabs as focus moves between them', () => {
		const first = editorGroups.focusedId;
		editorGroups.splitRight();
		const second = editorGroups.focusedId;
		expect(tabs.list.map((t) => t.path)).toEqual(['/w/b.tex']);
		editorGroups.focus(first);
		expect(tabs.list.map((t) => t.path)).toEqual(['/w/a.tex', '/w/b.tex']);
		expect(editorGroups.tabsOf(second).map((t) => t.path)).toEqual(['/w/b.tex']);
		// a rename in the tree reaches the parked group's strip too
		tabs.rename('/w/b.tex', '/w/c.tex');
		expect(editorGroups.tabsOf(second).map((t) => t.path)).toEqual(['/w/c.tex']);
	});

	it('gives a closed group its width back to the one beside it, also when it was the focused one', () => {
		editorGroups.splitRight();
		editorGroups.close(editorGroups.focusedId);
		expect(editorGroups.list).toHaveLength(1);
		expect(editorGroups.list[0].share).toBe(1);
	});
});
