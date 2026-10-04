// Local History keeps a copy before anything replaces text that no other copy holds: a discard in
// Source Control (whose notice then offers Undo), and Reload over unsaved edits when the file
// changed outside the app.
import { it, expect, vi, beforeEach } from 'vitest';

const addLocalHistory = vi.fn(async (_path: string, _content: string, _source?: string) => ({ id: 'aB3d.tex', timestamp: 1 }));
vi.mock('$lib/workspace/localHistory/localHistory.svelte', () => ({ addLocalHistory }));
const success = vi.fn((_t: { title: string; action?: { label: string; onClick: () => void } }) => {});
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success, error: vi.fn(), warning: vi.fn() } }));
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk: vi.fn(async () => true) }));
const gitDiscard = vi.fn(async (_root: string, _paths: string[]) => ({ ok: true }));
vi.mock('$lib/workspace/scm/git', () => ({ gitDiscard, gitUnstage: vi.fn(async () => ({ ok: true })) }));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	isNewFile: (c: { x: string }) => c.x === '?' || c.x === 'A',
	refreshGitStatus: vi.fn(async () => {})
}));
vi.mock('$lib/workspace/workspaceStore', () => ({
	workspaceRoot: { current: '/p' },
	activeFilePath: { current: '/p/main.tex' },
	isDirty: { current: true }
}));
vi.mock('$lib/workspace/diskStamp', () => ({ recordDiskStamp: vi.fn(async () => {}) }));

const { ScmDiscard } = await import('$lib/workspace/scm/actions/scmDiscard.svelte');
const { ExternalChangeWatcher } = await import('$lib/workspace/externalChange.svelte');
const { SavePipeline } = await import('$lib/workspace/savePipeline.svelte');

beforeEach(() => {
	addLocalHistory.mockClear();
	success.mockClear();
	gitDiscard.mockClear();
});

/** the open file on a disk of its own, with the save queue the editor has, and git's discard
 *  putting back what the last version held */
function openFile(opts: { disk: string; autosave: boolean; committed?: string }) {
	const P = '/p/main.tex';
	const disk: Record<string, string> = { [P]: opts.disk };
	const stamp: Record<string, string> = { [P]: opts.disk };
	const state = { buffer: opts.disk };
	gitDiscard.mockImplementationOnce(async (_root, paths) => {
		for (const p of paths) disk[p] = opts.committed ?? 'committed';
		return { ok: true };
	});
	const saver = new SavePipeline({
		sessionEdit: () => {},
		isGuest: () => false,
		autosaveActive: () => opts.autosave,
		clearDeleted: () => {},
		writeText: async (p, c) => void (disk[p] = c),
		getEol: () => '\n',
		getLoadedPath: () => P,
		getLiveContent: () => state.buffer,
		setDiskBaseline: () => {},
		setDirty: () => {},
		diskChanged: async (p) => disk[p] !== stamp[p],
		recordDiskStamp: async (p) => void (stamp[p] = disk[p]),
		raiseConflict: () => {}
	});
	saver.afterWrite = (p, c) => void addLocalHistory(p, c);
	const discard = new ScmDiscard(
		{ busy: false },
		{
			getLoadedPath: () => P,
			discardPendingSave: () => saver.discard(),
			hasPendingSave: () => !!saver.pending,
			flushPendingSave: () => saver.flushAndWait(),
			trashEntry: async () => 'trashed',
			removeEntry: async () => {},
			refreshTree: async () => {},
			// what FileOpener.open does: wait for the queue, read, adopt, stamp
			loadFile: async (p: string) => {
				await saver.whenIdle();
				state.buffer = disk[p];
				stamp[p] = disk[p];
			},
			isDiffMode: () => false,
			captureDiffSnapshot: () => {},
			readTextIfPresent: async (p: string) => disk[p] ?? null,
			writeText: async (p: string, c: string) => void (disk[p] = c)
		}
	);
	const type = (text: string) => {
		state.buffer = text;
		saver.schedule(P, text);
	};
	return { P, disk, state, saver, discard, type };
}

it('keeps each discarded file in Local History, and Undo on the notice writes it back', async () => {
	const writeText = vi.fn(async (_p: string, _c: string) => {});
	const loadFile = vi.fn(async () => {});
	const discard = new ScmDiscard(
		{ busy: false },
		{
			getLoadedPath: () => '/p/main.tex',
			discardPendingSave: () => {},
			hasPendingSave: () => false,
			flushPendingSave: async () => {},
			trashEntry: async () => 'trashed',
			removeEntry: async () => {},
			refreshTree: async () => {},
			loadFile,
			isDiffMode: () => false,
			captureDiffSnapshot: () => {},
			readTextIfPresent: async (p: string) => (p === '/p/main.tex' ? 'my unversioned paragraph' : null),
			writeText
		}
	);
	await discard.run([{ path: '/p/main.tex', x: ' ', y: 'M' }]);
	expect(addLocalHistory).toHaveBeenCalledWith('/p/main.tex', 'my unversioned paragraph', 'before-discard');
	expect(gitDiscard).toHaveBeenCalledWith('/p', ['/p/main.tex']);
	const notice = success.mock.calls[0][0];
	expect(notice.action?.label).toBe('Undo');
	notice.action!.onClick();
	await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('/p/main.tex', 'my unversioned paragraph'));
	await vi.waitFor(() => expect(loadFile).toHaveBeenCalledWith('/p/main.tex'));
});

it('keeps the unsaved edits before Reload replaces them with what changed on disk', async () => {
	const w = new ExternalChangeWatcher({
		getLoadedPath: () => '/p/main.tex',
		isTextual: () => true,
		isStructured: () => true,
		whenIdle: async () => {},
		readText: async () => 'theirs',
		getDiskBaseline: () => 'base',
		setDiskBaseline: () => {},
		getBuffer: () => 'mine, never saved',
		setTexSource: () => {},
		setRawContent: () => {},
		setEol: () => {},
		rebuildVisual: () => {},
		discardQueuedSave: () => {},
		sessionEdit: () => {},
		saveNow: () => {},
		exists: async () => true,
		setDeleted: () => {},
		takeSessionWrite: () => null
	});
	await w.check();
	w.resolve('reload');
	expect(addLocalHistory).toHaveBeenCalledWith('/p/main.tex', 'mine, never saved', 'before-reload');
});

it('keeps the open file’s unsaved edits before discarding them, not only what is on disk', async () => {
	const f = openFile({ disk: 'saved, not yet a version', autosave: false });
	f.type('saved, not yet a version, and an unsaved paragraph');
	await f.discard.run([{ path: f.P, x: ' ', y: 'M' }]);
	expect(addLocalHistory).toHaveBeenCalledWith(f.P, 'saved, not yet a version, and an unsaved paragraph', 'before-discard');
	expect(f.saver.pending).toBeNull();
	expect(f.disk[f.P]).toBe('committed');
	expect(f.state.buffer).toBe('committed');
});

it('Undo after a discard is not overwritten by typing queued before it', async () => {
	vi.useFakeTimers();
	try {
		const f = openFile({ disk: 'my paragraph', autosave: true });
		await f.discard.run([{ path: f.P, x: ' ', y: 'M' }]);
		expect(f.state.buffer).toBe('committed');
		// the author types into the discarded text, then presses Undo within the autosave's pause
		f.type('committed, and a word');
		success.mock.calls[0][0].action!.onClick();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(f.disk[f.P]).toBe('my paragraph');
		expect(f.state.buffer).toBe('my paragraph');
		// the typing was saved first, so it is kept too
		expect(addLocalHistory).toHaveBeenCalledWith(f.P, 'committed, and a word');
	} finally {
		vi.useRealTimers();
	}
});

it('keeps a discarded CRLF file in LF, as saves are kept, and Undo writes its own endings back', async () => {
	const f = openFile({ disk: 'one\r\ntwo\r\n', autosave: true });
	await f.discard.run([{ path: f.P, x: ' ', y: 'M' }]);
	expect(addLocalHistory).toHaveBeenCalledWith(f.P, 'one\ntwo\n', 'before-discard');
	success.mock.calls[0][0].action!.onClick();
	await vi.waitFor(() => expect(f.disk[f.P]).toBe('one\r\ntwo\r\n'));
});

it('keeps unsaved edits the save guard turned away before discarding them', async () => {
	// the file changed outside and the author put the question off: the flush writes nothing
	let queued: { path: string; content: string } | null = { path: '/p/main.tex', content: 'typed, refused by the guard' };
	const discard = new ScmDiscard(
		{ busy: false },
		{
			getLoadedPath: () => '/p/main.tex',
			discardPendingSave: () => (queued = null),
			hasPendingSave: () => queued !== null,
			flushPendingSave: async () => {},
			detachPendingSave: () => {
				const q = queued;
				queued = null;
				return q;
			},
			trashEntry: async () => 'trashed',
			removeEntry: async () => {},
			refreshTree: async () => {},
			loadFile: async () => {},
			isDiffMode: () => false,
			captureDiffSnapshot: () => {},
			readTextIfPresent: async () => 'what is on disk',
			writeText: async () => {}
		}
	);
	await discard.run([{ path: '/p/main.tex', x: ' ', y: 'M' }]);
	expect(addLocalHistory).toHaveBeenCalledWith('/p/main.tex', 'typed, refused by the guard', 'before-discard');
	expect(addLocalHistory).toHaveBeenCalledWith('/p/main.tex', 'what is on disk', 'before-discard');
	expect(queued).toBeNull();
});
