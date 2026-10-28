import { describe, expect, it } from 'vitest';
import { overlayUnsaved, searchLineTest } from '$lib/search/unsavedSearch';

describe('overlayUnsaved', () => {
	it('searches a file with unsaved edits in the editor, dropping its disk hits, even when it no longer matches', () => {
		const disk = [
			{ file: '/p/a.tex', rel: 'a.tex', matches: [{ line: 1, text: 'old colour' }] },
			{ file: '/p/b.tex', rel: 'b.tex', matches: [{ line: 2, text: 'colour' }] }
		];
		const unsaved = [
			{ path: '/p/a.tex', text: 'new color' },
			{ path: '/p/c.tex', text: 'one\ncolour here' }
		];
		const test = searchLineTest('colour', { regex: false, caseSensitive: false })!;
		expect(overlayUnsaved(disk, unsaved, '/p', test)).toEqual([
			{ file: '/p/b.tex', rel: 'b.tex', matches: [{ line: 2, text: 'colour' }] },
			{ file: '/p/c.tex', rel: 'c.tex', matches: [{ line: 2, text: 'colour here' }] }
		]);
	});
});
