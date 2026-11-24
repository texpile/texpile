// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { StepMap } from 'prosemirror-transform';
import { BlockIndex } from '$lib/editor/canvas/document/blockIndex';
import { windowInvalidation } from '$lib/editor/canvas/document/invalidation';
import { ScrollAnchor } from '$lib/editor/canvas/document/scrollAnchor';
import type { FaceInputKey } from '$lib/editor/canvas';
import { createTestCanvasView, LINE, settleTestView, testSchema } from '../testing/testCanvasView';

const PICTURE: FaceInputKey = { kind: 'bitmap', source: 'figures/plot.png' };

/** 30 one-line paragraphs with a picture at block 10 */
function paper(): EditorState {
	const blocks: PMNode[] = [];
	for (let i = 0; i < 30; i++)
		blocks.push(
			i === 10 ? testSchema.node('image', { label: 'fig:plot' }) : testSchema.node('paragraph', null, [testSchema.text(`line ${i}`)])
		);
	return EditorState.create({ doc: testSchema.node('doc', null, blocks) });
}

/** a view scrolled 10 px into block 11, the picture just above the top edge */
async function scrolledPastPicture(picture: { height: number }) {
	const view = createTestCanvasView(paper(), {
		blockHeight: (node) => (node.type.name === 'image' ? picture.height : null),
		blockKeys: (node) => (node.type.name === 'image' ? [PICTURE] : [])
	});
	await settleTestView(view);
	const scroller = view.canvas.scroller;
	scroller.scrollTop = 11 * LINE + 10;
	await settleTestView(view);
	const firstVisible = view.state.doc.resolve(0).posAtIndex(11) + 1;
	return { view, scroller, firstVisible, top: () => view.coordsAtPos(firstVisible).top };
}

/** 30 one-line paragraphs scrolled 5 blocks down, the caret on block 12 or 13 next to their boundary, after a key */
async function keyedAtBoundary(caretBlock: 12 | 13) {
	const view = createTestCanvasView(paper());
	await settleTestView(view);
	view.canvas.scroller.scrollTop = 5 * LINE;
	const end = view.state.doc.resolve(0).posAtIndex(13) - 1;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, caretBlock === 12 ? end : end + 2)));
	await settleTestView(view);
	view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
	return { view, end };
}

/** Chromium keeps scrollTop on the nearest device pixel */
function roundScrollTop(scroller: HTMLElement, ratio = 1): void {
	let top = 0;
	Object.defineProperty(scroller, 'scrollTop', { get: () => top, set: (value: number) => (top = Math.round(value * ratio) / ratio) });
}

describe('the reading place', () => {
	it('keeps the page still when Backspace deletes the last character of a paragraph', async () => {
		const { view, end } = await keyedAtBoundary(12);
		view.dispatch(view.state.tr.delete(end - 1, end));
		await settleTestView(view);
		expect(view.canvas.scroller.scrollTop).toBe(5 * LINE);
		view.destroy();
	});

	it('keeps the lines above still when Backspace joins a paragraph onto the one above', async () => {
		const { view, end } = await keyedAtBoundary(13);
		view.dispatch(view.state.tr.join(end + 1));
		await settleTestView(view);
		expect(view.canvas.scroller.scrollTop).toBe(5 * LINE);
		view.destroy();
	});

	it('owes the scroller what its whole pixels left over, so the top line does not creep', async () => {
		const picture = { height: LINE };
		const view = createTestCanvasView(paper(), {
			blockHeight: (node) => (node.type.name === 'image' ? picture.height : null),
			blockKeys: (node) => (node.type.name === 'image' ? [PICTURE] : [])
		});
		roundScrollTop(view.canvas.scroller);
		await settleTestView(view);
		view.canvas.scroller.scrollTop = 11 * LINE + 10;
		await settleTestView(view);
		const firstVisible = view.state.doc.resolve(0).posAtIndex(11) + 1;
		const before = view.coordsAtPos(firstVisible).top;
		for (let step = 0; step < 5; step++) {
			picture.height += 0.4;
			windowInvalidation(window).fire(PICTURE);
			await settleTestView(view);
		}
		expect(view.canvas.scroller.scrollTop).toBe(11 * LINE + 10 + 2);
		expect(Math.abs(view.coordsAtPos(firstVisible).top - before)).toBeLessThan(0.5);
		view.destroy();
	});

	it('stays still to the device pixel at 150 percent while the blocks above are measured', async () => {
		Object.defineProperty(window, 'devicePixelRatio', { value: 1.5, configurable: true });
		const blocks = Array.from({ length: 120 }, (_, i) =>
			testSchema.node('paragraph', null, [testSchema.text(`line ${i} ${'x'.repeat(i % 9)}`)])
		);
		const view = createTestCanvasView(EditorState.create({ doc: testSchema.node('doc', null, blocks) }), {
			blockHeight: (node) => LINE + 0.37 * (node.textContent.length % 7)
		});
		roundScrollTop(view.canvas.scroller, 1.5);
		const idle = view.state.doc.resolve(0).posAtIndex(90) + 1;
		view.canvas.scroller.scrollTop = 90 * LINE;
		await settleTestView(view);
		const top = () => Math.round(view.coordsAtPos(idle).top * 1000) / 1000;
		const before = top();
		const seen = new Set<number>();
		for (let slice = 0; slice < 8; slice++) {
			await new Promise((resolve) => setTimeout(resolve, 60));
			await settleTestView(view);
			seen.add(top());
		}
		expect([...seen]).toEqual([before]);
		view.destroy();
		Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
	});

	it('stays still when a picture just above the viewport arrives taller', async () => {
		const picture = { height: LINE };
		const { view, scroller, top } = await scrolledPastPicture(picture);
		const before = top();
		picture.height = LINE + 100;
		windowInvalidation(window).fire(PICTURE);
		await settleTestView(view);
		expect(scroller.scrollTop).toBe(11 * LINE + 10 + 100);
		expect(top()).toBe(before);
		view.destroy();
	});

	it('is the reader to move while the native scrollbar is held', async () => {
		const picture = { height: LINE };
		const { view, scroller, top } = await scrolledPastPicture(picture);
		const before = top();
		scroller.dispatchEvent(new Event('pointerdown'));
		picture.height = LINE + 100;
		windowInvalidation(window).fire(PICTURE);
		await settleTestView(view);
		expect(scroller.scrollTop).toBe(11 * LINE + 10);
		expect(top()).toBe(before + 100);
		window.dispatchEvent(new Event('pointerup'));
		view.destroy();
	});

	it('stays still when an edit grows the off-screen block that holds the caret', async () => {
		// idle heights stay out of it: in the app they run after the frames, in jsdom before them
		const idle = { request: window.requestIdleCallback, cancel: window.cancelIdleCallback };
		window.requestIdleCallback = () => 0;
		window.cancelIdleCallback = () => {};
		const view = createTestCanvasView(paper(), { blockHeight: (node) => (node.textContent.includes('grown') ? LINE + 100 : null) });
		await settleTestView(view);
		view.canvas.scroller.scrollTop = 11 * LINE + 10;
		await settleTestView(view);
		const firstVisible = view.state.doc.resolve(0).posAtIndex(11) + 1;
		const before = view.coordsAtPos(firstVisible).top;
		const words = ' grown';
		view.dispatch(view.state.tr.insertText(words, 2).setMeta('addToHistory', false));
		await settleTestView(view);
		view.coordsAtPos(view.state.selection.head);
		await settleTestView(view);
		expect(view.coordsAtPos(firstVisible + words.length).top).toBe(before);
		view.destroy();
		Object.assign(window, { requestIdleCallback: idle.request, cancelIdleCallback: idle.cancel });
	});
});

/** a 30 character paragraph between two one-line ones, its lines starting at wrap.starts */
function wrappedParagraph() {
	const paragraph = (text: string) => testSchema.node('paragraph', null, [testSchema.text(text)]);
	const index = new BlockIndex(testSchema.node('doc', null, [paragraph('above'), paragraph('x'.repeat(30)), paragraph('below')]));
	const start = index.blocks[1].pos + 1;
	const wrap = { starts: [0, 10, 20] };
	const tops = () => [0, LINE, LINE * (1 + wrap.starts.length)];
	const anchor = new ScrollAnchor(index, {
		indexAtY: (y) => (y < LINE ? 0 : 1),
		blockTop: (i) => tops()[i],
		posAtY: () => 1,
		lineOf(pos) {
			const i = index.indexAt(pos);
			if (i !== 1) return { top: tops()[i], from: index.blocks[i].pos + 1 };
			const line = wrap.starts.findLastIndex((offset) => start + offset <= pos);
			return { top: LINE * (1 + line), from: start + wrap.starts[line] };
		}
	});
	return { anchor, start, wrap };
}

describe('the caret paragraph', () => {
	it('stays still when typing lets the line above take part of the caret line', () => {
		const { anchor, start, wrap } = wrappedParagraph();
		anchor.capture(0, start + 18);
		wrap.starts = [0, 12, 21];
		anchor.noteEdit(true, new StepMap([start + 18, 0, 1]));
		expect(anchor.shift()).toBe(0);
	});

	it('stays still when an undo above the caret line rewraps it', () => {
		const { anchor, start, wrap } = wrappedParagraph();
		anchor.capture(0, start + 18);
		wrap.starts = [0, 9, 20];
		anchor.noteEdit(true, new StepMap([start + 3, 5, 0]));
		expect(anchor.shift()).toBe(0);
	});
});
