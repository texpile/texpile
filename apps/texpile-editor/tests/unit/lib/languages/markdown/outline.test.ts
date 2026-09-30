// The source-mode outline of a .md: the headings a reader would list, where they start.
import { describe, expect, it } from 'vitest';
import { markdownOutline } from '$lib/languages/markdown/outline';

describe('markdownOutline', () => {
	it('lists ATX and setext headings with their level and offset', () => {
		const src = '# Introduction\nText.\n\nBackground\n----------\n\n### Details ###\n';
		expect(markdownOutline(src)).toEqual([
			{ level: 1, text: 'Introduction', pos: 0 },
			{ level: 2, text: 'Background', pos: src.indexOf('Background') },
			{ level: 3, text: 'Details', pos: src.indexOf('### Details') }
		]);
	});

	it('shows the words of a heading, not its markup', () => {
		const items = markdownOutline('## *Bold* `code` [a link](https://x.org "t") ~~gone~~ <b>tag</b> \\#1\n');
		expect(items[0].text).toBe('Bold code a link gone tag #1');
	});

	it('ignores # in fenced code and HTML comments', () => {
		const src = '```\n# not a heading\n```\n\n<!--\n# nor this\n-->\n\n# Real\n';
		expect(markdownOutline(src).map((i) => i.text)).toEqual(['Real']);
	});

	it('finds headings in block quotes and lists', () => {
		expect(markdownOutline('> ## Quoted\n\n- ### Listed\n').map((i) => [i.level, i.text])).toEqual([
			[2, 'Quoted'],
			[3, 'Listed']
		]);
	});

	it('reads past front matter, whose closing --- is no setext underline', () => {
		const src = '---\ntitle: Notes\n---\n# First\n';
		expect(markdownOutline(src)).toEqual([{ level: 1, text: 'First', pos: src.indexOf('# First') }]);
	});

	it('keeps offsets right after a byte order mark', () => {
		const src = '\ufeff---\ntitle: x\n---\n\n## After\n';
		expect(markdownOutline(src)[0].pos).toBe(src.indexOf('## After'));
	});

	it('is empty for a document without headings', () => {
		expect(markdownOutline('Just a paragraph.\n')).toEqual([]);
	});
});
