// Restore Contents as VS Code does it: asked first, the file replaced with the entry (in the
// file's own line endings), the open editor reloaded, and the restore kept as an entry of its own.
import { it, expect, vi, beforeEach } from 'vitest';

const promptAsk = vi.fn(async () => 'restore' as string | null);
const history = {
	readLocalHistory: vi.fn(async (_p: string, _id: string) => 'Old line.\nSecond.\n' as string | null),
	listLocalHistory: vi.fn(async (_p: string) => [] as { id: string; timestamp: number }[]),
	addLocalHistory: vi.fn(async () => null),
	removeLocalHistory: vi.fn(async () => true),
	renameLocalHistory: vi.fn(async () => true),
	removeAllLocalHistory: vi.fn(async () => {})
};
vi.mock('$lib/modals/confirm.svelte', () => ({ promptAsk }));
const success = vi.fn((_t: { title: string; action?: { label: string; onClick: () => void } }) => {});
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { error: vi.fn(), success, info: vi.fn() } }));
vi.mock('$lib/workspace/localHistory/localHistory.svelte', () => ({
	...history,
	sourceLabel: (s?: string) => s ?? 'File Saved',
	LOCAL_REF: 'local:'
}));
const openFile = vi.fn();
vi.mock('$lib/workspace/workspaceStore', () => ({ openFile }));

const { LocalHistoryActions } = await import('$lib/workspace/localHistory/localHistoryActions.svelte');
const { memoryFs, memoryStamps, openMemoryFolder } = await import('../memoryFolder');

function make(loaded: string | null) {
	const deps = {
		getLoadedPath: () => loaded,
		flushPendingSave: vi.fn(async () => {}),
		whenSaved: vi.fn(async () => {}),
		readTextIfPresent: vi.fn(async () => 'Now.\r\n' as string | null),
		writeText: vi.fn(async () => {}),
		adoptDisk: vi.fn(async () => {}),
		suggestionsDropped: vi.fn(async () => 0),
		restoreSuggestions: vi.fn(async () => {}),
		adoptClosed: vi.fn(async () => {}),
		openCompareTab: vi.fn(),
		leaveCompareTab: vi.fn()
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
	expect(deps.adoptDisk).toHaveBeenCalledWith('/p/main.tex');
	expect(history.addLocalHistory).toHaveBeenCalledWith('/p/main.tex', 'Old line.\nSecond.\n', 'restored');
});

it('says what it rejects, records that before the text lands, and the Undo hands the text back to the suggestions', async () => {
	const { actions, deps } = make(null);
	deps.suggestionsDropped.mockResolvedValueOnce(2);
	const order: string[] = [];
	deps.restoreSuggestions.mockImplementation(async () => void order.push('log'));
	deps.writeText.mockImplementation(async () => void order.push('text'));
	await actions.restore('/p/main.tex', ENTRY);
	expect(deps.suggestionsDropped).toHaveBeenCalledWith('/p/main.tex', 'Now.\n', 'Old line.\nSecond.\n');
	expect(promptAsk).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining('2') }));
	expect(order).toEqual(['log', 'text']);
	success.mock.calls[0][0].action!.onClick();
	await vi.waitFor(() => expect(deps.adoptClosed).toHaveBeenCalledWith('/p/main.tex', 'Now.\n'));
});

it('changes nothing when the author says no', async () => {
	promptAsk.mockResolvedValueOnce('cancel');
	const { actions, deps } = make(null);
	await actions.restore('/p/main.tex', ENTRY);
	expect(deps.writeText).not.toHaveBeenCalled();
	expect(history.addLocalHistory).not.toHaveBeenCalled();
});

it('opens on the newest copy that differs from the file, as a compare tab that reads from the history', async () => {
	const { actions, deps } = make(null);
	history.listLocalHistory.mockResolvedValueOnce([{ id: 'same.tex', timestamp: 2_000 }, ENTRY]);
	history.readLocalHistory.mockImplementation(async (_p, id) => (id === 'same.tex' ? 'Now.\n' : 'Old line.\n'));
	await actions.open('/p/main.tex');
	expect(deps.openCompareTab).toHaveBeenCalledWith('/p/main.tex', expect.objectContaining({ hash: 'local:aB3d.tex' }), undefined);
	history.readLocalHistory.mockImplementation(async () => 'Old line.\nSecond.\n');
});

it('brings back a deleted file as the copy was kept, and opens it', async () => {
	const { actions, deps } = make(null);
	deps.readTextIfPresent.mockResolvedValue(null);
	await actions.restore('/p/chapters/methods.tex', ENTRY);
	expect(deps.writeText).toHaveBeenCalledWith('/p/chapters/methods.tex', 'Old line.\nSecond.\n');
	expect(openFile).toHaveBeenCalledWith('/p/chapters/methods.tex');
	expect(deps.adoptDisk).not.toHaveBeenCalled();
});

/** the open file on a disk of its own, with the writer and the save guard the editor has */
async function editing(opts: { disk: string; changedOutside?: boolean; autosave?: boolean; detach?: boolean }) {
	const P = '/p/main.tex';
	// what the editor read; the file changed outside when disk no longer matches it
	const disk: Record<string, string> = { [P]: opts.changedOutside ? 'What was read.\n' : opts.disk };
	const { hooks } = memoryStamps(disk);
	const folder = await openMemoryFolder('/p', memoryFs(disk), {
		open: [P],
		loaded: () => P,
		hooks: { ...hooks, heldOff: () => !(opts.autosave ?? true) }
	});
	disk[P] = opts.disk;
	const { writer } = folder;
	const actions = new LocalHistoryActions({
		getLoadedPath: () => P,
		flushPendingSave: () => writer.flushAndWait(),
		...(opts.detach === false ? {} : { detachPendingSave: () => writer.detach() }),
		whenSaved: () => writer.whenIdle(),
		readTextIfPresent: async (p) => disk[p] ?? null,
		writeText: async (p, c) => void (disk[p] = c),
		// what ExternalChange.check does: wait for the writer, read, and adopt what nothing unwritten holds back
		adoptDisk: async (p) => {
			await writer.whenIdle();
			if (!writer.isDirty(p)) writer.adoptDisk(p, disk[p]);
		},
		suggestionsDropped: async () => 0,
		restoreSuggestions: async () => {},
		adoptClosed: async () => {},
		openCompareTab: () => {},
		leaveCompareTab: () => {}
	});
	return { P, disk, writer, actions, buffer: () => folder.textOf(P), type: (text: string) => folder.type(P, text) };
}

it('keeps unsaved edits the save guard turned away, and drops them from the queue, before restoring', async () => {
	history.readLocalHistory.mockResolvedValueOnce('Restored copy.\n');
	// the file changed outside and the author said to decide later: autosave cannot write the edits
	const f = await editing({ disk: 'Changed outside.\n', changedOutside: true, autosave: false });
	f.type('Mine, unsaved.\n');
	expect(await f.actions.restore(f.P, ENTRY)).toBe(true);
	expect(history.addLocalHistory).toHaveBeenCalledWith(f.P, 'Changed outside.\n', 'before-restore');
	expect(history.addLocalHistory).toHaveBeenCalledWith(f.P, 'Mine, unsaved.\n', 'before-restore');
	expect(f.writer.pending).toBeNull();
	// a compile or a file switch later flushes the writer: the restored text stays
	await f.writer.flushAndWait();
	expect(f.disk[f.P]).toBe('Restored copy.\n');
	expect(f.buffer()).toBe('Restored copy.\n');
});

it('Undo on the restore notice is not overwritten by typing queued before it', async () => {
	vi.useFakeTimers();
	try {
		history.readLocalHistory.mockResolvedValueOnce('Old copy.\n');
		// as the workspace provides it today, without detachPendingSave
		const f = await editing({ disk: 'Before.\n', detach: false });
		await f.actions.restore(f.P, ENTRY);
		expect(f.disk[f.P]).toBe('Old copy.\n');
		// the author types into the restored text, then presses Undo within the autosave's pause
		f.type('Old copy.\nA new line.\n');
		success.mock.calls[0][0].action!.onClick();
		await vi.advanceTimersByTimeAsync(2_000);
		expect(f.disk[f.P]).toBe('Before.\n');
		expect(f.buffer()).toBe('Before.\n');
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
