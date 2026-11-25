// Louis, 2026-11-18: canvas text "a bit blur" beside the DOM's. Chromium composites a row at its paint offset rounded and
// its translate as given; the translate held the pane's fractional offset, so the rows were resampled at most zooms
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';
import { paragraphPixels, removeDomReference, screenShot, showDomReference } from './textPixels';

const PARAGRAPH =
	'Typesetting on a screen asks for crisp stems and even color across every line of a paragraph. The writer reads the same words for hours, so a soft edge on each glyph adds up by the end of the afternoon.';
const NEEDLE = 'Typesetting on a screen';
const FONTS = path.join(import.meta.dirname, 'subpixelFonts.conf');

/** the View menu's zoom: the whole window, so devicePixelRatio is the display scale times it */
function setAppZoom(page: Page, zoom: number): Promise<unknown> {
	type Bridge = { texpileNative: { setZoomFactor(factor: number): Promise<number> } };
	return page.evaluate((zoom) => (window as unknown as Bridge).texpileNative.setZoomFactor(zoom), zoom);
}

function setMode(page: Page, mode: 'light' | 'dark'): Promise<void> {
	return page.evaluate((mode) => {
		document.documentElement.setAttribute('data-mode', mode);
		document.documentElement.classList.toggle('dark', mode === 'dark');
	}, mode);
}

for (const scale of [1, 1.5])
	test.describe(`at display scale ${scale}`, () => {
		const texpile = useTexpile({
			scale,
			env: { FONTCONFIG_FILE: FONTS },
			files: { 'sharp.tex': `\\documentclass{article}\n\\begin{document}\n\n${PARAGRAPH}\n\nA second paragraph.\n\n\\end{document}\n` }
		});

		test('the screen shows the rows as drawn, as sharp as DOM text, at every app zoom', async () => {
			const visual = new VisualEditor(texpile().page, texpile().root);
			const { page } = visual;
			await visual.open('sharp.tex');
			for (const [zoom, mode] of [
				[1, 'light'],
				[1.1, 'light'],
				[1.2, 'light'],
				[1.3, 'light'],
				[1.2, 'dark']
			] as const) {
				await setAppZoom(page, zoom);
				await setMode(page, mode);
				await page.waitForTimeout(400);
				await settled(page);
				const canvas = await paragraphPixels(page, await screenShot(page), NEEDLE);
				expect(canvas.inked, `zoom ${zoom}: inked device px`).toBeGreaterThan(1000);
				expect(canvas.same / canvas.inked, `zoom ${zoom} ${mode}: the screen shows the rows unresampled`).toBeGreaterThan(0.98);
				await showDomReference(page, NEEDLE, PARAGRAPH);
				const dom = await paragraphPixels(page, await screenShot(page), NEEDLE);
				await removeDomReference(page);
				expect(canvas.sharpness.gx / dom.sharpness.gx, `zoom ${zoom} ${mode}: vertical stems against the DOM's`).toBeGreaterThan(0.95);
				expect(canvas.sharpness.gy / dom.sharpness.gy, `zoom ${zoom} ${mode}: baselines against the DOM's`).toBeGreaterThan(0.95);
			}
			await setMode(page, 'light');
			await setAppZoom(page, 1);
			expect(await probeErrors(page)).toEqual([]);
		});

		test('a new device scale under an open document redraws every row at it', async () => {
			const { page } = texpile();
			const cdp = await page.context().newCDPSession(page);
			for (const deviceScaleFactor of [scale * 1.25, scale * 1.75]) {
				await cdp.send('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor, mobile: false });
				await page.waitForTimeout(300);
				await settled(page);
				const rows = await inCanvas(page, () =>
					[...document.querySelectorAll<HTMLCanvasElement>('[data-canvas-content]')].map((canvas) => {
						const rect = canvas.getBoundingClientRect();
						return {
							pixels: canvas.width / rect.width / devicePixelRatio,
							left: rect.left * devicePixelRatio,
							top: rect.top * devicePixelRatio
						};
					})
				);
				expect(rows.length).toBeGreaterThan(0);
				for (const row of rows) {
					expect(row.pixels, `${deviceScaleFactor}: backing px per device px`).toBeCloseTo(1, 2);
					expect(Math.abs(row.left - Math.round(row.left)), `${deviceScaleFactor}: a row on a whole device px`).toBeLessThan(0.05);
					expect(Math.abs(row.top - Math.round(row.top)), `${deviceScaleFactor}: a row on a whole device px`).toBeLessThan(0.05);
				}
			}
			await cdp.send('Emulation.clearDeviceMetricsOverride');
			await cdp.detach();
		});
	});
