import { expect, it } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import {
	joinParagraphToDisplay,
	startParagraphAfterDisplay
} from '$lib/languages/latex/visual/plugins/math/paragraph/displayParagraphKeys';

function run(state: EditorState, command: Command): EditorState {
	let next = state;
	expect(command(state, (tr) => (next = state.apply(tr)))).toBe(true);
	return next;
}

it('Enter at the start of the text after a display starts a new paragraph, and Backspace joins it back', () => {
	const display = schema.nodes.block_math.create({ inParagraph: true, continuesAfter: true }, schema.text('x'));
	const doc = schema.node('doc', null, [display, schema.nodes.paragraph.create(null, schema.text('where it is.'))]);
	const start = EditorState.create({ doc, selection: TextSelection.create(doc, display.nodeSize + 1) });
	const parted = run(start, startParagraphAfterDisplay);
	expect(parted.doc.firstChild!.attrs.continuesAfter).toBe(false);
	expect(parted.doc.childCount).toBe(2);
	expect(run(parted, joinParagraphToDisplay).doc.firstChild!.attrs.continuesAfter).toBe(true);
});
