// tab-set semantics: dedupe by path identity, neighbor pick on close, folder rename/delete
// fan-out, pruning against the live tree, and the single preview slot (an opened-but-unedited
// file gives its tab up to the next one). The older tests keep() each file first, which is what
// editing it does - without that every open would land in the same slot.
//
// A tab is now a file OR a comparison of that file against a version, so the store is keyed by
// tabKey rather than by path. Everything below is the same behaviour expressed through that key.
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { tabs, tabKey } from '$lib/workspace/tabs.svelte';

const platform = vi.hoisted(() => ({ isMac: false, isWindows: false }));
vi.mock('$lib/platform', () => platform);
afterEach(() => {
	platform.isWindows = false;
});

/** open a file and edit it: the way a tab becomes permanent */
function openAndEdit(path: string) {
	tabs.noteOpened(path);
	tabs.keep(path);
}
/** the store's contents as plain paths, for the file-only assertions */
const paths = () => tabs.list.map((t) => t.path);

describe('tabs store', () => {
	beforeEach(() => tabs.bind(null, false));

	it('dedupes opens case-insensitively on Windows and cycles in order', () => {
		platform.isWindows = true;
		openAndEdit('C:\\p\\main.tex');
		openAndEdit('C:\\p\\intro.tex');
		tabs.noteOpened('C:\\P\\MAIN.TEX'); // same file, Windows casing
		expect(tabs.list.length).toBe(2);
		expect(tabs.cycle('C:\\p\\main.tex', 1)?.path).toBe('C:\\p\\intro.tex');
		expect(tabs.cycle('C:\\p\\main.tex', -1)?.path).toBe('C:\\p\\intro.tex');
	});

	it('closing the active tab hands over to the right neighbor, then left', () => {
		for (const f of ['a.tex', 'b.tex', 'c.tex']) openAndEdit(`C:\\p\\${f}`);
		expect(tabs.neighborOf('C:\\p\\b.tex')?.path).toBe('C:\\p\\c.tex');
		tabs.close('C:\\p\\c.tex');
		expect(tabs.neighborOf('C:\\p\\b.tex')?.path).toBe('C:\\p\\a.tex');
	});

	it('folder rename and delete fan out to contained tabs, prune drops dead files', () => {
		openAndEdit('C:\\p\\ch\\one.tex');
		openAndEdit('C:\\p\\main.tex');
		tabs.rename('C:\\p\\ch', 'C:\\p\\parts');
		expect(paths()[0]).toBe('C:\\p\\parts\\one.tex');
		tabs.closeUnder('C:\\p\\parts');
		expect(paths()).toEqual(['C:\\p\\main.tex']);
		tabs.prune([]);
		expect(paths()).toEqual([]);
	});
});

describe('preview tab', () => {
	beforeEach(() => tabs.bind(null, false));

	it('reuses the one slot while nothing is edited', () => {
		tabs.noteOpened('C:\\p\\a.tex');
		tabs.noteOpened('C:\\p\\b.tex');
		tabs.noteOpened('C:\\p\\c.tex');
		expect(paths()).toEqual(['C:\\p\\c.tex']);
		expect(tabs.isPreview('C:\\p\\c.tex')).toBe(true);
	});

	it('an edit makes the tab permanent, so the next file gets its own', () => {
		tabs.noteOpened('C:\\p\\a.tex');
		tabs.keep('C:\\p\\a.tex');
		tabs.noteOpened('C:\\p\\b.tex');
		expect(paths()).toEqual(['C:\\p\\a.tex', 'C:\\p\\b.tex']);
		expect(tabs.isPreview('C:\\p\\a.tex')).toBe(false);
		expect(tabs.isPreview('C:\\p\\b.tex')).toBe(true);
	});

	it('replaces only the unedited tab, however many edited ones sit beside it', () => {
		openAndEdit('C:\\p\\keep1.tex');
		tabs.noteOpened('C:\\p\\glance.tex');
		tabs.noteOpened('C:\\p\\keep2.tex'); // takes glance's slot, glance was never edited
		expect(paths()).toEqual(['C:\\p\\keep1.tex', 'C:\\p\\keep2.tex']);
		tabs.keep('C:\\p\\keep2.tex');
		tabs.noteOpened('C:\\p\\third.tex');
		expect(paths()).toEqual(['C:\\p\\keep1.tex', 'C:\\p\\keep2.tex', 'C:\\p\\third.tex']);
	});

	it('reopening a file that is already open changes nothing', () => {
		openAndEdit('C:\\p\\a.tex');
		tabs.noteOpened('C:\\p\\b.tex');
		tabs.noteOpened('C:\\p\\a.tex'); // still open: no slot change, b survives
		expect(paths()).toEqual(['C:\\p\\a.tex', 'C:\\p\\b.tex']);
		expect(tabs.isPreview('C:\\p\\b.tex')).toBe(true);
	});

	it('gives up the slot when the previewed file closes, is renamed, or disappears', () => {
		tabs.noteOpened('C:\\p\\a.tex');
		tabs.close('C:\\p\\a.tex');
		expect(tabs.preview).toBe(null);

		tabs.noteOpened('C:\\p\\b.tex');
		tabs.rename('C:\\p\\b.tex', 'C:\\p\\renamed.tex');
		expect(tabs.isPreview('C:\\p\\renamed.tex')).toBe(true);

		tabs.prune([]);
		expect(tabs.preview).toBe(null);
	});

	it('restored tabs are all permanent: the first file opened appends', () => {
		// bind() replays a persisted set; none of it was "just glanced at" this session
		expect(tabs.preview).toBe(null);
	});
});

// A comparison is a tab in its own right. The invariants that matter: it never takes the file's
// tab, two versions of one file are two tabs, and it dies with the file it compares.
describe('comparison tabs', () => {
	beforeEach(() => tabs.bind(null, false));

	const V1 = { hash: 'aaa111', subject: 'First draft' };
	const V2 = { hash: 'bbb222', subject: 'Second draft' };

	it('opens beside the file rather than replacing it', () => {
		openAndEdit('C:\\p\\main.tex');
		tabs.openCompare('C:\\p\\main.tex', V1);
		expect(tabs.list).toHaveLength(2);
		expect(tabs.list.filter((t) => !t.compare)).toHaveLength(1);
	});

	it('keeps two versions of one file as two tabs', () => {
		openAndEdit('C:\\p\\main.tex');
		const k1 = tabs.openCompare('C:\\p\\main.tex', V1);
		tabs.keep(k1);
		const k2 = tabs.openCompare('C:\\p\\main.tex', V2);
		expect(k1).not.toBe(k2);
		expect(tabs.list.filter((t) => t.compare)).toHaveLength(2);
	});

	it('re-opening the same comparison focuses it instead of duplicating', () => {
		openAndEdit('C:\\p\\main.tex');
		tabs.openCompare('C:\\p\\main.tex', V1);
		tabs.openCompare('C:\\p\\main.tex', V1);
		expect(tabs.list.filter((t) => t.compare)).toHaveLength(1);
	});

	it('closing the file takes its comparisons with it', () => {
		openAndEdit('C:\\p\\main.tex');
		openAndEdit('C:\\p\\other.tex');
		tabs.openCompare('C:\\p\\main.tex', V1);
		tabs.closeFile('C:\\p\\main.tex');
		expect(paths()).toEqual(['C:\\p\\other.tex']);
	});

	it('a comparison is not listed among the open documents', () => {
		// paths is what the MCP surface reports: files only
		openAndEdit('C:\\p\\main.tex');
		tabs.openCompare('C:\\p\\main.tex', V1);
		expect(tabs.paths).toEqual(['C:\\p\\main.tex']);
	});

	it('a folder rename retargets a comparison too, keeping its version', () => {
		tabs.openCompare('C:\\p\\ch\\one.tex', V1);
		tabs.rename('C:\\p\\ch', 'C:\\p\\parts');
		const moved = tabs.list[0];
		expect(moved.path).toBe('C:\\p\\parts\\one.tex');
		expect(moved.compare).toEqual(V1);
		// the preview slot holds a KEY built from the path, so it has to have been re-derived
		expect(tabs.isPreview(tabKey(moved))).toBe(true);
	});
});

describe('reopening closed tabs', () => {
	beforeEach(() => tabs.bind(null, false));

	it('brings back the last closed tab first, skipping one that is open again or gone', () => {
		for (const f of ['a.tex', 'b.tex', 'c.tex']) openAndEdit(`C:\\p\\${f}`);
		tabs.close('C:\\p\\a.tex');
		tabs.close('C:\\p\\c.tex');
		tabs.close('C:\\p\\b.tex');
		openAndEdit('C:\\p\\b.tex');
		expect(tabs.reopen((p) => !p.endsWith('c.tex'))?.path).toBe('C:\\p\\a.tex');
		expect(paths()).toEqual(['C:\\p\\b.tex', 'C:\\p\\a.tex']);
		expect(tabs.isPreview('C:\\p\\a.tex')).toBe(false);
		expect(tabs.reopen(() => true)).toBeNull();
	});
});
