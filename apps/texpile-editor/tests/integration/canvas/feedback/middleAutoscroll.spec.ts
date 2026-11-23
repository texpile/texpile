// Louis, 2026-11-18: "middle mouse button doesnt make my mouse go into scroll mode". A middle press over the paper
// starts the browser's autoscroll as it does over the DOM editor; the press must keep its default
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const body = Array.from({ length: 120 }, (_, i) => `Paragraph ${i} holds enough words to wrap over two lines of the column.`).join('\n\n');
const texpile = useTexpile({
	switches: ['--enable-features=MiddleClickAutoscroll'],
	files: { 'long.tex': `\\documentclass{article}\n\\begin{document}\n\n${body}\n\n\\end{document}\n` }
});

test('a middle press starts autoscroll and the pane scrolls', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('long.tex');
	await settled(page);
	const pane = await inCanvas(page, ({ view }) => {
		const box = view.canvas.scroller.getBoundingClientRect();
		return { x: box.x + box.width / 2, y: box.y + 200, top: view.canvas.scroller.scrollTop };
	});
	const caret = await inCanvas(page, ({ view }) => view.state.selection.from);
	await page.evaluate(() => {
		(window as unknown as { middleDown: boolean }).middleDown = false;
		document.addEventListener('mousedown', (e) => {
			if (e.button === 1) (window as unknown as { middleDown: boolean }).middleDown = e.defaultPrevented;
		});
	});
	await page.mouse.move(pane.x, pane.y);
	await page.mouse.down({ button: 'middle' });
	await page.mouse.up({ button: 'middle' });
	await page.mouse.move(pane.x, pane.y + 250, { steps: 5 });
	await page.waitForTimeout(1000);
	const top = await inCanvas(page, ({ view }) => view.canvas.scroller.scrollTop);
	await page.mouse.click(pane.x, pane.y + 250);
	expect(await page.evaluate(() => (window as unknown as { middleDown: boolean }).middleDown), 'the press kept its default').toBe(false);
	expect(top - pane.top, 'the pane autoscrolled').toBeGreaterThan(100);
	expect(await inCanvas(page, ({ view }) => view.state.selection.from)).toBe(caret);
	expect(await probeErrors(page)).toEqual([]);
});
