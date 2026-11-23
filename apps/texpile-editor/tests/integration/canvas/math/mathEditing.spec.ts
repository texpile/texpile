// a formula edited on the canvas (P4 of the MathLive inventory, A5, A10): entered by the arrows and a click, typed into,
// composed into, left by every key of T7, undone, redrawn on a macros change, read only, and made by typing $x$
import { expect, test, type Page } from '@playwright/test';
import { Disk } from '../../driver/disk';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const LONG = 'A paragraph whose one line reaches well past the middle of the column.';
const FLOWS = `\\documentclass{article}
\\newcommand{\\R}{\\mathbb{R}}
\\begin{document}

${LONG}

Inline $a+b$ formula in a line.

${LONG}

\\[
x = \\frac{1}{2} + \\alpha + \\beta + \\gamma + \\delta + \\sum_{i=1}^{n} i^2 + \\R^n
\\]

${LONG}

\\begin{align*}
a + b + c + d + e &= f + g + h + i + j \\\\
k + l + m + n + o &= p + q + r + s + t \\\\
u + v + w + x + y &= z + a + b + c + d
\\end{align*}

${LONG}

\\begin{align*}
f &= x \\\\
g &= y + z \\\\
h &= w
\\end{align*}

${LONG}

\\[
${Array.from({ length: 60 }, (_, i) => `a_{${i}}`).join(' + ')}
\\]

\\end{document}
`;

const STACKED = '$ M = mat(1, 2; 3, 4) $\n\n$ x &= a + b \\\n  y &= c \\\n  z &= d $\n\nAfter the displays.\n';

// the reference's block is built again once the names it reads land, after the formula's session started
const REFERENCED = 'With math $a^2+b^2$ inline and a label @knuth1984 end.\n';

const texpile = useTexpile({
	files: { 'flows.tex': FLOWS, 'typed.tex': FLOWS, 'emptied.tex': FLOWS, 'stacked.typ': STACKED, 'referenced.typ': REFERENCED }
});
const visual = () => new VisualEditor(texpile().page, texpile().root);
const disk = () => new Disk(texpile().root);

type Session = { pos: number; offset: number; lastOffset: number; source: string; caretX: number | null };

function session(page: Page): Promise<Session | null> {
	return inCanvas(page, ({ probe }) => {
		const math = probe.math.active();
		return (
			math && { pos: math.pos, offset: math.offset, lastOffset: math.lastOffset, source: math.source, caretX: math.caretBox?.x ?? null }
		);
	});
}

/** the nth formula of a type: its position and end */
function formula(v: VisualEditor, type: string, nth = 0): Promise<{ pos: number; end: number }> {
	return v.evalView(
		`const found = []; view.state.doc.descendants((n, p) => { if (n.type.name === arg.type) found.push({ pos: p, end: p + n.nodeSize }); }); return found[arg.nth];`,
		{ type, nth }
	);
}

function selection(v: VisualEditor): Promise<{ type: string; anchor: number; head: number }> {
	return v.evalView(`const s = view.state.selection; return { type: s.toJSON().type, anchor: s.anchor, head: s.head };`);
}

async function caretAt(v: VisualEditor, pos: number): Promise<void> {
	await inCanvas(v.page, ({ probe }, at) => probe.select(at), pos);
	await settled(v.page);
}

test.beforeEach(async () => {
	await visual().open('flows.tex');
	await visual().page.keyboard.press('Escape');
});

test('the arrows enter an inline formula from either side and every edge key of T7 leaves it', async () => {
	const v = visual();
	const { pos, end } = await formula(v, 'inline_math');
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await expect.poll(() => session(v.page)).toMatchObject({ pos, offset: 0 });
	await v.press('ArrowLeft');
	expect(await session(v.page)).toBeNull();
	expect(await selection(v)).toMatchObject({ head: pos });

	await caretAt(v, end);
	await v.press('ArrowLeft');
	const entered = await session(v.page);
	expect(entered).toMatchObject({ pos, offset: entered!.lastOffset });
	await v.press('ArrowRight');
	expect(await selection(v)).toMatchObject({ head: end });

	const leaves: [string, (s: { anchor: number; head: number }) => boolean][] = [
		['Escape', (s) => s.head === end],
		['Enter', (s) => s.head === end],
		['Control+ArrowRight', (s) => s.head === end],
		['Shift+ArrowRight', (s) => s.anchor === pos && s.head === end],
		['ArrowUp', (s) => s.head < pos],
		['ArrowDown', (s) => s.head > end]
	];
	for (const [key, landed] of leaves) {
		await caretAt(v, end);
		await v.press('ArrowLeft');
		await expect.poll(() => session(v.page), { message: `entered before ${key}` }).not.toBeNull();
		await v.press(key);
		expect(await session(v.page), `${key} leaves`).toBeNull();
		expect(landed(await selection(v)), `${key} lands beside the formula`).toBe(true);
	}
	// Backspace at the start of a formula with something in it: the caret before it
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await v.press('Backspace');
	expect(await session(v.page)).toBeNull();
	expect(await selection(v)).toMatchObject({ head: pos });
	expect(await probeErrors(v.page)).toEqual([]);
});

test('Shift+Enter in a display makes an empty display below, entered', async () => {
	const v = visual();
	const { pos } = await formula(v, 'block_math');
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await expect.poll(() => session(v.page)).toMatchObject({ pos });
	await v.press('Shift+Enter');
	const below = await formula(v, 'block_math', 1);
	await expect.poll(() => session(v.page)).toMatchObject({ pos: below.pos });
	await v.press('Escape');
	await v.page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => disk().read('flows.tex')).toBe(FLOWS);
});

test('a formula emptied and then left for something outside the editor is removed', async () => {
	const v = visual();
	await v.open('emptied.tex');
	const { pos } = await formula(v, 'inline_math');
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await expect.poll(() => session(v.page)).toMatchObject({ pos });
	await v.press('Control+a');
	await v.press('Backspace');
	await v.page.evaluate(() => {
		const outside = document.createElement('button');
		document.body.append(outside);
		outside.focus();
	});
	const formulas = () =>
		v.evalView<number>(`let n = 0; view.state.doc.descendants((node) => void (node.type.name === 'inline_math' && n++)); return n;`);
	await expect.poll(formulas).toBe(0);
});

test('a click places the math caret where it lands, typing reaches the file and Ctrl+Z gives the bytes back', async () => {
	const v = visual();
	const { pos } = await formula(v, 'inline_math');
	const box = await inCanvas(v.page, ({ probe }, at) => probe.rectOfNode(at)!.toJSON() as DOMRect, pos);
	await v.page.mouse.click(box.right - 2, box.top + box.height / 2);
	await expect.poll(() => session(v.page)).toMatchObject({ pos });
	expect((await session(v.page))!.offset).toBe((await session(v.page))!.lastOffset);
	await v.page.keyboard.type('+c');
	await disk().expectFile('flows.tex', (text) => text.includes('$a+b+c$'), 'the typed letters are saved');
	expect(await session(v.page)).toMatchObject({ pos, source: 'a+b+c' });
	await v.page.keyboard.press('ControlOrMeta+z');
	await disk().expectFile('flows.tex', (text) => text === FLOWS, 'undo restores the file');
	expect(await session(v.page), 'undo keeps the writer in the formula').toMatchObject({ pos });
});

test('a Typst inline formula beside a reference takes a click and the arrows, and typing reaches the file', async () => {
	const v = visual();
	await v.open('referenced.typ');
	await settled(v.page);
	const { pos, end } = await formula(v, 'inline_math');
	await caretAt(v, end);
	await v.press('ArrowLeft');
	await expect.poll(() => session(v.page)).toMatchObject({ pos });
	await v.press('Escape');
	const box = await inCanvas(v.page, ({ probe }, at) => probe.rectOfNode(at)!.toJSON() as DOMRect, pos);
	await v.page.mouse.click(box.right - 2, box.top + box.height / 2);
	await expect.poll(() => session(v.page)).toMatchObject({ pos });
	await v.page.keyboard.type('+c');
	await disk().expectFile(
		'referenced.typ',
		(text) => /\+ ?c\)?\$ inline and a label @knuth1984 end\./.test(text),
		'the typed letters are saved in the formula'
	);
});

test('a composition commits at the math caret', async () => {
	const v = visual();
	const { pos } = await formula(v, 'inline_math');
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await expect.poll(() => session(v.page)).toMatchObject({ pos, offset: 0 });
	const cdp = await v.page.context().newCDPSession(v.page);
	await cdp.send('Input.imeSetComposition', { text: 'z', selectionStart: 1, selectionEnd: 1 });
	await cdp.send('Input.insertText', { text: 'z' });
	await cdp.detach();
	await expect.poll(async () => (await session(v.page))?.source).toBe('za+b');
	await disk().expectFile('flows.tex', (text) => text.includes('$za+b$'), 'the composed letter is saved');
	await v.page.keyboard.press('ControlOrMeta+z');
	await disk().expectFile('flows.tex', (text) => text === FLOWS, 'undo restores the file');
});

test('a macros change redraws the entered formula and keeps its caret', async () => {
	const v = visual();
	const { pos } = await formula(v, 'block_math');
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await v.press('ArrowRight');
	const before = await session(v.page);
	await v.page.evaluate(async () => {
		const { mathMacros } = await import(
			/* @vite-ignore */ '/src/lib/editor/visual/extensions/mathlivebridge/mathMacros.svelte.ts' as string
		);
		mathMacros.current = { ...mathMacros.current, R: { def: '\\mathbb{C}', args: 0, expand: false } };
	});
	await expect.poll(() => v.evalView<string>('return view.canvas.nested()?.field.macros.R?.def ?? ""')).toBe('\\mathbb{C}');
	expect(await session(v.page)).toMatchObject({ pos, offset: before!.offset });
	expect(disk().read('flows.tex')).toBe(FLOWS);
});

test('a read-only formula takes a click and the arrows, and typing changes nothing', async () => {
	const v = visual();
	const { pos } = await formula(v, 'inline_math');
	await v.evalView('view.setProps({ editable: () => false });');
	try {
		const box = await inCanvas(v.page, ({ probe }, at) => probe.rectOfNode(at)!.toJSON() as DOMRect, pos);
		await v.page.mouse.click(box.left + 2, box.top + box.height / 2);
		await expect.poll(() => session(v.page)).toMatchObject({ pos });
		await v.press('ArrowRight');
		await v.page.keyboard.type('zz');
		expect(await session(v.page)).toMatchObject({ pos, source: 'a+b' });
		expect(disk().read('flows.tex')).toBe(FLOWS);
	} finally {
		await v.evalView('view.setProps({ editable: () => true });');
	}
});

test('the math toolbar inserts into the entered formula', async () => {
	test.skip(test.info().project.name.startsWith('canvas-web'), "the toolbar is the app window's");
	const v = visual();
	const { pos } = await formula(v, 'inline_math');
	await caretAt(v, pos);
	await v.press('ArrowRight');
	await expect.poll(() => session(v.page)).toMatchObject({ pos });
	await v.page.getByRole('button', { name: 'Greek', exact: true }).first().dispatchEvent('pointerdown');
	await v.page.locator('.symbol-grid[data-group="greek"] .symbol-btn').first().dispatchEvent('pointerdown');
	await expect.poll(async () => (await session(v.page))?.source).toBe('\\alpha a+b');
	await v.page.keyboard.press('ControlOrMeta+z');
	await disk().expectFile('flows.tex', (text) => text === FLOWS, 'undo restores the file');
});

/** the caret's client x and the textblock or formula it stands in */
function caretPlace(page: Page): Promise<{ x: number; math: boolean; head: number }> {
	return inCanvas(page, ({ probe, view }) => {
		const math = probe.math.active();
		if (math?.caretBox) return { x: math.caretBox.x, math: true, head: view.state.selection.head };
		const caret = probe.carets().find((c) => c.kind === 'local');
		return { x: caret!.rect.x, math: false, head: view.state.selection.head };
	});
}

for (const [kind, nth, rows] of [
	['a centered display', 0, 1],
	['a three-row align', 1, 3]
] as const) {
	test(`Down from x = 300 goes through ${kind} at the atom nearest x = 300 and out within 2 px of it (A5)`, async () => {
		const v = visual();
		const { pos, end } = await formula(v, 'block_math', nth);
		const above = await v.evalView<number>(`return view.state.doc.resolve(arg).nodeBefore ? arg - 2 : arg;`, pos);
		const goal = await inCanvas(v.page, ({ probe }, at) => ({ left: probe.rectOfNode(at.pos)!.left, y: probe.clientPointOf(at.above).y }), {
			pos,
			above
		});
		const x = goal.left + 300;
		await v.page.mouse.click(x, goal.y);
		const start = await caretPlace(v.page);
		for (let row = 0; row < rows; row++) {
			await v.press('ArrowDown');
			const place = await caretPlace(v.page);
			expect(place.math, `row ${row + 1} is in the formula`).toBe(true);
			// the caret stops on the caret's own row: the same caret top
			const atoms = await v.evalView<number[]>(
				`const s = view.canvas.nested(); const f = s.field; const keep = f.position; const row = s.caretElementRect().y; const xs = [];
				for (let o = 0; o <= f.lastOffset; o++) { f.position = o; const r = s.caretElementRect(); if (r && Math.abs(r.y - row) < 0.5) xs.push(r.x); }
				f.position = keep; return xs;`
			);
			const nearest = Math.min(...atoms.map((a) => Math.abs(a - start.x)));
			expect(Math.abs(place.x - start.x), `row ${row + 1} at the atom nearest the goal`).toBeLessThanOrEqual(nearest + 0.5);
		}
		await v.press('ArrowDown');
		const out = await caretPlace(v.page);
		expect(out.math).toBe(false);
		expect(out.head).toBeGreaterThan(end);
		expect(Math.abs(out.x - start.x)).toBeLessThanOrEqual(2);
	});
}

/** the caret stops of the session's row holding offset `on`: their x */
function rowStops(v: VisualEditor, on: number): Promise<number[]> {
	return v.evalView<number[]>(
		`const s = view.canvas.nested(); const f = s.field; const keep = f.position; f.position = arg; const row = s.caretElementRect().y;
		const xs = []; for (let o = 0; o <= f.lastOffset; o++) { f.position = o; const r = s.caretElementRect(); if (r && Math.abs(r.y - row) < 0.5) xs.push(r.x); }
		f.position = keep; return xs;`,
		on
	);
}

test('Up and Down from beside a narrow align enter its bottom and top rows at their nearer ends (A5)', async () => {
	const v = visual();
	const { pos, end } = await formula(v, 'block_math', 2);
	await caretAt(v, pos);
	await v.press('ArrowRight');
	const box = await inCanvas(v.page, ({ probe }) => {
		const { left, right } = probe.math.active()!.formula;
		return { left, right };
	});
	const last = (await session(v.page))!.lastOffset;
	await v.press('Escape');
	const lines = await inCanvas(
		v.page,
		({ probe }, at) => ({ above: probe.clientPointOf(at.pos - 2).y, below: probe.clientPointOf(at.end + 2).y }),
		{
			pos,
			end
		}
	);

	await v.page.mouse.click(box.left - 40, lines.below);
	await v.press('ArrowUp');
	const bottom = await rowStops(v, last);
	expect((await session(v.page))?.pos, 'Up entered the align').toBe(pos);
	expect((await caretPlace(v.page)).x, 'at the start of the bottom row').toBeCloseTo(Math.min(...bottom), 0);
	await v.press('Escape');

	await v.page.mouse.click(box.right + 40, lines.above);
	await v.press('ArrowDown');
	const top = await rowStops(v, 0);
	expect((await session(v.page))?.pos, 'Down entered the align').toBe(pos);
	expect((await caretPlace(v.page)).x, 'at the end of the top row').toBeCloseTo(Math.max(...top), 0);
});

test('Down from a display enters the display under it on its top row (A5)', async () => {
	const v = visual();
	await v.open('stacked.typ');
	const first = await formula(v, 'block_math', 0);
	const second = await formula(v, 'block_math', 1);
	await caretAt(v, first.pos);
	await v.press('ArrowRight');
	for (let i = 0; i < 3 && (await session(v.page))?.pos !== second.pos; i++) await v.press('ArrowDown');
	expect((await session(v.page))?.pos, 'Down entered the next display').toBe(second.pos);
	const rows = await v.evalView<[number, number]>(
		`const s = view.canvas.nested(); const f = s.field; const at = s.caretElementRect().y; const keep = f.position;
		f.position = 1; const top = s.caretElementRect().y; f.position = keep; return [at, top];`
	);
	expect(rows[0], 'on the top row').toBeCloseTo(rows[1], 0);
});

test('a display wider than the column scrolls to keep the math caret in it (E8)', async () => {
	const v = visual();
	const { pos } = await formula(v, 'block_math', 3);
	await caretAt(v, pos);
	await v.press('ArrowRight');
	const column = await inCanvas(v.page, ({ probe }, at) => probe.rectOfNode(at)!.toJSON(), pos);
	const shown = () =>
		inCanvas(v.page, ({ probe, view }) => ({
			x: probe.math.active()!.caret!.x,
			scrollX: (view.canvas.nested() as unknown as { scrollX: number }).scrollX
		}));
	await v.press('End');
	await v.page.keyboard.type('+b');
	const end = await shown();
	expect(end.scrollX).toBeGreaterThan(0);
	expect(end.x).toBeLessThanOrEqual(column.right);
	await v.press('Home');
	expect(await shown()).toMatchObject({ scrollX: 0 });
	expect((await shown()).x).toBeGreaterThanOrEqual(column.left - 1);
});

test('typing a $x^2$ b into a paragraph saves a formula and leaves every other byte', async () => {
	const v = visual();
	await v.open('typed.tex');
	await v.caretAfter('Inline $a+b$ formula in a line.'.slice(-6));
	await v.page.keyboard.type(' a $x^2$ b', { delay: 30 });
	const expected = FLOWS.replace('formula in a line.', 'formula in a line. a $x^2$ b');
	await disk().expectFile('typed.tex', (text) => text === expected, 'the formula and the text around it saved, nothing else');
	expect(
		await v.evalView<number>(`let n = 0; view.state.doc.descendants((node) => { if (node.type.name === 'inline_math') n++; }); return n;`)
	).toBe(2);
});
