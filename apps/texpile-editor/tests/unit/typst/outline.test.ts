// The source-mode outline of a .typ: the headings a reader would list, where they start.
import { describe, expect, it } from 'vitest';
import { typstSourceOutline } from '$lib/languages/typst/outline';

describe('typstSourceOutline', () => {
	it('lists headings with their level and offset', async () => {
		const src = '= Introduction\nText.\n\n== Background <bg>\n\n=== Details\n';
		expect(await typstSourceOutline(src)).toEqual([
			{ level: 1, text: 'Introduction', pos: 0 },
			{ level: 2, text: 'Background', pos: src.indexOf('== Background') },
			{ level: 3, text: 'Details', pos: src.indexOf('=== Details') }
		]);
	});

	it('shows the words of a heading, not its markup', async () => {
		const items = await typstSourceOutline('= *Bold* and _em_ with #smallcaps[Caps] and $x^2$ \\#1\n');
		expect(items[0].text).toBe('Bold and em with Caps and $x^2$ #1');
	});

	it('finds headings inside content blocks', async () => {
		expect((await typstSourceOutline('#block[\n  = Inside\n]\n')).map((i) => i.text)).toEqual(['Inside']);
	});

	it('ignores `=` in raw text, strings and comments', async () => {
		const src = '```\n= not a heading\n```\n#let s = "= nor this"\n// = nor this\n= Real\n';
		expect((await typstSourceOutline(src)).map((i) => i.text)).toEqual(['Real']);
	});

	it('is empty for a document without headings', async () => {
		expect(await typstSourceOutline('Just a paragraph.\n')).toEqual([]);
	});
});
