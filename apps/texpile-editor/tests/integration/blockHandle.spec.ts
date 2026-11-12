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

const CENTERED = `\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\nBefore.\n\n\\begin{center}\n\\begin{tikzpicture}\n  \\node[draw] (a) at (0,0) {A};\n\\end{tikzpicture}\n\\end{center}\n\nAfter.\n\n\\end{document}\n`;

const texpile = useTexpile({ files: { 'unit.tex': TEX, 'centered.tex': CENTERED } });

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

test('the settings gear of a centered figure sits clear of the handle', async () => {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open('centered.tex');
	const card = page.locator('.figure-card').first();
	await card.scrollIntoViewIfNeeded();
	const c = (await card.boundingBox())!;
	await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2, { steps: 4 });
	const gear = page.locator('.env-gear');
	await expect(gear).toHaveCSS('opacity', '1', { timeout: 5000 });
	const handle = page.locator('.block-handle-btn');
	await expect(handle.first()).toBeVisible();
	const gearBox = (await gear.boundingBox())!;
	for (const button of await handle.all()) {
		const b = (await button.boundingBox())!;
		const apart =
			b.x + b.width <= gearBox.x || gearBox.x + gearBox.width <= b.x || b.y + b.height <= gearBox.y || gearBox.y + gearBox.height <= b.y;
		expect(apart, 'a handle button and the gear share no pixels').toBe(true);
	}
});
