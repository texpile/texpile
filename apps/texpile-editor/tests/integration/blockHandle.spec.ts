import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

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

const LINES = `\\documentclass{article}\n\\begin{document}\n\n\\section{Heading}\n\nA line.\n\n\\begin{equation}\nE = mc^2\n\\end{equation}\n\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'unit.tex': TEX,
		'centered.tex': CENTERED,
		'bare.tex': BARE_TABLE,
		'held.tex': BARE_TABLE,
		'float.tex': FLOAT,
		'lines.tex': LINES
	}
});

type Box = { left: number; right: number; top: number; bottom: number };

const PANE_OFFSET = 150;

/** the nth top-level block of this type put under the pane's top, then where it shows */
async function blockBox(v: VisualEditor, type: string, nth = 0): Promise<Box> {
	await inCanvas(
		v.page,
		({ probe, view }, arg) => {
			let index = -1;
			let seen = 0;
			view.state.doc.forEach((n, _p, i) => {
				if (index < 0 && n.type.name === arg.type && seen++ === arg.nth) index = i;
			});
			probe.scrollToBlock(index, arg.offset);
		},
		{ type, nth, offset: PANE_OFFSET }
	);
	await settled(v.page);
	return inCanvas(
		v.page,
		({ probe, view }, arg) => {
			let at = -1;
			let seen = 0;
			view.state.doc.forEach((n, p) => {
				if (at < 0 && n.type.name === arg.type && seen++ === arg.nth) at = p;
			});
			const r = probe.rectOfNode(at)!;
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
		},
		{ type, nth }
	);
}

async function scrollToWord(v: VisualEditor, word: string): Promise<number> {
	const pos = await inCanvas(
		v.page,
		({ probe, view }, arg) => {
			const f = probe.posOf(arg.word);
			probe.scrollToBlock(view.state.doc.resolve(f).index(0), arg.offset);
			return f;
		},
		{ word, offset: PANE_OFFSET }
	);
	await settled(v.page);
	return pos;
}

async function wordBox(v: VisualEditor, word: string): Promise<Box> {
	const f = await scrollToWord(v, word);
	return inCanvas(
		v.page,
		({ view }, pos) => {
			const c = view.coordsAtPos(pos, 1);
			return { left: c.left, right: c.right, top: c.top, bottom: c.bottom };
		},
		f
	);
}

// the rect of the unit (top-level block or list item) holding the word
async function unitBox(v: VisualEditor, word: string): Promise<Box> {
	return inCanvas(
		v.page,
		({ probe, view }, arg) => {
			const f = probe.posOf(arg);
			const $p = view.state.doc.resolve(f);
			let d = 1;
			for (let i = $p.depth; i > 0; i--)
				if ($p.node(i).type.name === 'list') {
					d = i;
					break;
				}
			const r = probe.rectOfNode($p.before(d))!;
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
		},
		word
	);
}

/** how many top-level blocks of this type the document holds */
function countBlocks(v: VisualEditor, type: string): Promise<number> {
	return inCanvas(
		v.page,
		({ view }, arg) => {
			let n = 0;
			view.state.doc.forEach((child) => {
				if (child.type.name === arg) n++;
			});
			return n;
		},
		type
	);
}

async function clickWord(v: VisualEditor, word: string, options: { button?: 'right' } = {}) {
	const f = await scrollToWord(v, word);
	const at = await inCanvas(v.page, ({ probe }, pos) => probe.clientPointOf(pos + 1), f);
	await v.page.mouse.click(at.x, at.y, options);
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

test("the handle's gear sets a centered figure's alignment", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('centered.tex');
	const gear = page.locator('.block-handle-settings');
	const card = await blockBox(v, 'environment');
	await page.mouse.move((card.left + card.right) / 2, (card.top + card.bottom) / 2, { steps: 4 });
	await gear.click();
	const panel = page.locator('.drawn-chip-panel');
	await expect(panel.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
	await panel.getByRole('radio', { name: 'Right' }).click();
	await expect.poll(() => disk.read('centered.tex')).toContain('\\begin{flushright}\n\\begin{tikzpicture}');
	await page.keyboard.press('Escape');
});

test("the handle's gear opens an equation's settings", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('centered.tex');
	const gear = page.locator('.block-handle-settings');
	const e = await blockBox(v, 'block_math');
	await page.mouse.move((e.left + e.right) / 2, (e.top + e.bottom) / 2, { steps: 4 });
	// the equation's own gear is the handle's now
	await expect(page.locator('.math-settings-btn')).toBeHidden();
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
	const box = await blockBox(v, 'environment');
	const block = { x: box.left, y: box.top, width: box.right - box.left, height: box.bottom - box.top };
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
	expect(Math.abs(button.y - block.y), "still on the block's first line").toBeLessThan(8);
});

// it stood at the block's top edge, 15px over the middle of a heading's line
test('the handle stands level with a heading and with the middle of a formula', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('lines.tex');
	const plus = page.locator('.block-handle-btn').first();
	for (const type of ['heading', 'block_math']) {
		await expect
			.poll(async () => {
				const at = await blockBox(v, type);
				const middle = (at.top + at.bottom) / 2;
				await page.mouse.move(5, 5);
				await page.mouse.move((at.left + at.right) / 2, middle, { steps: 4 });
				const button = await plus.boundingBox();
				return button ? Math.abs(button.y + button.height / 2 - middle) : null;
			})
			.toBeLessThan(3);
	}
});

test("a table in center gets a caption and a number from the handle's gear", async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	const disk = new Disk(root);
	await v.open('bare.tex');
	const table = await blockBox(v, 'environment');
	await v.openBlockSettings((table.left + table.right) / 2, (table.top + table.bottom) / 2);
	const settings = page.locator('.bare-table-settings');
	await expect(settings.getByRole('radio', { name: 'Center' })).toHaveAttribute('aria-checked', 'true');
	await settings.getByText('Caption and number').click();
	await expect.poll(() => countBlocks(v, 'table_wrapper')).toBe(1);
	await expect.poll(() => disk.read('bare.tex')).toContain('\\begin{table}');
	const saved = disk.read('bare.tex');
	expect(saved).not.toContain('\\begin{center}');
	expect(saved).toContain('\\begin{tabular}{|l|r|}');
	// and back: the float's own settings take the caption and the number away
	const float = await blockBox(v, 'table_wrapper');
	await v.openBlockSettings((float.left + float.right) / 2, float.top + 12);
	await page.locator('[data-part="label"]:visible', { hasText: 'Caption and number' }).click();
	await expect.poll(() => countBlocks(v, 'table_wrapper')).toBe(0);
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
	const float = await blockBox(v, 'table_wrapper');
	await v.openBlockSettings((float.left + float.right) / 2, float.top + 12);
	await page.locator('[data-part="label"]:visible', { hasText: 'Show notes section' }).click();
	await page.keyboard.press('Escape');
	await expect.poll(() => inCanvas(page, ({ probe }) => probe.query('.table-notes').length)).toBeGreaterThan(0);
	const notes = await inCanvas(page, ({ probe }) => probe.query('.table-notes')[0].rect);
	await page.mouse.click(notes.x + notes.width / 2, notes.y + notes.height / 2);
	await page.keyboard.type('Source: survey.');
	await disk.expectFile('float.tex', (text) => text.includes('{\\small Source: survey.}'), 'the notes are in the file');
	// off takes the section away: hidden notes were written without their wrapper once the switch went back
	const again = await blockBox(v, 'table_wrapper');
	await v.openBlockSettings((again.left + again.right) / 2, again.top + 12);
	await page.locator('[data-part="label"]:visible', { hasText: 'Show notes section' }).click();
	await disk.expectFile('float.tex', (text) => text === FLOAT, 'the file is as it was read');
});

test('right-clicking a table offers its settings, which open with the alignment of the block it stands alone in', async () => {
	test.skip(process.platform === 'darwin', 'the editor context menu is native on macOS');
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('held.tex');
	await clickWord(v, 'Name', { button: 'right' });
	await page.getByRole('menuitem', { name: 'Table settings', exact: true }).click();
	const settings = page.locator('.bare-table-settings');
	await expect(settings.getByRole('radiogroup', { name: 'Alignment' }).getByRole('radio', { name: 'Center' })).toHaveAttribute(
		'aria-checked',
		'true'
	);
	await page.keyboard.press('Escape');
});
