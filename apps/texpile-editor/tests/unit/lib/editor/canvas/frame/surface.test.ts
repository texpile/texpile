// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { PaintFrame } from '$lib/editor/canvas/contracts/engineTypes';
import { NO_ROOT_BOX } from '$lib/editor/canvas/frame/rootBox';
import { CanvasSurface } from '$lib/editor/canvas/frame/surface';
import { createTestCanvasView, LINE, lineLayout, settleTestView, testSchema } from '../testing/testCanvasView';

describe('the surface', () => {
	it('zooms paint and scroll and lays out at the column over the zoom, the first visible line kept on screen', async () => {
		const blocks = Array.from({ length: 60 }, (_, i) => testSchema.node('paragraph', null, [testSchema.text(`line ${i}`)]));
		const widths: number[] = [];
		const view = createTestCanvasView(EditorState.create({ doc: testSchema.node('doc', null, blocks) }), {
			width: 600,
			engine: {
				layoutBlock(request) {
					widths.push(request.width);
					return lineLayout(request, LINE, null);
				}
			}
		});
		await settleTestView(view);
		const scroller = view.canvas.scroller;
		scroller.scrollTop = 20 * LINE;
		await settleTestView(view);
		const line = view.state.doc.resolve(0).posAtIndex(20) + 1;
		const before = view.coordsAtPos(line);
		view.canvas.setZoom(2);
		await settleTestView(view);
		expect(scroller.scrollTop).toBe(40 * LINE);
		expect(view.coordsAtPos(line).top).toBe(before.top);
		expect(view.coordsAtPos(line).bottom - view.coordsAtPos(line).top).toBe(2 * LINE);
		expect(parseFloat(view.dom.style.height)).toBe(2 * 60 * LINE);
		expect(widths.at(-1)).toBe(300);
		view.destroy();
	});

	afterEach(() => vi.restoreAllMocks());

	it('puts rows and carets on whole device pixels, drawn where docPoint maps', () => {
		const dpr = 1.25;
		vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(dpr);
		const transforms: number[][] = [];
		vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
			setTransform: (...m: number[]) => transforms.push(m),
			clearRect() {}
		} as unknown as CanvasRenderingContext2D);
		const pane = document.body.appendChild(document.createElement('div'));
		Object.defineProperties(pane, { clientWidth: { value: 700 }, clientHeight: { value: 500 } });
		pane.getBoundingClientRect = () => new DOMRect(0.4, 30.3, 700, 500);
		const surface = new CanvasSurface(pane);
		const box = new DOMRect(51.3, -200.1, 600, 4000);
		surface.dom.getBoundingClientRect = () => box;
		surface.zoom = 1.1;
		surface.root = { ...NO_ROOT_BOX, left: 20.3, top: 7.7 };
		surface.place(pane);
		const scale = dpr * surface.zoom;
		/** device x of a doc x as docPoint and clientRect map it */
		const deviceX = (x: number) => surface.clientRect({ x, y: 0, width: 0, height: 0 }).x * dpr;
		/** a layer's device x: its paint offset rounded (Chromium), then its translate */
		const layerX = (el: HTMLElement) =>
			Math.round((box.left + parseFloat(el.style.left || '0')) * dpr) +
			parseFloat(/translate\(([-\d.e]+)px/.exec(el.style.transform)![1]) * dpr;

		const whole = (x: number) => Math.abs(x - Math.round(x)) < 1e-6;

		const row = surface.tiles.tile(surface.rowsShown().first);
		const rect = surface.rowRect(row.row);
		expect(whole(layerX(row.canvas))).toBe(true);
		expect(layerX(row.canvas)).toBeCloseTo(deviceX(rect.x), 1);

		const frame = { dpr, zoom: surface.zoom } as PaintFrame;
		surface.caretContextOver({ x: 100.37, y: 40.2, width: 1, height: 18 }, frame);
		const [, , , , e] = transforms.at(-1)!;
		expect(whole(layerX(surface.caret))).toBe(true);
		expect(layerX(surface.caret) + 100.37 * scale + e).toBeCloseTo(deviceX(100.37), 1);
		pane.remove();
	});
});
