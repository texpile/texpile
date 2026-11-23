// Louis, 2026-11-18: "typing is a bit laggy also". A key repaints the line it changed, where the sticky canvas repainted
// the screen (2.5), and a letter typed before the next frame lands where the key before it left the caret
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';
import { recordFramePaints, stopFramePaints } from './framePaints';

const long = 'A long paragraph whose words wrap over many lines of the column while someone types into its middle. '.repeat(12);
const body = Array.from({ length: 12 }, (_, i) => (i === 4 ? long : `Paragraph ${i} sits around the one being typed into.`)).join('\n\n');
const texpile = useTexpile({ files: { 'typing.tex': `\\documentclass{article}\n\\begin{document}\n\n${body}\n\n\\end{document}\n` } });

/** a click before `needle` */
async function caretBefore(visual: VisualEditor, needle: string, nth = 0): Promise<void> {
	const point = await inCanvas(visual.page, ({ probe }, [needle, nth]) => probe.clientPointOf(probe.posOf(needle, nth)), [
		needle,
		nth
	] as const);
	await visual.page.mouse.click(point.x, point.y);
	await settled(visual.page);
}

test('a key repaints the line it changed', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('typing.tex');
	await caretBefore(visual, 'one being typed', 6);
	const screen = await inCanvas(page, ({ view }) => {
		const box = view.canvas.scroller.getBoundingClientRect();
		return box.width * box.height * devicePixelRatio * devicePixelRatio;
	});
	await recordFramePaints(page);
	await page.keyboard.type('quick', { delay: 120 });
	await settled(page);
	const painted = await stopFramePaints(page);
	expect(painted.length, 'the keys ran frames').toBeGreaterThan(0);
	expect(Math.max(...painted), 'device pixels a key painted, against the pane').toBeLessThan(screen / 8);
	expect(await probeErrors(page)).toEqual([]);
});

test('a letter typed before the frame after Enter lands in the new paragraph', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('typing.tex');
	await caretBefore(visual, 'while someone types', 5);
	const at = await inCanvas(page, ({ view }) => view.state.selection.head);
	// both keys wait behind a busy main thread, so no frame runs between them
	await page.evaluate(() => {
		setTimeout(() => {
			const end = performance.now() + 300;
			while (performance.now() < end);
		});
	});
	await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('z')]);
	await settled(page);
	const typed = await inCanvas(
		page,
		({ view }, from) => {
			const $head = view.state.selection.$head;
			return {
				before: view.state.doc.textBetween(from - 6, from),
				line: $head.parent.textContent.slice(0, 12),
				offset: $head.parentOffset
			};
		},
		at
	);
	expect(typed.line.startsWith('z'), `the new paragraph starts with the letter: "${typed.line}"`).toBe(true);
	expect(typed.offset).toBe(1);
	expect(await probeErrors(page)).toEqual([]);
});
