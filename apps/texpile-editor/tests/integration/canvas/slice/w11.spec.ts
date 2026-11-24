// W11's slice (design 20.2): a \vspace and a \footnote chip and a theorem drawn in LaTeX, a drawn chip in Typst, raw chips
// left as source in Markdown, read through the probe; a press selects a drawn chip, and typing beside it and undo keep it drawn
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const TEX = [
	'\\documentclass{article}',
	'\\usepackage{amsthm}',
	'\\newtheorem{theorem}{Theorem}',
	'\\begin{document}',
	'A first paragraph before the space.',
	'',
	'\\vspace{2em}',
	'',
	'A sentence with a note\\footnote{The note says what it means.} in the middle of it.',
	'',
	'\\begin{theorem}[Zorn]',
	'Every chain has an upper bound, so the set has a maximal element and the proof follows from it in a few lines.',
	'\\end{theorem}',
	'',
	'The last paragraph.',
	'\\end{document}',
	''
].join('\n');
const TYP = ['A first paragraph before the space.', '', '#v(2em)', '', 'A sentence with a note#footnote[The note.] in it.', ''].join('\n');
const MD = ['A first paragraph with a raw chip <kbd>Ctrl</kbd> in it.', '', 'The last paragraph.', ''].join('\n');

const texpile = useTexpile({ files: { 'main.tex': TEX, 'slice.typ': TYP, 'slice.md': MD } });

type DrawnText = { text: string; left: number; right: number; top: number; bottom: number };

/** the words a top-level block draws, each its font box in client px */
function drawnTexts(visual: VisualEditor, needle: string): Promise<DrawnText[]> {
	return inCanvas(
		visual.page,
		({ probe, view }, at) => {
			const block = view.state.doc.resolve(probe.posOf(at)).before(1);
			return probe
				.drawList(block)
				.filter((op) => op.op === 'fillText')
				.map((op) => ({ op, rect: view.canvas.clientRect(op.rect) }))
				.map(({ op, rect }) => ({ text: op.text!, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
		},
		needle
	);
}

function chips(visual: VisualEditor): Promise<{ classes: string[]; pos: number; x: number; y: number }[]> {
	return inCanvas(visual.page, ({ probe }) =>
		probe.query('.drawn-chip').map((chip) => ({
			classes: chip.classes,
			pos: chip.pos!,
			x: chip.rect.left + chip.rect.width / 2,
			y: chip.rect.top + chip.rect.height / 2
		}))
	);
}

test('main.tex: a vertical space, a footnote mark and a theorem head run in are drawn', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('main.tex');
	await settled(visual.page);

	const drawn = await chips(visual);
	expect(drawn.map((chip) => chip.classes.includes('drawn-chip-line'))).toEqual([true, false]);
	// 2em of the editor's font, its command and length beside the arrow
	const space = await inCanvas(visual.page, ({ probe }) => ({
		height: probe.query('.drawn-vspace')[0].rect.height,
		labels: probe.query('.drawn-vspace span').map((el) => el.text)
	}));
	expect(space.height).toBeGreaterThan(30);
	expect(space.labels).toEqual(['', '\\vspace', '2em']);

	// the mark is the counter's number, raised above the words it follows
	const sentence = await drawnTexts(visual, 'A sentence');
	expect(sentence.map((each) => each.text)).toContain('1');
	const note = sentence.find((each) => each.text === 'note')!;
	const mark = sentence.find((each) => each.text === '1')!;
	expect(mark.left).toBeGreaterThanOrEqual(note.right - 0.5);
	expect(note.bottom - mark.bottom).toBeGreaterThan(3);

	// the head floats left and the body's first words start on its line
	const theorem = await drawnTexts(visual, 'Every chain');
	const head = theorem.find((each) => each.text.startsWith('Theorem'))!;
	const every = theorem.find((each) => each.text.startsWith('Every'))!;
	// the DOM editor's text boxes of the two share their top: bold 16px and italic 17px
	expect(Math.abs(every.top - head.top)).toBeLessThan(1);
	expect(every.left).toBeGreaterThan(head.right);
	expect(await probeErrors(visual.page)).toEqual([]);
});

test('main.tex: a press selects a drawn chip whole and opens its panel, and words typed after it and undone leave it drawn', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('main.tex');
	await settled(visual.page);
	const footnote = (await chips(visual))[1];

	await visual.page.mouse.click(footnote.x, footnote.y);
	await settled(visual.page);
	expect(await inCanvas(visual.page, ({ view }) => view.state.selection.toJSON())).toMatchObject({ type: 'node', anchor: footnote.pos });
	expect(await inCanvas(visual.page, ({ probe }) => probe.query('.drawn-chip-selected').length)).toBe(1);

	// P0's press opened the panel on the chip's source; Escape closes it with the caret after the chip
	await expect(visual.page.locator('.drawn-chip-panel')).toBeVisible();
	await visual.press('Escape');
	await expect(visual.page.locator('.drawn-chip-panel')).toBeHidden();
	await visual.type('Q');
	await settled(visual.page);
	expect(await inCanvas(visual.page, ({ view }, at) => view.state.doc.textBetween(at, at + 50), footnote.pos)).toContain('means.}Q in');
	expect(await inCanvas(visual.page, ({ probe }) => probe.query('.drawn-chip-selected').length)).toBe(0);

	await visual.press('ControlOrMeta+z');
	await settled(visual.page);
	expect(await inCanvas(visual.page, ({ probe }) => probe.query('.drawn-footnote').map((el) => el.text))).toEqual(['1']);

	// a chip just inserted draws as one read from the file
	await inCanvas(visual.page, ({ view }) => {
		const { state } = view;
		view.dispatch(
			state.tr.insert(state.selection.head, state.schema.nodes.inline_latex.create(null, state.schema.text('\\footnote{More.}')))
		);
	});
	await settled(visual.page);
	expect(await inCanvas(visual.page, ({ probe }) => probe.query('.drawn-footnote').map((el) => el.text))).toEqual(['1', '2']);
	expect(await probeErrors(visual.page)).toEqual([]);
});

test('slice.typ: a vertical space and a footnote mark are drawn', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('slice.typ');
	await settled(visual.page);
	expect((await chips(visual)).map((chip) => chip.classes.includes('drawn-chip-line'))).toEqual([true, false]);
	expect(await inCanvas(visual.page, ({ probe }) => probe.query('.drawn-space-command').map((el) => el.text))).toEqual(['#v']);
	const sentence = await drawnTexts(visual, 'A sentence');
	const note = sentence.find((each) => each.text === 'note')!;
	const mark = sentence.find((each) => each.text === '1')!;
	expect(note.bottom - mark.bottom).toBeGreaterThan(3);
	expect(await probeErrors(visual.page)).toEqual([]);
});

test('slice.md: a raw chip stays its source', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await visual.open('slice.md');
	await settled(visual.page);
	expect(await chips(visual)).toEqual([]);
	const words = (await drawnTexts(visual, 'A first')).map((each) => each.text).join('');
	expect(words).toContain('<kbd>');
	expect(await probeErrors(visual.page)).toEqual([]);
});
