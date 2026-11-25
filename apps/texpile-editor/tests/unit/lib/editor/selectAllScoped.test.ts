// Ctrl+A takes the field the caret is in before it takes the document, so the next keystroke
// cannot replace the body from inside a cell, a caption or a chip.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { selectAllScoped } from '$lib/editor/visual/selectAllScoped';

const N = schema.nodes;

/** paragraph, then a figure whose caption is inline content of the image node */
function docWithFigure() {
	return N.doc.create(null, [
		N.paragraph.create(null, schema.text('body text here')),
		N.paragraph.create(null, [N.image.create({ src: 'a.png' }, schema.text('caption words'))])
	]);
}

function selectionInside(state: EditorState, needle: string) {
	const at = state.doc.textContent.indexOf(needle);
	// +2 skips the doc and paragraph openings for the position of the text itself
	let found = -1;
	state.doc.descendants((n, pos) => {
		if (n.isText && n.text?.includes(needle) && found < 0) found = pos + 1;
	});
	expect(found).toBeGreaterThan(-1);
	expect(at).toBeGreaterThan(-1);
	return state.apply(state.tr.setSelection(TextSelection.create(state.doc, found)));
}

describe('selectAllScoped', () => {
	it('takes the caption of a figure, not the document', () => {
		const state = selectionInside(EditorState.create({ doc: docWithFigure() }), 'caption words');
		let next = state;
		expect(selectAllScoped(state, (tr) => (next = state.apply(tr)))).toBe(true);
		const { from, to } = next.selection;
		expect(next.doc.textBetween(from, to)).toBe('caption words');
	});

	it('stands down in plain prose so the base command selects the document', () => {
		const state = selectionInside(EditorState.create({ doc: docWithFigure() }), 'body text here');
		expect(selectAllScoped(state, () => {})).toBe(false);
	});

	it('widens on a second press once the field is already whole', () => {
		const first = selectionInside(EditorState.create({ doc: docWithFigure() }), 'caption words');
		let next = first;
		selectAllScoped(first, (tr) => (next = first.apply(tr)));
		expect(selectAllScoped(next, () => {})).toBe(false);
	});

	it('takes a raw LaTeX block before the document', () => {
		const doc = N.doc.create(null, [N.paragraph.create(null, schema.text('body')), N.raw_latex.create(null, schema.text('\\foo{x}'))]);
		const state = selectionInside(EditorState.create({ doc }), 'foo');
		let next = state;
		expect(selectAllScoped(state, (tr) => (next = state.apply(tr)))).toBe(true);
		expect(next.doc.textBetween(next.selection.from, next.selection.to)).toBe('\\foo{x}');
		expect(selectAllScoped(next, () => {})).toBe(false);
	});
});
