// Another folder opened while a Sync waits on the network: the refresh Sync queued for its own
// folder used to replace the new folder's, and the panel then showed the old folder's branch,
// changes and history, with its paths behind every row action.
import { it, expect, vi } from 'vitest';

const workspaceRoot = { current: '/A' as string | null };
const statusOf: Record<string, object> = {
	'/A': {
		ok: true,
		branch: 'thesis-a',
		tracking: 'origin/thesis-a',
		head: 'aaa',
		hasCommits: true,
		repoRoot: '/A',
		entries: [{ path: '/A/new.tex', x: '?', y: '?' }]
	},
	'/B': { ok: true, branch: 'main', tracking: 'origin/main', head: 'bbb', hasCommits: true, repoRoot: '/B', entries: [] }
};
let releaseSync!: () => void;
vi.mock('$lib/workspace/scm/git', () => ({
	gitStatus: vi.fn(async (root: string) => statusOf[root]),
	gitLog: vi.fn(async (root: string) => ({
		ok: true,
		entries: [{ hash: root, short: root, subject: `history of ${root}`, author: 'x', date: '', parentCount: 1 }]
	})),
	gitIdentity: vi.fn(async () => ({ name: 'A', email: 'a@b.c' })),
	gitSync: vi.fn(
		() =>
			new Promise((resolve) => {
				releaseSync = () => resolve({ ok: true, remote: 'origin', pulled: 0, pushed: 1 });
			})
	),
	gitInit: vi.fn(),
	gitStage: vi.fn(),
	gitUnstage: vi.fn(),
	gitCommit: vi.fn(),
	gitRestore: vi.fn(),
	gitChangesSince: vi.fn(),
	gitSetIdentity: vi.fn(),
	gitRemotes: vi.fn(),
	gitAddRemote: vi.fn(),
	gitPublish: vi.fn(),
	githubPublish: vi.fn(),
	gitRecheck: vi.fn()
}));
vi.mock('$lib/workspace/scm/gitDialogs.svelte', () => ({ askIdentity: vi.fn(), askPublish: vi.fn() }));
vi.mock('$lib/workspace/scm/actions/scmAutoCheck.svelte', () => ({ autoCheckDone: async () => {}, resumeAutoCheck: () => {} }));
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk: vi.fn(), confirmAsk: vi.fn(async () => true) }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot }));

const { ScmActions } = await import('$lib/workspace/scm/actions/scmActions.svelte');
const store = await import('$lib/workspace/scm/gitStore');

it('after Sync in A ends, the store describes B, the folder that is open', async () => {
	await store.refreshGitStatus('/A');
	const scm = new ScmActions({
		getLoadedPath: () => null,
		discardPendingSave: () => {},
		hasPendingSave: () => false,
		flushPendingSave: async () => {},
		trashEntry: async () => 'trashed',
		removeEntry: async () => {},
		refreshTree: async () => {},
		loadFile: async () => {},
		captureDiffSnapshot: () => {},
		isDiffMode: () => false,
		openCompareTab: () => {},
		openAtLine: () => {},
		settleConflicts: () => {},
		ignoreLines: () => [],
		writeText: async () => {},
		readTextIfPresent: async () => null
	});
	const syncing = scm.sync();
	await new Promise((r) => setTimeout(r, 0));
	// File > Open Recent > B: FolderLifecycle.open flips the root and refreshTree() reads git status
	workspaceRoot.current = '/B';
	await store.refreshGitStatus('/B');
	releaseSync();
	await syncing;
	await new Promise((r) => setTimeout(r, 10));
	expect(store.gitBranch.current).toBe('main');
});
