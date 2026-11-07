import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const doc = (body: string) => `\\documentclass{article}\n\\usepackage{natbib}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'panel.tex': doc('Last paragraph of the text.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}'),
		'popover.tex': doc('Alpha words \\cite{knuth84} and \\label{sec:a} beta.'),
		'math.tex': doc('Before the formula.\n\n\\[ x+y \\]\n\nAfter the formula.'),
		'paste.tex': doc('Some text \\textbf{\\emph{nested}} words and \\url{http://x.org} end.')
	}
});
const visual = () => new VisualEditor(texpile().page, texpile().root);
const disk = () => new Disk(texpile().root);

/** the screen box of the node at `pos` */
async function boxOf(v: VisualEditor, pos: number): Promise<{ left: number; right: number; top: number; bottom: number }> {
	return v.evalView(
		`const r = view.nodeDOM(arg).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };`,
		pos
	);
}

async function nodePos(v: VisualEditor, type: string): Promise<number> {
	return v.evalView<number>(
		`let at = -1; view.state.doc.descendants((n, p) => { if (at < 0 && n.type.name === arg) at = p; }); return at;`,
		type
	);
}

test('a key pressed after a click on a chip adds to the argument in its panel, never replaces it', async () => {
	const v = visual();
	await v.open('panel.tex');
	const at = await v.evalView<number>(`let r = -1; view.state.doc.forEach((n, o, i) => { if (i === 1) r = o; }); return r;`);
	const r = await v.evalView<{ x: number; y: number }>(
		`const c = view.coordsAtPos(arg + 1, 1); return { x: c.left + 1, y: (c.top + c.bottom) / 2 };`,
		at
	);
	await v.page.mouse.click(r.x, r.y);
	await v.page.waitForTimeout(400);
	await v.page.keyboard.press('Backspace');
	await disk().expectFile('panel.tex', (t) => t.includes('\\bibliographystyle{plainna}'), 'one letter of the argument goes');
});

test("Escape on a citation chip's popover gives the typing back to the text", async () => {
	const v = visual();
	await v.open('popover.tex');
	await v.caretAfter('Alpha');
	const r = await boxOf(v, await nodePos(v, 'citation'));
	await v.page.mouse.click(r.right - 3, (r.top + r.bottom) / 2);
	await v.page.waitForTimeout(400);
	await v.page.keyboard.press('Escape');
	await v.page.waitForTimeout(200);
	await v.type('ZQ');
	await expect.poll(() => v.text()).toContain('ZQ');
	const text = await v.text();
	expect(text.indexOf('ZQ'), 'typed where the caret was, not at the top').toBeGreaterThan(text.indexOf('Alpha'));
	expect(await nodePos(v, 'citation'), `the citation chip is still there`).toBeGreaterThan(0);
	await v.press('Backspace');
	await v.press('Backspace');
});

test("Find in Files opened over a citation chip's popover keeps the typing", async () => {
	const v = visual();
	await v.open('popover.tex');
	const original = disk().read('popover.tex');
	await v.caretAfter('Alpha');
	const r = await boxOf(v, await nodePos(v, 'citation'));
	await v.page.mouse.click(r.right - 3, (r.top + r.bottom) / 2);
	await v.page.waitForTimeout(400);
	await v.page.keyboard.press('ControlOrMeta+Shift+f');
	await v.page.waitForTimeout(400);
	await v.page.keyboard.type('ZQ');
	await v.page.waitForTimeout(400);
	expect(await v.text(), 'the letters went to the search box').not.toContain('ZQ');
	expect(disk().read('popover.tex')).toBe(original);
});

test('Ctrl+Z in a display formula undoes in the file, back to the bytes it had', async () => {
	const v = visual();
	await v.open('math.tex');
	const original = disk().read('math.tex');
	const r = await boxOf(v, await nodePos(v, 'block_math'));
	await v.page.mouse.click(r.right - 4, (r.top + r.bottom) / 2);
	await v.page.waitForTimeout(400);
	await v.type('z');
	await disk().expectFile('math.tex', (t) => t !== original, 'the typed letter is saved');
	await v.page.keyboard.press('ControlOrMeta+z');
	await disk().expectFile('math.tex', (t) => t === original, 'one undo brings the original back');
});
