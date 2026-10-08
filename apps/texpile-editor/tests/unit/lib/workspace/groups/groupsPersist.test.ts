// @vitest-environment jsdom
// The editor layout kept with the folder, and the free row of groups an earlier build kept there
import { beforeEach, describe, expect, it } from 'vitest';
import { updateFolder } from '$lib/storage/workspaces';
import { loadGroups } from '$lib/workspace/groups/groupsPersist';

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
