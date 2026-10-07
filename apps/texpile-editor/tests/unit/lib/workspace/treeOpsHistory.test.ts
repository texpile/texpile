import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TreeOps, type TreeOpsDeps } from '$lib/workspace/treeOps';
import { workspaceRoot, activeFilePath } from '$lib/workspace/workspaceStore';
import { tabs } from '$lib/workspace/tabs.svelte';
import { memoryFs, openMemoryFolder } from './memoryFolder';
import type { TreeEntry } from '$lib/workspace/fileSystem';

vi.mock('$lib/platform', () => ({ isMac: false, isWindows: false }));

// A fake filesystem: a flat set of paths, with prefix rules for folders. Enough to tell whether an
// undo actually put something back, which is the only thing these tests are about.
//
// It models the real shape of a delete: COPY the entry to a backup outside the workspace, then
// remove the original. `tooBigFor` stands in for the size limit that makes a delete non-undoable.
// what the "replace what is there?" prompt answers; mutable so a test can say no
const replaceAnswer = { ok: true };
// what the writer was told to do with an unwritten edit during the last operation
const saveCalls: string[] = [];

function makeFs(tooBigFor: (p: string) => boolean = () => false, hasRecycleBin = true) {
	const files = new Set<string>();
	const backups = new Set<string>();
	let slot = 0;
	const under = (p: string) => [...files].filter((f) => f === p || f.startsWith(p + '/'));
	const move = (from: string, to: string) => {
		for (const f of under(from)) {
			files.delete(f);
			files.add(to + f.slice(from.length));
		}
	};
	const copy = (from: string, to: string) => under(from).forEach((f) => files.add(to + f.slice(from.length)));
	const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);

	const deps: TreeOpsDeps = {
		create: async (p) => void files.add(p),
		remove: async (p) => void under(p).forEach((f) => files.delete(f)),
		rename: async (from, to) => {
			if (!files.has(from) && !under(from).length) throw new Error(`no such path: ${from}`);
			move(from, to);
		},
		copy: async (from, to) => copy(from, to),
		// backup-then-delete, with its own slot per entry, exactly like the real main-process handler
		trash: async (p) => {
			const dest = tooBigFor(p) ? null : `/appdata/undo/slot${slot++}/${base(p)}`;
			if (dest) {
				copy(p, dest);
				under(dest).forEach((f) => backups.add(f));
			}
			under(p).forEach((f) => files.delete(f));
			return { backup: dest, recycled: hasRecycleBin };
		},
		// a COPY back, so the backup survives for a later redo/undo round trip
		restore: async (from, to) => {
			if (files.has(to)) throw new Error(`Cannot restore: "${base(to)}" already exists`);
			if (!under(from).length) throw new Error(`backup is gone: ${from}`);
			copy(from, to);
		},
		writeBinary: async (p) => void files.add(p),
		stat: async (p) => ({ exists: under(p).length > 0 }),
		refreshTree: async () => {},
		loadRefs: () => {},
		wantsStarter: () => false,
		isTypstProject: () => false,
		insertIncludeAtCursor: () => true,
		afterRename: () => {},
		retargetPendingSave: (from, to) => void saveCalls.push(`retarget ${from} -> ${to}`),
		forgetBuffers: (path) => void saveCalls.push(`forget ${path}`),
		confirmReplace: async () => replaceAnswer.ok
	};
	return { files, backups, deps };
}

const fileEntry = (path: string): TreeEntry => ({ name: path.slice(path.lastIndexOf('/') + 1), path, type: 'file' });
const dirEntry = (path: string, children: TreeEntry[] = []): TreeEntry => ({
	name: path.slice(path.lastIndexOf('/') + 1),
	path,
	type: 'dir',
	children
});

/** paths inside the workspace: undo backups live outside it, under the app's own data directory */
const visible = (files: Set<string>) => [...files].filter((f) => f.startsWith('/proj/')).sort();

describe('tree undo/redo', () => {
	let fs: ReturnType<typeof makeFs>;
	let ops: TreeOps;

	beforeEach(() => {
		workspaceRoot.current = '/proj';
		activeFilePath.current = null;
		fs = makeFs();
		ops = new TreeOps(fs.deps);
	});

	it('backs an entry up outside the workspace, and undo puts it back', async () => {
		fs.files.add('/proj/fig.png');
		await ops.deleteMany([fileEntry('/proj/fig.png')]);
		expect(visible(fs.files)).toEqual([]);
		// the recovery copy is in app storage, NOT in the user's project
		expect([...fs.backups]).toEqual(['/appdata/undo/slot0/fig.png']);
		expect([...fs.files].some((f) => f.startsWith('/proj/'))).toBe(false);

		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/fig.png']);
		await ops.history.redo();
		expect(visible(fs.files)).toEqual([]);
	});

	it('offers no undo when the entry was too large to copy, but still deletes it', async () => {
		const big = makeFs((p) => p.endsWith('huge.pdf'));
		const bigOps = new TreeOps(big.deps);
		big.files.add('/proj/huge.pdf');
		await bigOps.deleteMany([fileEntry('/proj/huge.pdf')]);
		expect(visible(big.files)).toEqual([]); // gone, as asked
		expect([...big.backups]).toEqual([]); // nothing copied
		expect(bigOps.history.canUndo).toBe(false); // and no undo pretending otherwise
	});

	it('reports what a delete can still be recovered from', async () => {
		// the three outcomes the user is told apart, since only the last one destroys anything
		const backedUp = makeFs();
		backedUp.files.add('/proj/a.tex');
		expect(await new TreeOps(backedUp.deps).delete(fileEntry('/proj/a.tex'))).toMatchObject({
			pair: { original: '/proj/a.tex' },
			recycled: true
		});

		// too big to copy, but the OS took it: undo is off, the recycle bin is the fallback
		const big = makeFs((p) => p.endsWith('huge.pdf'));
		big.files.add('/proj/huge.pdf');
		expect(await new TreeOps(big.deps).delete(fileEntry('/proj/huge.pdf'))).toEqual({ pair: null, recycled: true });

		// too big AND nowhere to put it: actually gone, and the caller must be able to see that
		const doomed = makeFs(() => true, false);
		doomed.files.add('/proj/huge.pdf');
		expect(await new TreeOps(doomed.deps).delete(fileEntry('/proj/huge.pdf'))).toEqual({ pair: null, recycled: false });
	});

	it('withholds undo for the WHOLE gesture if any one entry could not be copied', async () => {
		// restoring only the small half would leave a state the user never had
		const mixed = makeFs((p) => p.endsWith('huge.pdf'));
		const mixedOps = new TreeOps(mixed.deps);
		mixed.files.add('/proj/a.tex');
		mixed.files.add('/proj/huge.pdf');
		await mixedOps.deleteMany([fileEntry('/proj/a.tex'), fileEntry('/proj/huge.pdf')]);
		expect(visible(mixed.files)).toEqual([]);
		expect(mixedOps.history.canUndo).toBe(false);
	});

	it('survives being undone and redone repeatedly', async () => {
		// the redo path re-trashes into a FRESH slot, so a second undo has to follow the new
		// location rather than the first one, which no longer exists
		fs.files.add('/proj/a.tex');
		await ops.deleteMany([fileEntry('/proj/a.tex')]);
		for (let i = 0; i < 3; i++) {
			await ops.history.undo();
			expect(visible(fs.files), `undo #${i + 1}`).toEqual(['/proj/a.tex']);
			await ops.history.redo();
			expect(visible(fs.files), `redo #${i + 1}`).toEqual([]);
		}
	});

	it('takes a whole multi-selection back in one step', async () => {
		for (const p of ['/proj/a.tex', '/proj/b.tex', '/proj/c.tex']) fs.files.add(p);
		await ops.deleteMany([fileEntry('/proj/a.tex'), fileEntry('/proj/b.tex')]);
		expect(visible(fs.files)).toEqual(['/proj/c.tex']);
		expect(ops.history.undoStack).toHaveLength(1); // ONE entry, not one per file
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/a.tex', '/proj/b.tex', '/proj/c.tex']);
	});

	it('restores a deleted folder with everything under it', async () => {
		for (const p of ['/proj/sec/one.tex', '/proj/sec/img/x.png']) fs.files.add(p);
		await ops.deleteMany([dirEntry('/proj/sec')]);
		expect(visible(fs.files)).toEqual([]);
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/sec/img/x.png', '/proj/sec/one.tex']);
	});

	it('reverses a rename and a move', async () => {
		fs.files.add('/proj/old.tex');
		await ops.rename(fileEntry('/proj/old.tex'), 'new.tex');
		expect(visible(fs.files)).toEqual(['/proj/new.tex']);
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/old.tex']);
		await ops.history.redo();
		expect(visible(fs.files)).toEqual(['/proj/new.tex']);

		await ops.moveMany([fileEntry('/proj/new.tex')], '/proj/sub');
		expect(visible(fs.files)).toEqual(['/proj/sub/new.tex']);
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/new.tex']);
	});

	it('undoes a paste by trashing the copies, not the originals', async () => {
		fs.files.add('/proj/src/fig.png');
		await ops.copyIn(['/proj/src/fig.png'], '/proj/dst');
		expect(visible(fs.files)).toEqual(['/proj/dst/fig.png', '/proj/src/fig.png']);
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/src/fig.png']); // the source is untouched
		await ops.history.redo();
		expect(visible(fs.files)).toEqual(['/proj/dst/fig.png', '/proj/src/fig.png']);
	});

	it('undoes a create', async () => {
		await ops.create('/proj', 'notes.tex', 'file');
		expect(visible(fs.files)).toEqual(['/proj/notes.tex']);
		await ops.history.undo();
		expect(visible(fs.files)).toEqual([]);
	});

	// a folder the tree does not show (.github, one made outside since the last scan) was "created"
	// again, and taking that create back trashed the folder with everything in it
	it('refuses a new folder that is already there, so undo cannot take it away', async () => {
		fs.files.add('/proj/.github/workflows/build.yml');
		await ops.create('/proj', '.github', 'dir');
		expect(ops.history.canUndo).toBe(false);
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/.github/workflows/build.yml']);
	});

	it('a new operation drops the redo stack', async () => {
		fs.files.add('/proj/a.tex');
		fs.files.add('/proj/b.tex');
		await ops.deleteMany([fileEntry('/proj/a.tex')]);
		await ops.history.undo();
		expect(ops.history.canRedo).toBe(true);
		await ops.deleteMany([fileEntry('/proj/b.tex')]);
		expect(ops.history.canRedo).toBe(false);
	});

	it('keeps a failed undo on the stack instead of swallowing it', async () => {
		fs.files.add('/proj/a.tex');
		await ops.deleteMany([fileEntry('/proj/a.tex')]);
		// something else now occupies the old path, so restore must refuse rather than overwrite
		fs.files.add('/proj/a.tex');
		await ops.history.undo();
		expect(ops.history.canUndo).toBe(true); // still available once the obstruction is gone
		expect(ops.history.canRedo).toBe(false); // and never presented as if it had been undone

		fs.files.delete('/proj/a.tex');
		await ops.history.undo();
		expect(ops.history.canUndo).toBe(false);
		expect(visible(fs.files)).toEqual(['/proj/a.tex']);
	});

	it('records nothing when the provider cannot trash, and still deletes', async () => {
		const plain = makeFs();
		delete (plain.deps as Partial<TreeOpsDeps>).trash;
		delete (plain.deps as Partial<TreeOpsDeps>).restore;
		const noUndo = new TreeOps(plain.deps);
		plain.files.add('/proj/a.tex');
		await noUndo.deleteMany([fileEntry('/proj/a.tex')]);
		expect([...plain.files]).toEqual([]); // gone for good, as before
		expect(noUndo.undoable).toBe(false);
		expect(noUndo.history.canUndo).toBe(false);
	});

	it('closing the file being deleted clears the open path', async () => {
		fs.files.add('/proj/sec/a.tex');
		activeFilePath.current = '/proj/sec/a.tex';
		await ops.deleteMany([dirEntry('/proj/sec')]);
		// the buffer has to let go: an autosave firing after this would recreate the deleted file
		expect(activeFilePath.current).toBeNull();
	});
});

// Dropping onto a name that is taken used to fail at the file system with "already exists". It now
// asks, and replaces by recycling what stood there: every other delete in the tree is recoverable,
// and a drag is the easiest gesture in the app to make by accident.
describe('replacing on a drop', () => {
	let fs: ReturnType<typeof makeFs>;
	let ops: TreeOps;

	beforeEach(() => {
		workspaceRoot.current = '/proj';
		activeFilePath.current = null;
		replaceAnswer.ok = true;
		fs = makeFs();
		ops = new TreeOps(fs.deps);
		fs.files.add('/proj/a.tex');
		fs.files.add('/proj/sub/a.tex');
	});

	it('recycles the destination, so the replaced file can still be recovered', async () => {
		const r = await ops.move(fileEntry('/proj/a.tex'), '/proj/sub');
		expect(r).toMatchObject({ from: '/proj/a.tex', to: '/proj/sub/a.tex' });
		expect(visible(fs.files)).toEqual(['/proj/sub/a.tex']);
		expect([...fs.backups]).toEqual(['/appdata/undo/slot0/a.tex']);
	});

	it('leaves both files alone when the prompt is declined', async () => {
		replaceAnswer.ok = false;
		expect(await ops.move(fileEntry('/proj/a.tex'), '/proj/sub')).toBeNull();
		expect(visible(fs.files)).toEqual(['/proj/a.tex', '/proj/sub/a.tex']);
		expect([...fs.backups]).toEqual([]);
	});

	it('does not ask when the destination is free', async () => {
		fs.files.delete('/proj/sub/a.tex');
		replaceAnswer.ok = false; // would refuse if it were asked
		expect(await ops.move(fileEntry('/proj/a.tex'), '/proj/sub')).not.toBeNull();
		expect(visible(fs.files)).toEqual(['/proj/sub/a.tex']);
	});
});

// A folder dropped from the file manager merges into one of the same name, and a file in it that
// lands on one already there wrote over it: nothing in the recycle bin, and an undo that took the
// new file away left nothing at all.
describe('importing a folder onto files already there', () => {
	let fs: ReturnType<typeof makeFs>;
	let ops: TreeOps;
	let text: Map<string, string>;

	beforeEach(() => {
		workspaceRoot.current = '/proj';
		activeFilePath.current = null;
		replaceAnswer.ok = true;
		fs = makeFs();
		ops = new TreeOps(fs.deps);
		text = new Map([['/proj/figs/plot.tex', 'mine']]);
		fs.files.add('/proj/figs/plot.tex');
		const { trash, restore } = fs.deps;
		fs.deps.writeBinary = async (p, f) => {
			fs.files.add(p);
			text.set(p, await f.text());
		};
		fs.deps.trash = async (p, root) => {
			const r = await trash!(p, root);
			if (r.backup) text.set(r.backup, text.get(p) ?? '');
			text.delete(p);
			return r;
		};
		fs.deps.restore = async (from, to) => {
			await restore!(from, to);
			text.set(to, text.get(from) ?? '');
		};
	});

	const dropped = () => [{ relPath: 'figs/plot.tex', file: new File(['theirs'], 'plot.tex') }];

	it('replaces it only when asked, and undo brings it back', async () => {
		await ops.import(dropped(), '/proj');
		expect(text.get('/proj/figs/plot.tex')).toBe('theirs');
		await ops.history.undo();
		expect(text.get('/proj/figs/plot.tex')).toBe('mine');
		await ops.history.redo();
		expect(text.get('/proj/figs/plot.tex')).toBe('theirs');
	});

	it('leaves it alone when the prompt is declined', async () => {
		replaceAnswer.ok = false;
		await ops.import(dropped(), '/proj');
		expect(text.get('/proj/figs/plot.tex')).toBe('mine');
	});
});

// Renaming a file that has unsaved edits must carry them to the new name. VS Code snapshots the
// dirty model and restores it at the target; here the file's text moves to the new name with its
// unwritten edits, so they arrive as the renamed file's content. The failure this guards against is
// the write still aimed at the old path, which recreates it.
describe('unsaved edits follow a rename', () => {
	let fs: ReturnType<typeof makeFs>;
	let ops: TreeOps;

	beforeEach(() => {
		workspaceRoot.current = '/proj';
		activeFilePath.current = null;
		saveCalls.length = 0;
		fs = makeFs();
		ops = new TreeOps(fs.deps);
	});

	it('repoints the unwritten edit instead of discarding it', async () => {
		fs.files.add('/proj/a.tex');
		activeFilePath.current = '/proj/a.tex';
		await ops.rename(fileEntry('/proj/a.tex'), 'b.tex');
		expect(saveCalls).toEqual(['retarget /proj/a.tex -> /proj/b.tex']);
		expect(activeFilePath.current).toBe('/proj/b.tex');
	});

	it('repoints a file inside a folder that was renamed', async () => {
		fs.files.add('/proj/sec/a.tex');
		activeFilePath.current = '/proj/sec/a.tex';
		await ops.rename(dirEntry('/proj/sec'), 'chapters');
		expect(saveCalls).toEqual(['retarget /proj/sec -> /proj/chapters']);
		expect(activeFilePath.current).toBe('/proj/chapters/a.tex');
	});

	it('leaves alone a file whose name differs only in case, on Linux', async () => {
		const disk = { '/proj/Notes.tex': 'other', '/proj/notes.tex': 'saved' };
		const folder = await openMemoryFolder('/proj', memoryFs(disk), {
			open: ['/proj/Notes.tex', '/proj/notes.tex'],
			loaded: () => activeFilePath.current
		});
		fs.deps.retargetPendingSave = (from, to) => folder.writer.retarget(from, to);
		fs.files.add('/proj/Notes.tex');
		fs.files.add('/proj/notes.tex');
		tabs.bind(null, false);
		tabs.noteOpened('/proj/notes.tex');
		activeFilePath.current = '/proj/notes.tex';
		folder.type('/proj/notes.tex', 'edited');
		await ops.rename(fileEntry('/proj/Notes.tex'), 'Renamed.tex');
		expect(visible(fs.files)).toEqual(['/proj/Renamed.tex', '/proj/notes.tex']);
		expect(tabs.list.map((t) => t.path)).toEqual(['/proj/notes.tex']);
		expect(folder.writer.pending).toEqual({ path: '/proj/notes.tex', content: 'edited' });
		expect(folder.textOf('/proj/Renamed.tex')).toBe('other');
		expect(activeFilePath.current).toBe('/proj/notes.tex');
	});
});

// A replace destroys a file, so it has to be undoable like every other delete in the tree, and in
// the same gesture: one Ctrl+Z puts back both the file that moved and the one it replaced.
describe('undoing a replace', () => {
	let fs: ReturnType<typeof makeFs>;
	let ops: TreeOps;

	beforeEach(() => {
		workspaceRoot.current = '/proj';
		activeFilePath.current = null;
		replaceAnswer.ok = true;
		fs = makeFs();
		ops = new TreeOps(fs.deps);
		fs.files.add('/proj/a.tex');
		fs.files.add('/proj/sub/a.tex');
	});

	it('brings back both files, and redo replaces again', async () => {
		await ops.moveMany([fileEntry('/proj/a.tex')], '/proj/sub');
		expect(visible(fs.files)).toEqual(['/proj/sub/a.tex']);

		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/a.tex', '/proj/sub/a.tex']);

		await ops.history.redo();
		expect(visible(fs.files)).toEqual(['/proj/sub/a.tex']);

		// and a second round trip still works, which is what re-taking the backup slot is for
		await ops.history.undo();
		expect(visible(fs.files)).toEqual(['/proj/a.tex', '/proj/sub/a.tex']);
	});
});
