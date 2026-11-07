// Typst's own elements written as calls (#figure, #heading) open as the editor's nodes and keep every argument the file
// gave them when an edit writes them again
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';

function first(doc: Node, type: string): { node: Node; pos: number } {
	let found: { node: Node; pos: number } | null = null;
	doc.descendants((node, pos) => {
		if (!found && node.type.name === type) found = { node, pos };
		return !found;
	});
	return found!;
}

/** the file after typing `text` at the end of the first `type` textblock */
function typeInto(src: string, type: string, text: string): string {
	const parsed = parseTypstFile(src);
	const { node, pos } = first(parsed.doc, type);
	const tr = EditorState.create({ doc: parsed.doc }).tr.insertText(text, pos + 1 + node.content.size);
	return serializeTypstFile(parsed, tr.doc);
}

function setAttrs(src: string, type: string, attrs: Record<string, unknown>): string {
	const parsed = parseTypstFile(src);
	const { node, pos } = first(parsed.doc, type);
	const tr = EditorState.create({ doc: parsed.doc }).tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
	return serializeTypstFile(parsed, tr.doc);
}

describe('a #figure', () => {
	it('with placement and a string caption is an image whose caption edit keeps the arguments', () => {
		const src = '#figure(\n  image("a.png", width: 100%),\n  caption: "A curious figure",\n  placement: top,\n) <fig:a>\n';
		expect(first(parseTypstFile(src).doc, 'image').node.textContent).toBe('A curious figure');
		expect(typeInto(src, 'image', '.')).toBe(src.replace('figure"', 'figure."'));
	});

	it('around a code listing holds the code, and its caption is editable', () => {
		const src = '#figure(\n  ```py\n  x = 15\n  ```,\n  caption: [Addition],\n  kind: "listing",\n)\n';
		const fig = first(parseTypstFile(src).doc, 'typ_figure').node;
		expect(fig.child(0).type.name).toBe('code_block');
		expect(fig.child(0).textContent).toBe('x = 15');
		expect(typeInto(src, 'typ_figure_caption', ' in Python')).toBe(src.replace('[Addition]', '[Addition in Python]'));
	});

	it('loses its caption with the caption and nothing else', () => {
		const src = '#figure(\n  caption: [Shown],\n  rect(),\n  supplement: [Box],\n)\n';
		const parsed = parseTypstFile(src);
		const { node, pos } = first(parsed.doc, 'typ_figure_caption');
		const tr = EditorState.create({ doc: parsed.doc }).tr.delete(pos, pos + node.nodeSize);
		expect(serializeTypstFile(parsed, tr.doc)).toBe('#figure(\n  rect(),\n  supplement: [Box],\n)\n');
	});
});

describe('a #heading call', () => {
	it('keeps outlined: and its numbering when its level changes', () => {
		const src = '#heading(level: 2, outlined: false, numbering: none)[Abstract]\n\nText.\n';
		const heading = first(parseTypstFile(src).doc, 'heading').node;
		expect(heading.attrs).toMatchObject({ level: 2, numbered: false });
		expect(setAttrs(src, 'heading', { level: 3 })).toBe(src.replace('level: 2', 'level: 3'));
		expect(setAttrs(src, 'heading', { numbered: true })).toBe(src.replace(', numbering: none', ''));
	});

	it('without parentheses stays without them until it needs an argument', () => {
		const src = '#heading[Introduction] <c-intro>\n';
		expect(first(parseTypstFile(src).doc, 'heading').node.attrs.label).toBe('c-intro');
		expect(typeInto(src, 'heading', '!')).toBe('#heading[Introduction!] <c-intro>\n');
		expect(setAttrs(src, 'heading', { level: 2 })).toBe('#heading(level: 2)[Introduction] <c-intro>\n');
	});
});

describe('inline elements', () => {
	it('styling calls, links to labels, line breaks and fenced raw are marks and breaks, written back as the file had them', () => {
		const src =
			'A #strike[gone], #smallcaps("Caps"), #highlight(fill: blue.C)[blue], #link(<intro>)[intro], ```typ #x()``` and #linebreak() end.\n';
		const para = parseTypstFile(src).doc.child(0);
		const chips: string[] = [];
		para.forEach((child) => {
			if (child.type.name === 'inline_latex') chips.push(child.textContent);
		});
		expect(chips).toEqual([]);
		expect(para.textContent).toBe('A gone, Caps, blue, intro, #x() and  end.');
		expect(typeInto(src, 'paragraph', ' More')).toBe(src.replace('end.\n', 'end. More\n'));
	});

	it('a url in prose is a link, and text typed after it does not run into it', () => {
		const src = 'See https://typst.app/docs here.\n';
		const parsed = parseTypstFile(src);
		expect(
			parsed.doc
				.child(0)
				.child(1)
				.marks.map((m) => m.type.name)
		).toEqual(['link']);
		const at = 1 + 'See https://typst.app/docs'.length;
		const tr = EditorState.create({ doc: parsed.doc })
			.tr.delete(at, at + ' here.'.length)
			.insertText('/x', at);
		const back = parseTypstFile(serializeTypstFile(parsed, tr.doc)).doc.child(0);
		expect(back.textContent).toBe('See https://typst.app/docs/x');
		expect(back.child(1).marks.map((m) => m.type.name)).toEqual(['link']);
		expect(back.child(1).text).toBe('https://typst.app/docs');
	});
});
