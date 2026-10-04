// Source Control's writes against the author's timing: another folder opened while a Sync waited on
// the network, a held Ctrl+Enter, a double click on Publish Branch. Each used to act twice, or on
// the wrong folder.
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Entry = { path: string; x: string; y: string };
const gitSync = vi.fn(async (_root: string): Promise<Record<string, unknown>> => ({ ok: true }));
const gitStage = vi.fn(async (_root: string, _paths: string[]) => ({ ok: true }));
const gitCommit = vi.fn(async (_root: string, _message: string) => ({ ok: true }));
const gitRemotes = vi.fn(async (_root: string) => ({ ok: true, remotes: [{ name: 'origin', url: 'u' }] }));
const gitPublish = vi.fn(async (_root: string, _remote: string) => ({ ok: true, remote: 'origin' }));
vi.mock('$lib/workspace/scm/git', () => ({
	gitInit: vi.fn(),
	gitStage,
	gitUnstage: vi.fn(async () => ({ ok: true })),
	gitCommit,
	gitRestore: vi.fn(),
	gitChangesSince: vi.fn(),
	gitIdentity: vi.fn(async () => ({ name: 'Ada', email: 'ada@example.com' })),
	gitSetIdentity: vi.fn(),
	gitRemotes,
	gitAddRemote: vi.fn(),
	gitPublish,
	gitSync,
	githubPublish: vi.fn(),
	gitRecheck: vi.fn()
}));
const gitCombine = vi.fn(async () => ({ ok: true, conflicts: [] }));
vi.mock('$lib/workspace/scm/branches/gitCombine', () => ({
	gitCombine,
	gitFinishCombine: vi.fn(),
	gitCancelCombine: vi.fn(),
	gitKeepSide: vi.fn()
}));

const gitChanges = { current: [] as Entry[] };
const refreshGitStatus = vi.fn(async (_root: string | null, _own?: boolean) => ({ missingGit: false }));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	refreshGitStatus,
	refreshGitHistory: vi.fn(),
	isGitRepo: { current: true },
	isConflicted: () => false,
	isNewFile: (c: { x: string }) => c.x === '?',
	gitChanges,
	gitBranch: { current: 'main' },
	gitHasCommits: { current: true },
	gitOperation: { current: null },
	gitRunning: { current: null },
	setGitWriting: vi.fn()
}));
const workspaceRoot = { current: '/a' as string | null };
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot }));
vi.mock('$lib/workspace/scm/gitDialogs.svelte', () => ({ askIdentity: vi.fn(), askPublish: vi.fn() }));
vi.mock('$lib/workspace/scm/actions/scmAutoCheck.svelte', () => ({ autoCheckDone: async () => {}, resumeAutoCheck: () => {} }));
const promptAsk = vi.fn(async (_o: unknown) => 'save' as string);
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk, confirmAsk: vi.fn(async () => true) }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
const toastGitFailure = vi.fn();
vi.mock('$lib/workspace/scm/gitFailureToast', () => ({ toastGitFailure }));

const { ScmActions } = await import('$lib/workspace/scm/actions/scmActions.svelte');
type ScmDeps = ConstructorParameters<typeof ScmActions>[0];

function makeScm(opts: { pending?: boolean; loaded?: string } = {}, deps: Partial<ScmDeps> = {}) {
	return new ScmActions({
		getLoadedPath: () => opts.loaded ?? null,
		discardPendingSave: () => {},
		hasPendingSave: () => opts.pending ?? false,
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
		readTextIfPresent: async () => null,
		...deps
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	workspaceRoot.current = '/a';
	gitChanges.current = [];
	refreshGitStatus.mockImplementation(async () => ({ missingGit: false }));
});

describe('a Sync that ends after another folder was opened', () => {
	// B's changes were committed as "WIP before sync", and B synced
	it('neither commits nor syncs the folder open now over unsaved work, and says why', async () => {
		gitChanges.current = [{ path: '/b/chapter.tex', x: ' ', y: 'M' }];
		gitSync.mockImplementationOnce(async () => {
			workspaceRoot.current = '/b';
			return { ok: false, failure: 'dirty', remote: 'origin', files: ['/a/main.tex'] };
		});
		await makeScm().sync();
		expect(promptAsk).not.toHaveBeenCalled();
		expect(gitCommit).not.toHaveBeenCalled();
		expect(gitSync).toHaveBeenCalledTimes(1);
		expect(toastGitFailure).toHaveBeenCalledOnce();
	});

	// a real merge started in A, and A's file opened in B's editor
	it('starts no merge over a conflict', async () => {
		gitSync.mockImplementationOnce(async () => {
			workspaceRoot.current = '/b';
			return { ok: false, failure: 'conflict', remote: 'origin', files: ['main.tex'] };
		});
		await makeScm().sync();
		expect(promptAsk).not.toHaveBeenCalled();
		expect(gitCombine).not.toHaveBeenCalled();
		expect(toastGitFailure).toHaveBeenCalledOnce();
	});

	it('still commits in its own folder, and syncs it again, when nothing was switched', async () => {
		gitChanges.current = [{ path: '/a/main.tex', x: ' ', y: 'M' }];
		gitSync.mockResolvedValueOnce({ ok: false, failure: 'dirty', remote: 'origin', files: ['/a/main.tex'] });
		await makeScm().sync();
		expect(gitStage).toHaveBeenCalledWith('/a', ['/a/main.tex']);
		expect(gitCommit.mock.calls[0][0]).toBe('/a');
		expect(gitSync.mock.calls.map((c) => c[0])).toEqual(['/a', '/a']);
	});

	it('does not sync again once another folder was opened during the commit', async () => {
		gitChanges.current = [{ path: '/a/main.tex', x: ' ', y: 'M' }];
		gitSync.mockResolvedValueOnce({ ok: false, failure: 'dirty', remote: 'origin', files: ['/a/main.tex'] });
		gitCommit.mockImplementationOnce(async () => {
			workspaceRoot.current = '/b';
			return { ok: true };
		});
		await makeScm().sync();
		// committed where it began, and nothing sent from the folder open now
		expect(gitCommit.mock.calls[0][0]).toBe('/a');
		expect(gitSync).toHaveBeenCalledTimes(1);
	});
});

// a reload after the pull took the typing out of the editor, and the autosave still queued then
// wrote it over the versions that came in
describe('typing while a Sync waits on the network', () => {
	function typingDuringSync(pulledOverTyping: boolean) {
		let pending = false;
		const loadFile = vi.fn(async (_path: string) => {});
		const flushPendingSave = vi.fn(async () => {
			// the save guard turns the write away when git rewrote the file under it
			if (!pulledOverTyping) pending = false;
		});
		gitSync.mockImplementationOnce(async () => {
			pending = true;
			return { ok: true, remote: 'origin', pulled: 1, pushed: 0 };
		});
		const scm = makeScm({ loaded: '/a/main.tex' }, { hasPendingSave: () => pending, flushPendingSave, loadFile });
		return { scm, loadFile, flushPendingSave };
	}

	it('writes the typing through the save guard instead of reloading over it', async () => {
		const { scm, loadFile, flushPendingSave } = typingDuringSync(true);
		await scm.sync();
		expect(flushPendingSave).toHaveBeenCalledOnce();
		expect(loadFile).not.toHaveBeenCalled();
	});

	it('still reloads the file once the typing is on disk', async () => {
		const { scm, loadFile } = typingDuringSync(false);
		await scm.sync();
		expect(loadFile).toHaveBeenCalledWith('/a/main.tex');
	});
});

describe('one commit at a time', () => {
	// the open file's edit, written out mid-commit: the status read after it let go of busy, and a
	// repeated Ctrl+Enter started a second commit in that moment
	it('keeps busy through the status read in the middle, and a second commit does nothing', async () => {
		const scm = makeScm({ pending: true, loaded: '/a/intro.tex' });
		const busyAtRead: boolean[] = [];
		let second: Promise<boolean> | null = null;
		refreshGitStatus.mockImplementationOnce(async (_root, own) => {
			busyAtRead.push(scm.busy && !!own);
			second = scm.commit('Tighten the proof', ['/a/main.tex']);
			gitChanges.current = [{ path: '/a/intro.tex', x: ' ', y: 'M' }];
			return { missingGit: false };
		});
		expect(await scm.commit('Tighten the proof', ['/a/main.tex'])).toBe(true);
		expect(busyAtRead).toEqual([true]);
		expect(await second).toBe(false);
		expect(gitCommit).toHaveBeenCalledTimes(1);
		expect(gitStage).toHaveBeenCalledWith('/a', ['/a/main.tex', '/a/intro.tex']);
	});
});

describe('Publish Branch', () => {
	it('publishes once on a double click, while the remotes are still being read', async () => {
		let listed!: () => void;
		gitRemotes.mockImplementationOnce(
			() => new Promise((resolve) => (listed = () => resolve({ ok: true, remotes: [{ name: 'origin', url: 'u' }] })))
		);
		const scm = makeScm();
		const first = scm.publish();
		const second = scm.publish();
		listed();
		await Promise.all([first, second]);
		expect(gitPublish).toHaveBeenCalledTimes(1);
		expect(scm.busy).toBe(false);
	});
});
