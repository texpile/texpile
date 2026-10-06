// Keep mine / Keep theirs for a whole file, with an edit to that file still waiting to be written
// (autosave held off): the edit is dropped, or it would land on top of the side just kept, markers and
// all. Real ScmCombine, SavePipeline and diskStamp over an in-memory disk.
import { it, expect, vi } from 'vitest';

const disk = new Map<string, { text: string; mtime: number }>();
let clock = 1;
function put(p: string, text: string) {
	disk.set(p, { text, mtime: clock++ });
}

vi.mock('$lib/workspace/fileSystem', async (orig) => ({
	...(await orig<typeof import('$lib/workspace/fileSystem')>()),
	statFile: async (p: string) => {
		const f = disk.get(p);
		return f ? { exists: true, mtimeMs: f.mtime, size: f.text.length } : { exists: false, mtimeMs: 0, size: 0 };
	}
}));
vi.mock('$lib/workspace/scm/branches/gitCombine', () => ({
	gitCombine: vi.fn(),
	gitFinishCombine: vi.fn(),
	gitCancelCombine: vi.fn(),
	// git checkout --theirs + add: the whole file becomes their side
	gitKeepSide: vi.fn(async (_root: string, path: string, _side: string) => {
		put(path, THEIRS);
		return { ok: true };
	})
}));
vi.mock('$lib/workspace/scm/gitStore', () => ({
	refreshGitStatus: vi.fn(async () => ({})),
	refreshGitHistory: vi.fn(async () => {}),
	gitChanges: { current: [{ path: '/p/main.tex', x: 'U', y: 'U', markers: true }] },
	isConflicted: (x: string, y: string) => x === 'U' || y === 'U'
}));
vi.mock('$lib/workspace/workspaceStore', () => ({ workspaceRoot: { current: '/p' } }));
vi.mock('$lib/modals/confirm.svelte', () => ({ confirmAsk: vi.fn(async () => true), promptAsk: vi.fn() }));
vi.mock('$lib/modals/toaster-svelte', () => ({ toaster: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const MARKED = 'Intro.\n<<<<<<< HEAD\nMine.\n=======\nTheirs.\n>>>>>>> origin/main\nEnd.\n';
const PARTIAL = 'Intro.\nMine, reworded.\n<<<<<<< HEAD\n=======\nTheirs.\n>>>>>>> origin/main\nEnd.\n';
const THEIRS = 'Intro.\nTheirs.\nEnd.\n';

const { ScmCombine } = await import('$lib/workspace/scm/branches/scmCombine.svelte');
const { SavePipeline } = await import('$lib/workspace/savePipeline.svelte');
const { recordDiskStamp, diskChangedSince } = await import('$lib/workspace/diskStamp');

it('Keep theirs is not undone by the edit that was waiting to be saved', async () => {
	put('/p/main.tex', MARKED);
	let buffer = MARKED;
	const saver = new SavePipeline({
		sessionEdit: () => {},
		isGuest: () => false,
		autosaveActive: () => false, // held off, as for a conflict put off
		clearDeleted: () => {},
		writeText: async (p, c) => put(p, c),
		getEol: () => '\n' as const,
		getLoadedPath: () => '/p/main.tex',
		getLiveContent: () => buffer,
		setDiskBaseline: () => {},
		setDirty: () => {},
		diskChanged: diskChangedSince,
		recordDiskStamp,
		raiseConflict: vi.fn()
	});
	await recordDiskStamp('/p/main.tex'); // the file was opened
	// the author starts choosing in the editor: an edit, queued, not yet on disk
	buffer = PARTIAL;
	saver.schedule('/p/main.tex', PARTIAL);

	const host = { busy: false, ensureIdentity: async () => true, openDiff: () => {} };
	const combine = new ScmCombine(host, {
		getLoadedPath: () => '/p/main.tex',
		discardPendingSave: () => saver.discard(),
		hasPendingSave: () => !!saver.pending,
		flushPendingSave: () => saver.flushAndWait(),
		trashEntry: async () => 'trashed',
		removeEntry: async () => {},
		refreshTree: async () => {},
		// FileOpener.open: read the file into the buffer, then recordDiskStamp
		loadFile: async (p: string) => {
			buffer = disk.get(p)!.text;
			await recordDiskStamp(p);
		},
		captureDiffSnapshot: () => {},
		isDiffMode: () => false,
		openCompareTab: () => {},
		openAtLine: () => {},
		settleConflicts: () => {},
		ignoreLines: () => [],
		writeText: async () => {},
		readTextIfPresent: async (p: string) => disk.get(p)?.text ?? null
	} as never);

	// the row menu's "Keep theirs" for the whole file
	await combine.keepSide('/p/main.tex', 'theirs');

	// later: Ctrl+S, a file switch or a compile flushes the queue
	await saver.flushAndWait();
	expect(disk.get('/p/main.tex')!.text).toBe(THEIRS);
});
