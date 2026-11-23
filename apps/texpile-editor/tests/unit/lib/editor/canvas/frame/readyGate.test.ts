// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { faceElement, type LayoutBox, type PlacedBlock, type ReplacedContent } from '$lib/editor/canvas';
import { ReadyGate } from '$lib/editor/canvas/frame/readyGate';
import { createTestCanvasView, LINE, settleTestView, testSchema } from '../testing/testCanvasView';

/** a block holding a line of text in a font, and a formula, sized or not yet */
function blockWith(font: string, formula: { size: { width: number; height: number } | null }): PlacedBlock {
	const math = faceElement('span', 'math');
	const replaced: ReplacedContent = { intrinsic: () => formula.size, paint() {}, keys: [{ kind: 'math', key: 'x^2' }] };
	math.replaced = replaced;
	const atom = { element: math, children: [], lines: null } as unknown as LayoutBox;
	const text = { kind: 'text', run: { fontString: font } };
	const box = { element: null, children: [], lines: [{ fragments: [text, { kind: 'atomic', box: atom }] }] } as unknown as LayoutBox;
	return { index: 0, pos: 0, top: 0, layout: { box } as PlacedBlock['layout'] };
}

describe('the ready gate', () => {
	it('fires after the first painted frame, never at construction', async () => {
		const onReady = vi.fn();
		const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, [testSchema.text('one')])]);
		const view = createTestCanvasView(EditorState.create({ doc }), { onReady });
		expect(onReady).not.toHaveBeenCalled();
		await settleTestView(view);
		expect(onReady).toHaveBeenCalledTimes(1);
		await settleTestView(view);
		expect(onReady).toHaveBeenCalledTimes(1);
		view.destroy();
	});

	it('waits for a formula to be sized and for the fonts the visible text uses', async () => {
		const onReady = vi.fn();
		let loaded: () => void = () => {};
		const loadFonts = vi.fn(() => new Promise<void>((resolve) => (loaded = resolve)));
		const requestFrame = vi.fn();
		const gate = new ReadyGate({ loadFonts, fontLoaded: () => false, inputsLoading: () => null, hold() {}, requestFrame }, onReady);
		const formula: { size: { width: number; height: number } | null } = { size: null };
		gate.painted([blockWith('16px Libertinus', formula)]);
		expect(loadFonts).not.toHaveBeenCalled();
		formula.size = { width: 20, height: 12 };
		gate.painted([blockWith('16px Libertinus', formula)]);
		gate.painted([blockWith('16px Libertinus', formula)]);
		expect(loadFonts).toHaveBeenCalledTimes(1);
		expect(loadFonts).toHaveBeenCalledWith(['16px Libertinus']);
		expect(onReady).not.toHaveBeenCalled();
		loaded();
		await Promise.resolve();
		expect(requestFrame).toHaveBeenCalled();
		gate.painted([blockWith('16px Libertinus', formula)]);
		expect(onReady).toHaveBeenCalledTimes(1);
	});

	it('fires on the first frame of a document swapped in, its fonts and the formula fonts in or waited for once', async () => {
		const onReady = vi.fn();
		let settle: () => void = () => {};
		const loadFonts = vi.fn(() => new Promise<void>((resolve) => (settle = resolve)));
		const loaded = new Set(['16px Libertinus']);
		const host = { loadFonts, fontLoaded: (font: string) => loaded.has(font), inputsLoading: () => null, hold() {}, requestFrame() {} };
		const gate = new ReadyGate(host, onReady);
		const formula = { size: { width: 20, height: 12 } };
		expect(gate.painted([blockWith('16px Libertinus', formula)])).toBe(false);
		settle();
		await Promise.resolve();
		expect(gate.painted([blockWith('16px Libertinus', formula)])).toBe(true);
		gate.rearm();
		expect(gate.painted([blockWith('16px Libertinus', formula)])).toBe(true);
		expect([onReady.mock.calls.length, loadFonts.mock.calls.length]).toEqual([2, 1]);
	});

	it('holds the rows until it fires, waits for the hyphenation patterns, and holds again for another document', async () => {
		const held: boolean[] = [];
		let arrive: () => void = () => {};
		let patterns: Promise<void> | null = new Promise<void>((resolve) => (arrive = resolve));
		const onReady = vi.fn();
		const requestFrame = vi.fn();
		const host = {
			loadFonts: vi.fn(),
			fontLoaded: () => true,
			inputsLoading: () => patterns,
			hold: (on: boolean) => held.push(on),
			requestFrame
		};
		const gate = new ReadyGate(host, onReady);
		const text = { kind: 'text', run: { fontString: '16px Libertinus' } };
		const block = { index: 0, pos: 0, top: 0, layout: { box: { element: null, children: [], lines: [{ fragments: [text] }] } } };
		const blocks = [block as unknown as PlacedBlock];
		expect(gate.painted(blocks)).toBe(false);
		expect(held).toEqual([true]);
		arrive();
		patterns = null;
		await new Promise((resolve) => setTimeout(resolve));
		expect(requestFrame).toHaveBeenCalled();
		expect(gate.painted(blocks)).toBe(true);
		expect([onReady.mock.calls.length, held]).toEqual([1, [true, false]]);
		gate.rearm();
		expect(held.at(-1)).toBe(true);
		expect(gate.painted(blocks)).toBe(true);
		expect([onReady.mock.calls.length, held.at(-1)]).toEqual([2, false]);
	});

	it('marks the pane shown after the frame it fires in, and not while a swapped document or a page font is held', async () => {
		const doc = testSchema.node('doc', null, [testSchema.node('paragraph', null, [testSchema.text('one')])]);
		let arrive: () => void = () => {};
		const fonts = { status: 'loading', ready: new Promise<void>((resolve) => (arrive = resolve)), check: () => true };
		Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
		const onReady = vi.fn();
		const view = createTestCanvasView(EditorState.create({ doc }), { onReady });
		const pane = view.canvas.scroller;
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect([onReady.mock.calls.length, pane.hasAttribute('data-canvas-shown')]).toEqual([0, false]);
		fonts.status = 'loaded';
		arrive();
		// the mark lands in a microtask after the frame, past the settle
		await settleTestView(view).then(() => Promise.resolve());
		expect([onReady.mock.calls.length, pane.hasAttribute('data-canvas-shown')]).toEqual([1, true]);
		view.canvas.holdUntilReady();
		expect(pane.hasAttribute('data-canvas-shown')).toBe(false);
		await settleTestView(view).then(() => Promise.resolve());
		expect(pane.hasAttribute('data-canvas-shown')).toBe(true);
		view.destroy();
		expect(pane.hasAttribute('data-canvas-shown')).toBe(false);
		Reflect.deleteProperty(document, 'fonts');
	});

	it('shows the first frame where the caret onReady restores lands', async () => {
		const doc = testSchema.node(
			'doc',
			null,
			Array.from({ length: 60 }, (_, i) => testSchema.node('paragraph', null, [testSchema.text(`line ${i}`)]))
		);
		const shown: number[] = [];
		const frame = window.requestAnimationFrame.bind(window);
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
			frame((time) => {
				callback(time);
				const rows = view.dom.querySelector<HTMLElement>('[data-canvas-tiles]')!;
				if (rows.style.visibility !== 'hidden') shown.push(view.canvas.scroller.scrollTop);
			})
		);
		const view = createTestCanvasView(EditorState.create({ doc }), {
			onReady() {
				const end = view.state.doc.content.size - 2;
				view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)).scrollIntoView());
			}
		});
		await settleTestView(view);
		expect(shown.length).toBeGreaterThan(0);
		expect(Math.min(...shown)).toBeGreaterThan(40 * LINE);
		view.destroy();
		vi.restoreAllMocks();
	});

	it('holds the rows while a place is taken and shows them on the next frame, with no second onReady', async () => {
		const onReady = vi.fn();
		const held: boolean[] = [];
		const host = {
			loadFonts: async () => {},
			fontLoaded: () => true,
			inputsLoading: () => null,
			hold: (on: boolean) => held.push(on),
			requestFrame() {}
		};
		const gate = new ReadyGate(host, onReady);
		gate.painted([]);
		expect(onReady).toHaveBeenCalledTimes(1);
		const { promise, resolve } = Promise.withResolvers<void>();
		gate.holdWhilePlacing(promise);
		gate.painted([]);
		expect(held.at(-1)).toBe(true);
		resolve();
		await promise;
		await Promise.resolve();
		gate.painted([]);
		expect(held.at(-1)).toBe(false);
		expect(onReady).toHaveBeenCalledTimes(1);
	});
});
