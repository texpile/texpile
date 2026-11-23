// Louis, 2026-11-18: "scroll a bit laggy". The text sits in rows of the document that the browser scrolls with the
// scrollbar and the overlay layer (2.5), painted ahead in idle slices: a scroll repaints nothing and no row comes on
// screen blank. The sticky canvas repainted the screen after every scroll, a frame behind at fractional scales
import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';
import { recordFramePaints, stopFramePaints } from './framePaints';

const body = Array.from(
	{ length: 220 },
	(_, i) => `Paragraph ${i} holds enough words to wrap over two lines of the column, so the document runs many screens long.`
).join('\n\n');
type MarkedWindow = Window & { canvasTopsBefore?: Map<Element, number> };

/** 'before' marks every content canvas's client top; 'after' gives how far each one still in the page moved */
function canvasTops(page: Page, when: 'before' | 'after'): Promise<number[]> {
	return page.evaluate((when) => {
		const w = window as MarkedWindow;
		const tops = new Map([...document.querySelectorAll('[data-canvas-content]')].map((el) => [el, el.getBoundingClientRect().top]));
		if (when === 'before') w.canvasTopsBefore = tops;
		return [...(w.canvasTopsBefore ?? [])].filter(([el]) => tops.has(el)).map(([el, top]) => tops.get(el)! - top);
	}, when);
}

const texpile = useTexpile({ files: { 'long.tex': `\\documentclass{article}\n\\begin{document}\n\n${body}\n\n\\end{document}\n` } });

test('the wheel scrolls rows already painted', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('long.tex');
	await settled(page);
	await page.waitForTimeout(500);
	const pane = await inCanvas(page, ({ view }) => {
		const box = view.canvas.scroller.getBoundingClientRect();
		return { x: box.x + box.width / 2, y: box.y + box.height / 2, top: view.canvas.scroller.scrollTop };
	});
	await page.mouse.move(pane.x, pane.y);
	const before = await inCanvas(page, ({ probe }) => probe.frameStats());
	await canvasTops(page, 'before');
	await recordFramePaints(page);
	for (let i = 0; i < 8; i++) {
		await page.mouse.wheel(0, 120);
		await page.waitForTimeout(150);
	}
	await settled(page);
	const painted = await stopFramePaints(page);
	const after = await inCanvas(page, ({ probe, view }) => ({ ...probe.frameStats(), top: view.canvas.scroller.scrollTop }));
	expect(after.top - pane.top, 'the pane scrolled').toBeGreaterThan(600);
	const moved = await canvasTops(page, 'after');
	expect(moved.length, 'canvases on screen before and after').toBeGreaterThan(0);
	for (const shift of moved) expect(shift, 'a canvas moved with the scroll').toBeCloseTo(pane.top - after.top, 0);
	expect(painted.length, 'the scrolls ran frames').toBeGreaterThan(0);
	expect(after.lateRows - before.lateRows, 'rows that came on screen unpainted').toBe(0);
	expect(Math.max(...painted), 'device pixels a scroll frame painted').toBe(0);
	expect(await probeErrors(page)).toEqual([]);
});
