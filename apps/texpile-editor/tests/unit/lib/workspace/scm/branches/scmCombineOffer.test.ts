// Combine now, from the question Sync asks after a conflict: it runs inside Sync's busy window,
// where status reads wait, so it used to choose the file to open from the status before the merge
// and could open a figure instead of the text with places to choose. Real gitStore, ScmActions and
// ScmCombine; git itself is stood in for.
import { it, expect, vi } from 'vitest';

const ROOT = '/p';
// what `git status` says: before the merge the tree is clean; after gitCombine, a binary conflict
// (figure.png, which status marks choose:'binary') and a text conflict (main.tex)
let merged = false;
const gitStatus = vi.fn(async (_root: string) => ({
	ok: true,
	branch: 'main',
	tracking: 'origin/main',
	head: 'abc',
	hasCommits: true,
	operation: merged ? 'merge' : null,
	repoRoot: ROOT,
	entries: merged
		? [
				{ path: '/p/figure.png', x: 'U', y: 'U', markers: true, choose: 'binary' },
				{ path: '/p/main.tex', x: 'U', y: 'U', markers: true }
			]
		: []
}));

vi.mock('$lib/workspace/scm/git', () => ({
	gitStatus,
	gitLog: vi.fn(async () => ({ ok: true, entries: [] })),
	gitInit: vi.fn(),
	gitStage: vi.fn(),
	gitUnstage: vi.fn(),
	gitCommit: vi.fn(),
	gitRestore: vi.fn(),
	gitChangesSince: vi.fn(),
	gitIdentity: vi.fn(async () => ({ name: 'A', email: 'a@b.c' })),
	gitSetIdentity: vi.fn(),
	gitRemotes: vi.fn(),
	gitAddRemote: vi.fn(),
	gitPublish: vi.fn(),
	gitSync: vi.fn(async () => ({ ok: false, failure: 'conflict', remote: 'origin', files: ['figure.png', 'main.tex'] })),
	githubPublish: vi.fn(),
	gitRecheck: vi.fn()
}));
vi.mock('$lib/workspace/scm/branches/gitCombine', () => ({
	gitCombine: vi.fn(async () => {
		merged = true;
		return { ok: true, with: 'origin/main', conflicts: ['/p/figure.png', '/p/main.tex'] };
	}),
	gitFinishCombine: vi.fn(),
	gitCancelCombine: vi.fn(),
	gitKeepSide: vi.fn()
}));
vi.mock('$lib/workspace/scm/gitDialogs.svelte', () => ({ askIdentity: vi.fn(), askPublish: vi.fn() }));
vi.mock('$lib/workspace/scm/actions/scmAutoCheck.svelte', () => ({ autoCheckDone: async () => {}, resumeAutoCheck: () => {} }));
const promptAsk = vi.fn(async () => 'combine');
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk, confirmAsk: vi.fn(async () => true) }));
const toaster = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster }));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: '/p' } }));

const { ScmActions } = await import('$lib/workspace/scm/actions/scmActions.svelte');
const store = await import('$lib/workspace/scm/gitStore');

it('Combine now opens the text conflict, not the figure whose row asks which version to keep', async () => {
	await store.refreshGitStatus(ROOT); // the panel's status before Sync: clean
	const openAtLine = vi.fn();
	const openCompareTab = vi.fn();
	const disk: Record<string, string> = {
		'/p/figure.png': '\u0089PNG\r\n\u001a\n\u0000\u0000binary',
		'/p/main.tex': 'a\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> origin/main\n'
	};
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
		openCompareTab,
		openAtLine,
		settleConflicts: () => {},
		ignoreLines: () => [],
		writeText: async () => {},
		readTextIfPresent: async (p) => disk[p] ?? null
	});
	await scm.sync();
	// the status read inside offer() was deferred: while offer ran gitChanges was the clean pre-merge list
	expect(openAtLine).toHaveBeenCalledWith('/p/main.tex', 2);
});
