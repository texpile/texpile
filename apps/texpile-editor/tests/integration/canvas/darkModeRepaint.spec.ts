// a dark mode toggle is a paint epoch (4.6): the canvas repaints in the new colors and lays out no block again
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { inCanvas, probeErrors, settled } from './canvasPage';

const texpile = useTexpile({
	files: {
		'mode.tex': [
			'\\documentclass{article}',
			'\\begin{document}',
			'',
			'\\section{Colors}',
			'',
			'A paragraph whose words take the color of the mode the window is in.',
			'',
			'\\end{document}',
			''
		].join('\n')
	}
});

function textColor(visual: VisualEditor): Promise<string | undefined> {
	return inCanvas(visual.page, ({ probe, view }) => {
		let block = -1;
		view.state.doc.forEach((node, pos) => {
			if (node.textContent.startsWith('A paragraph whose')) block = pos;
		});
		return probe.drawList(block).find((op) => op.op === 'fillText')?.color;
	});
}

function setMode(visual: VisualEditor, mode: 'light' | 'dark'): Promise<void> {
	return visual.page.evaluate(async (mode) => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		theme.setTheme(mode);
	}, mode);
}

test('a dark mode toggle repaints the text without laying a block out again', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await setMode(visual, 'light');
	await visual.open('mode.tex');
	await settled(visual.page);
	const light = await textColor(visual);
	expect(light, 'the paragraph drew its text').toBeTruthy();
	for (const mode of ['dark', 'light'] as const) {
		const before = await inCanvas(visual.page, ({ probe }) => probe.frameStats().frames);
		await setMode(visual, mode);
		await expect.poll(() => inCanvas(visual.page, ({ probe }) => probe.frameStats().frames)).toBeGreaterThan(before);
		await settled(visual.page);
		expect(await inCanvas(visual.page, ({ probe }) => probe.frameStats().blocksLaidOut), `blocks laid out going ${mode}`).toBe(0);
		const color = await textColor(visual);
		if (mode === 'dark') expect(color, 'the text color in dark mode').not.toBe(light);
		else expect(color, 'the text color back in light mode').toBe(light);
	}
	expect(await probeErrors(visual.page)).toEqual([]);
});
