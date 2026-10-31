import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

// figures are drawn by the lualatex on PATH, else the spec is skipped
function hasLualatex(): boolean {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', ['lualatex'], { encoding: 'utf8' });
		return true;
	} catch {
		return false;
	}
}

const PICTURE =
	'\\begin{tikzpicture}\n  \\node[draw] (a) at (0,0) {A};\n  \\node[draw] (b) at (3,0) {B};\n  \\draw[->] (a) -- (b);\n\\end{tikzpicture}';
const doc = (body: string) =>
	`\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\nBefore.\n\n${body}\n\nAfter.\n\n\\end{document}\n`;
const FIG = doc(PICTURE);

test.skip(!hasLualatex(), 'needs lualatex on PATH');

const texpile = useTexpile({ files: { 'fig.tex': FIG } });

async function openFigure(visual: VisualEditor): Promise<void> {
	const card = visual.page.locator('.figure-card').first();
	await card.scrollIntoViewIfNeeded();
	await card.hover();
	await visual.page.getByRole('button', { name: 'Edit figure' }).first().click();
	await expect(visual.page.getByText('Figure 1 - fig.tex')).toBeVisible();
	await expect(visual.page.getByRole('treeitem', { name: /B/ })).toBeVisible({ timeout: 120_000 });
	await expect(visual.page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 120_000 });
}

test('a figure tab edits the picture in the file, and undo takes the edit back', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('fig.tex');
	await openFigure(visual);
	await page.getByRole('treeitem', { name: /B/ }).click();
	const x = page.getByRole('textbox', { name: 'x', exact: true });
	await x.fill('4');
	await x.press('Enter');
	await disk.expectFile('fig.tex', (t) => t.includes('at (4,0) {B}'), 'the moved node on disk');
	expect(disk.read('fig.tex').replace('at (4,0) {B}', 'at (3,0) {B}')).toBe(FIG);
	await page.getByRole('button', { name: 'Undo' }).last().click();
	await disk.expectFile('fig.tex', (t) => t === FIG, 'the file after undo');
});

test('the card shows the drawing the figure tab made, kept in .texpile/figures', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('fig.tex');
	await openFigure(visual);
	await page.getByRole('tab', { name: /^fig\.tex/ }).click();
	await expect(page.locator('.figure-card svg').first()).toBeAttached({ timeout: 60_000 });
	const kept = path.join(root, '.texpile', 'figures');
	await expect.poll(() => (fs.existsSync(kept) ? fs.readdirSync(kept).filter((f) => f.endsWith('.svg')).length : 0)).toBeGreaterThan(0);
});

test('a figure whose picture is deleted from the file says so', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('fig.tex');
	await openFigure(visual);
	disk.write('fig.tex', doc('No picture now.'));
	const deleted = page.getByText('This figure was deleted.');
	await expect(deleted).toBeVisible({ timeout: 30_000 });
	await deleted.locator('..').getByRole('button', { name: 'Close' }).click();
	await expect(deleted).toHaveCount(0);
	disk.write('fig.tex', FIG);
});
