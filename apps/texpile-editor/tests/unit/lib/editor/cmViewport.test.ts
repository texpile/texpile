// @vitest-environment jsdom
// Viewport materialization for the two CodeMirror-backed node views.
//
// These carry more weight than usual: the repo compiles with "strict": false, so the optional `cm`
// field buys no compile-time protection against touching the editor before it exists. Every guard
// is held by a test rather than by the type checker.
//
// The behaviour under guard is the one an earlier focus-triggered attempt broke: a chip that is on
// screen must be a real, syntax-highlighted CodeMirror, never plain text.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { schema } from '$lib/schema/schema';
import InlineLatexView from '$lib/editor/extensions/raw-latex/inlineLatexView';
import CodeBlockView from '$lib/editor/extensions/codemirrorbridge/cmview';
import { CM_PLACEHOLDER_CLASS } from '$lib/editor/extensions/codemirrorbridge/cmStatic';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';

type Entry = { target: Element; isIntersecting: boolean };
type Cb = (entries: Entry[], obs: unknown) => void;
const watched = new Map<Element, { cb: Cb; obs: unknown }>();

class FakeIntersectionObserver {
	constructor(private cb: Cb) {}
	observe(el: Element) {
		watched.set(el, { cb: this.cb, obs: this });
	}
	unobserve(el: Element) {
		watched.delete(el);
	}
	disconnect() {
		watched.clear();
	}
}

function comeIntoView(el: Element) {
	const rec = watched.get(el);
	if (!rec) throw new Error('element is not being observed');
	rec.cb([{ target: el, isIntersecting: true }], rec.obs);
}

// CodeMirror measures on construction; jsdom has no layout, so stub what it reads.
beforeAll(() => {
	globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
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

beforeEach(() => {
	watched.clear();
	document.body.innerHTML = '';
});

const pmView = () =>
	({
		state: { tr: {}, selection: {}, doc: {} },
		dispatch: () => {},
		focus: () => {}
	}) as unknown as ProseMirrorView;

function makeInline(text = '\\alpha_{ij}') {
	const node = schema.nodes.inline_latex.create(null, schema.text(text));
	const view = new InlineLatexView(node, pmView(), () => 0);
	document.body.appendChild(view.dom);
	return view;
}

function makeBlock(text = 'const a = 1;\nconst b = 2;') {
	const node = schema.nodes.code_block.create({ lang: 'JavaScript' }, schema.text(text));
	const view = new CodeBlockView(node, pmView(), () => 0);
	document.body.appendChild(view.dom);
	return view;
}

const placeholderOf = (view: { dom: HTMLElement }) => view.dom.querySelector(`.${CM_PLACEHOLDER_CLASS}`);

describe('inline_latex chip materialization', () => {
	it('starts as plain text carrying the node content, with no CodeMirror built', () => {
		const view = makeInline();
		expect(view.cm).toBeUndefined();
		expect(placeholderOf(view)?.textContent).toBe('\\alpha_{ij}');
		expect(view.dom.querySelector('.cm-editor')).toBeNull();
	});

	it('builds CodeMirror when the chip nears the viewport, so anything visible is highlighted', () => {
		const view = makeInline();
		comeIntoView(view.dom);
		expect(view.cm).toBeDefined();
		expect(view.cm!.state.doc.toString()).toBe('\\alpha_{ij}');
		expect(placeholderOf(view)).toBeNull();
		expect(view.dom.querySelector('.cm-editor')).not.toBeNull();
	});

	it('builds on caret arrival even if it never scrolled into view', () => {
		const view = makeInline();
		view.selectNode();
		expect(view.cm).toBeDefined();
	});

	it('builds once however it is triggered', () => {
		const view = makeInline();
		comeIntoView(view.dom);
		const first = view.cm;
		view.selectNode();
		expect(view.cm).toBe(first);
		expect(view.dom.querySelectorAll('.cm-editor').length).toBe(1);
	});

	it('leaves events to ProseMirror until CodeMirror exists', () => {
		const view = makeInline();
		expect(view.stopEvent()).toBe(false);
		comeIntoView(view.dom);
		expect(view.stopEvent()).toBe(true);
	});

	it('re-renders the stand-in for an edit that lands while still offscreen', () => {
		const view = makeInline('a+b');
		view.update(schema.nodes.inline_latex.create(null, schema.text('c+d')));
		expect(view.cm).toBeUndefined(); // an offscreen edit must not force an editor into existence
		expect(placeholderOf(view)?.textContent).toBe('c+d');
	});

	it('carries the edited text into a CodeMirror built after an offscreen edit', () => {
		const view = makeInline('a+b');
		view.update(schema.nodes.inline_latex.create(null, schema.text('c+d')));
		comeIntoView(view.dom);
		expect(view.cm!.state.doc.toString()).toBe('c+d');
	});

	it('still diffs an external edit into an existing instance rather than remounting', () => {
		const view = makeInline();
		comeIntoView(view.dom);
		const before = view.cm;
		view.update(schema.nodes.inline_latex.create(null, schema.text('\\gamma^2')));
		expect(view.cm).toBe(before);
		expect(view.cm!.state.doc.toString()).toBe('\\gamma^2');
	});

	it('destroys cleanly while still plain text, and stops watching', () => {
		const view = makeInline();
		expect(() => view.destroy()).not.toThrow();
		expect(watched.has(view.dom)).toBe(false);
	});
});

describe('code_block materialization', () => {
	it('starts as plain text with no CodeMirror built', () => {
		const view = makeBlock();
		expect(view.cm).toBeUndefined();
		expect(placeholderOf(view)).not.toBeNull();
	});

	it('gives the stand-in one line box per line, which is what keeps the height honest', () => {
		const view = makeBlock('one\ntwo\nthree');
		expect(placeholderOf(view)!.querySelectorAll('.cm-line').length).toBe(3);
	});

	it('builds CodeMirror when the block nears the viewport', () => {
		const view = makeBlock();
		comeIntoView(view.dom);
		expect(view.cm).toBeDefined();
		expect(view.cm!.state.doc.toString()).toBe('const a = 1;\nconst b = 2;');
		expect(placeholderOf(view)).toBeNull();
	});

	it('keeps the stand-in in sync with an offscreen edit, line count included', () => {
		const view = makeBlock('one\ntwo');
		view.update(schema.nodes.code_block.create({ lang: 'JavaScript' }, schema.text('a\nb\nc\nd')));
		expect(view.cm).toBeUndefined();
		expect(placeholderOf(view)!.querySelectorAll('.cm-line').length).toBe(4);
	});

	it('shows only the current language until the picker is touched', () => {
		const view = makeBlock();
		const select = view.dom.querySelector('select')!;
		expect(select.options.length).toBe(1);
		expect(select.value).toBe('JavaScript');
	});

	it('fills in the full language list on focus, keeping the current selection', () => {
		const view = makeBlock();
		const select = view.dom.querySelector('select')!;
		select.dispatchEvent(new Event('focus'));
		expect(select.options.length).toBeGreaterThan(50);
		expect(select.value).toBe('JavaScript');
	});

	it('destroys cleanly while still plain text', () => {
		const view = makeBlock();
		expect(() => view.destroy()).not.toThrow();
		expect(watched.has(view.dom)).toBe(false);
	});
});
