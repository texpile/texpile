import { expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { tableEditing } from 'prosemirror-tables';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { beforeCellStart, dragHead } from '$lib/editor/canvas/interaction/pointer/dragHeads';
import type { CanvasHit } from '$lib/editor/canvas';

const N = schema.nodes;
const cell = (text: string) => N.table_cell.create(null, N.paragraph.create(null, schema.text(text)));

// a drag from the paragraph into the table flashed the whole paragraph each time the head met a cell's start
it('stops a drag short of a cell start, which the table plugin would turn into the first paragraph', () => {
	const doc = N.doc.create(null, [
		N.paragraph.create(null, schema.text('words before the table')),
		N.table.create(null, [N.table_row.create(null, [cell('one'), cell('two')])])
	]);
	let state = EditorState.create({ doc, plugins: [tableEditing()] });
	let twoStart = 0;
	doc.descendants((node, pos) => {
		if (node.isText && node.text === 'two') twoStart = pos;
	});
	const $head = beforeCellStart(doc.resolve(3), doc.resolve(twoStart));
	expect($head.parent.textContent).toBe('one');
	state = state.apply(state.tr.setSelection(TextSelection.between(doc.resolve(3), $head)));
	expect(state.selection.anchor).toBe(3);
});

// over a figure or display the nearest text caret lay lines above the pointer, and the range jumped back across it
it('puts the head on the edge of a block drawn whole, and on the caret over text', () => {
	const caret = { pos: 7, affinity: 1 } as const;
	expect(dragHead({ pos: 40, inside: 20, caret, target: { kind: 'leaf', pos: 20, policy: 'atom' } } as unknown as CanvasHit)).toEqual({
		pos: 40,
		affinity: 1
	});
	expect(dragHead({ pos: 9, inside: 1, caret, target: { kind: 'text', textblock: 0 } } as unknown as CanvasHit)).toBe(caret);
});
