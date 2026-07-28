// @vitest-environment jsdom
// The inline_latex node view is lazy: a real paper carries tens of thousands of these chips and
// ProseMirror builds every node view up front, so each one starts as a plain text span and only
// becomes a CodeMirror instance when the caret actually lands in it. These tests pin both halves:
// the cheap placeholder path and the upgrade, including that no text is lost across the swap.
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

describe('InlineLatexView (lazy)', () => {
	it('mounts as a plain placeholder, with no CodeMirror instance', () => {
		const { view } = makeView();
		expect(view.cm).toBeNull();
		expect(view.dom.querySelector('.cm-editor')).toBeNull();
		const text = view.dom.querySelector('.inline-latex-text');
		expect(text).not.toBeNull();
		expect(text!.textContent).toBe(LATEX);
	});

	it('lets ProseMirror handle events while it is still a placeholder', () => {
		// stopEvent must stay false until CodeMirror owns the DOM, otherwise the click that is
		// supposed to trigger the upgrade never reaches ProseMirror and the chip is uneditable
		const { view } = makeView();
		expect(view.stopEvent()).toBe(false);
	});

	it('retexts the placeholder on update without building CodeMirror', () => {
		const { view } = makeView();
		const next = schema.nodes.inline_latex.create(null, schema.text('\\beta'));
		expect(view.update(next)).toBe(true);
		expect(view.cm).toBeNull();
		expect(view.dom.querySelector('.inline-latex-text')!.textContent).toBe('\\beta');
	});

	it('upgrades to CodeMirror on selectNode, preserving the text', () => {
		const { view } = makeView();
		view.selectNode();
		expect(view.cm).not.toBeNull();
		expect(view.cm!.state.doc.toString()).toBe(LATEX);
		// the placeholder is gone and CodeMirror took its place inside the same wrapper
		expect(view.dom.querySelector('.inline-latex-text')).toBeNull();
		expect(view.dom.querySelector('.cm-editor')).not.toBeNull();
		expect(view.stopEvent()).toBe(true);
	});

	it('upgrades on setSelection (caret moved in by keyboard, not click)', () => {
		const { view } = makeView();
		view.setSelection(1, 1);
		expect(view.cm).not.toBeNull();
		expect(view.cm!.state.doc.toString()).toBe(LATEX);
	});

	it('is idempotent: a second upgrade reuses the same instance', () => {
		const { view } = makeView();
		view.selectNode();
		const first = view.cm;
		view.selectNode();
		expect(view.cm).toBe(first);
		expect(view.dom.querySelectorAll('.cm-editor').length).toBe(1);
	});

	it('syncs an external edit into CodeMirror once upgraded', () => {
		const { view } = makeView();
		view.selectNode();
		view.update(schema.nodes.inline_latex.create(null, schema.text('\\gamma^2')));
		expect(view.cm!.state.doc.toString()).toBe('\\gamma^2');
	});

	it('destroys cleanly whether or not it was ever upgraded', () => {
		const lazy = makeView().view;
		expect(() => lazy.destroy()).not.toThrow();
		const upgraded = makeView().view;
		upgraded.selectNode();
		expect(() => upgraded.destroy()).not.toThrow();
	});
});
