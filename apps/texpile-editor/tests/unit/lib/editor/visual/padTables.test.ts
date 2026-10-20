import { describe, it, expect } from 'vitest';
import { parseLatexFile, serializeLatexFile } from '../../../../../src/lib/workspace/latexRoundtrip';
import { withoutOrigins } from '../../../../../src/lib/editor/visual/parseOrigins';
import { padTablesInState } from '../../../../../src/lib/editor/visual/padTables';
import { swapParsedDoc } from '../../../../../src/lib/editor/visual/docSwap';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { EditorState } from 'prosemirror-state';
import type { Node as PmNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

// a one-cell first row over a two-column row, which only a view mount or an edit can produce
function shortRowDoc(): PmNode {
	const cell = (text: string) =>
		schema.nodes.table_cell.create(null, schema.nodes.paragraph.create(null, text ? schema.text(text) : undefined));
	const row = (...texts: string[]) => schema.nodes.table_row.create(null, texts.map(cell));
	const table = schema.nodes.table.create(null, [row('c'), row('a', 'b')]);
	return schema.nodes.doc.create(null, [schema.nodes.table_wrapper.createAndFill(null, table)!]);
}

const firstRowTexts = (doc: PmNode): string[] => {
	let texts: string[] | undefined;
	doc.descendants((n) => {
		if (n.type.name === 'table_row') texts ??= n.children.map((c) => c.textContent);
		return true;
	});
	return texts!;
};

describe('padTables', () => {
	it('pads a short first row at its end', () => {
		const src = [
			'\\documentclass{article}',
			'\\begin{document}',
			'\\begin{tabular}{ccc}',
			'\\multicolumn{1}{c}{} & b\\\\',
			'1 & 2 & 3\\\\',
			'\\end{tabular}',
			'\\end{document}',
			''
		].join('\n');
		const parsed = parseLatexFile(src);
		const out = serializeLatexFile(parsed, withoutOrigins(parsed.doc));
		const header = out.split('\n').find((l) => l.endsWith('\\\\'))!;
		expect(header.replace(/\s+/g, '')).toMatch(/^&b&\\\\$/);
	});

	it('pads a short first row of a state at its end', () => {
		const state = EditorState.create({ schema, doc: shortRowDoc() });
		expect(firstRowTexts(padTablesInState(state).doc)).toEqual(['c', '']);
	});

	it('pads a swapped-in doc at the row end', () => {
		let swapped: EditorState | undefined;
		const view = {
			state: EditorState.create({ schema, doc: shortRowDoc() }),
			dom: { parentElement: null },
			updateState: (next: EditorState) => (swapped = next)
		} as unknown as EditorView;
		swapParsedDoc(view, schema, shortRowDoc());
		expect(firstRowTexts(swapped!.doc)).toEqual(['c', '']);
	});
});
