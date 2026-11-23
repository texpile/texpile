// W5's formatting contexts, read through the probe and painted pixels: a turned \rotatebox box, Typst columns walked in
// reading order, and the bullet marks of each depth in light and dark
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { readPng } from '../../../unit/lib/editor/canvas/style/parity/pngPixels';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, settled } from '../canvasPage';

const SHOTS = process.env.W5_SHOTS;

const FILES: Record<string, string> = {
	'rotate.tex': [
		'\\documentclass{article}',
		'\\usepackage{graphicx}',
		'\\begin{document}',
		'Before \\rotatebox{90}{Turned words} after the box on the same line.',
		'',
		'The next paragraph.',
		'\\end{document}',
		''
	].join('\n'),
	'columns.typ': [
		'Intro paragraph.',
		'',
		'#columns(2)[Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega, then the same letters again so the text runs to enough lines to break: alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega.]',
		'',
		'Last paragraph.',
		''
	].join('\n'),
	'bullets.tex': [
		'\\documentclass{article}',
		'\\begin{document}',
		'\\begin{itemize}',
		'\\item one',
		'\\begin{itemize}',
		'\\item two',
		'\\begin{itemize}',
		'\\item three',
		'\\begin{itemize}',
		'\\item four',
		'\\end{itemize}',
		'\\end{itemize}',
		'\\end{itemize}',
		'\\item back at one',
		'\\end{itemize}',
		'\\begin{itemize}[label=--]',
		'\\item dashed',
		'\\end{itemize}',
		'\\end{document}',
		''
	].join('\n'),
	'tasks.md': ['- [ ] an unchecked task', '- [x] a checked task', ''].join('\n'),
	'bullets.typ': ['- one', '  - two', '    - three', '- back at one', ''].join('\n'),
	'bullets.md': ['- one', '  - two', '    - three', '- back at one', ''].join('\n')
};

const texpile = useTexpile({ files: FILES });

function setMode(visual: VisualEditor, mode: 'light' | 'dark'): Promise<void> {
	return visual.page.evaluate(async (mode) => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		theme.setTheme(mode);
	}, mode);
}

async function shot(visual: VisualEditor, name: string): Promise<void> {
	if (SHOTS) await visual.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

/** the mark each list item drew, in the order of the page */
function drawnMarks(visual: VisualEditor): Promise<string[]> {
	return inCanvas(visual.page, ({ probe, view }) => {
		const marks: { text: string; top: number }[] = [];
		view.state.doc.forEach((_, offset) => {
			for (const op of probe.drawList(offset))
				if (op.op === 'fillText' && /^[•–∗·‣◦▪]\s*$/.test(op.text ?? '')) marks.push({ text: op.text!.trim(), top: op.rect.y });
		});
		// reading order: a nested list paints its marks before its parent's
		return marks.sort((a, b) => a.top - b.top).map((mark) => mark.text);
	});
}

test('a \\rotatebox box lays out turned and paints turned', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await setMode(visual, 'light');
	await visual.open('rotate.tex');
	await settled(visual.page);
	const box = await inCanvas(visual.page, ({ probe }) => {
		const found = probe.query('.drawn-rotated')[0];
		return found && { width: found.rect.width, height: found.rect.height, left: found.rect.left, top: found.rect.top };
	});
	expect(box, 'the rotated span is in the tree').toBeTruthy();
	expect(box.height, 'as tall as its text is long').toBeGreaterThan(box.width * 2);
	await shot(visual, 'rotate');
	const ink = await inkExtent(visual, box);
	expect(ink.height, 'the glyphs run down the box').toBeGreaterThan(ink.width * 2);
});

/** the dark pixels' extent in a client rect, read from a screenshot of it */
async function inkExtent(visual: VisualEditor, box: { left: number; top: number; width: number; height: number }) {
	const png = await visual.page.screenshot({ clip: { x: box.left, y: box.top, width: box.width, height: box.height } });
	return visual.page.evaluate(async (base64) => {
		const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
		const canvas = new OffscreenCanvas(image.width, image.height);
		const ctx = canvas.getContext('2d')!;
		ctx.drawImage(image, 0, 0);
		const { data } = ctx.getImageData(0, 0, image.width, image.height);
		let [minX, minY, maxX, maxY] = [image.width, image.height, -1, -1];
		for (let y = 0; y < image.height; y++)
			for (let x = 0; x < image.width; x++) {
				const at = (y * image.width + x) * 4;
				if (data[at] + data[at + 1] + data[at + 2] < 300) {
					minX = Math.min(minX, x);
					maxX = Math.max(maxX, x);
					minY = Math.min(minY, y);
					maxY = Math.max(maxY, y);
				}
			}
		return { width: maxX - minX + 1, height: maxY - minY + 1 };
	}, png.toString('base64'));
}

for (const [file, marks] of Object.entries({
	'bullets.tex': ['•', '–', '∗', '·', '•', '–'],
	'bullets.typ': ['•', '‣', '–', '•'],
	'bullets.md': ['•', '◦', '▪', '•']
})) {
	test(`${file}: bullets draw the mark of their depth`, async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		for (const mode of ['light', 'dark'] as const) {
			await setMode(visual, mode);
			await visual.open(file);
			await settled(visual.page);
			expect(await drawnMarks(visual)).toEqual(marks);
			await shot(visual, `${file}-${mode}`);
		}
	});
}

test('Typst #columns balance the text and the caret walks the columns in reading order', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await setMode(visual, 'light');
	await visual.open('columns.typ');
	await settled(visual.page);
	const walk = await inCanvas(visual.page, ({ probe, view }) => {
		const from = probe.posOf('Alpha');
		const to = probe.posOf('omega.') + 'omega'.length;
		const stops: { pos: number; x: number; top: number }[] = [];
		for (let pos = from; pos <= to; pos++) {
			const rect = probe.rectOf(pos);
			if (rect && view.state.doc.resolve(pos).parent.inlineContent) stops.push({ pos, x: rect.left, top: rect.top });
		}
		return stops;
	});
	// the first column's last line runs to its right edge, so the break shows as the caret going back up
	const breaks = walk.flatMap((stop, i) => (i > 0 && stop.top < walk[i - 1].top - 1 ? [i] : []));
	expect(breaks, 'the text continues in one second column, above').toHaveLength(1);
	const [jump] = breaks;
	expect(walk[jump].x, 'to the right of the first column').toBeGreaterThan(walk[0].x + 200);
	const columns = [walk.slice(0, jump), walk.slice(jump)];
	for (const column of columns)
		for (const [i, stop] of column.entries()) if (i) expect(stop.top).toBeGreaterThanOrEqual(column[i - 1].top - 0.5);
	expect(Math.abs(columns[0].length - columns[1].length), 'balanced by lines of about equal length').toBeLessThan(columns[0].length / 2);
	// the arrow keys step across the break in document order
	await inCanvas(visual.page, ({ probe }, pos) => probe.select(pos), walk[jump - 1].pos);
	await visual.page.keyboard.press('ArrowRight');
	await settled(visual.page);
	const after = await inCanvas(visual.page, ({ probe, view }) => ({
		pos: view.state.selection.head,
		rect: probe.rectOf(view.state.selection.head)!
	}));
	expect(after.pos).toBe(walk[jump].pos);
	expect(after.rect.left).toBeGreaterThan(walk[0].x + 200);
	await shot(visual, 'columns');
});

const CHROME = path.resolve(import.meta.dirname, '../../../fixtures/parity/looks/chrome');
type Ink = { x: number; y: number; width: number; height: number; at(x: number, y: number): [number, number, number] };

/** the 52 by 52 device pixel box of a native checkbox, found in a screenshot by its difference from the ground */
function boxIn(image: { width: number; height: number; at(x: number, y: number): readonly [number, number, number] }): Ink {
	const ground = image.at(2, 8 * 4);
	let [minX, minY, maxX, maxY] = [image.width, image.height, -1, -1];
	// the clip starts 12 css px above the box, where the editor's toolbar can end: its edge is left out
	for (let y = 8 * 4; y < image.height; y++)
		for (let x = 0; x < image.width; x++) {
			const pixel = image.at(x, y);
			if (Math.abs(pixel[0] - ground[0]) + Math.abs(pixel[1] - ground[1]) + Math.abs(pixel[2] - ground[2]) > 40 && x < 52 * 4) {
				minX = Math.min(minX, x);
				maxX = Math.max(maxX, x);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
		}
	return {
		x: minX,
		y: minY,
		width: maxX - minX + 1,
		height: maxY - minY + 1,
		at: (x, y) => image.at(minX + x, minY + y) as [number, number, number]
	};
}

async function decode(
	page: Page,
	png: Buffer
): Promise<{ width: number; height: number; at(x: number, y: number): [number, number, number] }> {
	const raw = await page.evaluate(async (base64) => {
		const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
		const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!;
		ctx.drawImage(bitmap, 0, 0);
		return { width: bitmap.width, height: bitmap.height, data: Array.from(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data) };
	}, png.toString('base64'));
	return {
		width: raw.width,
		height: raw.height,
		at: (x, y) => [raw.data[(y * raw.width + x) * 4], raw.data[(y * raw.width + x) * 4 + 1], raw.data[(y * raw.width + x) * 4 + 2]]
	};
}

for (const mode of ['light', 'dark'] as const) {
	test(`the Markdown task checkbox matches the DOM editor's at 4x in ${mode}`, async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		const { page } = visual;
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 4, mobile: false });
		try {
			await setMode(visual, mode);
			await visual.open('tasks.md');
			await settled(page);
			for (const state of ['unchecked', 'checked'] as const) {
				// the pointer off the page: the block handle beside a hovered item would share the clip. A capture moves
				// the pointer to the middle of the emulated screen, so before each one
				await page.mouse.move(1, 1);
				await page.mouse.move(0, 0);
				await expect(page.locator('.block-handle-btn:visible')).toHaveCount(0);
				const box = await inCanvas(
					page,
					({ probe }, index) => {
						const found = probe.query('input')[index];
						return { left: found.rect.left, top: found.rect.top, width: found.rect.width, height: found.rect.height };
					},
					state === 'unchecked' ? 0 : 1
				);
				// Playwright's screenshot keeps the context's scale, so the 4x device pixels come from CDP itself
				const captured = await cdp.send('Page.captureScreenshot', {
					format: 'png',
					clip: { x: box.left - 40, y: box.top - 12, width: 93, height: 37, scale: 1 }
				});
				const shot = Buffer.from(captured.data, 'base64');
				if (SHOTS) fs.writeFileSync(path.join(SHOTS, `task-${state}-${mode}.png`), shot);
				const ours = boxIn(await decode(page, shot));
				const recorded = boxIn(readPng(path.join(CHROME, `${mode}-task-${state}.png`)));
				// an edge on a fractional device pixel antialiases below the ink threshold: half a css px either way
				expect(Math.abs(ours.width - recorded.width), "the box is as wide as the DOM editor's").toBeLessThanOrEqual(2);
				expect(Math.abs(ours.height - recorded.height), "the box is as tall as the DOM editor's").toBeLessThanOrEqual(2);
				let off = 0;
				for (let y = 0; y < Math.min(recorded.height, ours.height); y++)
					for (let x = 0; x < Math.min(recorded.width, ours.width); x++) {
						const [a, b] = [ours.at(x, y), recorded.at(x, y)];
						if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) > 40) off++;
					}
				// Chromium antialiases its native tick its own way: the checked box keeps 5%
				expect(off, `${state} pixels that differ by more than 40 of ${recorded.width * recorded.height}`).toBeLessThan(
					recorded.width * recorded.height * (state === 'checked' ? 0.05 : 0.03)
				);
			}
		} finally {
			await cdp.send('Emulation.clearDeviceMetricsOverride');
			await cdp.detach();
		}
	});
}
