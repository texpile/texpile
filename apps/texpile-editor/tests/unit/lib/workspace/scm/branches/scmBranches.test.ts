// Switch branch, from the command palette. A switch refused over unsaved work: the author is offered
// to save it as a version on this branch first, and the switch is tried again. What goes in is what
// the panel has staged: build output and what the author unstaged are left out, as Commit leaves
// them out. The palette has closed by then, so the outcome is a notice.
import { it, expect, vi, beforeEach } from 'vitest';

const gitSwitch = vi.fn(async (_root: string, _name: string) => ({ ok: true, branch: 'draft' }) as object);
const promptAsk = vi.fn(async (_o: unknown) => 'save' as string | null);
const gitChanges = {
	current: [
		{ path: '/p/main.tex', x: ' ', y: 'M' },
		{ path: '/p/notes.tex', x: '?', y: '?' },
		{ path: '/p/main.aux', x: '?', y: '?' }
	]
};

const toastGitFailure = vi.fn();
const success = vi.fn();

vi.mock('$lib/workspace/scm/branches/gitBranches', () => ({ gitSwitch, gitBranches: vi.fn() }));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	refreshGitStatus: vi.fn(),
	refreshGitHistory: vi.fn(),
	gitOperation: { current: null },
	gitChanges,
	gitBranch: { current: 'main' }
}));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: '/p' } }));
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success, error: vi.fn() } }));
vi.mock('$lib/workspace/scm/gitFailureToast', () => ({ toastGitFailure }));

const { ScmBranches } = await import('$lib/workspace/scm/branches/scmBranches.svelte');
const { scmDraftFor } = await import('$lib/workspace/scm/actions/scmDraft.svelte');

function make() {
	const host = { busy: false, commit: vi.fn(async (_m: string, _p: string[], _root: string) => true) };
	const deps = {
		getLoadedPath: () => null,
		hasPendingSave: () => false,
		flushPendingSave: async () => {},
		refreshTree: async () => {},
		loadFile: async () => {},
		readTextIfPresent: async () => null,
		isDiffMode: () => false,
		captureDiffSnapshot: () => {}
	};
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- only what change() reads
	return { branches: new ScmBranches(host, deps as any), host };
}

beforeEach(() => {
	vi.clearAllMocks();
	scmDraftFor('/p').excluded = [];
});

it('offers to save the work first, then switches', async () => {
	gitSwitch.mockResolvedValueOnce({ ok: false, failure: 'dirty', files: ['/p/main.tex'] });
	const { branches, host } = make();
	await branches.switchTo('draft');
	expect((promptAsk.mock.calls[0][0] as { message: string }).message).toContain('main.tex');
	// what the panel has staged, build output left out, under a message that says why, in this folder
	expect(host.commit).toHaveBeenCalledWith('WIP before checkout to draft', ['/p/main.tex', '/p/notes.tex'], '/p');
	expect(gitSwitch).toHaveBeenCalledTimes(2);
	expect(host.busy).toBe(false);
	expect(success).toHaveBeenCalledWith({ title: 'Switched to branch "draft"' });
	expect(toastGitFailure).not.toHaveBeenCalled();
});

it('leaves an unstaged file for the checkout to carry over, unless it is in the way', async () => {
	scmDraftFor('/p').excluded = ['/p/notes.tex', '/p/main.tex'];
	gitSwitch.mockResolvedValueOnce({ ok: false, failure: 'dirty', files: ['/p/main.tex'] });
	const { branches, host } = make();
	await branches.switchTo('draft');
	expect(host.commit).toHaveBeenCalledWith('WIP before checkout to draft', ['/p/main.tex'], '/p');
});

it('switches nothing when the author declines, or the save fails', async () => {
	const { branches, host } = make();
	gitSwitch.mockResolvedValueOnce({ ok: false, failure: 'dirty', files: ['/p/main.tex'] });
	promptAsk.mockResolvedValueOnce('cancel');
	await branches.switchTo('draft');
	expect(host.commit).not.toHaveBeenCalled();

	gitSwitch.mockResolvedValueOnce({ ok: false, failure: 'dirty', files: ['/p/main.tex'] });
	host.commit.mockResolvedValueOnce(false);
	await branches.switchTo('draft');
	expect(gitSwitch).toHaveBeenCalledTimes(2);
	// backing out is not a failure to report
	expect(toastGitFailure).not.toHaveBeenCalled();
	expect(success).not.toHaveBeenCalled();
});

it('says why a switch did not happen, in a notice', async () => {
	const { branches } = make();
	gitSwitch.mockResolvedValueOnce({ ok: false, failure: 'busy' });
	await branches.switchTo('draft');
	expect(toastGitFailure).toHaveBeenCalledWith(
		'Could not switch branches',
		'A merge, rebase, cherry-pick or revert is in progress. Continue or abort it first.',
		{}
	);
	expect(success).not.toHaveBeenCalled();
});
