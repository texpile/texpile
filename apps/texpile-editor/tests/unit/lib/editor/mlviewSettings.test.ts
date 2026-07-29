// @vitest-environment jsdom
// The block_math settings popover is invisible until the block is hovered or focused (opacity:0 in
// MathSettings.svelte), so it is mounted lazily: a 262-equation document should not pay for 262
// Svelte components at load. These pin that contract, and the part that matters more - that the
// popover still appears the moment the user reaches for it, by mouse or by keyboard.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EditorView as ProseMirrorView } from 'prosemirror-view';

// A mathfield is a heavy web component with no layout in jsdom; none of these tests exercise it.
// It still has to be a real element, since the node view appends it to its own DOM.
vi.mock('mathlive', () => {
	class FakeMathfield extends HTMLElement {
		static soundsDirectory: string | null = null;
		selection: unknown = {};
		readOnly = false;
		mathVirtualKeyboardPolicy = 'auto';
		canUndo = () => false;
		canRedo = () => false;
		setValue() {}
		getValue() {
			return '';
		}
		hasFocus() {
			return false;
		}
	}
	customElements.define('mock-math-field', FakeMathfield);
	// spelled out so the placeholder renders through its normal path rather than its error fallback
	return { MathfieldElement: FakeMathfield, convertLatexToMarkup: (latex: string) => `<span>${latex}</span>` };
});
vi.mock('mathlive/static.css', () => ({}));
vi.mock('mathlive/fonts.css', () => ({}));
vi.mock('$lib/editor/extensions/mathlivebridge/virtualKeyboardConfig', () => ({ configureMathVirtualKeyboard() {} }));

const mountSpy = vi.fn((_component: unknown, _options: { props: { node: unknown } }) => ({ __component: true }));
const unmountSpy = vi.fn();
vi.mock('svelte', async (orig) => ({ ...(await orig<Record<string, unknown>>()), mount: mountSpy, unmount: unmountSpy }));

const { schema } = await import('$lib/schema/schema');
const { default: MathLiveView } = await import('$lib/editor/extensions/mathlivebridge/mlview.svelte');

function makeView(isBlock: boolean) {
	const type = isBlock ? schema.nodes.block_math : schema.nodes.inline_math;
	const node = type.create(isBlock ? { numbered: false, lineLabels: [] } : null, schema.text('x^2'));
	const pmView = {
		editable: true,
		state: { doc: { descendants() {} }, tr: {} },
		dispatch() {},
		focus() {}
	} as unknown as ProseMirrorView;
	const view = new MathLiveView(node, pmView, () => 0, {}, isBlock);
	// jsdom attaches nothing by default; hover/focus events need the node in a document
	document.body.appendChild(view.dom);
	return view;
}

beforeEach(() => {
	mountSpy.mockClear();
	unmountSpy.mockClear();
	document.body.innerHTML = '';
});

describe('block_math settings popover', () => {
	it('is not mounted at construction, which is the whole point', () => {
		makeView(true);
		expect(mountSpy).not.toHaveBeenCalled();
	});

	it('mounts on hover, so the button is there when it becomes visible', () => {
		const view = makeView(true);
		view.dom.dispatchEvent(new Event('pointerenter'));
		expect(mountSpy).toHaveBeenCalledTimes(1);
	});

	it('mounts on focus, so keyboard users can still tab to it', () => {
		const view = makeView(true);
		view.dom.dispatchEvent(new Event('focusin', { bubbles: true }));
		expect(mountSpy).toHaveBeenCalledTimes(1);
	});

	it('mounts once however many times the user hovers back and forth', () => {
		const view = makeView(true);
		view.dom.dispatchEvent(new Event('pointerenter'));
		view.dom.dispatchEvent(new Event('focusin', { bubbles: true }));
		view.dom.dispatchEvent(new Event('pointerenter'));
		expect(mountSpy).toHaveBeenCalledTimes(1);
	});

	it('hands the component the current node, not the one captured at construction', () => {
		const view = makeView(true);
		const updated = schema.nodes.block_math.create({ numbered: true, lineLabels: [], label: 'eq:later' }, schema.text('y^2'));
		view.update(updated);
		view.dom.dispatchEvent(new Event('pointerenter'));
		expect(mountSpy.mock.calls[0][1].props.node).toBe(updated);
	});

	it('unmounts on destroy once it exists', () => {
		const view = makeView(true);
		view.dom.dispatchEvent(new Event('pointerenter'));
		view.destroy();
		expect(unmountSpy).toHaveBeenCalledTimes(1);
	});

	it('destroys cleanly when it was never hovered', () => {
		const view = makeView(true);
		expect(() => view.destroy()).not.toThrow();
		expect(unmountSpy).not.toHaveBeenCalled();
	});

	it('never mounts for inline math, which has no settings at all', () => {
		const view = makeView(false);
		view.dom.dispatchEvent(new Event('pointerenter'));
		expect(mountSpy).not.toHaveBeenCalled();
	});
});
