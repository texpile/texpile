// Louis, 2026-11-18: canvas text "a bit blur" beside the DOM's. Chromium composites a row at its paint offset rounded and
// its translate as given; the translate held the pane's fractional offset, so the rows were resampled at most zooms
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, settled } from '../canvasPage';

for (const scale of [1, 1.5])
	test.describe(`at display scale ${scale}`, () => {
		const texpile = useTexpile({
			scale,
			files: { 'sharp.tex': `\\documentclass{article}\n\\begin{document}\n\nA paragraph.\n\nA second paragraph.\n\n\\end{document}\n` }
		});

		test('a new device scale under an open document redraws every row at it', async () => {
			const { page, root } = texpile();
			await new VisualEditor(page, root).open('sharp.tex');
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
