import { describe, it, expect } from 'vitest';
import { Transform } from 'prosemirror-transform';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { argsWithLanguage } from '$lib/languages/latex/parser/listingLanguage';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema as S } from '$lib/languages/typst/visual/schema';

describe('a code block whose language was picked from the list', () => {
	it('names it with a word typst reads whole, keeping the code as typed', () => {
		for (const [name, tag] of [
			['C++', 'cpp'],
			['C#', 'cs'],
			['F#', 'fs'],
			['Common Lisp', 'common-lisp']
		]) {
			const block = S.nodes.code_block.create({ env: 'fence', lang: name, args: argsWithLanguage('fence', '', name) }, S.text('int x;'));
			const out = serializeToTypst(S.nodes.doc.create(null, [block]));
			const back = typstToProseMirror(out).doc.child(0);
			expect(back.textContent, out).toBe('int x;');
			expect(back.attrs.args, out).toBe(tag);
		}
	});
});

describe('an image resized by dragging', () => {
	function dragged(options: string): string {
		const img = S.nodes.image.create({ src: 'a.png', options, numbered: false, showCaption: false, width: 200, maxWidth: 400 });
		return serializeToTypst(S.nodes.doc.create(null, [img]));
	}

	it('replaces only its width, an option holding a comma kept whole', () => {
		expect(dragged('alt: "x, width: y"')).toBe('#image("a.png", width: 50%, alt: "x, width: y")');
		expect(dragged('width: calc.min(50%, 3cm), fit: "cover"')).toBe('#image("a.png", width: 50%, fit: "cover")');
		const back = typstToProseMirror(dragged('alt: "x, width: y"')).doc.child(0);
		expect(back.type.name).toBe('image');
		expect(back.attrs.options).toBe('width: 50%, alt: "x, width: y"');
	});

	it('stays a bare image when it carries a label, as the file wrote it', () => {
		const src = '#image("a.png") <lbl>\n';
		const img = typstToProseMirror(src).doc.child(0);
		const resized = S.nodes.image.create({ ...img.attrs, width: 200, maxWidth: 400 });
		expect(serializeToTypst(S.nodes.doc.create(null, [resized]))).toBe('#image("a.png", width: 50%) <lbl>');
	});
});

describe('a figure table whose caption is empty', () => {
	it('keeps its caption: [] when the table is written afresh, and gains none it did not have', () => {
		const src = '#figure(\n  table(\n    columns: 2,\n    [a], [b],\n  ),\n  caption: [],\n) <tab:x>\n';
		const parsed = parseTypstFile(src);
		let at = -1;
		parsed.doc.descendants((n, pos) => {
			if (at < 0 && n.isText && n.text === 'a') at = pos;
			return at < 0;
		});
		const edited = new Transform(parsed.doc).replaceWith(at, at + 1, S.text('A')).doc;
		expect(serializeTypstFile(parsed, edited)).toContain('caption: []');
		expect(serializeToTypst(typstToProseMirror(src).doc)).toContain('caption: []');
		expect(serializeToTypst(typstToProseMirror(src.replace('  caption: [],\n', '')).doc)).not.toContain('caption');
	});
});
