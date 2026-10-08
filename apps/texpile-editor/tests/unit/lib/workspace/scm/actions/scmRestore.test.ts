// The panel hands the restore action a whole log entry, and it used to take a hash and a subject
// instead - so the entry arrived where the hash belonged and the subject was undefined. The dialog
// read `Restore "undefined"?` and the hash git received was an object.
//
// Types cannot catch this: the prop travels through `scm: Any` in WorkspaceChrome, which erases
// the signature all the way from the panel to here.
import { describe, it, expect, vi, beforeEach } from 'vitest';

// the parameters are spelled out so the assertions below can read mock.calls without TS deciding
// these take none
const gitRestore = vi.fn(async (_root: string, _hash: string, _message: string) => ({ ok: true }));
const gitCommit = vi.fn(async (_root: string, _message: string) => ({ ok: true }));
const gitStage = vi.fn(async (_root: string, _paths: string[]) => ({ ok: true }));
const gitUnstage = vi.fn(async (_root: string, _paths: string[]) => ({ ok: true }));
const gitDiscard = vi.fn(async (_root: string, _paths: string[]) => ({ ok: true }));
const confirmAsk = vi.fn(async (_message: string, _opts?: { confirmLabel?: string; detail?: string }) => true);
const gitIdentity = vi.fn(async (_root: string) => ({ name: 'Ada Lovelace' as string | null, email: 'ada@example.com' as string | null }));
const askIdentity = vi.fn(async (_current: { name: string; email: string }) => null as { name: string; email: string } | null);
const gitChanges = { current: [] as { path: string; x: string; y: string; markers?: boolean; from?: string }[] };
// as git answers when the restore rewrites every file that has changed; a test narrows it
const gitRestoreInTheWay = vi.fn(async (_root: string, _hash: string) => ({
	ok: true,
	files: gitChanges.current.filter((c) => c.x !== '?').map((c) => c.path)
}));

vi.mock('$lib/workspace/scm/git', () => ({
	gitInit: vi.fn(),
	gitStage,
	gitUnstage,
	gitDiscard,
	gitCommit,
	gitRestore,
	gitRestoreInTheWay,
	gitChangesSince: vi.fn(),
	gitPush: vi.fn(),
	// someone git already knows, unless a test says otherwise
	gitIdentity,
	gitSetIdentity: vi.fn(async () => ({ ok: true }))
}));
vi.mock('$lib/workspace/scm/gitDialogs.svelte', () => ({ askIdentity, askPublish: vi.fn() }));
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success: vi.fn(), error: vi.fn() } }));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	isConflicted: (x: string, y: string) => x === 'U' || y === 'U' || (x === y && (x === 'A' || x === 'D')),
	isNewFile: (c: { x: string }) => c.x === '?' || c.x === 'A',
	refreshGitStatus: vi.fn(),
	refreshGitHistory: vi.fn(),
	isGitRepo: { current: true },
	gitChanges,
	gitOperation: { current: null },
	gitRunning: { current: null },
	setGitWriting: vi.fn()
}));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: 'C:/project' }, isDirty: { current: false } }));

const { ScmActions } = await import('$lib/workspace/scm/actions/scmActions.svelte');

const flushed = vi.fn(async () => {});
const discarded = vi.fn();

function makeScm(
	opts: {
		pending?: boolean;
		loaded?: string;
		trash?: (p: string) => Promise<'trashed' | 'kept'>;
		remove?: (p: string) => Promise<void>;
		read?: (p: string) => Promise<string | null>;
		compareTab?: (path: string, compare: { hash: string; subject: string; path?: string }) => void;
		hasPending?: () => boolean;
		load?: (p: string) => Promise<void>;
	} = {}
) {
	return new ScmActions({
		getLoadedPath: () => opts.loaded ?? null,
		discardPendingSave: discarded,
		hasPendingSave: opts.hasPending ?? (() => opts.pending ?? false),
		flushPendingSave: flushed,
		trashEntry: opts.trash ?? (async () => 'trashed' as const),
		removeEntry: opts.remove ?? (async () => {}),
		refreshTree: async () => {},
		loadFile: opts.load ?? (async () => {}),
		captureDiffSnapshot: () => {},
		isDiffMode: () => false,
		openCompareTab: opts.compareTab ?? (() => {}),
		openAtLine: () => {},
		settleConflicts: () => {},
		ignoreLines: () => [],
		writeText: async () => {},
		readTextIfPresent: opts.read ?? (async () => null)
	});
}

const ENTRY = { hash: '9f3c1ab0', subject: 'Add the methods section' };

describe('restoring a version', () => {
	beforeEach(() => {
		gitRestore.mockClear();
		confirmAsk.mockClear();
	});

	it('names the version in the confirmation, rather than "undefined"', async () => {
		await makeScm().restore(ENTRY);
		const asked = String(confirmAsk.mock.calls[0]?.[0] ?? '');
		expect(asked).toContain(ENTRY.subject);
		expect(asked).not.toContain('undefined');
	});

	it('gives git the hash, not the entry it came in', async () => {
		await makeScm().restore(ENTRY);
		const [, hash, message] = gitRestore.mock.calls[0] as unknown as [string, string, string];
		expect(hash).toBe(ENTRY.hash);
		expect(message).toContain(ENTRY.subject);
	});

	it('does nothing when the confirmation is declined', async () => {
		confirmAsk.mockResolvedValueOnce(false as never);
		expect(await makeScm().restore(ENTRY)).toBe(false);
		expect(gitRestore).not.toHaveBeenCalled();
	});
});

// typed while the restore ran: the reload took it out of the editor, and the autosave still queued
// then wrote it over the restored file
describe('typing while a restore runs', () => {
	it('is written through the save guard instead of reloaded over', async () => {
		let pending = false;
		const load = vi.fn(async (_p: string) => {});
		flushed.mockClear();
		gitChanges.current = [];
		gitRestore.mockImplementationOnce(async () => {
			pending = true;
			return { ok: true };
		});
		expect(await makeScm({ loaded: 'C:/project/main.tex', hasPending: () => pending, load }).restore(ENTRY)).toBe(true);
		expect(flushed).toHaveBeenCalledOnce();
		expect(load).not.toHaveBeenCalled();
	});
});

// The restore itself refuses over unsaved work in a file it rewrites, so work already saved was never at risk. The edit
// still sitting in the buffer WAS: git cannot see it, and it used to be discarded outright.
describe('work that would be in the way', () => {
	beforeEach(() => {
		gitRestore.mockClear();
		gitCommit.mockClear();
		gitStage.mockClear();
		confirmAsk.mockClear();
		flushed.mockClear();
		discarded.mockClear();
		gitChanges.current = [];
	});

	it('is saved as its own version first, so it can be gone back to as well', async () => {
		gitChanges.current = [{ path: 'C:/project/main.tex', x: ' ', y: 'M' }];
		await makeScm().restore(ENTRY);

		expect(gitStage.mock.calls[0]?.[1]).toEqual(['C:/project/main.tex']);
		expect(gitCommit).toHaveBeenCalled();
		expect(gitRestore).toHaveBeenCalled();
	});

	it('counts the edit that never reached disk, and writes it out rather than dropping it', async () => {
		await makeScm({ pending: true }).restore(ENTRY);
		expect(flushed).toHaveBeenCalled();
		expect(discarded).not.toHaveBeenCalled();
	});

	it('writes nothing when the answer is no, so a cancelled restore has no side effect', async () => {
		confirmAsk.mockResolvedValueOnce(false as never);
		await makeScm({ pending: true }).restore(ENTRY);
		expect(flushed).not.toHaveBeenCalled();
		expect(gitCommit).not.toHaveBeenCalled();
	});

	it('leaves a changed file the restore does not rewrite uncommitted, and asks the plain question', async () => {
		// unticked to stay on this computer, and the same in the version being restored
		gitChanges.current = [{ path: 'C:/project/private.tex', x: ' ', y: 'M' }];
		gitRestoreInTheWay.mockResolvedValueOnce({ ok: true, files: [] });
		await makeScm().restore(ENTRY);

		expect(confirmAsk.mock.calls[0]?.[1]?.confirmLabel).toBe('Restore');
		expect(gitCommit).not.toHaveBeenCalled();
		expect(gitRestore).toHaveBeenCalled();
	});

	// gitRestore checks --untracked-files=no, so these neither block it nor belong in a version
	// the user never chose to track
	it('leaves untracked files alone', async () => {
		gitChanges.current = [{ path: 'C:/project/scratch.txt', x: '?', y: '?' }];
		await makeScm().restore(ENTRY);

		expect(gitCommit).not.toHaveBeenCalled();
		expect(gitRestore).toHaveBeenCalled();
	});

	it('asks the plain question when there is nothing in the way', async () => {
		await makeScm().restore(ENTRY);
		// the question, and under it (the detail line) that it can be undone
		expect(String(confirmAsk.mock.calls[0]?.[0] ?? '')).toMatch(/^Are you sure you want to restore /);
		expect(String(confirmAsk.mock.calls[0]?.[1]?.detail ?? '')).toContain('undo');
		expect(gitCommit).not.toHaveBeenCalled();
	});
});

// git refuses to write a version it cannot put a name and email on. Save version asked; Restore on
// a clean tree went straight to a commit, and so could fail with git's own "tell me who you are".
describe('who the version is by', () => {
	beforeEach(() => {
		gitRestore.mockClear();
		gitCommit.mockClear();
		askIdentity.mockClear();
		confirmAsk.mockClear();
		gitChanges.current = [];
	});

	it('restore asks for a name and email git does not have, and stops if the author backs out', async () => {
		gitIdentity.mockResolvedValueOnce({ name: null, email: null });
		expect(await makeScm().restore(ENTRY)).toBe(false);
		expect(askIdentity).toHaveBeenCalled();
		expect(gitRestore).not.toHaveBeenCalled();
	});

	it('does not ask when git already knows', async () => {
		await makeScm().restore(ENTRY);
		expect(askIdentity).not.toHaveBeenCalled();
		expect(gitRestore).toHaveBeenCalled();
	});
});

describe('saving a version', () => {
	beforeEach(() => {
		flushed.mockClear();
		gitStage.mockClear();
		gitCommit.mockClear();
	});

	// within autosave's delay (or while it is held off) the last edit is not on disk yet, and the version
	// would quietly leave it behind
	it('writes out an edit still waiting to be saved before building the version', async () => {
		const order: string[] = [];
		flushed.mockImplementationOnce(async () => void order.push('flush'));
		gitStage.mockImplementationOnce(async () => (order.push('stage'), { ok: true }));
		expect(await makeScm({ pending: true }).commit('Tighten the proof', ['C:/project/main.tex'])).toBe(true);
		expect(order).toEqual(['flush', 'stage']);
	});

	// the open file had no changes on disk, so it was not in the list the ticks were read from: its
	// waiting edit is what the author is saving, and it could not have been unticked
	it('takes in the open file once its waiting edit shows it changed', async () => {
		gitChanges.current = [];
		flushed.mockImplementationOnce(async () => {
			gitChanges.current = [{ path: 'C:/project/intro.tex', x: ' ', y: 'M' }];
		});
		await makeScm({ pending: true, loaded: 'C:/project/intro.tex' }).commit('Tighten the proof', ['C:/project/main.tex']);
		expect(gitStage.mock.calls.at(-1)?.[1]).toEqual(['C:/project/main.tex', 'C:/project/intro.tex']);
		gitChanges.current = [];
	});

	it('leaves the open file out when it was listed and the author unticked it', async () => {
		gitChanges.current = [{ path: 'C:/project/intro.tex', x: ' ', y: 'M' }];
		await makeScm({ pending: true, loaded: 'C:/project/intro.tex' }).commit('Tighten the proof', ['C:/project/main.tex']);
		expect(gitStage.mock.calls.at(-1)?.[1]).toEqual(['C:/project/main.tex']);
		gitChanges.current = [];
	});

	it('writes nothing when nothing is waiting', async () => {
		await makeScm().commit('Tighten the proof', ['C:/project/main.tex']);
		expect(flushed).not.toHaveBeenCalled();
		expect(gitCommit).toHaveBeenCalled();
	});
});

describe('saving a version, as VS Code would', () => {
	beforeEach(() => {
		gitCommit.mockClear();
		gitStage.mockClear();
	});

	it('takes a rename in whole: the new name, and the old one it no longer has', async () => {
		gitChanges.current = [{ path: 'C:/project/introduction.tex', x: 'R', y: ' ', from: 'C:/project/intro.tex' }];
		await makeScm().commit('Rename', ['C:/project/introduction.tex']);
		expect(gitStage.mock.calls.at(-1)?.[1]).toEqual(['C:/project/introduction.tex', 'C:/project/intro.tex']);
		gitChanges.current = [];
	});

	it('waits while a file both sides changed still holds a marked place, and takes it in once chosen', async () => {
		// a stash that did not apply cleanly: no merge under way, so nothing else stops the save
		gitChanges.current = [{ path: 'C:/project/refs.bib', x: 'U', y: 'U', markers: true }];
		expect(await makeScm().commit('Notes', ['C:/project/main.tex'])).toBe(false);
		expect(gitCommit).not.toHaveBeenCalled();

		gitChanges.current = [{ path: 'C:/project/refs.bib', x: 'U', y: 'U' }];
		expect(await makeScm().commit('Notes', ['C:/project/main.tex'])).toBe(true);
		expect(gitStage.mock.calls.at(-1)?.[1]).toEqual(['C:/project/main.tex', 'C:/project/refs.bib']);
		gitChanges.current = [];
	});
});

describe('comparing with a version', () => {
	it('reads a file renamed since under the name it had in that version', () => {
		const tabs: unknown[][] = [];
		makeScm({ compareTab: (...args) => void tabs.push(args) }).compare(ENTRY, 'C:/project/introduction.tex', 'C:/project/intro.tex');
		expect(tabs).toEqual([['C:/project/introduction.tex', { ...ENTRY, path: 'C:/project/intro.tex' }]]);
	});
});

describe('throwing changes away', () => {
	beforeEach(() => {
		gitDiscard.mockClear();
		gitUnstage.mockClear();
		confirmAsk.mockClear();
	});

	it('lets go of a file staged as new and moves it to the Trash, rather than asking git for a copy it never had', async () => {
		const trashed: string[] = [];
		const scm = makeScm({ trash: async (p) => (trashed.push(p), 'trashed') });
		await scm.discard([{ path: 'C:/project/new.tex', x: 'A', y: ' ' }]);
		expect(gitUnstage.mock.calls.at(-1)?.[1]).toEqual(['C:/project/new.tex']);
		expect(trashed).toEqual(['C:/project/new.tex']);
		expect(gitDiscard).not.toHaveBeenCalled();
	});

	it('puts a rename back: the new name to the Trash, the old one from the last version', async () => {
		const trashed: string[] = [];
		await makeScm({ trash: async (p) => (trashed.push(p), 'trashed') }).discard([
			{ path: 'C:/project/introduction.tex', x: 'R', y: ' ', from: 'C:/project/intro.tex' } as never
		]);
		expect(trashed).toEqual(['C:/project/introduction.tex']);
		expect(gitDiscard.mock.calls.at(-1)?.[1]).toEqual(['C:/project/intro.tex']);
	});

	// git mv intro.tex introduction.tex, then a new intro.tex started: the checkout of the old name
	// used to write over it, with no copy in the Trash or in Local History
	it('moves a new file started at the old name to the Trash before putting the old one back', async () => {
		const steps: string[] = [];
		gitDiscard.mockImplementationOnce(async (_root, paths) => (steps.push(`checkout ${paths.join()}`), { ok: true }));
		await makeScm({
			trash: async (p) => (steps.push(`trash ${p}`), 'trashed'),
			read: async (p) => (p === 'C:/project/intro.tex' ? 'A new introduction.\n' : null)
		}).discard([{ path: 'C:/project/introduction.tex', x: 'R', y: ' ', from: 'C:/project/intro.tex' } as never]);
		expect(steps).toEqual(['trash C:/project/introduction.tex', 'trash C:/project/intro.tex', 'checkout C:/project/intro.tex']);
	});

	it('leaves the new file at the old name, and the rename undone only in part, when it may not be deleted', async () => {
		const scm = makeScm({ trash: async () => 'kept', read: async (p) => (p === 'C:/project/intro.tex' ? 'A new introduction.\n' : null) });
		confirmAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		await scm.discard([{ path: 'C:/project/introduction.tex', x: 'R', y: ' ', from: 'C:/project/intro.tex' } as never]);
		expect(gitDiscard).not.toHaveBeenCalled();
	});

	it('asks before deleting outright where there is no Trash, and keeps the file on no', async () => {
		const removed: string[] = [];
		const scm = makeScm({ trash: async () => 'kept', remove: async (p) => void removed.push(p) });
		confirmAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
		await scm.discard([{ path: 'C:/project/draft.tex', x: '?', y: '?' }]);
		expect(confirmAsk).toHaveBeenCalledTimes(2);
		expect(removed).toEqual([]);

		confirmAsk.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
		await scm.discard([{ path: 'C:/project/draft.tex', x: '?', y: '?' }]);
		expect(removed).toEqual(['C:/project/draft.tex']);
	});

	it('never deletes a folder row that also holds ignored files', async () => {
		const trashed: string[] = [];
		await makeScm({ trash: async (p) => (trashed.push(p), 'trashed') }).discard([
			{ path: 'C:/project/data', x: '?', y: '?', files: 300, ignoredInside: true } as never
		]);
		expect(confirmAsk).not.toHaveBeenCalled();
		expect(trashed).toEqual([]);
	});
});
