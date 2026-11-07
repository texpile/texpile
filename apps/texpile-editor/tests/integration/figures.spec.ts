import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
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

const texpile = useTexpile({
	files: {
		'fig.tex': FIG
	}
});

async function openFigure(visual: VisualEditor, file = 'fig.tex', item = /B/): Promise<void> {
	const card = visual.page.locator('.figure-card').first();
	await card.scrollIntoViewIfNeeded();
	await card.hover();
	await visual.page.getByRole('button', { name: 'Edit figure' }).first().click();
	await expect(visual.page.getByText(`Figure 1 - ${file}`)).toBeVisible();
	await expect(visual.page.getByRole('treeitem', { name: item })).toBeVisible({ timeout: 120_000 });
	await expect(visual.page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 120_000 });
}

// the panels sit tucked behind their tabs at the stage's edge until the pointer comes close
async function revealPanels(visual: VisualEditor): Promise<void> {
	const box = (await visual.page.locator('[data-figure-panel-tabs]').boundingBox())!;
	await visual.page.mouse.move(box.x + box.width - 2, box.y + 20);
}

test('a figure tab edits the picture in the file, and undo takes the edit back', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('fig.tex');
	await openFigure(visual);
	await revealPanels(visual);
	await page.getByRole('treeitem', { name: /B/ }).click();
	const x = page.getByRole('textbox', { name: 'x', exact: true });
	await x.fill('4');
	await x.press('Enter');
	await disk.expectFile('fig.tex', (t) => t.includes('at (4,0) {B}'), 'the moved node on disk');
	expect(disk.read('fig.tex').replace('at (4,0) {B}', 'at (3,0) {B}')).toBe(FIG);
	await page.getByRole('button', { name: 'Undo' }).last().click();
	await disk.expectFile('fig.tex', (t) => t === FIG, 'the file after undo');
});

test('a narrow pane keeps the tools on one row and docks the panels at the foot', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('fig.tex');
	await openFigure(visual);
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'Two side by side' }).click();
	const toolbar = page.getByRole('toolbar', { name: 'Tools' }).last();
	await expect(toolbar.getByRole('button', { name: 'Pen' })).toHaveCount(0);
	await toolbar.getByRole('button', { name: 'More tools' }).click();
	await expect(page.getByRole('menuitem', { name: /Pen/ })).toBeVisible();
	await page.getByRole('menuitem', { name: /Pen/ }).click();
	await expect(toolbar.getByRole('button', { name: 'More tools' })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByRole('treeitem', { name: /B/ })).toHaveCount(0);
	await page.getByRole('button', { name: 'Objects' }).last().click();
	await page.getByRole('treeitem', { name: /B/ }).last().click();
	await expect(page.getByRole('button', { name: 'Show code' }).last()).toBeVisible();
	await page.getByRole('button', { name: 'Layout' }).click();
	await page.getByRole('menuitemradio', { name: 'One editor' }).click();
	// the layout menu hands the keyboard to the figure, which has no text to take it
	const canvas = page.getByRole('application', { name: 'Figure canvas' });
	await canvas.focus();
	await page.keyboard.press('4');
	await expect(page.getByRole('button', { name: 'Ellipse', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await page.keyboard.press('Escape');
	await page
		.getByRole('tab', { name: /^Figure 1 - fig\.tex/ })
		.getByRole('button', { name: /close/i })
		.click();
	await visual.showVisual();
});
