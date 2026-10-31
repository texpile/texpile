// @vitest-environment jsdom
// The editor layout kept with the folder, and the free row of groups an earlier build kept there
import { beforeEach, describe, expect, it } from 'vitest';
import { updateFolder } from '$lib/storage/workspaces';
import { loadGroups, saveGroups } from '$lib/workspace/groups/groupsPersist';

const root = '/w';

beforeEach(() => localStorage.clear());

describe('loadGroups', () => {
	it('reads a saved row of groups as two side by side, keeping the focused one', () => {
		updateFolder(root, (d) => {
			(d as { groups?: unknown }).groups = [
				{ share: 1, tabs: ['a.tex'], active: 0, mode: 'source' },
				{ share: 2, tabs: ['b.tex', 'c.tex'], active: 1, mode: 'visual' },
				{ focused: true, share: 1 }
			];
		});
		const restored = loadGroups(root);
		expect(restored?.layout).toBe('columns');
		expect(restored?.slots).toEqual([
			{ focused: false, tabs: [{ path: '/w/a.tex' }], active: { path: '/w/a.tex' }, mode: 'source' },
			{ focused: true, mode: 'visual' }
		]);
		expect(restored?.split.column).toBeCloseTo(0.5);
	});
});

describe('saveGroups', () => {
	it('brings back the tab that was active past a figure tab, and a figure as its file', () => {
		const tabs = [{ path: '/w/main.tex' }, { path: '/w/main.tex', figure: '1' }, { path: '/w/intro.tex' }];
		const save = (active: (typeof tabs)[number]) =>
			saveGroups(root, 'columns', { column: 0.5, row: 0.5 }, [
				{ focused: false, tabs, active, mode: 'visual' },
				{ focused: true, tabs: [], active: null, mode: 'visual' }
			]);
		save(tabs[2]);
		expect(loadGroups(root)?.slots[0]).toMatchObject({ active: { path: '/w/intro.tex' } });
		save(tabs[1]);
		expect(loadGroups(root)?.slots[0]).toMatchObject({ active: { path: '/w/main.tex' } });
	});
});
