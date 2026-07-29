// @vitest-environment jsdom
// Viewport materialization for math node views: a static typeset stands in until the node nears the
// viewport or the caret arrives, at which point the real MathfieldElement takes over.
//
// The contract these guard is the one an earlier lazy-loading attempt broke: whatever the reader can
// see must be fully rendered. So the placeholder is a real typeset (not a stub), edits reach it
// while it is still offscreen, and clicking it always ends in a live field.
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;

function comeIntoView(el: Element) {
	const rec = watched.get(el);
	if (!rec) throw new Error('element is not being observed');
	rec.cb([{ target: el, isIntersecting: true }], rec.obs);
}

let built = 0;
vi.mock('mathlive', () => {
	class FakeMathfield extends HTMLElement {
		static soundsDirectory: string | null = null;
		selection: unknown = {};
		readOnly = false;
		mathVirtualKeyboardPolicy = 'auto';
		private value = '';
		canUndo = () => false;
		canRedo = () => false;
		setValue(v: string) {
			this.value = v;
		}
		getValue() {
			return this.value;
		}
		hasFocus() {
			return false;
		}
		executeCommand() {}
	}
	customElements.define('mock-math-field-vp', FakeMathfield);
	return {
		MathfieldElement: new Proxy(FakeMathfield, {
			construct(target, args) {
				built++;
				return Reflect.construct(target, args);
			}
		}),
		convertLatexToMarkup: (latex: string) => `<span class="typeset">${latex}</span>`
	};
});
vi.mock('mathlive/static.css', () => ({}));
vi.mock('mathlive/fonts.css', () => ({}));
vi.mock('$lib/editor/extensions/mathlivebridge/virtualKeyboardConfig', () => ({ configureMathVirtualKeyboard() {} }));
vi.mock('svelte', async (orig) => ({ ...(await orig<Record<string, unknown>>()), mount: () => ({}), unmount: () => {} }));

const { schema } = await import('$lib/schema/schema');
const { PLACEHOLDER_CLASS } = await import('$lib/editor/extensions/mathlivebridge/mathStatic');
const { default: MathLiveView } = await import('$lib/editor/extensions/mathlivebridge/mlview.svelte');

function makeView(latex = 'x^2', isBlock = false) {
	const type = isBlock ? schema.nodes.block_math : schema.nodes.inline_math;
	const node = type.create(isBlock ? { numbered: false, lineLabels: [] } : null, schema.text(latex));
	const pmView = {
		editable: true,
		state: { doc: { descendants() {} }, tr: {} },
		dispatch() {},
		focus() {}
	} as unknown as ProseMirrorView;
	const view = new MathLiveView(node, pmView, () => 0, { getState: () => undefined }, isBlock);
	document.body.appendChild(view.dom);
	return view;
}

const placeholderOf = (view: { dom: HTMLElement }) => view.dom.querySelector(`.${PLACEHOLDER_CLASS}`);

/** let the idle typeset queue drain; jsdom has no requestIdleCallback so it falls back to a timer */
const flushIdle = async () => {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
	watched.clear();
	built = 0;
	document.body.innerHTML = '';
});

describe('math node view materialization', () => {
	it('starts as a cheaply-sized box, not yet typeset and with no mathfield built', () => {
		const view = makeView('\\alpha_{ij}');
		expect(built).toBe(0);
		expect(view.mathField).toBeUndefined();
		const ph = placeholderOf(view) as HTMLElement;
		expect(ph).not.toBeNull();
		// typesetting a thousand of these at mount is what froze the UI for ~1.1 s, so mounting must
		// not do it. An estimated size holds the space instead.
		expect(ph.querySelector('.typeset')).toBeNull();
		expect(ph.style.width).not.toBe('');
	});

	it('typesets the placeholder in idle time, so a fast scroll finds real math', async () => {
		const view = makeView('\\alpha_{ij}');
		await flushIdle();
		const ph = placeholderOf(view) as HTMLElement;
		expect(ph.querySelector('.typeset')?.textContent).toBe('\\alpha_{ij}');
		// the real render supersedes the estimate
		expect(ph.style.width).toBe('');
		expect(built).toBe(0); // still no mathfield: this stage is rendering only
	});

	it('builds the field when the node nears the viewport, replacing the placeholder', () => {
		const view = makeView();
		comeIntoView(view.dom);
		expect(built).toBe(1);
		expect(view.mathField).toBeDefined();
		expect(placeholderOf(view)).toBeNull();
		expect(view.mathField!.isConnected).toBe(true);
	});

	it('carries the current latex into the field it builds', () => {
		const view = makeView('\\gamma^2');
		comeIntoView(view.dom);
		expect(view.mathField!.getValue()).toBe('\\gamma^2');
	});

	it('builds the field on caret arrival even if it never scrolled into view', () => {
		const view = makeView();
		view.selectNode();
		expect(built).toBe(1);
		expect(view.mathField).toBeDefined();
	});

	it('builds only once however it is triggered', () => {
		const view = makeView();
		comeIntoView(view.dom);
		view.selectNode();
		expect(built).toBe(1);
	});

	it('lets ProseMirror handle events until the field exists, then hands them to mathlive', () => {
		const view = makeView();
		// false while a placeholder: PM needs the click to set a NodeSelection and call selectNode
		expect(view.stopEvent()).toBe(false);
		comeIntoView(view.dom);
		expect(view.stopEvent()).toBe(true);
	});

	it('picks up an edit that lands before the placeholder has been typeset', async () => {
		const view = makeView('a+b');
		view.update(schema.nodes.inline_math.create(null, schema.text('c+d')));
		expect(built).toBe(0); // an offscreen edit must not force a field into existence
		await flushIdle();
		expect(placeholderOf(view)!.querySelector('.typeset')?.textContent).toBe('c+d');
	});

	it('re-typesets immediately for an edit that lands after the placeholder was typeset', async () => {
		const view = makeView('a+b');
		await flushIdle();
		view.update(schema.nodes.inline_math.create(null, schema.text('c+d')));
		expect(placeholderOf(view)!.querySelector('.typeset')?.textContent).toBe('c+d');
		expect(built).toBe(0);
	});

	it('hands a field materialized after an offscreen edit the edited latex, not the original', () => {
		const view = makeView('a+b');
		view.update(schema.nodes.inline_math.create(null, schema.text('c+d')));
		comeIntoView(view.dom);
		expect(view.mathField!.getValue()).toBe('c+d');
	});

	it('destroys cleanly while still a placeholder, and stops watching', () => {
		const view = makeView();
		expect(() => view.destroy()).not.toThrow();
		expect(watched.has(view.dom)).toBe(false);
	});

	it('applies to block math too', () => {
		const view = makeView('E=mc^2', true);
		expect(built).toBe(0);
		expect(placeholderOf(view)).not.toBeNull();
		comeIntoView(view.dom);
		expect(built).toBe(1);
		expect(placeholderOf(view)).toBeNull();
	});
});
