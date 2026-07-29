// @vitest-environment jsdom
// The inline_latex node view wraps a single-line CodeMirror. These pin the contract ProseMirror
// relies on once that CodeMirror exists: it holds the node's text, an external edit (undo,
// collaborator patch, disk reload) is diffed into the existing instance rather than remounting it,
// and teardown is clean.
//
// The instance is built lazily now, as the chip nears the viewport. jsdom has no
// IntersectionObserver, so upgradeWhenNear falls back to building it immediately and these keep
// exercising a live chip. The laziness itself is covered in cmViewport.test.ts, which installs a
// fake observer.
import { describe, it, expect, beforeAll } from 'vitest';
import { schema } from '$lib/schema/schema';
import InlineLatexView from '$lib/editor/extensions/raw-latex/inlineLatexView';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';

// CodeMirror measures on construction; jsdom has no layout, so stub what it reads.
beforeAll(() => {
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

const LATEX = '\\alpha_{ij}';

function makeView(text = LATEX) {
	const node = schema.nodes.inline_latex.create(null, text ? schema.text(text) : null);
	// the view is only used for dispatch/focus on interaction; none of these tests take that path
	const pmView = { state: { tr: {}, selection: {} }, dispatch: () => {}, focus: () => {} } as unknown as ProseMirrorView;
	return { node, view: new InlineLatexView(node, pmView, () => 0) };
}

describe('InlineLatexView', () => {
	it('mounts with a CodeMirror holding the node text, so the chip is highlighted on sight', () => {
		const { view } = makeView();
		expect(view.cm).toBeTruthy();
		expect(view.cm.state.doc.toString()).toBe(LATEX);
		expect(view.dom.querySelector('.cm-editor')).not.toBeNull();
	});

	it('swallows events, since CodeMirror owns the DOM', () => {
		expect(makeView().view.stopEvent()).toBe(true);
	});

	it('diffs an external edit into the existing instance instead of remounting', () => {
		const { view } = makeView();
		const before = view.cm;
		expect(view.update(schema.nodes.inline_latex.create(null, schema.text('\\gamma^2')))).toBe(true);
		expect(view.cm).toBe(before); // same instance: no remount, no lost selection
		expect(view.cm.state.doc.toString()).toBe('\\gamma^2');
		expect(view.dom.querySelectorAll('.cm-editor').length).toBe(1);
	});

	it('leaves the document untouched when the text is unchanged', () => {
		const { view } = makeView();
		expect(view.update(schema.nodes.inline_latex.create(null, schema.text(LATEX)))).toBe(true);
		expect(view.cm.state.doc.toString()).toBe(LATEX);
	});

	it('refuses a node of a different type, so ProseMirror rebuilds the view', () => {
		const { view } = makeView();
		expect(view.update(schema.nodes.inline_math.create(null, schema.text('x^2')))).toBe(false);
	});

	it('destroys cleanly', () => {
		const { view } = makeView();
		expect(() => view.destroy()).not.toThrow();
	});
});
