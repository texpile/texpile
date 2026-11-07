import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { replaceSelectionWithBlock, insertBlockAtCaret } from '$lib/editor/visual/insert/insertRun';
import { displayPlacement } from '$lib/languages/latex/visual/plugins/math/paragraph/displayPlacement';

const p = (text: string) => schema.nodes.paragraph.create(null, schema.text(text));
const display = () => schema.nodes.block_math.create(null, schema.text('x'));

function stateAt(doc: ReturnType<typeof schema.node>, caret: number): EditorState {
	const state = EditorState.create({ doc, plugins: [displayPlacement] });
	return state.apply(state.tr.setSelection(TextSelection.create(doc, caret)));
}

function placed(state: EditorState): Record<string, unknown> {
	let attrs: Record<string, unknown> = {};
	state.doc.descendants((n) => {
		if (n.type.name === 'block_math') attrs = { inParagraph: n.attrs.inParagraph, continuesAfter: n.attrs.continuesAfter };
	});
	return attrs;
}

describe('a display the editor puts in', () => {
	it('splitting a paragraph sits inside it, the text after continuing', () => {
		const state = stateAt(schema.node('doc', null, [p('The threshold is where it is.')]), 17);
		expect(placed(state.applyTransaction(replaceSelectionWithBlock(state.tr, display())).state)).toEqual({
			inParagraph: true,
			continuesAfter: true
		});
	});

	it('after a paragraph leaves the paragraph that was already after it on its own', () => {
		const state = stateAt(schema.node('doc', null, [p('The threshold is'), p('Next.')]), 5);
		const tr = insertBlockAtCaret(state, { select: 'node', make: () => display() })!;
		expect(placed(state.applyTransaction(tr).state)).toEqual({ inParagraph: true, continuesAfter: false });
	});
});
