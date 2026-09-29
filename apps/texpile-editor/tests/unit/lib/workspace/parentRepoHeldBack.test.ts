// @vitest-environment jsdom
// A repository above the open folder is not used until the author agrees, as VS Code opens none
// (git.openRepositoryInParentFolders): the tree, the badge and the margin stay plain meanwhile.
import { it, expect, vi, beforeEach } from 'vitest';

const status = {
	ok: true,
	repoRoot: '/home/ada',
	branch: 'main',
	tracking: 'origin/main',
	head: 'abc',
	entries: [{ path: '/home/ada/thesis/main.tex', x: ' ', y: 'M' }]
};
vi.mock('$lib/workspace/scm/git', async (orig) => ({
	...(await orig<Record<string, unknown>>()),
	gitStatus: vi.fn(async () => status),
	gitLog: vi.fn(async () => ({ ok: true, entries: [] }))
}));

const store = await import('$lib/workspace/scm/gitStore');
const { useParentRepo } = await import('$lib/workspace/parentRepo.svelte');

beforeEach(() => localStorage.clear());

it('shows nothing from a parent repository until the author says to use it', async () => {
	await store.refreshGitStatus('/home/ada/thesis');
	expect(store.isGitRepo.current).toBe(true);
	expect(store.gitHeldBack.current).toBe(true);
	expect(store.gitChanges.current).toEqual([]);
	expect(store.gitStatusMap.current).toEqual({});
	expect(store.gitTracking.current).toBeNull();

	useParentRepo('/home/ada/thesis', '/home/ada');
	await store.refreshGitStatus('/home/ada/thesis');
	expect(store.gitHeldBack.current).toBe(false);
	expect(store.gitChanges.current).toHaveLength(1);
	expect(store.gitTracking.current).toBe('origin/main');
});
