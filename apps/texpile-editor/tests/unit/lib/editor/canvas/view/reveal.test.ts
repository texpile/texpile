// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import { PAGE_KEY_META } from '$lib/editor/canvas/contracts/geometryTypes';
import { createTestCanvasView, LINE, settleTestView, testSchema } from '../testing/testCanvasView';

const BAND_BOTTOM = 395;
const MARGIN = 3 * LINE;

async function paneOf(options: { height?: number; bar?: number } = {}): Promise<CanvasView> {
	const paragraphs = Array.from({ length: 80 }, (_, i) => testSchema.node('paragraph', null, [testSchema.text(`paragraph ${i}`)]));
	const doc = testSchema.node('doc', null, paragraphs);
	const view = createTestCanvasView(EditorState.create({ doc, selection: TextSelection.create(doc, 1) }), {
		height: options.height ?? 400
	});
	if (options.bar !== undefined) {
		const room = document.createElement('div');
		room.className = 'floating-bar-room';
		const bar = room.appendChild(document.createElement('div'));
		bar.setAttribute('data-format-bar', '');
		bar.getBoundingClientRect = () => new DOMRect(0, 0, 300, options.bar!);
		view.dom.parentElement!.replaceWith(room);
		room.appendChild(view.dom);
	}
	await settleTestView(view);
	return view;
}

/** the caret of paragraph `index`, a transaction that asks for a reveal */
async function caretIn(view: CanvasView, index: number, meta?: string): Promise<void> {
	let pos = 0;
	view.state.doc.forEach((node, offset) => {
		if (view.state.doc.child(index) === node) pos = offset + 1;
	});
	const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).scrollIntoView();
	if (meta) tr.setMeta(meta, true);
	view.dispatch(tr);
	await settleTestView(view);
}

function caretBox(view: CanvasView): { top: number; bottom: number } {
	const rect = view.canvas.geometry.caretRect(view.canvas.head())!;
	const box = view.canvas.clientRect(rect);
	return { top: box.top, bottom: box.top + box.height };
}

describe('a keyed reveal keeps three caret lines from the foot', () => {
	it('scrolls nothing for a caret inside the band, and just enough once it comes within three lines of the foot', async () => {
		const view = await paneOf();
		await caretIn(view, 12);
		expect(view.canvas.scroller.scrollTop).toBe(0);
		await caretIn(view, 13);
		expect(caretBox(view).bottom).toBeCloseTo(BAND_BOTTOM - MARGIN);
		view.destroy();
	});

	it('scrolls one line for each line the caret moves down past the margin', async () => {
		const view = await paneOf();
		await caretIn(view, 14);
		const settledAt = view.canvas.scroller.scrollTop;
		for (let line = 15; line < 20; line++) {
			await caretIn(view, line);
			expect(view.canvas.scroller.scrollTop - settledAt).toBe((line - 14) * LINE);
		}
		view.destroy();
	});

	it('caps the margin at a fifth of the band in a short pane', async () => {
		const view = await paneOf({ height: 150 });
		await caretIn(view, 12);
		const band = BAND_BOTTOM - 145 - 0;
		void band;
		const fifth = (145 - 5) * 0.2;
		expect(150 - 5 - caretBox(view).bottom).toBeCloseTo(fifth);
		view.destroy();
	});

	it('keeps three lines under the format bar going up', async () => {
		const view = await paneOf({ bar: 40 });
		await caretIn(view, 30);
		await caretIn(view, 29);
		expect(caretBox(view).top).toBeGreaterThanOrEqual(40 + 5 + MARGIN - 0.5);
		view.destroy();
	});

	it('leaves a Page key to its own scroll', async () => {
		const view = await paneOf();
		await caretIn(view, 40, PAGE_KEY_META);
		expect(view.canvas.scroller.scrollTop).toBe(0);
		view.destroy();
	});
});
