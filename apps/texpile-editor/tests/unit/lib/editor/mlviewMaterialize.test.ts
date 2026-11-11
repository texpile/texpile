// @vitest-environment jsdom
// Math node views: a static typeset stands in until a pointer reaches the formula or the caret arrives,
// at which point the real MathfieldElement takes over. Scrolling builds no field.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';
import type { PluginKey } from 'prosemirror-state';
import type { MathLivePluginState } from '$lib/editor/visual/extensions/mathlivebridge/mlplugin';

function pointTo(el: Element) {
	el.dispatchEvent(new Event('pointerenter'));
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
vi.mock('$lib/editor/visual/extensions/mathlivebridge/virtualKeyboardConfig', () => ({ configureMathVirtualKeyboard() {} }));
vi.mock('svelte', async (orig) => ({ ...(await orig<Record<string, unknown>>()), mount: () => ({}), unmount: () => {} }));

const { schema } = await import('$lib/languages/latex/schema/latexPMSchema');
const { PLACEHOLDER_CLASS } = await import('$lib/editor/visual/extensions/mathlivebridge/mathStatic');
const { MathLiveView } = await import('$lib/editor/visual/extensions/mathlivebridge/mlview.svelte');

function makeView(latex = 'x^2', isBlock = false, editable = true) {
	const type = isBlock ? schema.nodes.block_math : schema.nodes.inline_math;
	const node = type.create(isBlock ? { numbered: false, lineLabels: [] } : null, schema.text(latex));
	const pmView = {
		editable,
		state: { doc: { descendants() {} }, tr: {}, selection: { from: 0, to: 0 } },
		dispatch() {},
		focus() {}
	} as unknown as ProseMirrorView;
	const view = new MathLiveView(node, pmView, () => 0, { getState: () => undefined } as unknown as PluginKey<MathLivePluginState>, isBlock);
	document.body.appendChild(view.dom);
	return view;
}

const placeholderOf = (view: { dom: HTMLElement }) => view.dom.querySelector(`.${PLACEHOLDER_CLASS}`);

/** let the idle typeset queue drain; jsdom has no requestIdleCallback so it falls back to a timer */
const flushIdle = async () => {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

beforeEach(() => {
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

	// a Select All over a long paper typeset every formula in it again
	it('keeps what it typeset when the view is updated for the same formula', async () => {
		const view = makeView('\\alpha_{ij}');
		await flushIdle();
		const typeset = placeholderOf(view)!.querySelector('.typeset');
		view.update(view.node, []);
		expect(placeholderOf(view)!.querySelector('.typeset')).toBe(typeset);
	});

	it('builds the field when a pointer reaches the formula, replacing the placeholder', () => {
		const view = makeView();
		pointTo(view.dom);
		expect(built).toBe(1);
		expect(view.mathField).toBeDefined();
		expect(placeholderOf(view)).toBeNull();
		expect(view.mathField!.isConnected).toBe(true);
	});

	it('builds no field for a drag selecting across the formula, and builds it on the next plain hover', () => {
		const view = makeView();
		const drag = new Event('pointerenter');
		Object.defineProperty(drag, 'buttons', { value: 1 });
		view.dom.dispatchEvent(drag);
		expect(built).toBe(0);
		expect(placeholderOf(view)).not.toBeNull();
		pointTo(view.dom);
		expect(built).toBe(1);
	});

	it('carries the current latex into the field it builds', () => {
		const view = makeView('\\gamma^2');
		pointTo(view.dom);
		expect(view.mathField!.getValue()).toBe('\\gamma^2');
	});

	it('builds the field on caret arrival with no pointer over it', () => {
		const view = makeView();
		view.selectNode();
		expect(built).toBe(1);
		expect(view.mathField).toBeDefined();
	});

	it('takes no focus when a parked editor selects the formula again as it follows the file', () => {
		const parked = makeView('E=mc^2', true, false);
		pointTo(parked.dom);
		const focus = vi.spyOn(parked.mathField!, 'focus');
		parked.selectNode();
		expect(focus).not.toHaveBeenCalled();
		const live = makeView('E=mc^2', true);
		pointTo(live.dom);
		const entered = vi.spyOn(live.mathField!, 'focus');
		live.selectNode();
		expect(entered).toHaveBeenCalled();
	});

	it('builds only once however it is triggered', () => {
		const view = makeView();
		pointTo(view.dom);
		view.selectNode();
		expect(built).toBe(1);
	});

	it('lets ProseMirror handle events until the field exists, then hands them to mathlive', () => {
		const view = makeView();
		// false while a placeholder: PM needs the click to set a NodeSelection and call selectNode
		expect(view.stopEvent()).toBe(false);
		pointTo(view.dom);
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
		pointTo(view.dom);
		expect(view.mathField!.getValue()).toBe('c+d');
	});

	it('destroys cleanly while still a placeholder, and a pointer after that builds nothing', () => {
		const view = makeView();
		expect(() => view.destroy()).not.toThrow();
		pointTo(view.dom);
		expect(built).toBe(0);
	});

	it('applies to block math too', () => {
		const view = makeView('E=mc^2', true);
		expect(built).toBe(0);
		expect(placeholderOf(view)).not.toBeNull();
		pointTo(view.dom);
		expect(built).toBe(1);
		expect(placeholderOf(view)).toBeNull();
	});
});
