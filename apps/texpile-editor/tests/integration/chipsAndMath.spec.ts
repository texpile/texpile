import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';
import { inCanvas, settled } from './canvas/canvasPage';

const doc = (body: string) => `\\documentclass{article}\n\\usepackage{natbib}\n\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const RESULTS = `\\section{Results}\\label{sec:results}

\\begin{figure}
	\\includegraphics[width=0.4\\textwidth]{figures/plot.png}
	\\caption{A plot.}\\label{fig:plot}
\\end{figure}

See Figure~\\ref{fig:plot} in Section~\\ref{sec:results} and \\eqref{eq:energy}, or \\autoref{fig:plot}.
`;

const texpile = useTexpile({
	files: {
		'chapters/results.tex': RESULTS,
		'panel.tex': doc('Last paragraph of the text.\n\n\\bibliographystyle{plainnat}\n\\bibliography{refs}'),
		'popover.tex': doc('Alpha words \\cite{knuth84} and \\label{sec:a} beta.'),
		'renamed.tex': doc('Alpha \\label{sec:old} and see \\ref{sec:old}.'),
		'headed.tex': doc('\\section{Intro}\\label{sec:x}\nBefore words.\n\nCite \\cite{knuth84} and more.'),
		'lonechip.tex': doc('\\subsection*{Details}\n\\label{app:details}\n\nAfter the label.'),
		'math.tex': doc('Before the formula.\n\n\\[ x+y \\]\n\nAfter the formula.'),
		'rawchip.tex': doc('Text with \\mysterymacro{eq:one} inside it.'),
		'paste.tex': doc('Some text \\textbf{\\emph{nested}} words and \\url{http://x.org} end.'),
		'figure.tex': `\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\n${Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ')}\n\n\\begin{tikzpicture}\n  \\node[draw] (a) at (0,0) {A};\n\\end{tikzpicture}\n\nAfter the figure.\n\n\\end{document}\n`,
		'color.tex': `\\documentclass{article}\n\\usepackage{xcolor}\n\\begin{document}\n\n\\textcolor{red}{We know that $(a+b)^2$ can be evaluated as $a^2+b^2+2ab$.}\n\n\\end{document}\n`
	}
});
const visual = () => new VisualEditor(texpile().page, texpile().root);
const disk = () => new Disk(texpile().root);

/** the screen box of the node at `pos`, as the canvas draws it */
async function boxOf(v: VisualEditor, pos: number): Promise<{ left: number; right: number; top: number; bottom: number }> {
	await settled(v.page);
	return inCanvas(
		v.page,
		({ probe }, at) => {
			const r = probe.rectOfNode(at)!;
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
		},
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

// the click landed in a zero width space inside the chip, which selected the chip, and the next key replaced it
test('a click after a chip that ends its paragraph puts the caret there, and typing keeps the chip', async () => {
	const v = visual();
	await v.open('lonechip.tex');
	const box = await boxOf(v, await nodePos(v, 'label'));
	await v.page.mouse.click(box.right + 80, (box.top + box.bottom) / 2);
	await v.page.waitForTimeout(300);
	await v.type('X');
	await disk().expectFile('lonechip.tex', (t) => t.includes('\\label{app:details}X'), 'the letter lands after the label');
});

test('a click on a label chip opens its name, and a rename there moves its references', async () => {
	const v = visual();
	await v.open('renamed.tex');
	const r = await boxOf(v, await nodePos(v, 'label'));
	await v.page.mouse.click((r.left + r.right) / 2, (r.top + r.bottom) / 2);
	await expect(v.page.locator('.drawn-chip-panel .cm-content')).toBeVisible();
	await v.page.keyboard.press('ControlOrMeta+a');
	await v.page.keyboard.type('\\label{sec:new}');
	await v.page.keyboard.press('Enter');
	await disk().expectFile(
		'renamed.tex',
		(t) => t.includes('Alpha \\label{sec:new} and see \\ref{sec:new}.'),
		'the label and its reference take the new name'
	);
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

test("closing a citation's panel opened by a click keeps the caret at the chip", async () => {
	const v = visual();
	await v.open('headed.tex');
	const r = await boxOf(v, await nodePos(v, 'citation'));
	await v.page.mouse.click((r.left + r.right) / 2, (r.top + r.bottom) / 2);
	await expect(v.page.locator('.citation-edit-form')).toBeVisible();
	await v.page.keyboard.press('Escape');
	await v.page.waitForTimeout(200);
	await v.type('Q');
	await disk().expectFile(
		'headed.tex',
		(t) => t.includes('\\cite{knuth84}Q and') && t.includes('\\section{Intro}'),
		'the letter lands after the chip'
	);
});

test("Find in Files opened over a citation chip's popover keeps the typing", async () => {
	test.skip(test.info().project.name.startsWith('canvas-web'), "Find in Files is the app window's");
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

// undo in a formula keeps the writer in it, the caret where MathLive's own snapshot of that text had it (A8)
test('Ctrl+Z in a display formula undoes in the file and stays in the formula', async () => {
	const v = visual();
	await v.open('math.tex');
	const original = disk().read('math.tex');
	const pos = await nodePos(v, 'block_math');
	const r = await boxOf(v, pos);
	await v.page.mouse.click(r.left + (r.right - r.left) / 2 + 12, (r.top + r.bottom) / 2);
	await expect.poll(() => v.evalView<number | null>('return view.canvas.nested()?.pos ?? null;')).toBe(pos);
	const snapshot = await v.evalView<number>('return view.canvas.nested().field.position;');
	await v.type('zw');
	await disk().expectFile('math.tex', (t) => t !== original, 'the typed letters are saved');
	await v.page.keyboard.press('ControlOrMeta+z');
	await disk().expectFile('math.tex', (t) => t === original, 'one undo brings the original back');
	expect(await v.evalView<number | null>('return view.canvas.nested()?.pos ?? null;'), 'the formula keeps the session').toBe(pos);
	expect(await v.evalView<number>('return view.canvas.nested().field.position;'), 'the caret where the snapshot had it').toBe(snapshot);
});

test('editing a formula in colored text keeps it in the color, as one \\textcolor', async () => {
	const v = visual();
	await v.open('color.tex');
	await v.caretAfter('We know that ');
	await v.press('ArrowRight');
	await v.page.waitForTimeout(400);
	await v.press('End');
	await v.type('+1');
	await disk().expectFile(
		'color.tex',
		(t) => t.includes('\\textcolor{red}{We know that $(a+b)^2+1$ can be evaluated as') && t.split('\\textcolor').length === 2,
		'the edited formula stays inside the one color run'
	);
});

test('arrows select a figure card from the paragraphs around it, and Backspace removes it', async () => {
	const v = visual();
	await v.open('figure.tex');
	const selected = () =>
		v.evalView<string>(
			`const s = view.state.selection; return s.node ? s.node.type.name : s.constructor.name + ':' + s.$head.parent.textContent.slice(0, 5);`
		);
	// the caret mid-line in a wrapped paragraph passes its lines first, then the card is selected
	await v.caretAfter('word3 ');
	await v.press('ArrowDown');
	expect(await selected(), 'one line down is still the paragraph').toBe('TextSelection:word0');
	for (let i = 0; i < 8 && (await selected()) !== 'raw_latex'; i++) await v.press('ArrowDown');
	expect(await selected()).toBe('raw_latex');
	await v.press('ArrowDown');
	expect(await selected()).toBe('TextSelection:After');
	await v.press('ArrowUp');
	expect(await selected()).toBe('raw_latex');
	await v.press('ArrowUp');
	expect(await selected()).toMatch(/^TextSelection:word/);
	await v.press('ArrowDown');
	expect(await selected()).toBe('raw_latex');
	await v.press('Backspace');
	expect(await v.blockTypes()).toEqual(['paragraph', 'paragraph']);
});

test('a reference shows the number drawn on what it names, with no compile', async () => {
	test.skip(test.info().project.name !== 'app', 'the harness page counts no labels: its numbering loads from a blob it cannot fetch');
	const v = visual();
	await v.open('chapters/results.tex');
	// the section and the figure are counted here, the equation in the main file that reads this one in
	// the drawn text of the last paragraph, chips' labels included, read without its spaces
	const lastLine = () =>
		inCanvas(v.page, ({ probe, view }) => {
			const last = view.state.doc.content.size - view.state.doc.lastChild!.nodeSize;
			return probe
				.drawList(last)
				.filter((op) => op.op === 'fillText')
				.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
				.map((op) => op.text)
				.join('')
				.replace(/\s+/g, '');
		});
	await expect.poll(lastLine, { timeout: 20_000 }).toBe('SeeFigure1inSection2and(1),orFigure1.');
});

// the DOM editor outlined raw LaTeX while the caret was in it (:focus-within), so its bounds show while it is edited
test('raw LaTeX shows its bounds while the caret is in it, and none at rest', async () => {
	const v = visual();
	await v.open('rawchip.tex');
	await settled(v.page);
	const outlines = (inside: boolean) =>
		inCanvas(
			v.page,
			async ({ probe, view }, into) => {
				let chip = -1;
				view.state.doc.descendants((node, pos) => {
					if (node.type.name === 'inline_latex') chip = pos;
				});
				const at = into ? chip + 3 : probe.posOf('inside it');
				// the page's own TextSelection: the editor opens with one
				const TextSelection = view.state.selection.constructor as unknown as { create(doc: unknown, pos: number): never };
				view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)));
				await probe.settle();
				return probe.drawList(view.state.doc.resolve(chip).before(1)).filter((op) => /0\.45\)/.test((op as { color?: string }).color ?? ''))
					.length;
			},
			inside
		);
	expect(await outlines(true), 'an outline with the caret in the chip').toBeGreaterThan(0);
	expect(await outlines(false), 'none with the caret in the text').toBe(0);
});
