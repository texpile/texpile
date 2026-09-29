// Restore Contents as VS Code does it: asked first, the file replaced with the entry (in the
// file's own line endings), the open editor reloaded, and the restore kept as an entry of its own.
import { it, expect, vi, beforeEach } from 'vitest';

const promptAsk = vi.fn(async () => 'restore' as string | null);
const history = {
	readLocalHistory: vi.fn(async () => 'Old line.\nSecond.\n' as string | null),
	addLocalHistory: vi.fn(async () => null),
	removeLocalHistory: vi.fn(async () => true),
	renameLocalHistory: vi.fn(async () => true),
	removeAllLocalHistory: vi.fn(async () => {})
};
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk }));
const success = vi.fn((_t: { title: string; action?: { label: string; onClick: () => void } }) => {});
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { error: vi.fn(), success } }));
vi.mock('$lib/workspace/localHistory/localHistory.svelte', () => ({
	...history,
	sourceLabel: (s?: string) => s ?? 'File Saved',
	LOCAL_REF: 'local:'
}));
const openFile = vi.fn();
vi.mock('$lib/workspace/workspaceStore', () => ({ openFile }));

const { LocalHistoryActions } = await import('$lib/workspace/localHistory/localHistoryActions.svelte');
const { SavePipeline } = await import('$lib/workspace/savePipeline.svelte');

function make(loaded: string | null) {
	const deps = {
		getLoadedPath: () => loaded,
		flushPendingSave: vi.fn(async () => {}),
		whenSaved: vi.fn(async () => {}),
		readTextIfPresent: vi.fn(async () => 'Now.\r\n' as string | null),
		writeText: vi.fn(async () => {}),
		loadFile: vi.fn(async () => {}),
		openCompareTab: vi.fn()
	};
	return { actions: new LocalHistoryActions(deps), deps };
}
const ENTRY = { id: 'aB3d.tex', timestamp: 1_000 };

beforeEach(() => {
	promptAsk.mockClear();
	history.addLocalHistory.mockClear();
	success.mockClear();
});

it('restores in the file’s own line endings, reloads it, and records the restore', async () => {
	const { actions, deps } = make('/p/main.tex');
	await actions.restore('/p/main.tex', ENTRY);
	expect(deps.flushPendingSave).toHaveBeenCalled();
	expect(deps.writeText).toHaveBeenCalledWith('/p/main.tex', 'Old line.\r\nSecond.\r\n');
	expect(deps.loadFile).toHaveBeenCalledWith('/p/main.tex');
	expect(history.addLocalHistory).toHaveBeenCalledWith('/p/main.tex', 'Old line.\nSecond.\n', 'restored');
});

it('changes nothing when the author says no', async () => {
	promptAsk.mockResolvedValueOnce('cancel');
	const { actions, deps } = make(null);
	await actions.restore('/p/main.tex', ENTRY);
	expect(deps.writeText).not.toHaveBeenCalled();
	expect(history.addLocalHistory).not.toHaveBeenCalled();
});

it('opens an entry against the file as a compare tab that reads from the history', () => {
	const { actions, deps } = make(null);
	actions.compare('/p/main.tex', ENTRY);
	expect(deps.openCompareTab).toHaveBeenCalledWith('/p/main.tex', expect.objectContaining({ hash: 'local:aB3d.tex' }));
});

it('brings back a deleted file as the copy was kept, and opens it', async () => {
	const { actions, deps } = make(null);
	deps.readTextIfPresent.mockResolvedValueOnce(null);
	await actions.restore('/p/chapters/methods.tex', ENTRY);
	expect(deps.writeText).toHaveBeenCalledWith('/p/chapters/methods.tex', 'Old line.\nSecond.\n');
	expect(openFile).toHaveBeenCalledWith('/p/chapters/methods.tex');
	expect(deps.loadFile).not.toHaveBeenCalled();
});

/** the open file on a disk of its own, with the save queue and the save guard the editor has */
function editing(opts: { disk: string; buffer: string; changedOutside?: boolean; autosave?: boolean; detach?: boolean }) {
	const P = '/p/main.tex';
	const disk: Record<string, string> = { [P]: opts.disk };
	// what the editor last read or wrote; the file changed outside when disk no longer matches it
	const stamp: Record<string, string> = { [P]: opts.changedOutside ? 'what was read' : opts.disk };
	const state = { buffer: opts.buffer };
	const saver = new SavePipeline({
		sessionEdit: () => {},
		isGuest: () => false,
		autosaveActive: () => opts.autosave ?? true,
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
	const actions = new LocalHistoryActions({
		getLoadedPath: () => P,
		flushPendingSave: () => saver.flushAndWait(),
		...(opts.detach === false ? {} : { detachPendingSave: () => saver.detach() }),
		whenSaved: () => saver.whenIdle(),
		readTextIfPresent: async (p) => disk[p] ?? null,
		writeText: async (p, c) => void (disk[p] = c),
		// what FileOpener.open does: wait for the queue, read, adopt, stamp
		loadFile: async (p) => {
			await saver.whenIdle();
			state.buffer = disk[p];
			stamp[p] = disk[p];
		},
		openCompareTab: () => {}
	});
	const type = (text: string) => {
		state.buffer = text;
		saver.schedule(P, text);
	};
	return { P, disk, state, saver, actions, type };
}

it('keeps unsaved edits the save guard turned away, and drops them from the queue, before restoring', async () => {
	history.readLocalHistory.mockResolvedValueOnce('Restored copy.\n');
	// the file changed outside and the author said to decide later: autosave cannot write the edits
	const f = editing({ disk: 'Changed outside.\n', buffer: 'Mine, unsaved.\n', changedOutside: true, autosave: false });
	f.type('Mine, unsaved.\n');
	expect(await f.actions.restore(f.P, ENTRY)).toBe(true);
	expect(history.addLocalHistory).toHaveBeenCalledWith(f.P, 'Changed outside.\n', 'before-restore');
	expect(history.addLocalHistory).toHaveBeenCalledWith(f.P, 'Mine, unsaved.\n', 'before-restore');
	expect(f.saver.pending).toBeNull();
	// a compile or a file switch later flushes the queue: the restored text stays
	await f.saver.flushAndWait();
	expect(f.disk[f.P]).toBe('Restored copy.\n');
	expect(f.state.buffer).toBe('Restored copy.\n');
});

it('Undo on the restore notice is not overwritten by typing queued before it', async () => {
	vi.useFakeTimers();
	try {
		history.readLocalHistory.mockResolvedValueOnce('Old copy.\n');
		// as the workspace provides it today, without detachPendingSave
		const f = editing({ disk: 'Before.\n', buffer: 'Before.\n', detach: false });
		await f.actions.restore(f.P, ENTRY);
		expect(f.disk[f.P]).toBe('Old copy.\n');
		// the author types into the restored text, then presses Undo within the autosave's pause
		f.type('Old copy.\nA new line.\n');
		success.mock.calls[0][0].action!.onClick();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(f.disk[f.P]).toBe('Before.\n');
		expect(f.state.buffer).toBe('Before.\n');
	} finally {
		vi.useRealTimers();
	}
});

it('gives the file as it is now in LF, as the copies are kept, so a CRLF file can match one', async () => {
	const { actions, deps } = make('/p/main.tex');
	deps.readTextIfPresent.mockResolvedValueOnce('One.\r\nTwo.\r\n');
	expect(await actions.currentText('/p/main.tex')).toBe('One.\nTwo.\n');
	deps.readTextIfPresent.mockResolvedValueOnce(null);
	expect(await actions.currentText('/p/gone.tex')).toBeNull();
});
