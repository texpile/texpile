// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, NodeSelection, TextSelection, type Selection, type Transaction } from 'prosemirror-state';
import { GapCursor } from 'prosemirror-gapcursor';
import type { Node as PMNode } from 'prosemirror-model';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import type { VisualView } from '$lib/editor/canvas';
import { KeyRouter } from '$lib/editor/canvas/interaction/keys/keyRouter';
import { testModel } from '../../geometry/geometryFixture';

const { paragraph, block_math: blockMath, ref } = schema.nodes;

/** the router over the real geometry of `doc`, its view applying what it dispatches */
function routedKeys(doc: PMNode, selection: (doc: PMNode) => Selection): { press(init: KeyboardEventInit): Selection; view: VisualView } {
	const { view, geometry } = testModel(doc);
	const writable = view as { -readonly [K in keyof VisualView]: VisualView[K] };
	writable.state = EditorState.create({ doc, selection: selection(doc) });
	Object.assign(view, {
		input: {},
		composing: false,
		dispatch(tr: Transaction) {
			writable.state = view.state.apply(tr);
		},
		endOfTextblock: (dir: Parameters<VisualView['endOfTextblock']>[0]) => geometry.endOfTextblock(dir, view.state),
		canvas: { geometry, head: () => ({ pos: view.state.selection.head, affinity: 1 }) }
	});
	const router = new KeyRouter(view, { active: () => null, stopsEvent: () => false }, () => null, 'linux');
	return {
		view,
		press(init) {
			const keyCode = { ArrowLeft: 37, ArrowRight: 39, Backspace: 8 }[init.key!] ?? 0;
			router.keydown(new KeyboardEvent('keydown', { ...init, keyCode }));
			return view.state.selection;
		}
	};
}

const words = paragraph.create(null, schema.text('the line. Punctuation: well-known end'));
const caretAt = (pos: number) => (doc: PMNode) => TextSelection.create(doc, pos);

describe('KeyRouter', () => {
	it('moves by words the way Chromium does: past a punctuation mark, never into one glued to a word', () => {
		const doc = schema.nodes.doc.create(null, [words]);
		const at = (text: string) => doc.textContent.indexOf(text) + 1;
		expect(routedKeys(doc, caretAt(at('. Punct'))).press({ key: 'ArrowRight', ctrlKey: true }).head).toBe(at(' Punct'));
		expect(routedKeys(doc, caretAt(at(' Punct'))).press({ key: 'ArrowLeft', ctrlKey: true }).head).toBe(at('. Punct'));
		expect(routedKeys(doc, caretAt(at(': well'))).press({ key: 'ArrowRight', ctrlKey: true }).head).toBe(at(' well'));
		expect(routedKeys(doc, caretAt(at(' well'))).press({ key: 'ArrowRight', ctrlKey: true }).head).toBe(at('-known'));
	});

	it('steps from a textblock edge by word to the next textblock that takes a caret, past a display formula', () => {
		const below = paragraph.create(null, schema.text('after'));
		const doc = schema.nodes.doc.create(null, [words, blockMath.create(null, schema.text('E=mc^2')), below]);
		const belowStart = words.nodeSize + doc.child(1).nodeSize + 1;
		const keys = routedKeys(doc, caretAt(belowStart));
		expect(keys.press({ key: 'ArrowLeft', ctrlKey: true, shiftKey: true }).toJSON()).toEqual({
			type: 'text',
			anchor: belowStart,
			head: words.nodeSize - 1
		});
	});

	it('leaves a gap cursor for the text beside it instead of selecting the paragraph', () => {
		const doc = schema.nodes.doc.create(null, [words, blockMath.create(null, schema.text('x'))]);
		const keys = routedKeys(doc, (d) => new GapCursor(d.resolve(words.nodeSize)));
		expect(keys.press({ key: 'ArrowLeft', ctrlKey: true }).toJSON()).toEqual({
			type: 'text',
			anchor: words.nodeSize - 1,
			head: words.nodeSize - 1
		});
	});

	it('extends a word over a chip as the chip selected, and deletes a word with Ctrl+Backspace', () => {
		const chip = ref.create({ refType: 'reference', command: 'ref' }, schema.text('sec:keys'));
		const doc = schema.nodes.doc.create(null, [paragraph.create(null, [schema.text('see '), chip, schema.text(' here')])]);
		const extended = routedKeys(doc, caretAt(5)).press({ key: 'ArrowRight', ctrlKey: true, shiftKey: true });
		expect(extended).toBeInstanceOf(NodeSelection);
		expect([extended.from, extended.to]).toEqual([5, 5 + chip.nodeSize]);
		const keys = routedKeys(doc, caretAt(4));
		keys.press({ key: 'Backspace', ctrlKey: true });
		expect(keys.view.state.doc.textContent).toBe(' sec:keys here');
	});
});
