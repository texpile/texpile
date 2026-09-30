// An image figure's caption the editor shows is a caption in the file, empty or not: typst draws
// "Figure 1:" for `caption: []` as the editor does, and a figure with "Show caption" off has none.
import { describe, it, expect } from 'vitest';
import { Transform } from 'prosemirror-transform';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typSchema } from '$lib/languages/typst/visual/schema';

const FIGURE = 'Before.\n\n#figure(\n  image("a.png", width: 60%),\n  caption: [A plot.],\n) <fig:a>\n\nAfter.\n';

function firstImage(doc: Node): { node: Node; pos: number } {
	let found: { node: Node; pos: number } | null = null;
	doc.descendants((node, pos) => {
		if (!found && node.type.name === 'image') found = { node, pos };
	});
	return found!;
}

function withAttrs(doc: Node, attrs: Record<string, unknown>): Node {
	const { node, pos } = firstImage(doc);
	return new Transform(doc).setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs }).doc;
}

describe('an image figure caption', () => {
	it('emptied in the editor is written empty, and reopens shown', () => {
		const parsed = parseTypstFile(FIGURE);
		const { node, pos } = firstImage(parsed.doc);
		const doc = new Transform(parsed.doc).delete(pos + 1, pos + 1 + node.content.size).doc;
		const out = serializeTypstFile(parsed, doc);
		expect(out).toContain('#figure(image("a.png", width: 60%), caption: []) <fig:a>');
		expect(firstImage(parseTypstFile(out).doc).node.attrs.showCaption).toBe(true);
	});

	it('reads as shown when the file has an empty one, and is left out once turned off', () => {
		const parsed = parseTypstFile('#figure(image("a.png"), caption: [])\n');
		expect(firstImage(parsed.doc).node.attrs.showCaption).toBe(true);
		expect(serializeTypstFile(parsed, withAttrs(parsed.doc, { showCaption: false }))).toBe('#figure(image("a.png"))\n');
		expect(firstImage(parseTypstFile('#figure(image("a.png"))\n').doc).node.attrs.showCaption).toBe(false);
	});

	it('is written empty for an image the editor adds, and a bare image stays bare', () => {
		const added = typSchema.nodes.image.create({ src: 'a.png' });
		expect(serializeToTypst(typSchema.nodes.doc.create(null, [added]))).toBe('#figure(image("a.png"), caption: [])');
		const bare = parseTypstFile('#image("c.svg")\n');
		expect(serializeTypstFile(bare, withAttrs(bare.doc, { options: 'width: 50%' }))).toBe('#image("c.svg", width: 50%)\n');
	});
});
