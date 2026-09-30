// Constructs read from source must regenerate as typst reads them. Every case here is hidden
// behind the verbatim layer until its block is edited, which is why the round-trip suite never
// saw them; each was confirmed by compiling original and regenerated source and comparing the
// rendered pages (the 2026-09-05 hunt, findings T1 to T24).
import { describe, it, expect } from 'vitest';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typSchema } from '$lib/languages/typst/visual/schema';
import type { Node } from 'prosemirror-model';

/** every block regenerates: the converter's docs carry no norm, so nothing is verbatim */
function regen(src: string): string {
	return serializeToTypst(typstToProseMirror(src).doc);
}

const shape = (src: string) => typstToProseMirror(src).doc.content.content.map((n) => n.type.name);

describe('paragraph content (T1, T5, T13)', () => {
	it('a // comment inside a wrapped paragraph ends its line, so the text after it still renders', () => {
		expect(regen('First line\n// commented out line\nthird line.\n')).toBe('First line // commented out line\nthird line.');
		expect(regen('Text start // note\nmore text on the next line.\n')).toBe('Text start // note\nmore text on the next line.');
	});

	it('a slash after a closing star stays text, since */ ends a comment', () => {
		expect(regen('*a*\\/b\n')).toBe('*a*\\/b');
	});

	it('inline code-mode expressions stay inside their paragraph', () => {
		for (const src of [
			'It is #if true [yes] else [no] today.\n',
			'Page #context counter(page).display() of many.\n',
			'Value #{ 1 + 1 } here.\n'
		]) {
			expect(shape(src)).toEqual(['paragraph']);
			expect(regen(src)).toBe(src.trimEnd());
		}
	});

	it('a three-backtick raw is a block only when it holds a line end', () => {
		expect(shape('```rust let x = 1;``` starts the paragraph.\n')).toEqual(['paragraph']);
		expect(regen('```py x = 1```\n')).toBe('```py x = 1```');
		expect(regen('Text.\n```py\nx = 1\n```\n')).toBe('Text.\n```py\nx = 1\n```');
	});
});

describe('code mode and comments (T4, T8)', () => {
	it('a terminating semicolon belongs to the statement, not to the prose after it', () => {
		expect(regen('#let a = 1; text after\n')).toBe('#let a = 1;\ntext after');
		expect(regen('#let a = 1 ; text after\n')).toBe('#let a = 1 ;\ntext after');
	});

	it('an if keeps the line end that stops it reading on into the prose after it', () => {
		expect(regen('#if true [a]\nelse b\n')).toBe('#if true [a]\nelse b');
		expect(regen('Text #for\nx in y.\n')).toBe('Text #for\nx in y.');
	});

	it('a comment between or on list items does not split the list', () => {
		expect(shape('- a\n// c\n- b\n')).toEqual(['list', 'list']);
		expect(regen('- a\n// c\n- b\n')).toBe('- a // c\n- b');
		expect(regen('/ a: 1\n// c\n/ b: 2\n')).toBe('/ a: 1 // c\n/ b: 2');
	});
});

describe('lists and math (T9, T10, T12)', () => {
	it('explicit enum numbers come back as written', () => {
		expect(regen('1. a\n5. b\n6. c\n')).toBe('1. a\n5. b\n6. c');
		expect(regen('+ a\n5. b\n+ c\n')).toBe('+ a\n5. b\n+ c');
	});

	it('an inline equation standing alone stays inline', () => {
		expect(shape('$x^2$\n')).toEqual(['paragraph']);
		expect(regen('$x^2$\n')).toBe('$x^2$');
		expect(regen('- $x$\n- $ y $\n')).toBe('- $x$\n- $ y $');
	});

	it('a fence inside a list item reaches a fixed point instead of gaining indentation', () => {
		const src = '- a\n\n  ```py\n  x = 1\n  ```\n- b\n';
		const g1 = regen(src);
		expect(g1).toBe(src.trimEnd());
		expect(regen(g1)).toBe(g1);
	});
});

describe('file bytes (T14, T17)', () => {
	it('a CRLF file stays CRLF after an edit, fences included', () => {
		const src = '= Title\r\n\r\nText\r\nwrapped.\r\n\r\n```py\r\nx = 1\r\ny = 2\r\n```\r\n';
		const parsed = parseTypstFile(src);
		expect(parsed.doc.child(2).textContent).toBe('x = 1\ny = 2');
		const kids: Node[] = [];
		parsed.doc.forEach((c, _o, i) => kids.push(i === 1 ? c.type.create({ ...c.attrs }, typSchema.text('EDITED')) : c));
		const out = serializeTypstFile(parsed, parsed.doc.copy(typSchema.nodes.doc.create(null, kids).content));
		expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
		expect(out).toContain('EDITED\r\n\r\n```py\r\nx = 1\r\ny = 2\r\n```');
	});

	it('a BOM is not text: the first heading stays a heading and the BOM survives a save', () => {
		const src = '﻿= Title\n\nText.\n';
		const parsed = parseTypstFile(src);
		expect(parsed.doc.child(0).type.name).toBe('heading');
		expect(serializeTypstFile(parsed, parsed.doc)).toBe(src);
		const kids: Node[] = [];
		parsed.doc.forEach((c, _o, i) => kids.push(i === 1 ? c.type.create({ ...c.attrs }, typSchema.text('EDITED')) : c));
		expect(serializeTypstFile(parsed, parsed.doc.copy(typSchema.nodes.doc.create(null, kids).content))).toBe('﻿= Title\n\nEDITED\n');
	});
});

describe('headings (T18, T20)', () => {
	it('an empty heading is still a heading', () => {
		expect(regen('= \n\nText.\n')).toBe('=\n\nText.');
	});

	it('a label beside a heading belongs to the heading', () => {
		const doc = typstToProseMirror('= Intro\n<sec:intro>\n\nBody.\n').doc;
		expect(doc.child(0).attrs.label).toBe('sec:intro');
		// written back on the line the file gave it, beside or under the heading
		expect(regen('= Intro\n<sec:intro>\n\nBody.\n')).toBe('= Intro\n<sec:intro>\n\nBody.');
		expect(regen('= Intro <sec:intro>\n\nBody.\n')).toBe('= Intro <sec:intro>\n\nBody.');
		// and it no longer merges the heading's neighbour into one raw island
		expect(shape('= Refs\n<sec:refs>\n\n#bibliography("refs.bib")\n')).toEqual(['heading', 'raw_latex']);
	});

	it('a heading holding a line comment or a label is written as a call, since either would end an = heading', () => {
		for (const src of ['#heading(depth: 1)[A // note\n#x] <a>', '#heading(depth: 2)[A *B* <red> C]']) {
			expect(shape(src)).toEqual(['heading']);
			expect(regen(src)).toBe(src);
		}
		expect(regen('#heading(depth: 2)[Plain]\n')).toBe('== Plain');
	});
});

describe('math and strings (T22, T24)', () => {
	it('theta is theta; theta.alt is vartheta', () => {
		expect(typstToProseMirror('$ theta $\n').doc.child(0).textContent).toBe('\\theta');
		expect(typstToProseMirror('$ theta.alt $\n').doc.child(0).textContent).toBe('\\vartheta');
	});

	it('string escapes in a link target decode once and encode once', () => {
		const out = regen('#link("https://e.org/\\u{e9}")[q]\n');
		expect(out).toBe('#link("https://e.org/é")[q]');
		expect(regen(out)).toBe(out);
	});
});
