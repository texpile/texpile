// @vitest-environment jsdom
// What a paste into a source file becomes: a spreadsheet range a table and a URL over words a link on
// their own, formatting offered only when it says more than the plain text, code never.
import { describe, expect, it } from 'vitest';
import { linkSource, sourcePasteKinds } from '$lib/editor/source/paste/sourcePasteOptions';
import { formattedSource, tableSource } from '$lib/editor/source/paste/sourcePasteConvert';
import { imageSource } from '$lib/editor/source/paste/sourcePasteImage';

const SHEETS =
	'<google-sheets-html-origin><style type="text/css">td {border: 1px solid #ccc;}</style><table><tr><td>Name</td><td>Qty</td></tr>' +
	'<tr><td>Apple</td><td>3</td></tr></table>';

describe('source paste', () => {
	it('converts a spreadsheet range and a URL over words on its own, and nothing else', () => {
		expect(sourcePasteKinds({ html: SHEETS, text: 'Name\tQty\nApple\t3' }, '', true)).toEqual(['table', 'plain']);
		// with no HTML it may be a data file's columns: the table is offered, the text goes in
		expect(sourcePasteKinds({ html: '', text: 'a\tb\n1\t2\n' }, '', false)).toEqual(['plain', 'table']);
		expect(sourcePasteKinds({ html: '', text: 'https://x.com/a' }, 'the docs', false)).toEqual(['link', 'plain']);
		expect(sourcePasteKinds({ html: '', text: 'https://x.com/a' }, '', false)).toEqual(['plain']);
		expect(sourcePasteKinds({ html: '', text: '\tindented\n\tcode' }, '', false)).toEqual(['plain']);
	});

	it('writes a spreadsheet range as a table in each language, a pipe table with its first row as header', () => {
		expect(tableSource({ html: SHEETS, text: '' }, 'latex')).toBe(
			'\\begin{tabular}{|c|c|}\n\\hline\nName &Qty \\\\\\hline\nApple &3 \\\\\\hline\n\\end{tabular}'
		);
		expect(tableSource({ html: SHEETS, text: '' }, 'typst')).toBe('#table(\n  columns: 2,\n  [Name], [Qty],\n  [Apple], [3],\n)');
		expect(tableSource({ html: '', text: 'Name\tQty\nApple\t3' }, 'markdown')).toBe('| Name | Qty |\n| --- | --- |\n| Apple | 3 |');
	});

	it('offers formatting only when there is some, never for a code editor’s copy', () => {
		const vscode =
			'<div style="font-family: Consolas, monospace; white-space: pre;"><div><span style="color:#569cd6">let</span> x</div></div>';
		expect(formattedSource({ html: vscode, text: 'let x' }, 'latex')).toBeNull();
		expect(formattedSource({ html: '<p>plain words</p>', text: 'plain words' }, 'latex')).toBeNull();
		expect(formattedSource({ html: '<p>a <b>bold</b> <a href="https://x.com">link</a></p>', text: 'a bold link' }, 'typst')).toBe(
			'a *bold* #link("https://x.com")[link]'
		);
	});

	it('writes a link’s % and # so LaTeX reads them in any argument, and a picture path with spaces so Markdown reads it', () => {
		expect(linkSource('https://x.com/a%20b#part', 'the docs', 'latex')).toBe('\\href{https://x.com/a\\%20b\\#part}{the docs}');
		expect(imageSource('figures/My Plot (1).png', 'markdown')).toBe('![](<figures/My Plot (1).png>)');
		expect(imageSource('figures/plot.png', 'markdown')).toBe('![](figures/plot.png)');
	});
});
