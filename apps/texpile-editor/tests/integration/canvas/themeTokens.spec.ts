import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, settled } from './canvasPage';

const texpile = useTexpile({ files: { 'tokens.tex': '\\documentclass{article}\n\\begin{document}\n\nText.\n\n\\end{document}\n' } });

// a preset's stylesheet loads after its data-theme flip: the canvas painted Times New Roman until a mode toggle
test('a theme preset repaints the canvas with its font once its stylesheet loads', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('tokens.tex');
	await settled(visual.page);
	const fontOf = (): Promise<string> =>
		inCanvas(visual.page, async ({ probe }) => {
			await probe.settle();
			return probe.drawList(probe.posOf('Text.') - 1).find((op) => op.op === 'fillText')?.font ?? '';
		});
	await visual.page.evaluate(async () => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		theme.setThemeName('modern');
	});
	await expect.poll(() => visual.page.evaluate(() => !!document.querySelector<HTMLLinkElement>('#texpile-theme')?.sheet)).toBe(true);
	await expect.poll(fontOf).not.toMatch(/Times/);
	await visual.page.evaluate(async () => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		theme.setThemeName('theme');
	});
});
