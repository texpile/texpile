import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const TEX = `\\documentclass{article}
\\usepackage{amsthm}
\\newtheorem{theorem}{Theorem}
\\begin{document}

Alpha paragraph.

\\begin{theorem}
Theorem body text.
\\end{theorem}

Gamma paragraph.

\\begin{itemize}
\\item Apple
\\item Banana
\\end{itemize}

Delta paragraph.

\\end{document}
`;

const CENTERED = `\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\nBefore.\n\n\\begin{center}\n\\begin{tikzpicture}\n  \\node[draw] (a) at (0,0) {A};\n\\end{tikzpicture}\n\\end{center}\n\nAfter.\n\n\\begin{equation}\nE = mc^2\n\\end{equation}\n\n\\end{document}\n`;

const BARE_TABLE = `\\documentclass{article}\n\\begin{document}\n\nBefore.\n\n\\begin{center}\n\\begin{tabular}{|l|r|}\n\\hline\nName & Value \\\\\n\\hline\n\\end{tabular}\n\\end{center}\n\nAfter.\n\n\\end{document}\n`;

const FLOAT = `\\documentclass{article}\n\\begin{document}\n\nBefore.\n\n\\begin{table}[h]\n\\centering\n\\caption{Results}\n\\begin{tabular}{ll}\na & b \\\\\n\\end{tabular}\n\\end{table}\n\nAfter.\n\n\\end{document}\n`;

const texpile = useTexpile({
	files: { 'unit.tex': TEX, 'centered.tex': CENTERED, 'bare.tex': BARE_TABLE, 'held.tex': BARE_TABLE, 'float.tex': FLOAT }
});

type Box = { left: number; right: number; top: number; bottom: number };

async function wordBox(v: VisualEditor, word: string): Promise<Box> {
	return v.evalView<Box>(
		`let f = null; view.state.doc.descendants((n, p) => { if (f === null && n.isText) { const i = n.text.indexOf(arg); if (i >= 0) f = p + i; } });
		 view.domAtPos(f).node.parentElement?.scrollIntoView({ block: 'center' });
		 const c = view.coordsAtPos(f, 1); return { left: c.left, right: c.right, top: c.top, bottom: c.bottom };`,
		word
	);
}

// the rect of the unit (top-level block or list item) holding the word
async function unitBox(v: VisualEditor, word: string): Promise<Box> {
	return v.evalView<Box>(
		`let f = null; view.state.doc.descendants((n, p) => { if (f === null && n.isText && n.text.includes(arg)) f = p; });
		 const $p = view.state.doc.resolve(f); let d = 1;
		 for (let i = $p.depth; i > 0; i--) if ($p.node(i).type.name === 'list') { d = i; break; }
		 const r = view.nodeDOM($p.before(d)).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };`,
		word
	);
}

async function dragHandle(v: VisualEditor, from: string, to: { word: string; half: 'upper' | 'lower' }) {
	const { page } = v;
	await wordBox(v, from);
	await page.waitForTimeout(300);
	const a = await wordBox(v, from);
	await page.mouse.move(a.left + 5, (a.top + a.bottom) / 2, { steps: 4 });
	await page.mouse.move(a.left + 9, (a.top + a.bottom) / 2, { steps: 2 });
	const grip = page.locator('.block-handle-btn.cursor-grab');
	await expect(grip).toBeVisible();
	await page.waitForTimeout(200);
	const g = (await grip.boundingBox())!;
	await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2, { steps: 4 });
	await page.mouse.down();
	await page.mouse.move(g.x + g.width / 2 + 20, g.y + g.height / 2 + 8, { steps: 3 });
	const t = await unitBox(v, to.word);
	const y = to.half === 'upper' ? t.top + 3 : t.bottom - 3;
	await page.mouse.move((t.left + t.right) / 2, y, { steps: 15 });
	await page.waitForTimeout(150);
	await page.mouse.up();
	await page.waitForTimeout(2500);
}

const count = (text: string, needle: string) => text.split(needle).length - 1;

async function undoRestores(v: VisualEditor, disk: Disk, rel: string, original: string) {
	await v.page.keyboard.press('ControlOrMeta+z');
	await v.page.waitForTimeout(2500);
	expect(disk.read(rel)).toBe(original);
}

test('the handle over a theorem moves the whole theorem', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('unit.tex');
	await dragHandle(v, 'Theorem body', { word: 'Delta', half: 'lower' });
	const saved = disk.read('unit.tex');
	expect(count(saved, '\\begin{theorem}')).toBe(1);
	expect(count(saved, '\\end{theorem}')).toBe(1);
	expect(saved.indexOf('Delta paragraph')).toBeLessThan(saved.indexOf('\\begin{theorem}'));
	await undoRestores(v, disk, 'unit.tex', TEX);
});

test("the handle's gear sets a centered figure's alignment and opens an equation's settings", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('centered.tex');
	const gear = page.locator('.block-handle-settings');

	const card = page.locator('.figure-card').first();
	await card.scrollIntoViewIfNeeded();
	const c = (await card.boundingBox())!;
	await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 4 });
	await gear.click();
	const panel = page.locator('.drawn-chip-panel');
	await expect(panel.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
	await panel.getByRole('radio', { name: 'Right' }).click();
	await expect.poll(() => disk.read('centered.tex')).toContain('\\begin{flushright}\n\\begin{tikzpicture}');
	await page.keyboard.press('Escape');
	await page.locator('.ProseMirror p', { hasText: 'After.' }).click();

	const equation = page.locator('.ProseMirror > .block-math-container');
	const e = (await equation.boundingBox())!;
	await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2, { steps: 4 });
	// the equation's own gear is the handle's now
	await expect(equation.locator('.math-settings-btn')).toBeHidden();
	await gear.click();
	const settings = page.locator('[data-scope="popover"][data-part="content"][data-state="open"]');
	await expect(settings).toBeVisible();
	const [g, s2] = [(await gear.boundingBox())!, (await settings.boundingBox())!];
	expect(Math.abs(s2.x + s2.width - (g.x + g.width)), "the settings hang from the gear's right edge").toBeLessThan(4);
});

test('the handle waits for the pointer in the margin beside a tall block', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('centered.tex');
	const card = page.locator('.figure-card').first();
	await card.scrollIntoViewIfNeeded();
	const block = (await page.locator('.ProseMirror > .tex-environment').first().boundingBox())!;
	const middle = block.y + block.height / 2;
	await page.mouse.move(block.x + block.width / 2, middle, { steps: 4 });
	const remove = page.locator('.block-handle-btn-danger');
	await expect(remove).toBeVisible();
	// sideways into the margin, level with the block's middle and well under the button, then up to it
	await page.mouse.move(block.x + block.width + 19, middle, { steps: 8 });
	await page.waitForTimeout(400);
	await expect(remove).toBeVisible();
	await page.mouse.move(block.x + block.width + 19, block.y + 11, { steps: 8 });
	await page.waitForTimeout(200);
	const button = (await remove.boundingBox())!;
	expect(Math.abs(button.y - block.y)).toBeLessThan(3);
});

test("a table in center gets a caption and a number from the handle's gear", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('bare.tex');
	const table = (await page.locator('.ProseMirror > .tex-environment').first().boundingBox())!;
	await page.mouse.move(table.x + table.width / 2, table.y + table.height / 2, { steps: 4 });
	await page.locator('.block-handle-settings').click();
	const settings = page.locator('.bare-table-settings');
	await expect(settings.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
	await settings.getByText('Caption and number').click();
	await expect(page.locator('.ProseMirror > .table-wrapper')).toHaveCount(1);
	await expect.poll(() => disk.read('bare.tex')).toContain('\\begin{table}');
	const saved = disk.read('bare.tex');
	expect(saved).not.toContain('\\begin{center}');
	expect(saved).toContain('\\begin{tabular}{|l|r|}');
	// and back: the float's own settings take the caption and the number away
	const float = (await page.locator('.ProseMirror > .table-wrapper').boundingBox())!;
	await page.mouse.move(5, 5);
	await page.mouse.move(float.x + float.width / 2, float.y + 12, { steps: 4 });
	await page.locator('.block-handle-settings').click();
	await page.locator('[data-part="label"]:visible', { hasText: 'Caption and number' }).click();
	await expect(page.locator('.ProseMirror > .table-wrapper')).toHaveCount(0);
	await disk.expectFile(
		'bare.tex',
		(text) => text.includes('\\begin{center}') && !text.includes('\\begin{table}'),
		'the table is in center again'
	);
	expect(disk.read('bare.tex')).not.toContain('\\caption');
});

// the switch only showed notes a float already had, and one read from a file had none
test('Show notes section gives a float read from a file its notes', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('float.tex');
	const float = (await page.locator('.ProseMirror > .table-wrapper').boundingBox())!;
	await page.mouse.move(float.x + float.width / 2, float.y + 12, { steps: 4 });
	await page.locator('.block-handle-settings').click();
	await page.locator('[data-part="label"]:visible', { hasText: 'Show notes section' }).click();
	await page.keyboard.press('Escape');
	const notes = page.locator('.ProseMirror .table-notes');
	await expect(notes).toBeVisible();
	await notes.click();
	await page.keyboard.type('Source: survey.');
	await disk.expectFile('float.tex', (text) => text.includes('{\\small Source: survey.}'), 'the notes are in the file');
	// off takes the section away: hidden notes were written without their wrapper once the switch went back
	const again = (await page.locator('.ProseMirror > .table-wrapper').boundingBox())!;
	await page.mouse.move(5, 5);
	await page.mouse.move(again.x + again.width / 2, again.y + 12, { steps: 4 });
	await page.locator('.block-handle-settings').click();
	await page.locator('[data-part="label"]:visible', { hasText: 'Show notes section' }).click();
	await disk.expectFile('float.tex', (text) => text === FLOAT, 'the file is as it was read');
});

test('right-clicking a table offers its settings, which open with the alignment of the block it stands alone in', async () => {
	test.skip(process.platform === 'darwin', 'the editor context menu is native on macOS');
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('held.tex');
	const cell = (await page.locator('.ProseMirror > .tex-environment td').first().boundingBox())!;
	await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height / 2, { button: 'right' });
	await page.getByRole('menuitem', { name: 'Table settings', exact: true }).click();
	const settings = page.locator('.bare-table-settings');
	await expect(settings.getByRole('radiogroup', { name: 'Alignment' }).getByRole('radio', { name: 'Center' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await page.keyboard.press('Escape');
});
