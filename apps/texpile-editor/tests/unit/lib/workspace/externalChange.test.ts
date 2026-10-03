// An mtime-only rewrite of the open file (touch, a formatter, a checkout and back) trips the save
// guard; the conflict check then found disk equal to the baseline and returned without a fresh
// stamp, so every later autosave tripped the guard again and nothing reached disk.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExternalChangeWatcher, type ExternalChangeDeps } from '$lib/workspace/externalChange.svelte';
import { activeFilePath, isDirty } from '$lib/workspace/workspaceStore';
import { recordDiskStamp } from '$lib/workspace/diskStamp';

vi.mock('$lib/workspace/diskStamp', () => ({ recordDiskStamp: vi.fn(async () => {}) }));

const PATH = '/ws/main.tex';

function makeWatcher(over: Partial<ExternalChangeDeps> = {}) {
	const deps: ExternalChangeDeps = {
		getLoadedPath: () => PATH,
		isTextual: () => true,
		isStructured: () => true,
		whenIdle: async () => {},
		readText: async () => 'same',
		getDiskBaseline: () => 'same',
		setDiskBaseline: () => {},
		getBuffer: () => 'same',
		setTexSource: () => {},
		setRawContent: () => {},
		setEol: () => {},
		rebuildVisual: () => {},
		discardQueuedSave: () => {},
		sessionEdit: () => {},
		saveNow: () => {},
		exists: async () => true,
		setDeleted: () => {},
		takeSessionWrite: () => null,
		...over
	};
	return new ExternalChangeWatcher(deps);
}

beforeEach(() => {
	vi.mocked(recordDiskStamp).mockClear();
	activeFilePath.current = PATH;
	isDirty.current = true;
});

describe('ExternalChangeWatcher.check', () => {
	it('re-stamps when disk holds the same bytes as the baseline', async () => {
		const w = makeWatcher({ getBuffer: () => 'same plus my edit' });
		await w.check();
		expect(recordDiskStamp).toHaveBeenCalledWith(PATH);
		expect(w.conflict).toBeNull();
	});

	it('raises the conflict, and does not re-stamp, when disk really changed under a dirty buffer', async () => {
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine' });
		await w.check();
		expect(w.conflict?.disk).toBe('theirs');
		expect(recordDiskStamp).not.toHaveBeenCalled();
	});
});

// Hosting, the session writes a guest's words to the open file before the visual editor has taken
// them in. Read as someone else's write, the reload put that older text back over the shared one and
// took away what the guest typed since, or asked the host about a conflict with nobody.
describe('the session writing the open file for a guest', () => {
	it('takes the write as its own, neither reloading nor asking', async () => {
		isDirty.current = false;
		const sessionEdit = vi.fn();
		const setDiskBaseline = vi.fn();
		const common = { readText: async () => 'base guest', getDiskBaseline: () => 'base', takeSessionWrite: () => 'base guest' };
		const idle = makeWatcher({ ...common, getBuffer: () => 'base', sessionEdit, setDiskBaseline });
		await idle.check();
		expect(sessionEdit).not.toHaveBeenCalled();
		expect(setDiskBaseline).toHaveBeenCalledWith('base guest');
		expect(recordDiskStamp).toHaveBeenCalledWith(PATH);

		isDirty.current = true;
		const typing = makeWatcher({ ...common, getBuffer: () => 'base host' });
		await typing.check();
		expect(typing.conflict).toBeNull();
	});
});

// The two real answers each destroy one of the two versions, so the dialog's Escape / X had to
// stop meaning "keep mine": dismissing now defers, and nothing is written or replaced.
describe('ExternalChangeWatcher.resolve', () => {
	it('defer leaves disk and the buffer exactly as they are', async () => {
		const saveNow = vi.fn();
		const setTexSource = vi.fn();
		const discardQueuedSave = vi.fn();
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine', saveNow, setTexSource, discardQueuedSave });
		await w.check();
		expect(w.conflict).not.toBeNull();

		w.resolve('defer');
		expect(w.conflict).toBeNull();
		expect(saveNow).not.toHaveBeenCalled(); // disk keeps their version
		expect(setTexSource).not.toHaveBeenCalled(); // the buffer keeps mine
		expect(discardQueuedSave).not.toHaveBeenCalled();
		expect(isDirty.current).toBe(true); // still unsaved, so the next save asks again
	});

	it('keep still forces the write through the guard', async () => {
		const saveNow = vi.fn();
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine', saveNow });
		await w.check();
		w.resolve('keep');
		expect(saveNow).toHaveBeenCalled();
	});
});

// Renaming or deleting the open file from outside left Texpile none the wiser: the read failed,
// the watcher returned, the save guard reported "unchanged" for a file that was not there, and the
// next save recreated it under the old name with no indication anything had happened.
describe('the open file going missing', () => {
	const gone = async () => {
		throw new Error('ENOENT: no such file or directory');
	};

	it('marks the document deleted once the path is confirmed gone', async () => {
		const setDeleted = vi.fn();
		const w = makeWatcher({ readText: gone, exists: async () => false, setDeleted });
		await w.check();
		expect(setDeleted).toHaveBeenCalledWith(true);
	});

	// a file being rewritten in place is briefly unreadable, and network shares report deletes for
	// files that are still there; one failed read is not proof
	it('says nothing when the file is still there after all', async () => {
		const setDeleted = vi.fn();
		const w = makeWatcher({ readText: gone, exists: async () => true, setDeleted });
		await w.check();
		expect(setDeleted).not.toHaveBeenCalledWith(true);
	});

	it('clears the mark when the file comes back', async () => {
		const setDeleted = vi.fn();
		const w = makeWatcher({ setDeleted });
		await w.check();
		expect(setDeleted).toHaveBeenCalledWith(false);
	});

	it('leaves the buffer alone: it is the only copy left', async () => {
		const setTexSource = vi.fn();
		const discardQueuedSave = vi.fn();
		const w = makeWatcher({ readText: gone, exists: async () => false, setTexSource, discardQueuedSave });
		await w.check();
		expect(setTexSource).not.toHaveBeenCalled();
		expect(discardQueuedSave).not.toHaveBeenCalled();
		expect(isDirty.current).toBe(true);
	});
});

// "Decide later" has to mean later. Autosave is on by default, so without this the same question
// came back 1.5 seconds after the next keystroke, forever.
describe('a postponed conflict', () => {
	const conflicting = { readText: async () => 'theirs', getBuffer: () => 'mine' };

	it('is not asked again for the same disk content', async () => {
		const w = makeWatcher(conflicting);
		await w.check();
		expect(w.conflict).not.toBeNull();
		w.resolve('defer');

		await w.check();
		expect(w.conflict).toBeNull(); // still postponed
		expect(w.deferred?.disk).toBe('theirs');
	});

	it('is asked again when disk changes to something else', async () => {
		let disk = 'theirs';
		const w = makeWatcher({ readText: async () => disk, getBuffer: () => 'mine' });
		await w.check();
		w.resolve('defer');

		disk = 'theirs, edited again';
		await w.check();
		expect(w.conflict?.disk).toBe('theirs, edited again');
	});

	// pressing Save used to do nothing at all here: the write aborted on the guard and the postponed
	// conflict swallowed the prompt, so the keystroke had no visible effect
	it('asks again when a manual save runs into the postponed conflict', async () => {
		const w = makeWatcher({ readText: async () => 'theirs', getBuffer: () => 'mine' });
		await w.check();
		w.resolve('defer');

		await w.check(true);
		expect(w.conflict?.disk).toBe('theirs');
	});

	it('stops being postponed once the next question is answered', async () => {
		let disk = 'theirs';
		const w = makeWatcher({ readText: async () => disk, getBuffer: () => 'mine' });
		await w.check();
		w.resolve('defer');
		disk = 'theirs again';
		await w.check();
		w.resolve('keep');
		expect(w.deferred).toBeNull();
	});
});
