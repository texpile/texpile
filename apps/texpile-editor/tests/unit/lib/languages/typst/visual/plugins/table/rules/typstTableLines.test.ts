import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { withTypstLines } from '$lib/languages/typst/visual/plugins/table/rules/typstTableLines';
import { typstTableLook } from '$lib/languages/typst/visual/plugins/table/rules/typstTableLook';
import type { TableLines } from '$lib/editor/visual/extensions/table/rules/tableRules';

function tableAt(doc: Node): number {
	let at = -1;
	doc.descendants((node, pos) => {
		if (at < 0 && node.type.name === 'table') at = pos;
		return at < 0;
	});
	return at;
}

function withLines(source: string, lines: TableLines): { out: string; read: TableLines | null } {
	const parsed = parseTypstFile(source);
	const state = EditorState.create({ doc: parsed.doc });
	const at = tableAt(state.doc);
	const edited = withTypstLines(state.tr, at, lines).doc;
	return { out: serializeTypstFile(parsed, edited), read: typstTableLook.linesOf(edited.nodeAt(at)!) };
}

describe('the Lines choice of a Typst table', () => {
	it('writes the stroke and lines of the choice, the middle line under the header, and reads the choice back', () => {
		const plain = '#table(\n  columns: 2,\n  fill: luma(240),\n  table.header([K], [V]),\n  [a], [1],\n  [b], [2],\n)\n';

		const formal = withLines(plain, 'formal');
		expect(formal.read).toBe('formal');
		expect(formal.out).toBe(
			'#table(\n  columns: 2,\n  fill: luma(240),\n  stroke: none,\n  table.hline(),\n  table.header([K], [V]),\n  table.hline(),\n  [a], [1],\n  [b], [2],\n  table.hline(),\n)\n'
		);

		const none = withLines(formal.out, 'none');
		expect(none.read).toBe('none');
		expect(none.out).toBe(
			'#table(\n  columns: 2,\n  fill: luma(240),\n  stroke: none,\n  table.header([K], [V]),\n  [a], [1],\n  [b], [2],\n)\n'
		);

		const all = withLines(none.out, 'all');
		expect(all.read).toBe('all');
		expect(all.out).toBe(plain);
	});
});
