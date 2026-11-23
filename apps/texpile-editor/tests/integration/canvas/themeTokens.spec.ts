// a theme switch is a paint epoch and a length token a layout epoch (S1.3); the probe reads every token of the list
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, settled } from './canvasPage';

const texpile = useTexpile({ files: { 'tokens.tex': '\\documentclass{article}\n\\begin{document}\n\nText.\n\n\\end{document}\n' } });

test('theme tokens are read in a batch and bump the right epoch', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('tokens.tex');
	await settled(visual.page);
	const result = await inCanvas(visual.page, async ({ view }) => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		const list = await import(/* @vite-ignore */ '/src/lib/editor/canvas/style/theme/tokenList.ts' as string);
		const { ThemeTokens } = await import(/* @vite-ignore */ '/src/lib/editor/canvas/style/theme/themeTokens.ts' as string);
		const { StyleEpoch } = await import(/* @vite-ignore */ '/src/lib/editor/canvas/style/theme/styleEpoch.ts' as string);
		const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));
		theme.setTheme('light');
		await tick();
		const tokens = new ThemeTokens(view.dom);
		const epoch = new StyleEpoch(document, tokens);
		const light = tokens.color('--color-surface-950-50');
		const spacing = tokens.length('--spacing');
		const lengthsRead = list.LENGTH_TOKENS.every((name: string) => Number.isFinite(tokens.length(name)));
		const fontsRead = list.FONT_TOKENS.every((name: string) => tokens.font(name).length > 0);
		const declared = {
			muted: tokens.declaredText('--muted-text'),
			ink: tokens.declaredText('--primary-ink'),
			lineHeight: tokens.declaredText('--text-base--line-height'),
			size: tokens.declaredText('--text-base')
		};
		const start = { paint: epoch.paint, layout: epoch.layout };
		theme.setTheme('dark');
		await tick();
		const dark = tokens.color('--color-surface-950-50');
		const afterTheme = { paint: epoch.paint, layout: epoch.layout };
		document.documentElement.style.setProperty('--spacing', '9px');
		await tick();
		const widened = tokens.length('--spacing');
		const afterLength = { paint: epoch.paint, layout: epoch.layout };
		document.documentElement.style.removeProperty('--spacing');
		theme.setTheme('light');
		epoch.destroy();
		return { declared, light, dark, spacing, widened, lengthsRead, fontsRead, start, afterTheme, afterLength };
	});
	expect(result.lengthsRead && result.fontsRead).toBe(true);
	expect(result.declared.muted).toContain('currentColor');
	expect(result.declared.ink).toMatch(/^oklch\(/);
	expect(Number(result.declared.lineHeight)).toBeGreaterThan(1);
	expect(result.declared.size).toMatch(/px$/);
	expect(result.dark).not.toEqual(result.light);
	expect(result.afterTheme.paint).toBeGreaterThan(result.start.paint);
	expect(result.afterTheme.layout).toBe(result.start.layout);
	expect(result.widened).toBe(9);
	expect(result.afterLength.layout).toBeGreaterThan(result.afterTheme.layout);
});

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
