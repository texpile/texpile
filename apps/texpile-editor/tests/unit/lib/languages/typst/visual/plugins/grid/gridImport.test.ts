import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';
import { typSchema } from '$lib/languages/typst/visual/schema';
import { typGridNode } from '$lib/languages/typst/visual/typstTableNodes';

const SRC = `Before.

#grid(
  columns: (1fr, 1fr),
  gutter: 1em,
  [Left],
  figure(image("a.png"), caption: [Cap]),
  ..rest,
)

#grid(columns: 2, [Alpha], [Beta]) <g>

After.
`;

function typed(src: string, after: string, text: string) {
	const parsed = parseTypstFile(src);
	let at = -1;
	parsed.doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text!.includes(after)) at = pos + node.text!.indexOf(after) + after.length;
	});
	const state = EditorState.create({ doc: parsed.doc });
	return { parsed, edited: state.apply(state.tr.insertText(text, at)).doc };
}

describe('a grid made in the editor', () => {
	it('is written as a call with a content block for each cell', () => {
		const grid = typGridNode(typSchema);
		const filled = grid.type.create(grid.attrs, [
			grid.child(0).type.create(null, typSchema.nodes.paragraph.create(null, typSchema.text('A'))),
			grid.child(1).type.create(null, typSchema.nodes.paragraph.create(null, typSchema.text('B')))
		]);
		expect(serializeToTypst(typSchema.nodes.doc.create(null, [filled]))).toBe('#grid(columns: 2, [A], [B])');
	});
});

describe('a grid of cells', () => {
	it('is a grid node whose content cells hold blocks and whose other arguments hold their code', () => {
		const { doc } = parseTypstFile(SRC);
		const grids: string[][] = [];
		doc.descendants((node) => {
			if (node.type.name === 'typ_grid')
				grids.push(node.content.content.map((cell) => (cell.attrs.code ? `code:${cell.textContent}` : cell.textContent)));
		});
		// a figure written as code is the figure's node, its caption editable
		expect(grids).toEqual([
			['Left', 'code:Cap', 'code:..rest'],
			['Alpha', 'Beta']
		]);
		expect(doc.child(1).child(1).child(0).type.name).toBe('image');
		expect(serializeToTypst(doc)).toContain('  [Left],\n  figure(image("a.png"), caption: [Cap]),\n  ..rest,');
		expect(doc.child(1).attrs.args).toBe('\n  columns: (1fr, 1fr),\n  gutter: 1em,\n  ');
		expect(serializeTypstFile(parseTypstFile(SRC), doc)).toBe(SRC);
	});

	it('rewrites only its own call when a cell is edited', () => {
		const { parsed, edited } = typed(SRC, 'Left', ' side');
		expect(serializeTypstFile(parsed, edited)).toBe(SRC.replace('[Left]', '[Left side]'));
		const second = typed(SRC, 'Beta', 'b');
		expect(serializeTypstFile(second.parsed, second.edited)).toBe(SRC.replace('[Alpha], [Beta]', '[Alpha], [Betab]'));
	});
});
