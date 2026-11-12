import { describe, expect, it } from 'vitest';
import type { Node } from 'prosemirror-model';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { typstTableLook } from '$lib/languages/typst/visual/plugins/table/rules/typstTableEdges';

function tableOf(source: string): Node {
	let table: Node | null = null;
	typstToProseMirror(source).doc.descendants((node) => {
		if (!table && node.type.name === 'table') table = node;
		return !table;
	});
	return table!;
}

const edgesOf = (source: string, inFigure = false) => [...typstTableLook.edgesOf(tableOf(source), inFigure).values()];

describe('the lines a Typst table prints', () => {
	it('strokes every edge of a plain table, with the text left in the page and centered in a figure', () => {
		const plain = '#table(columns: 2, [a], [b], [c], [d])\n';
		expect(new Set(edgesOf(plain).map((e) => JSON.stringify(e)))).toEqual(
			new Set([JSON.stringify({ top: 'light', bottom: 'light', left: true, right: true, align: 'left' })])
		);
		expect(new Set(edgesOf(plain, true).map((e) => e.align))).toEqual(new Set(['center']));
	});

	it('prints only the written lines under stroke: none, and follows align by column', () => {
		const source =
			'#table(columns: 2, stroke: none, align: (left, right),\n  table.hline(stroke: 2pt),\n  [Model], [Dev],\n  table.hline(),\n  [Ours], [78.4],\n  table.hline(stroke: 2pt),\n)\n';
		expect(edgesOf(source)).toEqual([
			{ top: 'heavy', bottom: 'light', left: false, right: false, align: 'left' },
			{ top: 'heavy', bottom: 'light', left: false, right: false, align: 'right' },
			{ top: 'light', bottom: 'heavy', left: false, right: false, align: 'left' },
			{ top: 'light', bottom: 'heavy', left: false, right: false, align: 'right' }
		]);
	});

	it('fills the width only with fr or percent columns', () => {
		expect(typstTableLook.fillsWidth(tableOf('#table(columns: (1fr, 2fr), [a], [b])\n'))).toBe(true);
		expect(typstTableLook.fillsWidth(tableOf('#table(columns: (auto, 4cm), [a], [b])\n'))).toBe(false);
	});
});
