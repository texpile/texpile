// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { GapCursor } from 'prosemirror-gapcursor';
import { CellSelection } from 'prosemirror-tables';
import type { Node } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { drawnBlockBetween, hiddenSelectionHolder, hiddenSelectionPlugin } from '$lib/editor/visual/highlight/hiddenSelection';

// jsdom has no isContentEditable
Object.defineProperty(HTMLElement.prototype, 'isContentEditable', {
	configurable: true,
	get(this: HTMLElement) {
		const at = this.closest('[contenteditable]');
		return !!at && at.getAttribute('contenteditable') !== 'false';
	}
});

const drawn = () => {
	const dom = document.createElement('div');
	dom.setAttribute('contenteditable', 'false');
	return { dom };
};

function posOf(doc: Node, name: string, nth = 0): number {
	let at = -1;
	let seen = 0;
	doc.descendants((node, pos) => {
		if (node.type.name === name && at < 0 && seen++ === nth) at = pos;
	});
	return at;
}

// the class that hides a selection sits on the smallest node holding what the browser would paint: on the page it
// restyled the whole document
it('holds a selected node, a table for its cells, a gap cursor in its block, and nothing for text', () => {
	const cell = () => schema.nodes.table_cell.createAndFill()!;
	const table = schema.nodes.table.createAndFill(null, [
		schema.nodes.table_row.create(null, [cell(), cell()]),
		schema.nodes.table_row.create(null, [cell(), cell()])
	])!;
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('see'), schema.nodes.label.create({ name: 'a' })]),
		table
	]);
	const state = EditorState.create({ doc });
	const label = posOf(doc, 'label');
	expect(hiddenSelectionHolder(NodeSelection.create(doc, label))).toEqual({ from: label, to: label + 1 });
	const tableAt = posOf(doc, 'table');
	const cells = CellSelection.create(doc, posOf(doc, 'table_cell', 0), posOf(doc, 'table_cell', 3));
	expect(hiddenSelectionHolder(cells)).toEqual({ from: tableAt, to: tableAt + table.nodeSize });
	expect(hiddenSelectionHolder(TextSelection.create(doc, 2))).toBeNull();
	expect(hiddenSelectionHolder(new GapCursor(state.doc.resolve(tableAt)))).toBeNull();
	const cellAt = posOf(doc, 'table_cell', 1);
	expect(hiddenSelectionHolder(new GapCursor(doc.resolve(cellAt + 1)))).toEqual({
		from: cellAt,
		to: cellAt + doc.nodeAt(cellAt)!.nodeSize
	});
});

// a selected formula holds the browser's range over its contents, and read back before its field took the focus that
// range became the formula's hidden source selected as text
it("reads a range over a drawn block's contents back as the block selected", () => {
	const doc = schema.node('doc', null, [
		schema.node('paragraph', null, [schema.text('see')]),
		schema.nodes.block_math.create({ numbered: false, lineLabels: [] }, schema.text('a=b'))
	]);
	const view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc }),
		nodeViews: { block_math: drawn }
	});
	const at = posOf(doc, 'block_math');
	const selection = drawnBlockBetween(view, doc.resolve(at + 1), doc.resolve(at + doc.nodeAt(at)!.nodeSize - 1));
	expect(selection).toBeInstanceOf(NodeSelection);
	expect(selection?.from).toBe(at);
	view.destroy();
});

// Chrome paints its own caret beside a hidden selection, in the nearest block that takes one: past the chips of a gap
// between two \input lines, in the paragraphs on either side. Flipping every block's caret instead cost 35 ms a move
it('hides the caret of the nearest block on each side that takes one, past drawn blocks', () => {
	const { doc } = parseLatexFile(
		'\\documentclass{article}\n\\begin{document}\nFirst words.\n\n\\input{a}\n\n\\input{b}\n\nLast words.\n\\end{document}\n'
	);
	const view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc, plugins: [hiddenSelectionPlugin()] }),
		nodeViews: { includedoc: drawn }
	});
	view.dispatch(view.state.tr.setSelection(new GapCursor(doc.resolve(posOf(doc, 'includedoc', 1)))));
	expect([...view.dom.querySelectorAll('.pm-caret-hidden')].map((el) => el.textContent)).toEqual(['First words.', 'Last words.']);
	view.destroy();
});
