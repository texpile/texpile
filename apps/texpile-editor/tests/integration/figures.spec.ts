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

// a main file the window does not open, and a fragment it inputs
const MAIN = '\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\input{part}\n\\end{document}\n';
const PART = '\\begin{tikzpicture}\n  \\node[draw] (f) at (0,0) {F};\n\\end{tikzpicture}\n';

const texpile = useTexpile({
	files: {
		'fig.tex': FIG,
		'empty.tex': doc('\\begin{tikzpicture}[scale=2]\n\\end{tikzpicture}'),
		'paper.tex': MAIN,
		'part.tex': PART,
		'.texpile/config.json': JSON.stringify({ v: 1, main: 'paper.tex' })
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

test('the panels tuck behind tabs with nothing selected, and come out near the pointer or on a selection', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('fig.tex');
	await openFigure(visual);
	const panels = page.locator('[data-figure-panels]');
	const right = async () => (await panels.boundingBox())!.x + (await panels.boundingBox())!.width;
	const stage = (await page.getByRole('application', { name: 'Figure canvas' }).boundingBox())!;
	await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
	await expect.poll(async () => Math.round((await right()) - stage.x)).toBeLessThanOrEqual(0);
	await expect(page.locator('[data-figure-panel-tabs]')).toContainText('Objects 3');
	await revealPanels(visual);
	await expect.poll(async () => (await right()) - stage.x).toBeGreaterThan(100);
	const row = page.getByRole('treeitem', { name: /B/ });
	await row.click();
	await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
	await expect(page.getByRole('textbox', { name: 'x', exact: true })).toBeVisible();
	await page.waitForTimeout(400);
	expect((await right()) - stage.x).toBeGreaterThan(100);
	await page.keyboard.press('Escape');
	await page.getByRole('application', { name: 'Figure canvas' }).focus();
});

test('the natural size sits at the right, and Set canvas size slides out when the pointer comes close', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('fig.tex');
	await openFigure(visual);
	const stage = (await page.getByRole('application', { name: 'Figure canvas' }).boundingBox())!;
	const set = page.getByRole('button', { name: 'Set canvas size' });
	const shownWidth = () => set.locator('..').evaluate((el) => el.getBoundingClientRect().width);
	await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
	await expect.poll(shownWidth).toBe(0);
	const pill = (await set.locator('../..').boundingBox())!;
	expect(pill.x + pill.width).toBeGreaterThan(stage.x + stage.width - 40);
	await page.mouse.move(pill.x + pill.width / 2, pill.y - 10);
	await expect.poll(shownWidth).toBeGreaterThan(50);
	await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
	await expect.poll(shownWidth).toBe(0);
});

test('Empty canvas on an empty picture gives it a sheet and keeps its options', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('empty.tex');
	const card = page.locator('.figure-card').first();
	await card.scrollIntoViewIfNeeded();
	await card.hover();
	await page.getByRole('button', { name: 'Edit figure' }).first().click();
	await page.getByRole('button', { name: 'Empty canvas' }).click({ timeout: 120_000 });
	await disk.expectFile('empty.tex', (t) => /\\begin\{tikzpicture\}\[scale=2\]\n.*rectangle \(15, ?10\)/.test(t), 'the sheet on disk');
	await expect(page.getByRole('button', { name: 'Empty canvas' })).toHaveCount(0);
});

test('with the caret in a picture, the source editor offers Edit figure, and the tab it opens says so', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('fig.tex');
	await visual.showSource();
	const chip = page.locator('.cm-figure-chip');
	await page.locator('.cm-line', { hasText: 'Before.' }).click();
	await expect(chip).toHaveCount(0);
	await page.locator('.cm-line', { hasText: '(a) at (0,0)' }).click();
	await expect(chip).toHaveText('Edit figure');
	await page.locator('.cm-line', { hasText: 'After.' }).click();
	await expect(chip).toHaveCount(0);
	await page.locator('.cm-line', { hasText: '(a) at (0,0)' }).click();
	await chip.click();
	await expect(page.getByText('Figure 1 - fig.tex')).toBeVisible();
	await page.getByRole('tab', { name: /^fig\.tex/ }).click();
	await chip.click();
	await expect(page.getByRole('tab', { name: /^Figure \d+ - fig\.tex/ })).toHaveCount(1);
	await page
		.getByRole('tab', { name: /^Figure 1 - fig\.tex/ })
		.getByRole('button', { name: /close/i })
		.click();
	await visual.showVisual();
});

test('the paper is hidden under a figure tab, for a transparent window to show the figure alone', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	await visual.open('fig.tex');
	await openFigure(visual);
	await expect(page.locator('.ProseMirror').first()).toBeHidden();
	await page.getByRole('tab', { name: /^fig\.tex/ }).click();
	await expect(page.locator('.ProseMirror').first()).toBeVisible();
});

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

test('an ellipse puts its library in the preamble, and one undo takes both back', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('fig.tex');
	await openFigure(visual);
	const canvas = page.getByRole('application', { name: 'Figure canvas' });
	const box = (await canvas.boundingBox())!;
	await canvas.focus();
	await page.keyboard.press('4');
	const [x, y] = [box.x + box.width / 2, box.y + box.height * 0.8];
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + 60, y + 40, { steps: 8 });
	await page.mouse.up();
	await disk.expectFile(
		'fig.tex',
		(t) => t.includes('\\usetikzlibrary{shapes.geometric}') && /\\node\[[^\]]*ellipse/.test(t),
		'the ellipse and its library on disk'
	);
	await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
	await expect(page.getByText(/TeX could not typeset/)).toHaveCount(0);
	await page.getByRole('button', { name: 'Undo' }).last().click();
	await disk.expectFile('fig.tex', (t) => t === FIG, 'the file after undo');
});

test('a fragment drawn in an outline that needs a library puts it in the main file and draws at once', async () => {
	const { page, root } = texpile();
	const visual = new VisualEditor(page, root);
	const disk = new Disk(root);
	await visual.open('part.tex');
	await openFigure(visual, 'part.tex', /F/);
	await revealPanels(visual);
	await page.getByRole('treeitem', { name: /F/ }).click();
	await page.getByRole('button', { name: 'Ellipse', exact: true }).last().click();
	await disk.expectFile('part.tex', (t) => t.includes('\\node[draw, ellipse]'), 'the fragment in an ellipse');
	await disk.expectFile('paper.tex', (t) => t.includes('\\usetikzlibrary{shapes.geometric}'), 'the library in the main file');
	await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 60_000 });
	await expect(page.getByText(/TeX could not typeset/)).toHaveCount(0);
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
