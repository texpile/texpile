// What the panel does around a merge: Sync's offer to combine, and the Finish and Cancel that end
// it. The git side is covered live in gitCombineLive.test.ts; this is the order things happen in,
// which is where a half-written choice gets saved into the merge or thrown away with it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GitSyncResult } from '$lib/workspace/scm/git';

const gitCombine = vi.fn(
	async (_root: string, _message?: string) => ({ ok: true, with: 'origin/main', conflicts: ['C:/project/main.tex'] }) as object
);
const gitFinishCombine = vi.fn(async (_root: string) => ({ ok: true }) as object);
const gitCancelCombine = vi.fn(async (_root: string) => ({ ok: true }));
const promptAsk = vi.fn(async (_o: unknown) => 'combine' as string | null);
const confirmAsk = vi.fn(async (_message: string, _opts?: unknown) => true);
const toaster = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const gitChanges = { current: [] as { path: string; x: string; y: string; markers?: boolean }[] };
const order: string[] = [];

vi.mock('$lib/workspace/scm/branches/gitCombine', () => ({ gitCombine, gitFinishCombine, gitCancelCombine }));
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk, promptAsk }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster }));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	refreshGitStatus: vi.fn(async () => {
		order.push('status');
		return {};
	}),
	refreshGitHistory: vi.fn(),
	gitChanges,
	gitTracking: { current: 'origin/main' },
	isConflicted: (x: string, y: string) => x === 'U' || y === 'U'
}));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: 'C:/project' } }));

const { ScmCombine } = await import('$lib/workspace/scm/branches/scmCombine.svelte');

const MARKED = 'Intro.\n<<<<<<< HEAD\nMine.\n=======\nTheirs.\n>>>>>>> origin/main\n';

function make(opts: { loaded?: string | null; pending?: boolean; disk?: Record<string, string> } = {}) {
	const host = { busy: false, ensureIdentity: vi.fn(async () => true), openDiff: vi.fn() };
	const deps = {
		getLoadedPath: () => opts.loaded ?? null,
		discardPendingSave: vi.fn(() => void order.push('discard')),
		hasPendingSave: () => opts.pending ?? false,
		flushPendingSave: vi.fn(async () => void order.push('flush')),
		trashEntry: async () => 'trashed' as const,
		removeEntry: async () => {},
		refreshTree: vi.fn(async () => {}),
		loadFile: vi.fn(async (p: string) => void order.push(`load ${p}`)),
		captureDiffSnapshot: () => {},
		isDiffMode: () => false,
		openCompareTab: () => {},
		openAtLine: vi.fn(),
		settleConflicts: vi.fn(),
		ignoreLines: () => [],
		writeText: async () => {},
		readTextIfPresent: async (p: string) => opts.disk?.[p] ?? null
	};
	return { combine: new ScmCombine(host, deps), host, deps };
}

const CONFLICT: GitSyncResult = { ok: false, failure: 'conflict', remote: 'origin', files: ['main.tex'] };

beforeEach(() => {
	vi.clearAllMocks();
	order.length = 0;
	gitChanges.current = [];
	gitFinishCombine.mockImplementation(async () => {
		order.push('finish');
		return { ok: true };
	});
	gitCancelCombine.mockImplementation(async () => {
		order.push('cancel');
		return { ok: true };
	});
});

describe("Sync's offer to combine", () => {
	it('names the file both changed, and on yes opens it at the first marked place', async () => {
		const { combine, deps } = make({ loaded: 'C:/project/main.tex', disk: { 'C:/project/main.tex': MARKED } });
		await combine.offer('C:/project', CONFLICT);

		expect((promptAsk.mock.calls[0][0] as { message: string }).message).toBe(
			'There are merge conflicts with "origin" in "main.tex". Would you like to merge and resolve them?'
		);
		// no message of its own: git writes the merge commit's, as under VS Code's Sync
		expect(gitCombine).toHaveBeenCalledWith('C:/project');
		// the open file is read again from disk, markers and all, before anyone is sent to it
		expect(order).toContain('load C:/project/main.tex');
		expect(deps.openAtLine).toHaveBeenCalledWith('C:/project/main.tex', 2);
		expect(toaster.info).toHaveBeenCalled();
	});

	it('leaves the project alone when the answer is not now', async () => {
		promptAsk.mockResolvedValueOnce('later');
		const { combine, deps } = make();
		await combine.offer('C:/project', CONFLICT);
		expect(gitCombine).not.toHaveBeenCalled();
		expect(deps.loadFile).not.toHaveBeenCalled();
	});

	it('opens the comparison for a file one side deleted, which has no marked place', async () => {
		const { combine, host, deps } = make();
		await combine.offer('C:/project', CONFLICT);
		expect(deps.openAtLine).not.toHaveBeenCalled();
		expect(host.openDiff).toHaveBeenCalledWith('C:/project/main.tex');
	});
});

describe('finishing', () => {
	it('writes the last choice to disk before git reads the files', async () => {
		const { combine, host, deps } = make({ pending: true });
		await combine.finish();
		expect(order.slice(0, 2)).toEqual(['flush', 'finish']);
		expect(toaster.success).toHaveBeenCalled();
		// the open file's bar about choosing places goes with the merge
		expect(deps.settleConflicts).toHaveBeenCalled();
		expect(host.busy).toBe(false);
	});

	it('names what is still marked, and takes the author there', async () => {
		gitFinishCombine.mockResolvedValueOnce({ ok: false, failure: 'markers', files: ['C:/project/main.tex'] });
		const { combine, deps, host } = make({ disk: { 'C:/project/main.tex': MARKED } });
		await combine.finish();
		expect(toaster.warning).toHaveBeenCalledWith(expect.objectContaining({ description: 'main.tex' }));
		expect(deps.openAtLine).toHaveBeenCalledWith('C:/project/main.tex', 2);
		expect(deps.settleConflicts).not.toHaveBeenCalled();
		expect(host.busy).toBe(false);
	});

	it('does nothing without a name and email to save the merge under', async () => {
		const { combine, host } = make();
		host.ensureIdentity.mockResolvedValueOnce(false);
		await combine.finish();
		expect(gitFinishCombine).not.toHaveBeenCalled();
		expect(host.busy).toBe(false);
	});
});

describe('cancelling', () => {
	it('throws away a choice not yet written in a file the merge touched, so it cannot land afterwards', async () => {
		gitChanges.current = [{ path: 'C:/project/main.tex', x: 'U', y: 'U', markers: false }];
		const { combine } = make({ loaded: 'C:/project/main.tex', pending: true });
		await combine.cancel();
		expect(order.slice(0, 2)).toEqual(['discard', 'cancel']);
		expect(order).toContain('load C:/project/main.tex');
	});

	it('keeps an edit to a file the merge never touched', async () => {
		gitChanges.current = [{ path: 'C:/project/main.tex', x: 'U', y: 'U', markers: true }];
		const { combine, deps } = make({ loaded: 'C:/project/notes.tex', pending: true });
		await combine.cancel();
		expect(deps.discardPendingSave).not.toHaveBeenCalled();
		expect(order.slice(0, 2)).toEqual(['flush', 'cancel']);
	});

	it('asks first, and does nothing when the author keeps combining', async () => {
		confirmAsk.mockResolvedValueOnce(false);
		const { combine } = make();
		await combine.cancel();
		expect(gitCancelCombine).not.toHaveBeenCalled();
	});
});
