// @vitest-environment jsdom
// Arrowing into an inline chip. The chip's DOM is uneditable, so without a handler the caret steps
// straight over it and there is no way to reach the source with the keyboard.
import { describe, it, expect, beforeAll } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { enterInlineCm } from '$lib/editor/visual/extensions/codemirrorbridge/cmarrowhandler';
import { InlineLatexView } from '$lib/editor/visual/extensions/raw-latex/inlineLatexView';

// CodeMirror measures on construction and the chip watches for the viewport; jsdom has neither
beforeAll(() => {
	globalThis.IntersectionObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as never;
	if (!globalThis.ResizeObserver)
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as never;
	if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [] as never;
	if (!Range.prototype.getBoundingClientRect)
		Range.prototype.getBoundingClientRect = () => ({ top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }) as never;
});

/** "one " + \vspace{10pt} + " two", with the caret at `at` */
function stateAt(at: number) {
	const chip = schema.nodes.inline_latex.create(null, schema.text('\\vspace{10pt}'));
	const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('one '), chip, schema.text(' two')])]);
	return EditorState.create({ doc, selection: TextSelection.create(doc, at) });
}

/** where the chip sits, found rather than assumed */
function chipRange(state: EditorState) {
	let from = -1;
	let size = 0;
	state.doc.descendants((n, pos) => {
		if (n.type.name === 'inline_latex' && from < 0) {
			from = pos;
			size = n.nodeSize;
		}
	});
	return { from, to: from + size };
}

function run(state: EditorState, dir: 1 | -1) {
	let next: EditorState | null = null;
	const handled = enterInlineCm(dir)(state, (tr) => (next = state.apply(tr)));
	return { handled, next: next as EditorState | null };
}

describe('arrowing into an inline chip', () => {
	it('lands at the end of the source when arriving from the right', () => {
		const before = stateAt(1);
		const { to } = chipRange(before);
		const { handled, next } = run(stateAt(to), -1);
		expect(handled).toBe(true);
		// one step inside the closing edge is the last text position, not the first
		expect(next!.selection.from).toBe(to - 1);
		expect(next!.selection.$from.parent.type.name).toBe('inline_latex');
	});

	it('lands at the start of the source when arriving from the left', () => {
		const before = stateAt(1);
		const { from } = chipRange(before);
		const { handled, next } = run(stateAt(from), 1);
		expect(handled).toBe(true);
		expect(next!.selection.from).toBe(from + 1);
		expect(next!.selection.$from.parent.type.name).toBe('inline_latex');
	});

	// the caret has to be able to walk through the prose, so the handler must only fire at the edge
	it('leaves the caret alone anywhere but the chip edge', () => {
		const { from, to } = chipRange(stateAt(1));
		expect(run(stateAt(1), 1).handled).toBe(false);
		expect(run(stateAt(from), -1).handled).toBe(false);
		expect(run(stateAt(to), 1).handled).toBe(false);
		expect(run(stateAt(to + 2), -1).handled).toBe(false);
	});

	it('does not hijack a selection that is being extended', () => {
		const { to } = chipRange(stateAt(1));
		const doc = stateAt(1).doc;
		const ranged = EditorState.create({ doc, selection: TextSelection.create(doc, to, to + 2) });
		expect(run(ranged, -1).handled).toBe(false);
	});

	// the selection math is only half of it: ProseMirror has to carry that position into the node
	// view, which is what builds CodeMirror and puts the caret in it
	it('carries the caret into CodeMirror itself', () => {
		const place = document.createElement('div');
		document.body.appendChild(place);
		let chipView: InlineLatexView | null = null;
		const view = new EditorView(place, {
			state: stateAt(1),
			nodeViews: {
				inline_latex: (node, v, getPos) => (chipView = new InlineLatexView(node, v, getPos as () => number))
			}
		});
		const { to } = chipRange(view.state);

		// ProseMirror only writes a selection to the DOM while it owns the focus, and node views
		// hear about it through that write
		view.focus();
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to)));
		enterInlineCm(-1)(view.state, view.dispatch);

		const cm = (chipView as unknown as InlineLatexView).cm;
		expect(cm).toBeDefined();
		expect(cm!.state.doc.toString()).toBe('\\vspace{10pt}');
		// the END of the source, since the caret arrived from the right
		expect(cm!.state.selection.main.head).toBe('\\vspace{10pt}'.length);
		view.destroy();
	});
});
