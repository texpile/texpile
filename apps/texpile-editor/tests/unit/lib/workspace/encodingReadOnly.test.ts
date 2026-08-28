// @vitest-environment jsdom
// The gate that matters is on the BUFFER, not the editor widget. Hiding the places a user can type
// is not the same as closing the path that writes: onVisualChange reaches the save pipeline from a
// load-time transaction, with no keystroke involved.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$lib/workspace/fileSystem', () => ({
	basename: (p: string) => p.split(/[\\/]/).pop() ?? p,
	relativeTo: (root: string, p: string) => p.slice(root.length + 1),
	joinPath: (a: string, b: string) => `${a}/${b}`,
	samePath: (a: string, b: string) => a === b,
	readTextFile: () => Promise.reject(new Error('no fs in this test')),
	writeTextFile: () => Promise.resolve(),
	statFile: () => Promise.resolve({ exists: false, mtimeMs: 0, size: 0 })
}));

const { DocumentBuffer } = await import('$lib/workspace/documentBuffer.svelte');

/** the text fsService.read() hands the renderer for these bytes */
const asRead = (bytes: Buffer) => bytes.toString('utf-8');
const LATIN1 = asRead(Buffer.from('\\section{Caf\u00e9}\nDer wei\u00df.\n', 'latin1'));
const UTF16 = asRead(Buffer.from('\\section{Plain}\n', 'utf16le'));
const CLEAN = '\\section{Caf\u00e9}\nDer wei\u00df.\n';

let scheduled: string[];
let written: string[];

function buffer() {
	return new DocumentBuffer({
		scheduleSave: (_p, content) => scheduled.push(content),
		discardQueuedSave: () => {},
		writeNow: (_p, content) => written.push(content),
		rebuildVisual: () => {},
		isVisualMode: () => false,
		noteLocalEdit: () => {},
		clearPendingAnchor: () => {}
	});
}

beforeEach(() => {
	scheduled = [];
	written = [];
});

describe('a file that is not UTF-8', () => {
	it('still opens, so its content can be read', () => {
		const b = buffer();
		b.openTex('C:/p/main.tex', LATIN1, '\n');
		expect(b.texSource).toBe(LATIN1);
		expect(b.path).toBe('C:/p/main.tex');
	});

	it('is flagged, with a reason to show the reader', () => {
		const b = buffer();
		b.openTex('C:/p/main.tex', LATIN1, '\n');
		expect(b.encodingIssue).toBeTruthy();
	});

	// autosave is on by default and a save rewrites the WHOLE file, so one keystroke would otherwise
	// take every accented character in the file with it
	it('never queues a save, however the edit arrives', () => {
		const b = buffer();
		b.openTex('C:/p/main.tex', LATIN1, '\n');
		b.onTexInput('edited');
		b.replaceSource('replaced', { dirty: true });
		expect(scheduled).toEqual([]);
	});

	it('ignores an explicit Ctrl+S too, which reaches writeNow directly', () => {
		const b = buffer();
		b.openTex('C:/p/main.tex', LATIN1, '\n');
		b.onTexInput('edited');
		b.save();
		expect(written).toEqual([]);
	});

	it('covers raw kinds (.bib and friends), not just .tex', () => {
		const b = buffer();
		b.openRaw('C:/p/refs.bib', LATIN1, '\n');
		b.onRawInput('edited');
		b.save();
		expect(scheduled).toEqual([]);
		expect(written).toEqual([]);
	});

	it('flags UTF-16 as well as legacy 8-bit', () => {
		const b = buffer();
		b.openTex('C:/p/main.tex', UTF16, '\n');
		expect(b.encodingIssue).toBeTruthy();
		b.onTexInput('edited');
		expect(scheduled).toEqual([]);
	});
});

describe('a UTF-8 file is untouched by any of this', () => {
	it('carries no flag and saves normally', () => {
		const b = buffer();
		b.openTex('C:/p/main.tex', CLEAN, '\n');
		expect(b.encodingIssue).toBeNull();
		b.onTexInput('edited');
		b.save();
		expect(scheduled).toEqual(['edited']);
		expect(written).toEqual(['edited']);
	});

	// the flag is per-file: a blocked file must not poison the next one opened in the same buffer
	it('clears the flag when a clean file replaces a blocked one', () => {
		const b = buffer();
		b.openTex('C:/p/bad.tex', LATIN1, '\n');
		expect(b.encodingIssue).toBeTruthy();
		b.openTex('C:/p/good.tex', CLEAN, '\n');
		expect(b.encodingIssue).toBeNull();
		b.onTexInput('edited');
		expect(scheduled).toEqual(['edited']);
	});
});
