// The one writer: every change to a file's text reaches disk, never over someone else's write, and what the disk
// says comes back in as an edit that is undone like any other and never written back.
import { describe, it, expect, vi } from 'vitest';
import * as Y from 'yjs';
import { TextBuffers, type WriteHooks } from '$lib/buffers/textBuffers';
import { manifestOf } from '$lib/collab/session';

function fakeDisk(files: Record<string, string>) {
	const disk: Record<string, string> = { ...files };
	const writes: { path: string; content: string }[] = [];
	const fs = {
		readBytes: async (p: string) => {
			const rel = p.replace(/^root\//, '');
			if (!(rel in disk)) throw new Error('ENOENT ' + p);
			return new TextEncoder().encode(disk[rel]);
		},
		writeText: async (p: string, content: string) => {
			writes.push({ path: p, content });
			disk[p.replace(/^root\//, '')] = content;
		},
		listFiles: async () => Object.entries(disk).map(([rel, text]) => ({ rel, size: text.length }))
	};
	return { disk, writes, fs };
}

async function open(files: Record<string, string>, hooks: WriteHooks = {}) {
	const d = fakeDisk(files);
	const buffers = new TextBuffers('root', d.fs, (r, rel) => `${r}/${rel}`);
	buffers.hooks = hooks;
	await buffers.ensure('main.tex');
	const text = buffers.text('main.tex')!;
	return { ...d, buffers, text };
}

describe('TextBuffers writing', () => {
	it('writes an edit, keeping the file line endings, and knows the disk has it', async () => {
		const afterWrite = vi.fn();
		const { buffers, text, disk } = await open({ 'main.tex': 'a\r\nb\r\n' }, { afterWrite });
		buffers.fold('main.tex', 'a\nb!\n');
		expect(buffers.hasPending('main.tex')).toBe(true);
		await buffers.flushAll();
		expect(disk['main.tex']).toBe('a\r\nb!\r\n');
		expect([buffers.isDirty('main.tex'), buffers.hasPending('main.tex'), text.toString()]).toEqual([false, false, 'a\nb!\n']);
		expect(afterWrite).toHaveBeenCalledWith('root/main.tex', 'a\nb!\n');
	});

	it('refuses to write over a change on disk, keeps the edit and asks; forced it writes', async () => {
		const conflict = vi.fn();
		const { buffers, disk } = await open({ 'main.tex': 'one' }, { diskChanged: async () => true, conflict });
		buffers.fold('main.tex', 'mine');
		await buffers.flushAll();
		expect([disk['main.tex'], buffers.hasPending('main.tex')]).toEqual(['one', true]);
		expect(conflict).toHaveBeenLastCalledWith('root/main.tex', false);
		await buffers.save('main.tex');
		expect(conflict).toHaveBeenLastCalledWith('root/main.tex', true);
		await buffers.save('main.tex', true);
		expect(disk['main.tex']).toBe('mine');
	});

	it('keeps an edit that failed to write, and the next flush lands it', async () => {
		const failed = vi.fn();
		const { buffers, disk, fs } = await open({ 'main.tex': 'one' }, { failed });
		const write = fs.writeText;
		fs.writeText = async () => {
			throw new Error('locked');
		};
		buffers.fold('main.tex', 'two');
		await buffers.flushAll();
		expect([disk['main.tex'], buffers.hasPending('main.tex'), failed.mock.calls.length]).toEqual(['one', true, 1]);
		fs.writeText = write;
		await buffers.flushAll();
		expect(disk['main.tex']).toBe('two');
	});

	it('holds an edit off the disk while autosave stands down, and writes it when asked', async () => {
		vi.useFakeTimers();
		try {
			let held = true;
			const { buffers, disk } = await open({ 'main.tex': 'one' }, { heldOff: () => held });
			buffers.fold('main.tex', 'two');
			await vi.advanceTimersByTimeAsync(5000);
			expect([disk['main.tex'], buffers.hasPending('main.tex')]).toEqual(['one', true]);
			held = false;
			buffers.resume('main.tex');
			await vi.advanceTimersByTimeAsync(5000);
			expect(disk['main.tex']).toBe('two');
		} finally {
			vi.useRealTimers();
		}
	});

	it('undoes the save check rewrite together with the edit it saved, and keeps a redo waiting', async () => {
		const { buffers, text, disk } = await open({ 'main.tex': 'one' }, { verify: async (_p, c) => (c === 'two' ? 'TWO' : null) });
		const um = buffers.undoOf('main.tex')!;
		buffers.fold('main.tex', 'two');
		// the write comes after the autosave delay, well past the history's grouping window
		um.stopCapturing();
		await buffers.flushAll();
		expect(disk['main.tex']).toBe('TWO');
		um.undo();
		await buffers.flushAll();
		expect([text.toString(), disk['main.tex'], um.redoStack.length]).toEqual(['one', 'one', 1]);
	});

	it('writes what the save check hands back, and the text takes it too', async () => {
		const { buffers, text, disk } = await open({ 'main.tex': 'one' }, { verify: async (_p, c) => c.toUpperCase() });
		buffers.fold('main.tex', 'two');
		await buffers.flushAll();
		expect([disk['main.tex'], text.toString()]).toEqual(['TWO', 'TWO']);
	});
});

describe('TextBuffers taking in the disk', () => {
	it('takes a change on disk in as an undoable edit it never writes back; the undo is written', async () => {
		const { buffers, text, disk, writes } = await open({ 'main.tex': 'one' });
		disk['main.tex'] = 'two';
		buffers.adoptDisk('main.tex', 'two');
		await buffers.flushAll();
		expect([text.toString(), writes.length, buffers.isDirty('main.tex')]).toEqual(['two', 0, false]);
		buffers.undoOf('main.tex')!.undo();
		await buffers.flushAll();
		expect([text.toString(), disk['main.tex']]).toEqual(['one', 'one']);
	});

	it('catches a file up with its disk, unless it holds edits not written yet', async () => {
		const { buffers, text, disk } = await open({ 'main.tex': 'one', 'other.tex': 'x' }, { diskChanged: async () => true });
		await buffers.ensure('other.tex');
		disk['main.tex'] = 'outside';
		disk['other.tex'] = 'outside';
		buffers.fold('other.tex', 'mine');
		await buffers.syncFromDisk();
		expect([text.toString(), buffers.text('other.tex')!.toString(), buffers.hasPending('other.tex')]).toEqual(['outside', 'mine', true]);
	});

	it('dropping edits a write was refused for leaves the outside change standing, and the next write asks again', async () => {
		const stamped: Record<string, string> = {};
		const d = fakeDisk({ 'main.tex': 'base' });
		const rel = (p: string) => p.replace(/^root\//, '');
		const buffers = new TextBuffers('root', d.fs, (r, x) => `${r}/${x}`);
		buffers.hooks = {
			diskChanged: async (p) => (p in stamped || rel(p) in stamped ? d.disk[rel(p)] !== stamped[rel(p)] : false),
			recordStamp: async (p) => void (stamped[rel(p)] = d.disk[rel(p)])
		};
		await buffers.ensure('main.tex');
		buffers.fold('main.tex', 'mine');
		d.disk['main.tex'] = 'theirs';
		await buffers.flushAll();
		buffers.revert('main.tex');
		buffers.fold('main.tex', buffers.text('main.tex')!.toString() + ', typed after');
		await buffers.flushAll();
		expect(d.disk['main.tex']).toBe('theirs');
		await buffers.syncFromDisk();
		expect(buffers.text('main.tex')!.toString()).toBe('base, typed after');
	});

	it('carries unwritten edits along a rename and writes them at the new name', async () => {
		const { buffers, disk } = await open({ 'main.tex': 'one' });
		buffers.fold('main.tex', 'two');
		disk['ch/main.tex'] = disk['main.tex'];
		delete disk['main.tex'];
		buffers.move('main.tex', 'ch/main.tex');
		await buffers.flushAll();
		expect([disk['ch/main.tex'], buffers.has('main.tex')]).toEqual(['two', false]);
	});
});

describe('TextBuffers and a session', () => {
	it('keeps hidden files out of the doc a session shares, and lists the rest when sharing starts', async () => {
		const { buffers, disk } = await open({ 'main.tex': 'one', '.latexmkrc': '$pdf_mode = 1;', 'refs.bib': '@a{b}' });
		await buffers.ensure('.latexmkrc');
		buffers.fold('.latexmkrc', '$pdf_mode = 4;');
		await buffers.flushAll();
		expect(disk['.latexmkrc']).toBe('$pdf_mode = 4;');
		await buffers.sharing.start();
		const manifest = manifestOf(buffers.shared);
		expect([manifest.get('main.tex')?.kind, manifest.get('refs.bib')?.kind, manifest.has('.latexmkrc')]).toEqual(['text', 'text', false]);
	});
});

describe('TextBuffers around writes that race', () => {
	it('holds a file outside the folder by its own path, writes it there and never shares it', async () => {
		const { buffers, disk } = await open({ 'main.tex': 'one', '/elsewhere/defs.tex': 'defs' });
		await buffers.ensure('/elsewhere/defs.tex');
		buffers.fold('/elsewhere/defs.tex', 'defs changed');
		await buffers.flushAll();
		expect([disk['/elsewhere/defs.tex'], buffers.inShared('/elsewhere/defs.tex')]).toEqual(['defs changed', false]);
	});

	it('saves the text when the comment log cannot be written', async () => {
		const beforeWrite = async () => {
			throw new Error('read-only .texpile');
		};
		const { buffers, disk } = await open({ 'main.tex': 'one' }, { beforeWrite });
		buffers.fold('main.tex', 'two');
		await buffers.flushAll();
		expect(disk['main.tex']).toBe('two');
	});

	it('does not bring back a file deleted outside on autosave; Ctrl+S does', async () => {
		const d = fakeDisk({ 'main.tex': 'one' });
		const buffers = new TextBuffers('root', d.fs, (r, rel) => `${r}/${rel}`);
		buffers.hooks = { diskChanged: async (p) => (p.replace(/^root\//, '') in d.disk ? false : 'gone') };
		await buffers.ensure('main.tex');
		buffers.fold('main.tex', 'two');
		delete d.disk['main.tex'];
		await buffers.flushAll();
		expect('main.tex' in d.disk).toBe(false);
		await buffers.save('main.tex');
		expect(d.disk['main.tex']).toBe('two');
	});

	it('writes nothing over a change on disk made while the save check ran', async () => {
		const stamped: Record<string, string> = {};
		const d = fakeDisk({ 'main.tex': 'one' });
		const rel = (p: string) => p.replace(/^root\//, '');
		const buffers = new TextBuffers('root', d.fs, (r, x) => `${r}/${x}`);
		buffers.hooks = {
			diskChanged: async (p) => p in stamped && d.disk[rel(p)] !== stamped[p],
			recordStamp: async (p) => void (stamped[p] = d.disk[rel(p)]),
			verify: async () => {
				d.disk['main.tex'] = 'theirs';
				return null;
			}
		};
		await buffers.ensure('main.tex');
		await Promise.resolve();
		buffers.fold('main.tex', 'mine');
		await buffers.flushAll();
		expect([d.disk['main.tex'], buffers.refusedFiles]).toEqual(['theirs', ['main.tex']]);
	});

	it('a rename while a write waits on the save check leaves the old name gone', async () => {
		let release = () => {};
		let entered = () => {};
		const checked = new Promise<void>((r) => (release = r));
		const inCheck = new Promise<void>((r) => (entered = r));
		const verify = async () => {
			entered();
			await checked;
			return null;
		};
		const { buffers, disk } = await open({ 'main.tex': 'one' }, { verify });
		buffers.fold('main.tex', 'two');
		const writing = buffers.flushAll();
		await inCheck;
		disk['ch.tex'] = disk['main.tex'];
		delete disk['main.tex'];
		buffers.move('main.tex', 'ch.tex');
		release();
		await writing;
		await buffers.flushAll();
		expect(['main.tex' in disk, disk['ch.tex']]).toEqual([false, 'two']);
	});

	it('keeps a byte order mark through a save', async () => {
		const { buffers, disk } = await open({ 'main.tex': '﻿one' });
		buffers.fold('main.tex', buffers.text('main.tex')!.toString() + '!');
		await buffers.flushAll();
		expect(disk['main.tex']).toBe('﻿one!');
	});
});

describe('TextBuffers when a session starts', () => {
	it('sends nothing deleted before it started', async () => {
		const { buffers, text } = await open({ 'main.tex': 'one' });
		buffers.fold('main.tex', 'one secret words');
		buffers.undoOf('main.tex')!.stopCapturing();
		buffers.fold('main.tex', 'one');
		await buffers.sharing.start();
		expect([text.toString(), new TextDecoder().decode(Y.encodeStateAsUpdate(buffers.shared)).includes('secret')]).toEqual(['one', false]);
	});

	it('keeps the edits of a file opened while its files were read', async () => {
		let release = () => {};
		const slow = new Promise<void>((r) => (release = r));
		const { buffers, fs } = await open({ 'main.tex': 'one', 'ch.tex': 'disk' });
		const read = fs.readBytes;
		let reads = 0;
		// the session's read of ch.tex waits; the editor's own read of it does not
		fs.readBytes = async (p: string) => {
			if (p === 'root/ch.tex' && reads++ === 0) await slow;
			return read(p);
		};
		const starting = buffers.sharing.start();
		await new Promise((r) => setTimeout(r, 0));
		await buffers.ensure('ch.tex');
		buffers.fold('ch.tex', 'typed meanwhile');
		release();
		await starting;
		expect(buffers.text('ch.tex')!.toString()).toBe('typed meanwhile');
	});
});
