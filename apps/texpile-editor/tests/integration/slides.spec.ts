import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

const DECK = [
	'\\documentclass{beamer}',
	'\\begin{document}',
	'\\begin{frame}{First}',
	'Opening words.',
	'\\begin{columns}',
	'\\begin{column}{0.5\\textwidth}',
	'Left side.',
	'\\end{column}',
	'\\begin{column}{0.5\\textwidth}',
	'Right side.',
	'\\end{column}',
	'\\end{columns}',
	'\\end{frame}',
	'\\end{document}',
	''
].join('\n');

const EMPTY_TITLES =
	'\\documentclass{beamer}\n\\begin{document}\n\\begin{frame}{}\n\\begin{block}{}\nBody.\n\\end{block}\n\\end{frame}\n\\end{document}\n';

const texpile = useTexpile({ files: { 'deck.tex': DECK, 'empty.tex': EMPTY_TITLES } });

test('a frame is a 16:9 slide with its number, and its column width chip rewrites the width', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	const { page } = visual;
	await visual.open('deck.tex');
	await settled(page);
	const frame = await inCanvas(page, ({ probe }) => {
		const found = probe.query('.beamer-frame')[0];
		return { width: found.rect.width, height: found.rect.height, painted: probe.paintedLines().lines.map((line) => line.text) };
	});
	expect(frame.width / frame.height, 'the frame keeps the slide shape').toBeCloseTo(16 / 9, 1);
	expect(frame.painted, 'the slide number shows in the corner').toContain('1');

	const column = await inCanvas(page, ({ probe }) => {
		const rect = probe.query('.beamer-column')[0].rect;
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	});
	await page.mouse.move(column.x, column.y);
	const chip = page.locator('.beamer-column-chip').first();
	await expect(chip).toHaveText('0.5\\textwidth');
	await chip.click();
	const source = page.locator('.drawn-chip-panel .cm-content');
	await expect(source).toBeFocused();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.insertText('0.4\\textwidth');
	await page.keyboard.press('Escape');
	await expect(page.locator('.drawn-chip-panel')).toHaveCount(0);
	await expect
		.poll(() => fs.readFileSync(path.join(texpile().root, 'deck.tex'), 'utf8'))
		.toContain('\\begin{column}{0.4\\textwidth}\nLeft side.');
});

test('an empty frame title and block title show their hints with the caret at the line start', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('empty.tex');
	await settled(visual.page);
	const drawn = await inCanvas(visual.page, ({ view, probe }) => {
		const title = probe.query('.slide-title')[0].rect;
		const caret = view.coordsAtPos(view.state.selection.head);
		return { painted: probe.paintedLines().lines.map((line) => line.text), titleLeft: title.left, caretLeft: caret.left };
	});
	expect(drawn.painted).toEqual(expect.arrayContaining(['Frame title', 'Block title']));
	expect(drawn.caretLeft).toBeCloseTo(drawn.titleLeft, 0);
});
